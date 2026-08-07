import type {
  ChunkTileRequest,
  ChunkTileResponse,
} from './chunkHeightmapProtocol'
import { computeChunkTile } from './chunkHeightmap'
import { computeChunkItems } from './chunkItems'
import { computeChunkVegetation } from './chunkVegetation'

// `self` is cast rather than adding the `webworker` TS lib, which can't coexist
// with the main thread's `dom` lib in this project's single tsconfig.
const ctx = self as unknown as {
  postMessage: (message: ChunkTileResponse, transfer: Transferable[]) => void
  onmessage: ((event: MessageEvent<ChunkTileRequest>) => void) | null
}

ctx.onmessage = ({ data: { id, params } }) => {
  try {
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
    const items = computeChunkItems({ cx: params.cx, cz: params.cz }, tile, params)
    ctx.postMessage(
      {
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
  } catch (err) {
    ctx.postMessage(
      { id, ok: false, error: err instanceof Error ? err.message : String(err) },
      [],
    )
  }
}
