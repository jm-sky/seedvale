import type {
  ChunkTileRequest,
  ChunkTileResponse,
} from './chunkHeightmapProtocol'
import { computeChunkTile } from './chunkHeightmap'

// See heightmap.worker.ts for why `self` is cast rather than adding the `webworker`
// TS lib (it can't coexist with the main thread's `dom` lib in one tsconfig).
const ctx = self as unknown as {
  postMessage: (message: ChunkTileResponse, transfer: Transferable[]) => void
  onmessage: ((event: MessageEvent<ChunkTileRequest>) => void) | null
}

ctx.onmessage = ({ data: { id, params } }) => {
  try {
    const { heights, floorHeights, biomes, bodyScale } = computeChunkTile(params)
    ctx.postMessage({ id, ok: true, heights, floorHeights, biomes, bodyScale }, [
      heights.buffer,
      floorHeights.buffer,
      biomes.buffer,
      bodyScale.buffer,
    ])
  } catch (err) {
    ctx.postMessage(
      { id, ok: false, error: err instanceof Error ? err.message : String(err) },
      [],
    )
  }
}
