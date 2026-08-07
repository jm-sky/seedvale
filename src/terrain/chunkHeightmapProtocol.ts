import type { ChunkTileData, ChunkTileParams } from './chunkHeightmap'
import type { VegetationPlacement } from './chunkVegetation'

export type ChunkTileRequest = {
  id: number
  params: ChunkTileParams
}

/** A resolved tile's terrain grids plus its vegetation placements — what the
 *  worker pool ultimately hands back to `chunkManager.ts`. */
export type ChunkTileResult = ChunkTileData & { vegetation: VegetationPlacement[] }

export type ChunkTileResponse =
  | (ChunkTileResult & {
      id: number
      ok: true
    })
  | { id: number; ok: false; error: string }
