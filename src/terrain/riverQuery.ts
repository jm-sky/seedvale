import type { RawSampleParams, RiverChannelSegment } from './chunkHeightmap'
import {
  computeRiverTile,
  overlappingRiverTiles,
  type RiverChain,
  riverChannelSegmentsNear,
  riverTileKey,
} from './riverNetwork'

/**
 * @domain terrain
 * @system water
 * @role Analytic "what river geometry is around here" seam for *placement*
 *   code (settlement sites, village plots) that runs long before — and
 *   independently of — chunk streaming. Returns the same canonical
 *   `RiverChannelSegment[]` terrain carving and the water ribbon are built
 *   from (`riverChannelSegmentsNear`), so placement never reasons about
 *   rivers through a second, approximate representation.
 * @integration Deliberately separate from `riverTileCache.ts`: that cache is
 *   reference-counted against *loaded chunks* and evicts the moment no chunk
 *   holds a tile, which is the wrong lifetime for a query that has to answer
 *   for settlements far outside the loaded ring. This keeps its own small
 *   bounded map instead, at the cost of recomputing a tile the chunk cache
 *   may also hold. Both compute through the identical pure `computeRiverTile`,
 *   so the two can never disagree.
 */
export type RiverQuery = {
  /** Canonical channel segments whose carve reach overlaps a `size`-sided box
   *  centred on `(x, z)` — same filtering `chunkManager` applies per chunk. */
  segmentsNear(x: number, z: number, size: number): RiverChannelSegment[]
}

/** Tiles kept resident. A river tile is 256 m/side, so this covers a very
 *  generous area around wherever placement is currently working; oldest
 *  entries drop out first (insertion order) rather than growing unbounded
 *  across a long session of world traversal. */
const MAX_RESIDENT_TILES = 64

/**
 * Builds a `RiverQuery` over one world's `RawSampleParams`. Deterministic:
 * every answer is a pure function of `(sampleParams, x, z, size)`, the cache
 * only avoids recomputing a tile.
 *
 * @domain terrain
 */
export function createRiverQuery(sampleParams: RawSampleParams): RiverQuery {
  const tiles = new Map<string, RiverChain[]>()

  const chainsFor = (tx: number, tz: number): RiverChain[] => {
    const key = riverTileKey({ tx, tz })
    let chains = tiles.get(key)
    if (!chains) {
      chains = computeRiverTile({ tx, tz }, sampleParams)
      tiles.set(key, chains)
      if (tiles.size > MAX_RESIDENT_TILES) {
        const oldest = tiles.keys().next()
        if (!oldest.done) tiles.delete(oldest.value)
      }
    }
    return chains
  }

  return {
    segmentsNear(x, z, size) {
      const half = size / 2
      const chains: RiverChain[] = []
      for (const tile of overlappingRiverTiles({
        minX: x - half,
        maxX: x + half,
        minZ: z - half,
        maxZ: z + half,
      })) {
        chains.push(...chainsFor(tile.tx, tile.tz))
      }
      return chains.length === 0 ? [] : riverChannelSegmentsNear(chains, x, z, size)
    },
  }
}
