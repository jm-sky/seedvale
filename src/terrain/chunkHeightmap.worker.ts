import type {
  ChunkWorkerRequest,
  ChunkWorkerResponse,
} from './chunkHeightmapProtocol'
import { computeChunkCrops } from './chunkCrops'
import { computeChunkEnvironment } from './chunkEnvironment'
import { computeChunkTile } from './chunkHeightmap'
import { computeChunkItems } from './chunkItems'
import { computeChunkMeshData } from './chunkMeshData'
import { computeChunkVegetation } from './chunkVegetation'
import { computeChunkGrass, GRASS_SPECIES_ORDER, type GrassChunkData } from './grassPlacement'

// `self` is cast rather than adding the `webworker` TS lib, which can't coexist
// with the main thread's `dom` lib in this project's single tsconfig.
const ctx = self as unknown as {
  postMessage: (message: ChunkWorkerResponse, transfer: Transferable[]) => void
  onmessage: ((event: MessageEvent<ChunkWorkerRequest>) => void) | null
}

/** Every bucket's typed arrays, zero-copy transferred back to the main
 *  thread — the request's tile grids ride as structured-clone copies
 *  instead (see `ChunkWorkerPool`'s `requestChunkGrass`), since the main
 *  thread needs to keep its own `tile.heights` etc. */
function grassTransferList(grass: GrassChunkData): Transferable[] {
  const transfer: Transferable[] = []
  for (const id of GRASS_SPECIES_ORDER) {
    const bucket = grass[id]
    if (!bucket) continue
    transfer.push(
      bucket.matrices.buffer,
      bucket.phases.buffer,
      bucket.baseColors.buffer,
      bucket.tipColors.buffer,
      bucket.windFactors.buffer,
    )
  }
  return transfer
}

ctx.onmessage = ({ data }) => {
  const { id, kind } = data
  try {
    if (kind === 'tile') {
      const { params } = data
      const tile = computeChunkTile(params)
      const {
        heights,
        floorHeights,
        biomes,
        bodyScale,
        continentalness,
        mountainRidge,
        moistureRegion,
        roadTint,
      } = tile
      const vegetation = computeChunkVegetation({ cx: params.cx, cz: params.cz }, tile, params)
      const items = computeChunkItems({ cx: params.cx, cz: params.cz }, tile, params, vegetation)
      const environment = computeChunkEnvironment({ cx: params.cx, cz: params.cz }, tile, params, vegetation)
      const crops = computeChunkCrops({ cx: params.cx, cz: params.cz }, tile, params)
      ctx.postMessage(
        {
          kind: 'tile',
          id,
          ok: true,
          heights,
          floorHeights,
          biomes,
          bodyScale,
          continentalness,
          mountainRidge,
          moistureRegion,
          roadTint,
          vegetation,
          items,
          environment,
          crops,
        },
        [
          heights.buffer,
          floorHeights.buffer,
          biomes.buffer,
          bodyScale.buffer,
          continentalness.buffer,
          mountainRidge.buffer,
          moistureRegion.buffer,
          roadTint.buffer,
        ],
      )
    } else if (kind === 'grass') {
      const { params } = data
      const grass = computeChunkGrass(params, params.grids)
      ctx.postMessage({ kind: 'grass', id, ok: true, grass }, grassTransferList(grass))
    } else {
      const { params } = data
      const meshData = computeChunkMeshData(params)
      ctx.postMessage(
        { kind: 'mesh', id, ok: true, ...meshData },
        [
          meshData.positionY.buffer,
          meshData.normal.buffer,
          meshData.color.buffer,
          meshData.bareGround.buffer,
        ],
      )
    }
  } catch (err) {
    ctx.postMessage(
      { kind, id, ok: false, error: err instanceof Error ? err.message : String(err) },
      [],
    )
  }
}
