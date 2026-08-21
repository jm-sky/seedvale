import type { RawSampleParams } from './chunkHeightmap'
import { computeRiverTile, type RiverChain, type RiverTileCoord, riverTileKey } from './riverNetwork'

/**
 * Bounded, reference-counted cache of computed river tiles — the "on-demand
 * hydrology analysis region... kept in a bounded cache" the plan 181
 * implementation notes call for. A tile is computed once, the first time any
 * loaded chunk needs it, and shared by every other chunk overlapping it;
 * evicted the moment no loaded chunk still references it. No TTL/LRU needed —
 * membership is exactly reference-counted, same idea as
 * `vegetationRegionBatcher.ts`'s per-chunk membership, applied to tiles
 * instead of chunk-groups.
 */
export type RiverTileCache = {
  /** Computes (if needed) and retains a tile, returning its chains. */
  retain(tile: RiverTileCoord, sampleParams: RawSampleParams): RiverChain[]
  /** Releases one reference; the tile is evicted once nothing references it. */
  release(tile: RiverTileCoord): void
  disposeAll(): void
}

type CacheEntry = { chains: RiverChain[]; refCount: number }

export function createRiverTileCache(): RiverTileCache {
  const entries = new Map<string, CacheEntry>()

  return {
    retain(tile, sampleParams) {
      const key = riverTileKey(tile)
      let entry = entries.get(key)
      if (!entry) {
        entry = { chains: computeRiverTile(tile, sampleParams), refCount: 0 }
        entries.set(key, entry)
      }
      entry.refCount++
      return entry.chains
    },
    release(tile) {
      const key = riverTileKey(tile)
      const entry = entries.get(key)
      if (!entry) return
      entry.refCount--
      if (entry.refCount <= 0) entries.delete(key)
    },
    disposeAll() {
      entries.clear()
    },
  }
}
