import type {
  HeightmapWorkerRequest,
  HeightmapWorkerResponse,
} from './heightmapWorkerProtocol'
import { computeHeightmapData } from './heightmapCompute'

// `self` inside a worker is a DedicatedWorkerGlobalScope, but this project's
// single tsconfig.json has `"lib": [..., "DOM"]` for the main thread — adding
// the `webworker` lib to get that type would conflict with `dom`'s globals
// (they can't coexist in one program). Cast to the minimal surface this file
// actually uses instead of touching the shared tsconfig.
const ctx = self as unknown as {
  postMessage: (message: HeightmapWorkerResponse, transfer: Transferable[]) => void
  onmessage: ((event: MessageEvent<HeightmapWorkerRequest>) => void) | null
}

ctx.onmessage = ({ data: { id, params } }) => {
  try {
    const { heights, floorHeights, biomes, bodyScale } = computeHeightmapData(params)
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
