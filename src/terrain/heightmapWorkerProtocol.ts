import type { HeightmapParams } from './generateHeightmap'

export type HeightmapWorkerRequest = {
  id: number
  params: HeightmapParams
}

export type HeightmapWorkerResponse =
  | {
      id: number
      ok: true
      heights: Float32Array
      floorHeights: Float32Array
      biomes: Float32Array
      bodyScale: Float32Array
    }
  | { id: number; ok: false; error: string }
