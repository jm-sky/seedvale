/** Experimental cave heightfield spike — floor / ceiling / boundary-wall
 *  mesh buffers derived from `CaveHeightfieldRepresentation`. Three.js
 *  wrapping lives here so the representation builder stays pure.
 *
 * @domain world-terrain
 */

import {
  BufferAttribute,
  BufferGeometry,
  FrontSide,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import {
  type CaveHeightfieldRepresentation,
  extractHeightfieldBoundaryEdges,
  type HeightfieldBoundaryEdge,
} from './caveHeightfieldRepresentation'

export type HeightfieldMeshBuffers = {
  positions: Float32Array
  indices: Uint32Array
  colors: Float32Array
  vertices: number
  triangles: number
  geometryBytes: number
  boundaryEdgeCount: number
  meshBuildMs: number
}

const FLOOR_COLOR = [0.42, 0.34, 0.27] as const
const CEILING_COLOR = [0.28, 0.26, 0.24] as const
const WALL_COLOR = [0.36, 0.33, 0.30] as const

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function pushVertex(
  positions: number[],
  colors: number[],
  x: number,
  y: number,
  z: number,
  color: readonly [number, number, number],
): number {
  const i = positions.length / 3
  positions.push(x, y, z)
  colors.push(color[0], color[1], color[2])
  return i
}

function emitFloorOrCeiling(
  representation: CaveHeightfieldRepresentation,
  positions: number[],
  indices: number[],
  colors: number[],
  ceiling: boolean,
): void {
  const { width, depth, inside, originX, originZ, cellSize, floorY, ceilingY } = representation
  const color = ceiling ? CEILING_COLOR : FLOOR_COLOR
  for (let iz = 0; iz < depth; iz++) {
    for (let ix = 0; ix < width; ix++) {
      const i = iz * width + ix
      if (!inside[i]) continue
      if (ceiling && representation.openSky[i]) continue
      const x0 = originX + ix * cellSize
      const z0 = originZ + iz * cellSize
      const x1 = x0 + cellSize
      const z1 = z0 + cellSize
      const y = ceiling ? ceilingY[i]! : floorY[i]!
      const v00 = pushVertex(positions, colors, x0, y, z0, color)
      const v10 = pushVertex(positions, colors, x1, y, z0, color)
      const v11 = pushVertex(positions, colors, x1, y, z1, color)
      const v01 = pushVertex(positions, colors, x0, y, z1, color)
      if (ceiling) {
        // Wind opposite the floor so normals face the interior (−Y).
        indices.push(v00, v01, v10, v10, v01, v11)
      } else {
        indices.push(v00, v10, v01, v10, v11, v01)
      }
    }
  }
}

function emitWalls(
  edges: readonly HeightfieldBoundaryEdge[],
  positions: number[],
  indices: number[],
  colors: number[],
): void {
  for (const edge of edges) {
    const v0 = pushVertex(positions, colors, edge.x0, edge.floorY0, edge.z0, WALL_COLOR)
    const v1 = pushVertex(positions, colors, edge.x1, edge.floorY1, edge.z1, WALL_COLOR)
    const v2 = pushVertex(positions, colors, edge.x0, edge.ceilingY0, edge.z0, WALL_COLOR)
    const v3 = pushVertex(positions, colors, edge.x1, edge.ceilingY1, edge.z1, WALL_COLOR)
    const ex = edge.x1 - edge.x0
    const ez = edge.z1 - edge.z0
    const crossX = -ez
    const crossZ = ex
    const aligned = crossX * edge.inwardX + crossZ * edge.inwardZ >= 0
    if (aligned) {
      indices.push(v0, v1, v2, v1, v3, v2)
    } else {
      indices.push(v0, v2, v1, v1, v2, v3)
    }
  }
}

/**
 * Builds CPU mesh buffers for floor, ceiling and boundary walls from the
 * same heightfield representation used by traversal.
 *
 * @domain world-terrain
 */
export function buildHeightfieldMeshBuffers(
  representation: CaveHeightfieldRepresentation,
): HeightfieldMeshBuffers {
  const t0 = now()
  const edges = extractHeightfieldBoundaryEdges(representation)
  const positions: number[] = []
  const indices: number[] = []
  const colors: number[] = []
  emitFloorOrCeiling(representation, positions, indices, colors, false)
  emitFloorOrCeiling(representation, positions, indices, colors, true)
  emitWalls(edges, positions, indices, colors)
  const positionArray = new Float32Array(positions)
  const indexArray = new Uint32Array(indices)
  const colorArray = new Float32Array(colors)
  const vertices = positionArray.length / 3
  const triangles = indexArray.length / 3
  return {
    positions: positionArray,
    indices: indexArray,
    colors: colorArray,
    vertices,
    triangles,
    geometryBytes: positionArray.length * 4 + indexArray.length * 4 + vertices * 3 * 4,
    boundaryEdgeCount: edges.length,
    meshBuildMs: now() - t0,
  }
}

/**
 * Wraps heightfield mesh buffers in a `BufferGeometry`. Front-side so
 * inverted winding is visible in Inspect mode.
 *
 * @domain world-terrain
 */
export function createHeightfieldCaveGeometry(buffers: HeightfieldMeshBuffers): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(buffers.positions, 3))
  geometry.setAttribute('color', new BufferAttribute(buffers.colors, 3))
  geometry.setIndex(new BufferAttribute(buffers.indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  return geometry
}

export function createHeightfieldCaveMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0,
    flatShading: true,
    side: FrontSide,
  })
}

export function createHeightfieldCaveMesh(representation: CaveHeightfieldRepresentation): {
  mesh: Mesh
  buffers: HeightfieldMeshBuffers
} {
  const buffers = buildHeightfieldMeshBuffers(representation)
  const mesh = new Mesh(createHeightfieldCaveGeometry(buffers), createHeightfieldCaveMaterial())
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = 'cave-heightfield'
  return { mesh, buffers }
}
