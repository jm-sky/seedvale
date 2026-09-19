import type { ItemKind } from '../items/items'
import type { ChunkCoord } from './chunkGrid'
import { worldToChunk } from './chunkGrid'
import { type ChunkTileParams, computeChunkTile } from './chunkHeightmap'
import { computeChunkItems, type ItemPlacement } from './chunkItems'
import { computeChunkVegetation } from './chunkVegetation'
import {
  isWorldItemPlacementAvailable,
  type RenewableWorldItemOverrides,
} from './renewableWorldItems'

function ringChunkOffsets(maxRadius: number): { dx: number, dz: number }[] {
  const offsets: { dx: number, dz: number }[] = [{ dx: 0, dz: 0 }]
  for (let r = 1; r <= maxRadius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        offsets.push({ dx, dz })
      }
    }
  }
  return offsets
}

export type WorldChunkItemRef = {
  id: string
  kind: ItemKind
  x: number
  z: number
}

/** Parses deterministic world-item ids (`cx:cz:f<i>` / `cx:cz:c<i>`). */
export function chunkCoordFromWorldItemId(id: string): ChunkCoord | null {
  const parts = id.split(':')
  if (parts.length < 3) return null
  const cx = Number(parts[0])
  const cz = Number(parts[1])
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null
  return { cx, cz }
}

/**
 * Recomputes procedural chunk items for one coord — same pipeline as chunk
 * load (`chunkHeightmap.worker.ts`), minus mesh instantiation. Used for bounded
 * off-screen gather queries that must respect permanent `collectedItemIds` and
 * the medicinal renewable overlay (plan items-player-043).
 *
 * @domain settlements-npcs
 */
export function proceduralChunkItems(
  coord: ChunkCoord,
  params: ChunkTileParams,
  collectedItemIds: ReadonlySet<string>,
  renewableWorldItems: RenewableWorldItemOverrides = {},
  nowDays = 0,
): readonly ItemPlacement[] {
  const tile = computeChunkTile(params)
  const vegetation = computeChunkVegetation(coord, tile, params)
  return computeChunkItems(coord, tile, params, vegetation).filter((p) =>
    isWorldItemPlacementAvailable(p, collectedItemIds, renewableWorldItems, nowDays),
  )
}

/**
 * Deterministic nearest collectible among `loaded` (meshed) candidates and
 * `resolveChunk` (procedural, off-screen) placements. Stable id tie-break at
 * equal distance — no randomness (plan settlements-npcs-007 §13).
 */
export function nearestWorldChunkItem(
  x: number,
  z: number,
  radius: number,
  kinds: ReadonlySet<ItemKind>,
  chunkSize: number,
  loaded: readonly WorldChunkItemRef[],
  resolveChunk: (coord: ChunkCoord) => readonly WorldChunkItemRef[],
  maxChunkRadius: number,
): WorldChunkItemRef | null {
  let best: WorldChunkItemRef | null = null
  let bestDistSq = radius * radius

  const consider = (item: WorldChunkItemRef): void => {
    if (!kinds.has(item.kind)) return
    const dx = item.x - x
    const dz = item.z - z
    const distSq = dx * dx + dz * dz
    if (distSq > bestDistSq) return
    if (best && distSq === bestDistSq && item.id >= best.id) return
    best = item
    bestDistSq = distSq
  }

  for (const item of loaded) consider(item)

  const center = worldToChunk(x, z, chunkSize)
  for (const { dx, dz } of ringChunkOffsets(maxChunkRadius)) {
    const coord: ChunkCoord = { cx: center.cx + dx, cz: center.cz + dz }
    for (const item of resolveChunk(coord)) consider(item)
  }

  return best
}

/**
 * Bounded top-`limit` nearest collectibles among `loaded` (meshed) candidates
 * and `resolveChunk` (procedural, off-screen) placements — same candidate
 * universe and off-screen resolution as `nearestWorldChunkItem`, generalized
 * to a small ordered result set (plan npc-057 §8) instead of only the single
 * best. Stable ordering: distance ascending, then id ascending at an exact
 * tie — no randomness. Deduplicates by id (a loaded item's own chunk is
 * always included in the ring scan too).
 */
export function nearestWorldChunkItems(
  x: number,
  z: number,
  radius: number,
  kinds: ReadonlySet<ItemKind>,
  chunkSize: number,
  loaded: readonly WorldChunkItemRef[],
  resolveChunk: (coord: ChunkCoord) => readonly WorldChunkItemRef[],
  maxChunkRadius: number,
  limit: number,
): readonly WorldChunkItemRef[] {
  const radiusSq = radius * radius
  const seen = new Set<string>()
  const candidates: (WorldChunkItemRef & { distSq: number })[] = []

  const consider = (item: WorldChunkItemRef): void => {
    if (!kinds.has(item.kind) || seen.has(item.id)) return
    const dx = item.x - x
    const dz = item.z - z
    const distSq = dx * dx + dz * dz
    if (distSq > radiusSq) return
    seen.add(item.id)
    candidates.push({ ...item, distSq })
  }

  for (const item of loaded) consider(item)

  const center = worldToChunk(x, z, chunkSize)
  for (const { dx, dz } of ringChunkOffsets(maxChunkRadius)) {
    const coord: ChunkCoord = { cx: center.cx + dx, cz: center.cz + dz }
    for (const item of resolveChunk(coord)) consider(item)
  }

  candidates.sort((a, b) => a.distSq - b.distSq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return candidates.slice(0, limit).map(({ distSq: _distSq, ...item }) => item)
}
