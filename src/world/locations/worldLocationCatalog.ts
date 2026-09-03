import type { SettlementCell, SettlementDef } from '../../settlement/settlementGenerator'
import type { ChunkManager } from '../../terrain/chunkManager'
import type { Caves } from '../createCaves'
import type { WorldLocation, WorldLocationKind } from './worldLocationTypes'
import { cellFromId, cellsWithinRadius, SETTLEMENT_GRID_STEP, worldToCell } from '../../settlement/settlementGenerator'
import { type RawSampleParams, sampleHeightAt } from '../../terrain/chunkHeightmap'
import { projectCellAt } from '../map/mapProjection'
import {
  CEMETERY_SEARCH_CHUNK_RADIUS,
  kmToWorldUnits,
  LOCATION_SCAN_STEP,
  MAX_CEMETERY_SETTLEMENTS_SEARCHED,
  MIN_LAKE_CELLS,
  worldUnitsToKm,
} from './locationConfig'
import { landmarkName } from './worldLocationNames'

export type WorldLocationCatalogDeps = {
  /** `WorldConfig.seed`/`caves`/`chunkManager`/`chunkSize` are read fresh on
   *  every call (thunks), not captured once — `WorldBundle`'s own fields are
   *  reassigned in place on `rebuildWorld()` (new seed, new generators), same
   *  "stable container, mutated in place" contract `createWorldContext`
   *  already uses for `chunkManager`. The catalog itself is created once at
   *  app startup and must keep working across every later rebuild. */
  getSeed: () => number
  getCaves: () => Caves
  getChunkManager: () => ChunkManager
  lookupSettlement: (cell: SettlementCell) => SettlementDef | null
  /** Same params `mapProjection.ts` samples terrain with — reused so
   *  lake/mountain classification never drifts from what the world map
   *  itself already shows (notes §3/§7). */
  getSampleParams: () => RawSampleParams
  /** `WorldConfig.terrain.chunkSize` — only needed to re-derive a chunk's
   *  world-space center from a cemetery id's embedded `(cx, cz)` (notes §4:
   *  reuse the real landmark generator, `chunkEnvironment.computeChunkEnvironment`
   *  via `ChunkManager.findLandmarkNear`, instead of a second placement
   *  algorithm). */
  getChunkSize: () => number
}

export type WorldLocationCatalog = {
  /** Resolves a stable `WorldLocation.id` back to its (deterministic)
   *  position/name — works for any valid id, even one discovered in a
   *  previous session, without needing a prior search this session. */
  getById(id: string): WorldLocation | null
  /** Settlements within `maxKm` of `(x, z)`, nearest first (plan §8 — no
   *  `discoveryWeight`, always distance-ordered). */
  nearestSettlements(x: number, z: number, maxKm: number): WorldLocation[]
  /** cave + cemetery + lake + mountainPeak candidates within `maxKm` of
   *  `(x, z)` — unsorted; callers apply the distance-filter → weighted-pick
   *  pipeline themselves (`locationDiscovery.ts`). */
  landmarksWithin(x: number, z: number, maxKm: number): WorldLocation[]
  /** Drops the internal lake/peak scan cache — call after a world rebuild
   *  (new seed/terrain params), same "must not silently reuse stale terrain
   *  data across a rebuild" reasoning as `MapProjection.invalidateCache()`. */
  invalidateScanCache(): void
}

function distanceKm(ax: number, az: number, bx: number, bz: number): number {
  return worldUnitsToKm(Math.hypot(ax - bx, az - bz))
}

