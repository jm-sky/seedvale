import type { ItemKind } from '../items/items'
import type { ChunkCoord } from './chunkGrid'
import { worldToChunk } from './chunkGrid'

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
import { type ChunkTileParams, computeChunkTile } from './chunkHeightmap'
import { computeChunkItems, type ItemPlacement } from './chunkItems'
import { computeChunkVegetation } from './chunkVegetation'

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
 * off-screen gather queries that must respect `collectedItemIds`.
 *
 * @domain settlements-npcs
 */
export function proceduralChunkItems(
  coord: ChunkCoord,
  params: ChunkTileParams,
  collectedItemIds: ReadonlySet<string>,
): readonly ItemPlacement[] {
  const tile = computeChunkTile(params)
  const vegetation = computeChunkVegetation(coord, tile, params)
  return computeChunkItems(coord, tile, params, vegetation).filter((p) => !collectedItemIds.has(p.id))
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
