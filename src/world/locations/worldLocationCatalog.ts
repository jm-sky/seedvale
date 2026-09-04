import type { SettlementCell, SettlementDef } from '../../settlement/settlementGenerator'
import type { RawSampleParams } from '../../terrain/chunkHeightmap'
import type { ChunkManager } from '../../terrain/chunkManager'
import type { Caves } from '../createCaves'
import type { WorldLocation, WorldLocationKind } from './worldLocationTypes'
import { cellFromId, cellsWithinRadius, SETTLEMENT_GRID_STEP, worldToCell } from '../../settlement/settlementGenerator'
import { sampleContinentalnessAt, sampleFloorAt, sampleHeightAt, sampleMountainRidgeAt } from '../../terrain/chunkHeightmap'
import { isMountainRidge, isOceanMix, isWetFloor } from '../../terrain/terrainClassification'
import {
  CEMETERY_SEARCH_CHUNK_RADIUS,
  kmToWorldUnits,
  LAKE_FLOOD_FILL_SAFETY_CAP,
  LOCATION_SCAN_STEP,
  LOCATION_TILE_CELLS,
  MAX_CEMETERY_SETTLEMENTS_SEARCHED,
  MIN_LAKE_CELLS,
  PEAK_MERGE_RADIUS_CELLS,
  PEAK_SCAN_HALO_CELLS,
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

/** Cheap running totals for the coarse terrain scan (plan world-013 §1) — no
 *  console/log side effects, just counters a debug/perf tool can read via
 *  `WorldLocationCatalog.getScanDiagnostics()`. Reset whenever the scan cache
 *  itself is invalidated, since counts from a previous world/terrain config
 *  are meaningless afterwards. */
export type LocationScanDiagnostics = {
  /** Coarse cells that required an actual procedural sample this session. */
  sampledCells: number
  /** Coarse cells served from the tile cache instead of resampled. */
  cacheHitCells: number
  sampleFloorCalls: number
  sampleContinentalnessCalls: number
  sampleRidgeCalls: number
  sampleHeightCalls: number
  waterCells: number
  mountainCells: number
  classificationMs: number
  lakeExtractionMs: number
  peakExtractionMs: number
  cemeteryMs: number
}

function emptyDiagnostics(): LocationScanDiagnostics {
  return {
    sampledCells: 0,
    cacheHitCells: 0,
    sampleFloorCalls: 0,
    sampleContinentalnessCalls: 0,
    sampleRidgeCalls: 0,
    sampleHeightCalls: 0,
    waterCells: 0,
    mountainCells: 0,
    classificationMs: 0,
    lakeExtractionMs: 0,
    peakExtractionMs: 0,
    cemeteryMs: 0,
  }
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
   *  pipeline themselves (`locationDiscovery.ts`). Equivalent to
   *  `landmarksInRange(x, z, 0, maxKm)`. */
  landmarksWithin(x: number, z: number, maxKm: number): WorldLocation[]
  /** Same candidates as `landmarksWithin`, narrowed to `(minKm, maxKm]`
   *  up front (plan world-013 §8) — the expensive coarse terrain sampling
   *  itself is bounded to that band (plus a small boundary halo), instead of
   *  generating `0..maxKm` and filtering afterwards. `landmarksWithin` is the
   *  `minKm = 0` case of this. */
  landmarksInRange(x: number, z: number, minKm: number, maxKm: number): WorldLocation[]
  /** Drops the internal coarse-terrain tile cache and cemetery-lookup cache
   *  (and resets `getScanDiagnostics()`) — call after a world rebuild (new
   *  seed/terrain params), same "must not silently reuse stale terrain data
   *  across a rebuild" reasoning as `MapProjection.invalidateCache()`. */
  invalidateScanCache(): void
  /** See `LocationScanDiagnostics` — a live reference, not a snapshot copy;
   *  read its fields after a query to see that query's contribution. */
  getScanDiagnostics(): LocationScanDiagnostics
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

/** Coarse-cell classification result — only what World Locations needs to
 *  tell `lake` / `mountainPeak` candidates apart (plan world-013 §2), never
 *  `projectCellAt()`'s full biome/moisture/forest-density projection. */
const CELL_UNKNOWN = 0
const CELL_NONE = 1
const CELL_WATER = 2
const CELL_MOUNTAIN = 3

/** Coarse `(gx, gz)` key encoding for flood-fill visited/queue tracking —
 *  a single safe integer instead of a `[gx, gz]` tuple or template-string key,
 *  so the lake BFS (plan world-013 §10) allocates one `Set`/array of numbers
 *  per query, not one array/string per cell. `KEY_OFFSET` only needs to
 *  exceed the largest plausible coarse-grid coordinate magnitude. */
const KEY_OFFSET = 1 << 20
const KEY_SPAN = KEY_OFFSET * 2
function cellKeyOf(gx: number, gz: number): number {
  return (gx + KEY_OFFSET) * KEY_SPAN + (gz + KEY_OFFSET)
}
function decodeCellKey(key: number): { gx: number, gz: number } {
  const gxEnc = Math.floor(key / KEY_SPAN)
  return { gx: gxEnc - KEY_OFFSET, gz: key - gxEnc * KEY_SPAN - KEY_OFFSET }
}

const NEIGHBOR4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

export function createWorldLocationCatalog(deps: WorldLocationCatalogDeps): WorldLocationCatalog {
  const { getSeed, getCaves, getChunkManager, lookupSettlement, getSampleParams, getChunkSize } = deps

  let diagnostics = emptyDiagnostics()

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

  /** Cemetery-per-settlement result cache (plan world-013 §12), including a
   *  cached "no cemetery found" — `ChunkManager.findLandmarkNear()` is real
   *  chunk-generation work, so a settlement checked by Guard should not pay
   *  that cost again for Near/Far. Cleared by `invalidateScanCache()`. */
  const cemeteryCache = new Map<string, WorldLocation | null>()

  function cemeteryForSettlement(def: SettlementDef): WorldLocation | null {
    if (cemeteryCache.has(def.id)) return cemeteryCache.get(def.id) ?? null
    const found = getChunkManager().findLandmarkNear('cemetery', def.x, def.z, CEMETERY_SEARCH_CHUNK_RADIUS)
    const seed = getSeed()
    const loc: WorldLocation | null = found
      ? { id: found.id, kind: 'cemetery', x: found.x, z: found.z, name: landmarkName(seed, 'cemetery', found.id), discoveryWeight: weightOf(seed, found.id) }
      : null
    cemeteryCache.set(def.id, loc)
    return loc
  }

  function cemeteryCandidates(x: number, z: number, minKm: number, maxKm: number): WorldLocation[] {
    // Cemeteries only ever spawn on a settlement's own fringe — search the
    // nearest settlements (bounded — this is real chunk-generation work,
    // see locationConfig.ts) rather than scanning the world. `minKm` is
    // applied only to the resolved cemetery location below, never to which
    // settlements get searched — narrowing the settlement search itself
    // would make Far Map search different settlements than
    // `landmarksWithin(200) -> filter(60)` used to (notes §5).
    const center = worldToCell(x, z)
    const searchMarginKm = 5
    const radiusCells = Math.ceil(kmToWorldUnits(maxKm + searchMarginKm) / SETTLEMENT_GRID_STEP) + 1
    const settlements = cellsWithinRadius(center, radiusCells)
      .map((cell) => lookupSettlement(cell))
      .filter((def): def is SettlementDef => def != null)
      .sort((a, b) => distanceKm(x, z, a.x, a.z) - distanceKm(x, z, b.x, b.z))
      .slice(0, MAX_CEMETERY_SETTLEMENTS_SEARCHED)

    const out: WorldLocation[] = []
    for (const def of settlements) {
      const loc = cemeteryForSettlement(def)
      if (!loc) continue
      const km = distanceKm(x, z, loc.x, loc.z)
      if (km > maxKm || km <= minKm) continue
      out.push(loc)
    }
    return out
  }

  function caveCandidates(x: number, z: number, minKm: number, maxKm: number): WorldLocation[] {
    const seed = getSeed()
    const out: WorldLocation[] = []
    for (const def of getCaves().definitions()) {
      const km = distanceKm(x, z, def.entrance.x, def.entrance.z)
      if (km > maxKm || km <= minKm) continue
      const id = `cave:${def.caveId}`
      out.push({ id, kind: 'cave', x: def.entrance.x, z: def.entrance.z, name: landmarkName(seed, 'cave', id), discoveryWeight: weightOf(seed, id) })
    }
    return out
  }

  /** Minimal classification path for one coarse cell (plan world-013 §2) —
   *  `sampleFloorAt` first; only wet cells pay for `sampleContinentalnessAt`
   *  (ocean/inland-water split), only land cells pay for
   *  `sampleMountainRidgeAt`, and only ridge cells pay for `sampleHeightAt`
   *  (exactly once, unlike the old `projectCellAt()` + duplicate
   *  `sampleHeightAt()` path). Never computes moisture region, biome
   *  weights or forest density — those are map-only concerns. */
  function classifyCoarseCell(wx: number, wz: number, params: RawSampleParams): { kind: number, height: number } {
    diagnostics.sampleFloorCalls++
    const floorH = sampleFloorAt(wx, wz, params)
    if (isWetFloor(floorH, params.waterLevel)) {
      diagnostics.sampleContinentalnessCalls++
      const continentalness = sampleContinentalnessAt(wx, wz, params)
      if (isOceanMix(continentalness, params.region.oceanThreshold, params.region.coastThreshold)) {
        return { kind: CELL_NONE, height: 0 }
      }
      return { kind: CELL_WATER, height: 0 }
    }
    diagnostics.sampleRidgeCalls++
    const ridge = sampleMountainRidgeAt(wx, wz, params)
    if (isMountainRidge(ridge)) {
      diagnostics.sampleHeightCalls++
      const height = sampleHeightAt(wx, wz, params)
      return { kind: CELL_MOUNTAIN, height }
    }
    return { kind: CELL_NONE, height: 0 }
  }

  /** Lazily-materialized `LOCATION_TILE_CELLS`² tiles of coarse-cell state,
   *  keyed by stable tile identity (plan world-013 §3/§4) — shared across
   *  every Near/Guard/Far query touching a tile, instead of one cache entry
   *  per exact `(x, z, maxKm)` query. A cell is sampled at most once for the
   *  life of the cache; overlapping queries reuse already-classified cells. */
  const tiles = new Map<string, { state: Uint8Array, height: Float32Array }>()

  function getTile(tx: number, tz: number) {
    const key = `${tx},${tz}`
    let tile = tiles.get(key)
    if (!tile) {
      tile = { state: new Uint8Array(LOCATION_TILE_CELLS * LOCATION_TILE_CELLS), height: new Float32Array(LOCATION_TILE_CELLS * LOCATION_TILE_CELLS) }
      tiles.set(key, tile)
    }
    return tile
  }

  /** Classifies (or reuses the cached classification of) coarse cell `(gx,
   *  gz)`. The single seam every scan/flood-fill/peak-check reads through —
   *  callers never need to know whether a given `(gx, gz)` was already
   *  sampled by an earlier, differently-shaped query. */
  function coarseCellAt(gx: number, gz: number, params: RawSampleParams): { kind: number, height: number } {
    const tx = Math.floor(gx / LOCATION_TILE_CELLS)
    const tz = Math.floor(gz / LOCATION_TILE_CELLS)
    const tile = getTile(tx, tz)
    const lx = gx - tx * LOCATION_TILE_CELLS
    const lz = gz - tz * LOCATION_TILE_CELLS
    const li = lz * LOCATION_TILE_CELLS + lx
    const cached = tile.state[li]
    if (cached !== CELL_UNKNOWN) {
      diagnostics.cacheHitCells++
      return { kind: cached, height: tile.height[li] ?? 0 }
    }
    const wx = (gx + 0.5) * LOCATION_SCAN_STEP
    const wz = (gz + 0.5) * LOCATION_SCAN_STEP
    const classified = classifyCoarseCell(wx, wz, params)
    tile.state[li] = classified.kind
    if (classified.kind === CELL_MOUNTAIN) tile.height[li] = classified.height
    diagnostics.sampledCells++
    if (classified.kind === CELL_WATER) diagnostics.waterCells++
    if (classified.kind === CELL_MOUNTAIN) diagnostics.mountainCells++
    return classified
  }

  function cellCenterKm(x: number, z: number, gx: number, gz: number): number {
    return distanceKm(x, z, (gx + 0.5) * LOCATION_SCAN_STEP, (gz + 0.5) * LOCATION_SCAN_STEP)
  }

  /** Flood-fills connected `inland_water` coarse cells starting from
   *  `seeds`, expanding beyond the query's own candidate window whenever a
   *  component reaches its edge (plan world-013 §4/§9) — every neighbor
   *  lookup goes through the shared `coarseCellAt` cache, so this only ever
   *  pays for genuinely new samples. A component's representative/centroid
   *  therefore depends only on the real connected component, never on which
   *  query happened to discover it first — the determinism guarantee notes
   *  §9 requires (Guard → Near → Far must equal Far → Guard → Near). */
  function floodFillLakes(x: number, z: number, minKm: number, maxKm: number, seeds: Set<number>, params: RawSampleParams): WorldLocation[] {
    const visited = new Set<number>()
    const out: WorldLocation[] = []
    for (const seedKey of seeds) {
      if (visited.has(seedKey)) continue
      const stack: number[] = [seedKey]
      visited.add(seedKey)
      let count = 0
      let sumGx = 0
      let sumGz = 0
      while (stack.length > 0) {
        const key = stack.pop()!
        const { gx, gz } = decodeCellKey(key)
        count++
        sumGx += gx
        sumGz += gz
        if (count >= LAKE_FLOOD_FILL_SAFETY_CAP) break
        for (const [dx, dz] of NEIGHBOR4) {
          const ngx = gx + dx
          const ngz = gz + dz
          const nkey = cellKeyOf(ngx, ngz)
          if (visited.has(nkey)) continue
          visited.add(nkey)
          if (coarseCellAt(ngx, ngz, params).kind !== CELL_WATER) continue
          stack.push(nkey)
        }
      }
      if (count < MIN_LAKE_CELLS) continue
      const repGx = Math.round(sumGx / count)
      const repGz = Math.round(sumGz / count)
      const loc = scanGridLocation('lake', repGx, repGz)
      const km = distanceKm(x, z, loc.x, loc.z)
      if (km > minKm && km <= maxKm) out.push(loc)
    }
    return out
  }

  /** Local-maxima (8-neighborhood) mountain cells, merged to drop
   *  near-duplicate maxima on the same coarse-grid massif (plan world-013
   *  §9/§11) — `candidates` already includes the `PEAK_SCAN_HALO_CELLS`
   *  boundary margin so a peak/maximum right at the query edge is still
   *  evaluated against its true neighbors instead of an implicit "not
   *  mountain" outside a scan rectangle (the old code's boundary bug). */
  function extractPeaks(x: number, z: number, minKm: number, maxKm: number, candidates: { gx: number, gz: number, h: number }[], params: RawSampleParams): WorldLocation[] {
    const peakCandidates: { gx: number, gz: number, h: number }[] = []
    for (const cand of candidates) {
      let isMax = true
      for (let dz = -1; dz <= 1 && isMax; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue
          const neighbor = coarseCellAt(cand.gx + dx, cand.gz + dz, params)
          if (neighbor.kind === CELL_MOUNTAIN && neighbor.height > cand.h) { isMax = false; break }
        }
      }
      if (isMax) peakCandidates.push(cand)
    }

    const kept: typeof peakCandidates = []
    for (const cand of peakCandidates.sort((a, b) => b.h - a.h)) {
      const tooClose = kept.some((k) => Math.hypot(k.gx - cand.gx, k.gz - cand.gz) <= PEAK_MERGE_RADIUS_CELLS)
      if (!tooClose) kept.push(cand)
    }

    const out: WorldLocation[] = []
    for (const peak of kept) {
      const loc = scanGridLocation('mountainPeak', peak.gx, peak.gz)
      const km = distanceKm(x, z, loc.x, loc.z)
      if (km > minKm && km <= maxKm) out.push(loc)
    }
    return out
  }

  /** Coarse-terrain scan for `lake`/`mountainPeak` candidates in
   *  `(minKm, maxKm]` of `(x, z)` (plan world-013 §7/§8) — classifies only
   *  the circular annulus `[minKm - halo, maxKm + halo]` (never the whole
   *  enclosing square, never a full `0..maxKm` re-scan), through the shared
   *  `coarseCellAt` tile cache so overlapping Near/Guard/Far queries reuse
   *  each other's work. Coarse and approximate by design (notes §7/§22
   *  pitfalls) — a gameplay discovery aid, not a cartography-grade
   *  hydrology/orography system. */
  function scanLakesAndPeaks(x: number, z: number, minKm: number, maxKm: number): WorldLocation[] {
    const params = getSampleParams()
    const haloKm = worldUnitsToKm(PEAK_SCAN_HALO_CELLS * LOCATION_SCAN_STEP)
    const outerKm = maxKm + haloKm
    const innerKm = Math.max(0, minKm - haloKm)
    const outerWorld = kmToWorldUnits(outerKm)

    const minCx = Math.floor((x - outerWorld) / LOCATION_SCAN_STEP)
    const maxCx = Math.floor((x + outerWorld) / LOCATION_SCAN_STEP)
    const minCz = Math.floor((z - outerWorld) / LOCATION_SCAN_STEP)
    const maxCz = Math.floor((z + outerWorld) / LOCATION_SCAN_STEP)

    const classifyStart = performance.now()
    const waterSeeds = new Set<number>()
    const mountainCandidates: { gx: number, gz: number, h: number }[] = []
    for (let gz = minCz; gz <= maxCz; gz++) {
      for (let gx = minCx; gx <= maxCx; gx++) {
        const km = cellCenterKm(x, z, gx, gz)
        if (km > outerKm || km < innerKm) continue
        const cell = coarseCellAt(gx, gz, params)
        if (cell.kind === CELL_WATER) waterSeeds.add(cellKeyOf(gx, gz))
        else if (cell.kind === CELL_MOUNTAIN) mountainCandidates.push({ gx, gz, h: cell.height })
      }
    }
    diagnostics.classificationMs += performance.now() - classifyStart

    const lakeStart = performance.now()
    const lakes = floodFillLakes(x, z, minKm, maxKm, waterSeeds, params)
    diagnostics.lakeExtractionMs += performance.now() - lakeStart

    const peakStart = performance.now()
    const peaks = extractPeaks(x, z, minKm, maxKm, mountainCandidates, params)
    diagnostics.peakExtractionMs += performance.now() - peakStart

    return [...lakes, ...peaks]
  }

  function landmarksInRange(x: number, z: number, minKm: number, maxKm: number): WorldLocation[] {
    const cemeteryStart = performance.now()
    const cemeteries = cemeteryCandidates(x, z, minKm, maxKm)
    diagnostics.cemeteryMs += performance.now() - cemeteryStart
    return [
      ...caveCandidates(x, z, minKm, maxKm),
      ...cemeteries,
      ...scanLakesAndPeaks(x, z, minKm, maxKm),
    ]
  }

  function landmarksWithin(x: number, z: number, maxKm: number): WorldLocation[] {
    return landmarksInRange(x, z, 0, maxKm)
  }

  return {
    getById,
    nearestSettlements,
    landmarksWithin,
    landmarksInRange,
    invalidateScanCache: () => {
      tiles.clear()
      cemeteryCache.clear()
      diagnostics = emptyDiagnostics()
    },
    getScanDiagnostics: () => diagnostics,
  }
}

/** `settlement:<def.id>` where `def.id` is already `cellKey`-formatted
 *  (`settlementGenerator.ts`) — exported for callers that build a
 *  `WorldLocation.id` from a def they already have in hand (avoids a
 *  round-trip through `getById`). */
export function settlementLocationId(def: Pick<SettlementDef, 'id'>): string {
  return `settlement:${def.id}`
}