function hashLocationId(seed: number, id: string): number {
  let h = (seed ^ 0x9e3779b9) | 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

function weightOf(seed: number, id: string): number {
  return hashLocationId(seed, id) / 0xffffffff
}

export function createWorldLocationCatalog(deps: WorldLocationCatalogDeps): WorldLocationCatalog {
  const { getSeed, getCaves, getChunkManager, lookupSettlement, getSampleParams, getChunkSize } = deps

  function settlementLocation(def: SettlementDef): WorldLocation {
    return { id: `settlement:${def.id}`, kind: 'settlement', x: def.x, z: def.z, name: def.name, discoveryWeight: 0 }
  }

  function caveLocationFromCaveId(caveId: string): WorldLocation | null {
    const def = getCaves().definitions().find((d) => d.caveId === caveId)
    if (!def) return null
    const seed = getSeed()
    const id = `cave:${caveId}`
    return { id, kind: 'cave', x: def.entrance.x, z: def.entrance.z, name: landmarkName(seed, 'cave', id), discoveryWeight: weightOf(seed, id) }
  }

  /** `landmarkId` is `chunkEnvironment.ts`'s own `cemetery:<cx>:<cz>:<ordinal>:<seed36>`
   *  — used verbatim as the `WorldLocation.id` (notes §4/§21: same identity
   *  the physical landmark carries, never a second id scheme). */
  function cemeteryLocationFromChunk(cx: number, cz: number): WorldLocation | null {
    const chunkSize = getChunkSize()
    const centerX = cx * chunkSize + chunkSize / 2
    const centerZ = cz * chunkSize + chunkSize / 2
    const found = getChunkManager().findLandmarkNear('cemetery', centerX, centerZ, 0)
    if (!found) return null
    const seed = getSeed()
    return {
      id: found.id,
      kind: 'cemetery',
      x: found.x,
      z: found.z,
      name: landmarkName(seed, 'cemetery', found.id),
      discoveryWeight: weightOf(seed, found.id),
    }
  }

  function scanGridLocation(kind: 'lake' | 'mountainPeak', cx: number, cz: number): WorldLocation {
    const x = (cx + 0.5) * LOCATION_SCAN_STEP
    const z = (cz + 0.5) * LOCATION_SCAN_STEP
    const id = `${kind}:${cx},${cz}`
    const seed = getSeed()
    return { id, kind, x, z, name: landmarkName(seed, kind, id), discoveryWeight: weightOf(seed, id) }
  }

  function getById(id: string): WorldLocation | null {
    const sep = id.indexOf(':')
    if (sep < 0) return null
    const kind = id.slice(0, sep) as WorldLocationKind
    if (kind === 'settlement') {
      const cell = cellFromId(id.slice(sep + 1))
      if (!cell) return null
      const def = lookupSettlement(cell)
      return def ? settlementLocation(def) : null
    }
    if (kind === 'cave') return caveLocationFromCaveId(id.slice(sep + 1))
    if (kind === 'cemetery') {
      const parts = id.split(':')
      const cx = Number(parts[1])
      const cz = Number(parts[2])
      if (!Number.isInteger(cx) || !Number.isInteger(cz)) return null
      return cemeteryLocationFromChunk(cx, cz)
    }
    if (kind === 'lake' || kind === 'mountainPeak') {
      const [cxStr, czStr] = id.slice(sep + 1).split(',')
      const cx = Number(cxStr)
      const cz = Number(czStr)
      if (!Number.isInteger(cx) || !Number.isInteger(cz)) return null
      return scanGridLocation(kind, cx, cz)
    }
    return null
  }

  function nearestSettlements(x: number, z: number, maxKm: number): WorldLocation[] {
    const center = worldToCell(x, z)
    const radiusCells = Math.ceil(kmToWorldUnits(maxKm) / SETTLEMENT_GRID_STEP) + 1
    const out: WorldLocation[] = []
    for (const cell of cellsWithinRadius(center, radiusCells)) {
      const def = lookupSettlement(cell)
      if (!def) continue
      if (distanceKm(x, z, def.x, def.z) > maxKm) continue
      out.push(settlementLocation(def))
    }
    out.sort((a, b) => distanceKm(x, z, a.x, a.z) - distanceKm(x, z, b.x, b.z) || a.id.localeCompare(b.id))
    return out
  }

  function cemeteryCandidates(x: number, z: number, maxKm: number): WorldLocation[] {
    // Cemeteries only ever spawn on a settlement's own fringe — search the
    // nearest settlements (bounded — this is real chunk-generation work,
    // see locationConfig.ts) rather than scanning the world.
    const center = worldToCell(x, z)
    const searchMarginKm = 5
    const radiusCells = Math.ceil(kmToWorldUnits(maxKm + searchMarginKm) / SETTLEMENT_GRID_STEP) + 1
    const settlements = cellsWithinRadius(center, radiusCells)
      .map((cell) => lookupSettlement(cell))
      .filter((def): def is SettlementDef => def != null)
      .sort((a, b) => distanceKm(x, z, a.x, a.z) - distanceKm(x, z, b.x, b.z))
      .slice(0, MAX_CEMETERY_SETTLEMENTS_SEARCHED)

    const chunkManager = getChunkManager()
    const seed = getSeed()
    const out: WorldLocation[] = []
    for (const def of settlements) {
      const found = chunkManager.findLandmarkNear('cemetery', def.x, def.z, CEMETERY_SEARCH_CHUNK_RADIUS)
      if (!found) continue
      if (distanceKm(x, z, found.x, found.z) > maxKm) continue
      out.push({
        id: found.id,
        kind: 'cemetery',
        x: found.x,
        z: found.z,
        name: landmarkName(seed, 'cemetery', found.id),
        discoveryWeight: weightOf(seed, found.id),
      })
    }
    return out
  }

  function caveCandidates(x: number, z: number, maxKm: number): WorldLocation[] {
    const seed = getSeed()
    const out: WorldLocation[] = []
    for (const def of getCaves().definitions()) {
      if (distanceKm(x, z, def.entrance.x, def.entrance.z) > maxKm) continue
      const id = `cave:${def.caveId}`
      out.push({ id, kind: 'cave', x: def.entrance.x, z: def.entrance.z, name: landmarkName(seed, 'cave', id), discoveryWeight: weightOf(seed, id) })
    }
    return out
  }

  /** One-off deterministic scan cache: repeated queries from roughly the
   *  same origin (guard/merchant are always at a fixed settlement) hit this
   *  instead of re-sampling terrain (notes §7 warns this needs a real
   *  bounded generator, not a per-call world scan). */
  const scanCache = new Map<string, WorldLocation[]>()

  /** Scans a `LOCATION_SCAN_STEP` grid around `(x, z)` out to `maxKm`,
   *  flood-filling `inland_water` cells into lakes (≥ `MIN_LAKE_CELLS`) and
   *  finding local-maxima `mountain` cells as peaks. Coarse and approximate
   *  by design (notes §7/§22 pitfalls) — a gameplay discovery aid, not a
   *  cartography-grade hydrology/orography system. */
  function scanLakesAndPeaks(x: number, z: number, maxKm: number): WorldLocation[] {
    const key = `${Math.round(x)},${Math.round(z)},${Math.round(maxKm)}`
    const cached = scanCache.get(key)
    if (cached) return cached

    const sampleParams = getSampleParams()
    const halfWorld = kmToWorldUnits(maxKm)
    const minCx = Math.floor((x - halfWorld) / LOCATION_SCAN_STEP)
    const maxCx = Math.floor((x + halfWorld) / LOCATION_SCAN_STEP)
    const minCz = Math.floor((z - halfWorld) / LOCATION_SCAN_STEP)
    const maxCz = Math.floor((z + halfWorld) / LOCATION_SCAN_STEP)

    const width = maxCx - minCx + 1
    const height = maxCz - minCz + 1
    const isWater = new Uint8Array(width * height)
    const isMountain = new Uint8Array(width * height)
    const heights = new Float32Array(width * height)
    const idx = (gx: number, gz: number) => (gz - minCz) * width + (gx - minCx)

    for (let gz = minCz; gz <= maxCz; gz++) {
      for (let gx = minCx; gx <= maxCx; gx++) {
        const wx = (gx + 0.5) * LOCATION_SCAN_STEP
        const wz = (gz + 0.5) * LOCATION_SCAN_STEP
        const cell = projectCellAt(wx, wz, sampleParams)
        const i = idx(gx, gz)
        if (cell.terrain === 'inland_water') isWater[i] = 1
        if (cell.terrain === 'mountain') {
          isMountain[i] = 1
          heights[i] = sampleHeightAt(wx, wz, sampleParams)
        }
      }
    }

    const out: WorldLocation[] = []

    // --- Lakes: flood-fill connected inland_water cells ---
    const visited = new Uint8Array(width * height)
    for (let gz = minCz; gz <= maxCz; gz++) {
      for (let gx = minCx; gx <= maxCx; gx++) {
        const start = idx(gx, gz)
        if (!isWater[start] || visited[start]) continue
        const stack = [[gx, gz]]
        visited[start] = 1
        let count = 0
        let sumGx = 0
        let sumGz = 0
        while (stack.length > 0) {
          const [cx, cz] = stack.pop()!
          count++
          sumGx += cx
          sumGz += cz
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = cx + dx
            const nz = cz + dz
            if (nx < minCx || nx > maxCx || nz < minCz || nz > maxCz) continue
            const ni = idx(nx, nz)
            if (!isWater[ni] || visited[ni]) continue
            visited[ni] = 1
            stack.push([nx, nz])
          }
        }
        if (count < MIN_LAKE_CELLS) continue
        const repGx = Math.round(sumGx / count)
        const repGz = Math.round(sumGz / count)
        const loc = scanGridLocation('lake', repGx, repGz)
        if (distanceKm(x, z, loc.x, loc.z) <= maxKm) out.push(loc)
      }
    }

    // --- Peaks: local maxima among mountain cells (8-neighborhood) ---
    const peakCandidates: { gx: number, gz: number, h: number }[] = []
    for (let gz = minCz; gz <= maxCz; gz++) {
      for (let gx = minCx; gx <= maxCx; gx++) {
        const i = idx(gx, gz)
        if (!isMountain[i]) continue
        const h = heights[i]!
        let isMax = true
        for (let dz = -1; dz <= 1 && isMax; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue
            const nx = gx + dx
            const nz = gz + dz
            if (nx < minCx || nx > maxCx || nz < minCz || nz > maxCz) continue
            const ni = idx(nx, nz)
            if (isMountain[ni] && heights[ni]! > h) { isMax = false; break }
          }
        }
        if (isMax) peakCandidates.push({ gx, gz, h })
      }
    }
    // Merge near-duplicate maxima (coarse grid can produce a small plateau
    // of "locally highest" cells) — keep the tallest within a small radius.
    const mergeRadiusCells = 2
    const kept: typeof peakCandidates = []
    for (const cand of peakCandidates.sort((a, b) => b.h - a.h)) {
      const tooClose = kept.some((k) => Math.hypot(k.gx - cand.gx, k.gz - cand.gz) <= mergeRadiusCells)
      if (!tooClose) kept.push(cand)
    }
    for (const peak of kept) {
      const loc = scanGridLocation('mountainPeak', peak.gx, peak.gz)
      if (distanceKm(x, z, loc.x, loc.z) <= maxKm) out.push(loc)
    }

    scanCache.set(key, out)
    return out
  }

  function landmarksWithin(x: number, z: number, maxKm: number): WorldLocation[] {
    return [
      ...caveCandidates(x, z, maxKm),
      ...cemeteryCandidates(x, z, maxKm),
      ...scanLakesAndPeaks(x, z, maxKm),
    ]
  }

  return {
    getById,
    nearestSettlements,
    landmarksWithin,
    invalidateScanCache: () => scanCache.clear(),
  }
}

/** `settlement:<def.id>` where `def.id` is already `cellKey`-formatted
 *  (`settlementGenerator.ts`) — exported for callers that build a
 *  `WorldLocation.id` from a def they already have in hand (avoids a
 *  round-trip through `getById`). */
export function settlementLocationId(def: Pick<SettlementDef, 'id'>): string {
  return `settlement:${def.id}`
}
