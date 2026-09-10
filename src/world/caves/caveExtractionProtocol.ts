/** Plan world-terrain-008 B4.2 — serializable cave extraction worker protocol.
 *  Topology + SDF params only; no Three.js, no executable SDF sample fn,
 *  no analytic surface height (clipping stays on main).
 *
 * @domain world-terrain
 */

import type { Bounds, SdfCaveParams } from './caveSdfField'
import type { CaveTopology } from './caveTopology'

export type CaveExtractionRequest = {
  caveId: string
  requestId: number
  topology: CaveTopology
  params: SdfCaveParams
  detailEnabled: boolean
  meshBounds: Bounds
  distance: number
}

export type CaveExtractionMetrics = {
  representationMs: number
  sdfSamplingMs: number
  surfaceNetsMs: number
  vertices: number
  triangles: number
  peakTempBytes: number
  gridCells: number
}

export type CaveExtractionResult = {
  caveId: string
  requestId: number
  positions: Float32Array
  indices: Uint32Array
  metrics: CaveExtractionMetrics
}

export type CaveWorkerRequest = Omit<CaveExtractionRequest, 'distance'> & { id: number }

export type CaveWorkerResponse =
  | (CaveExtractionResult & { ok: true, id: number })
  | { ok: false, id: number, caveId: string, requestId: number, error: string }
