import type { CropPlacement } from '../world/cropLifecycle'
import type { EnvironmentPlacement } from './chunkEnvironment'
import type { ChunkTileData, ChunkTileParams } from './chunkHeightmap'
import type { ItemPlacement } from './chunkItems'
import type { ChunkMeshData, ChunkMeshDataParams } from './chunkMeshData'
import type { VegetationPlacement } from './chunkVegetation'
import type { GrassChunkData, GrassComputeParams, GrassTileGrids } from './grassPlacement'

/** A resolved tile's terrain grids plus its vegetation/item/decorative
 *  placements — what the worker pool ultimately hands back to
 *  `chunkManager.ts`. */
export type ChunkTileResult = ChunkTileData & {
  vegetation: VegetationPlacement[]
  items: ItemPlacement[]
  environment: EnvironmentPlacement[]
  /** Deterministic wild-crop placements (plan 172, `chunkCrops.ts`) — same
   *  worker-computed, main-thread-instantiated contract as `items`. */
  crops: CropPlacement[]
}

/** Grass placement request (plan 086) — the tile grids ride along as
 *  structured-clone copies, not transferred: the main thread keeps its own
 *  `ChunkTileResult.heights` etc. for `sampleHeight`/dig overlays, and a
 *  transfer would detach them. See `chunkWorkerPool.ts`'s `requestChunkGrass`. */
export type GrassRequestParams = GrassComputeParams & {
  grids: GrassTileGrids
}

export type ChunkWorkerRequest =
  | { kind: 'tile', id: number, params: ChunkTileParams }
  | { kind: 'grass', id: number, params: GrassRequestParams }
  | { kind: 'mesh', id: number, params: ChunkMeshDataParams }

export type ChunkWorkerResponse =
  | (ChunkTileResult & { kind: 'tile', id: number, ok: true })
  | { kind: 'grass', id: number, ok: true, grass: GrassChunkData }
  | (ChunkMeshData & { kind: 'mesh', id: number, ok: true })
  | { kind: 'tile' | 'grass' | 'mesh', id: number, ok: false, error: string }
