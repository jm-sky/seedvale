/** Plan world-terrain-008 B4.2 — dedicated cave SDF extraction worker.
 *  Rebuilds the deterministic SDF representation from serializable
 *  topology/config, samples the grid, and extracts Surface Nets. Clipping and
 *  Three.js stay on main.
 */

import type { CaveWorkerRequest, CaveWorkerResponse } from './caveExtractionProtocol'
import { extractCaveSdfSurface } from './caveSdfExtraction'

const ctx = self as unknown as {
  postMessage: (message: CaveWorkerResponse, transfer: Transferable[]) => void
  onmessage: ((event: MessageEvent<CaveWorkerRequest>) => void) | null
}

ctx.onmessage = ({ data }) => {
  const { id, caveId, requestId } = data
  try {
    const extracted = extractCaveSdfSurface({
      topology: data.topology,
      params: data.params,
      detailEnabled: data.detailEnabled,
      meshBounds: data.meshBounds,
    })
    ctx.postMessage(
      {
        ok: true,
        id,
        caveId,
        requestId,
        positions: extracted.positions,
        indices: extracted.indices,
        metrics: {
          representationMs: extracted.representationMs,
          sdfSamplingMs: extracted.sdfSamplingMs,
          surfaceNetsMs: extracted.surfaceNetsMs,
          vertices: extracted.vertices,
          triangles: extracted.triangles,
          peakTempBytes: extracted.peakTempBytes,
          gridCells: extracted.gridCells,
        },
      },
      [extracted.positions.buffer, extracted.indices.buffer],
    )
  } catch (err) {
    ctx.postMessage(
      {
        ok: false,
        id,
        caveId,
        requestId,
        error: err instanceof Error ? err.message : String(err),
      },
      [],
    )
  }
}
