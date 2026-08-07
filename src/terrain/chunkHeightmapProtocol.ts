import type { ChunkTileParams } from './chunkHeightmap'

export type ChunkTileRequest = {
  id: number
  params: ChunkTileParams
}

export type ChunkTileResponse =
  | {
      id: number
      ok: true
      heights: Float32Array
      floorHeights: Float32Array
      biomes: Float32Array
      bodyScale: Float32Array
    }
  | { id: number; ok: false; error: string }
