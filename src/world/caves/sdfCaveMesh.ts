/** Plan world-terrain-008 — derived presentation geometry for the production
 *  Graph + Local SDF representation (`caveSdfField.ts`): grid sampling +
 *  Naive Surface Nets extraction + analytic-surface clipping +
 *  `THREE.BufferGeometry`. Field/topology interpretation lives in
 *  `caveSdfField.ts`; CPU extraction is `caveSdfExtraction.ts` so a worker
 *  can run it without Three.js.
 *
 * @domain world-terrain
 */

import * as THREE from 'three'
import type { CaveSpikeMetrics } from './caveSpikeMetrics'
import type { CaveTopology, CaveTopologyPoint } from './caveTopology'
import { isSystemEnabled } from '../../debug/debugMode'
import {
  cavePresentationBounds,
  extractCaveSdfSurface,
  extractSurfaceNets,
  sampleGrid,
} from './caveSdfExtraction'
import {
  type Bounds,
  buildCaveSdfRepresentation,
  buildVoidField,
  type CaveSdfSpatialRepresentation,
  DEFAULT_SDF_PARAMS,
  type SdfCaveParams,
  type VoidPrimitive,
} from './caveSdfField'
import { clipTrianglesBelowSurface, clipTrianglesInFrontOfMouth, type SurfaceHeightSampler } from './clipBelowSurface'

export { DEFAULT_SDF_PARAMS, type SdfCaveParams } from './caveSdfField'

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export type SdfCaveResult = { geometry: THREE.BufferGeometry, metrics: CaveSpikeMetrics }

/**
 * World-dependent clipping + BufferGeometry finalisation. Worker extraction
 * hands typed arrays here; analytic surface height stays on main.
 *
 * @domain world-terrain
 */
export function finalizeSdfCaveMesh(
  positionsIn: ArrayLike<number>,
  indicesIn: ArrayLike<number>,
  topology: CaveTopology,
  surfaceHeightAt?: SurfaceHeightSampler,
): { geometry: THREE.BufferGeometry, clippingMs: number, bufferGeometryMs: number, normalsBoundsMs: number, vertices: number, triangles: number, geometryBytes: number, bounds: CaveSpikeMetrics['bounds'] } {
  const t0 = now()
  const surfaceClipped = surfaceHeightAt
    ? clipTrianglesBelowSurface(positionsIn, indicesIn, surfaceHeightAt)
    : { positions: Array.from(positionsIn), indices: Array.from(indicesIn) }
  const { positions, indices } = surfaceHeightAt
    ? clipTrianglesInFrontOfMouth(surfaceClipped.positions, surfaceClipped.indices, topology.entrance)
    : surfaceClipped
  const t1 = now()

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  const t2 = now()
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  const t3 = now()

  const vertices = positions.length / 3
  const triangles = indices.length / 3
  const bb = geometry.boundingBox!
  return {
    geometry,
    clippingMs: t1 - t0,
    bufferGeometryMs: t2 - t1,
    normalsBoundsMs: t3 - t2,
    vertices,
    triangles,
    geometryBytes: positions.length * 4 + indices.length * 4 + vertices * 3 * 4,
    bounds: { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] },
  }
}

/**
 * Builds Cave V2's production presentation geometry for `topology`. Pure —
 * no scene/collision/save side effects. Local grid only: bounded to the
 * representation's own footprint plus margin, never a global voxel terrain.
 * Used by tests and any remaining synchronous callers; the streaming path
 * uses worker extraction + `finalizeSdfCaveMesh`.
 *
 * @domain world-terrain
 */
export function buildSdfCaveMesh(
  topology: CaveTopology,
  params: SdfCaveParams = DEFAULT_SDF_PARAMS,
  surfaceHeightAt?: SurfaceHeightSampler,
  representation?: CaveSdfSpatialRepresentation,
): SdfCaveResult {
  const detailEnabled = isSystemEnabled('caveDetail')
  const field = representation ?? buildCaveSdfRepresentation(topology, params, detailEnabled)
  const meshBounds = cavePresentationBounds(field.bounds, topology, params)
  const extracted = extractCaveSdfSurface({
    topology,
    params,
    detailEnabled,
    meshBounds,
    representation: field,
  })
  const finalized = finalizeSdfCaveMesh(extracted.positions, extracted.indices, topology, surfaceHeightAt)

  const metrics: CaveSpikeMetrics = {
    variant: 'sdf',
    topologyBuildMs: 0,
    representationMs: extracted.representationMs,
    meshBuildMs: extracted.sdfSamplingMs + extracted.surfaceNetsMs,
    sdfSamplingMs: extracted.sdfSamplingMs,
    surfaceNetsMs: extracted.surfaceNetsMs,
    clippingMs: finalized.clippingMs,
    bufferGeometryMs: finalized.bufferGeometryMs,
    normalsBoundsMs: finalized.normalsBoundsMs,
    vertices: finalized.vertices,
    triangles: finalized.triangles,
    geometryBytes: finalized.geometryBytes,
    peakTempBytes: extracted.peakTempBytes,
    bounds: finalized.bounds,
    params,
    detailEnabled,
  }

  return { geometry: finalized.geometry, metrics }
}

/** Plan §10/§9 accidental-union stress test config: two spatially close but
 *  topologically unconnected void clusters. The clusters carry no topology
 *  segment between them — a real check that a smooth union does not bridge
 *  sections the layout never asked to be connected. */
export type AccidentalUnionStressConfig = {
  clusterA: { center: CaveTopologyPoint, radius: number }
  clusterB: { center: CaveTopologyPoint, radius: number }
  cellSize: number
  smoothK: number
}

/**
 * Builds just the two-cluster field from `config` and extracts it — bypasses
 * `CaveTopology`/`caveSdfField.ts` entirely since the point is exactly that
 * these clusters are *not* topologically connected. Used only by the
 * accidental-union stress test.
 *
 * @domain world-terrain
 */
export function buildAccidentalUnionStressMesh(config: AccidentalUnionStressConfig): { positions: number[], indices: number[] } {
  const primitives: VoidPrimitive[] = [
    { cx: config.clusterA.center.x, cy: config.clusterA.center.y, cz: config.clusterA.center.z, rx: config.clusterA.radius, ry: config.clusterA.radius, rz: config.clusterA.radius },
    { cx: config.clusterB.center.x, cy: config.clusterB.center.y, cz: config.clusterB.center.z, rx: config.clusterB.radius, ry: config.clusterB.radius, rz: config.clusterB.radius },
  ]
  const field = buildVoidField(primitives, [], config.smoothK, null)
  const margin = config.cellSize * 2
  const bounds: Bounds = {
    minX: Math.min(config.clusterA.center.x - config.clusterA.radius, config.clusterB.center.x - config.clusterB.radius) - margin,
    maxX: Math.max(config.clusterA.center.x + config.clusterA.radius, config.clusterB.center.x + config.clusterB.radius) + margin,
    minY: Math.min(config.clusterA.center.y - config.clusterA.radius, config.clusterB.center.y - config.clusterB.radius) - margin,
    maxY: Math.max(config.clusterA.center.y + config.clusterA.radius, config.clusterB.center.y + config.clusterB.radius) + margin,
    minZ: Math.min(config.clusterA.center.z - config.clusterA.radius, config.clusterB.center.z - config.clusterB.radius) - margin,
    maxZ: Math.max(config.clusterA.center.z + config.clusterB.radius, config.clusterB.center.z + config.clusterB.radius) + margin,
  }
  const grid = sampleGrid(bounds, config.cellSize, field)
  return extractSurfaceNets(grid)
}

/** Test-only helper: number of connected components in a triangle mesh
 *  (union-find over shared vertex indices), used by the accidental-union
 *  stress test to check whether two topologically disconnected sections
 *  ended up spatially bridged by the smooth union. */
export function countConnectedComponents(indices: readonly number[], vertexCount: number): number {
  const parent = Int32Array.from({ length: vertexCount }, (_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  for (let i = 0; i < indices.length; i += 3) {
    union(indices[i]!, indices[i + 1]!)
    union(indices[i + 1]!, indices[i + 2]!)
  }
  const roots = new Set<number>()
  const used = new Set<number>(indices)
  for (const v of used) roots.add(find(v))
  return roots.size
}
