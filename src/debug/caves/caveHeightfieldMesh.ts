/** Experimental cave heightfield spike — welded floor/ceiling mesh derived
 *  from `CaveHeightfield`. Three.js wrapping lives here so the field builder
 *  stays pure.
 *
 *  There is **no boundary-wall pass**. The footprint is the `gap > 0` region
 *  of the field, its outline is found with marching squares on `gap`, and the
 *  rim vertex on each crossing edge is *shared* by the floor and the ceiling.
 *  The surface therefore folds over at the rim: the wall is the outer part of
 *  the floor meeting the outer part of the ceiling, welded, with no vertical
 *  rectangles and no seam to align.
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
  type CaveHeightfield,
  heightfieldNodeGap,
  heightfieldNodeOpenSky,
} from './caveHeightfieldRepresentation'

export type HeightfieldMeshBuffers = {
  positions: Float32Array
  indices: Uint32Array
  colors: Float32Array
  vertices: number
  triangles: number
  geometryBytes: number
  /** Vertices on the `gap = 0` contour, shared by floor and ceiling. */
  rimVertexCount: number
  /** Cells that produced at least one floor triangle. */
  caveCellCount: number
  meshBuildMs: number
}

const FLOOR_COLOR = [0.42, 0.34, 0.27] as const
const CEILING_COLOR = [0.28, 0.26, 0.24] as const
/** Colour at the rim, where floor and ceiling meet and read as wall. */
const RIM_COLOR = [0.35, 0.32, 0.29] as const

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** Ring order of a cell's four corners, CCW seen from above. Verified
 *  against `computeVertexNormals()`'s `(C - B) x (A - B)`: a fan from the
 *  first entry yields +Y. */
const RING: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 0],
]

type Builder = {
  positions: number[]
  colors: number[]
  indices: number[]
}

function pushVertex(
  b: Builder,
  x: number,
  y: number,
  z: number,
  color: readonly [number, number, number],
): number {
  const i = b.positions.length / 3
  b.positions.push(x, y, z)
  b.colors.push(color[0], color[1], color[2])
  return i
}

/** Fan-triangulate a ring of vertex indices. `flip` reverses the winding so
 *  the ceiling faces −Y. */
function emitFan(b: Builder, ring: readonly number[], flip: boolean): void {
  for (let i = 1; i + 1 < ring.length; i++) {
    const a = ring[0]!
    const c = ring[i]!
    const d = ring[i + 1]!
    if (flip) b.indices.push(a, d, c)
    else b.indices.push(a, c, d)
  }
}

/**
 * Builds CPU mesh buffers for the floor and the ceiling from the same field
 * traversal uses. Interior vertices are shared between neighbouring cells
 * (so `computeVertexNormals()` can actually smooth, and there are no gaps
 * between cells); rim vertices are shared between the floor and the ceiling
 * (so the two surfaces are welded and the cave is closed).
 *
 * @domain world-terrain
 */
export function buildHeightfieldMeshBuffers(field: CaveHeightfield): HeightfieldMeshBuffers {
  const t0 = now()
  const { nx, nz, cellSize, originX, originZ, floorY, ceilY } = field
  const b: Builder = { positions: [], colors: [], indices: [] }

  const nodeCount = nx * nz
  const floorVertex = new Int32Array(nodeCount).fill(-1)
  const ceilVertex = new Int32Array(nodeCount).fill(-1)
  // Two rim slots per node: 0 = edge to +X neighbour, 1 = edge to +Z neighbour.
  const rimVertex = new Int32Array(nodeCount * 2).fill(-1)
  let rimVertexCount = 0
  let caveCellCount = 0

  const gapAt = (i: number): number => heightfieldNodeGap(field, i)

  const floorVertexAt = (ix: number, iz: number): number => {
    const i = iz * nx + ix
    let v = floorVertex[i]!
    if (v < 0) {
      v = pushVertex(b, originX + ix * cellSize, floorY[i]!, originZ + iz * cellSize, FLOOR_COLOR)
      floorVertex[i] = v
    }
    return v
  }

  const ceilVertexAt = (ix: number, iz: number): number => {
    const i = iz * nx + ix
    let v = ceilVertex[i]!
    if (v < 0) {
      v = pushVertex(b, originX + ix * cellSize, ceilY[i]!, originZ + iz * cellSize, CEILING_COLOR)
      ceilVertex[i] = v
    }
    return v
  }

  /** Rim vertex on the edge between two orthogonally adjacent nodes, created
   *  once and reused by both cells and by both surfaces. */
  const rimVertexAt = (ixA: number, izA: number, ixB: number, izB: number): number => {
    const along = ixB > ixA || izB > izA
    const loIx = along ? ixA : ixB
    const loIz = along ? izA : izB
    const slot = ixA === ixB ? 1 : 0
    const key = (loIz * nx + loIx) * 2 + slot
    let v = rimVertex[key]!
    if (v >= 0) return v
    const ia = izA * nx + ixA
    const ib = izB * nx + ixB
    const ga = gapAt(ia)
    const gb = gapAt(ib)
    const denom = ga - gb
    const t = Math.abs(denom) < 1e-9 ? 0.5 : Math.max(0, Math.min(1, ga / denom))
    const ax = originX + ixA * cellSize
    const az = originZ + izA * cellSize
    const bx = originX + ixB * cellSize
    const bz = originZ + izB * cellSize
    const midA = (floorY[ia]! + ceilY[ia]!) * 0.5
    const midB = (floorY[ib]! + ceilY[ib]!) * 0.5
    v = pushVertex(
      b,
      ax + (bx - ax) * t,
      midA + (midB - midA) * t,
      az + (bz - az) * t,
      RIM_COLOR,
    )
    rimVertex[key] = v
    rimVertexCount++
    return v
  }

  for (let iz = 0; iz + 1 < nz; iz++) {
    for (let ix = 0; ix + 1 < nx; ix++) {
      let insideCount = 0
      for (const [dx, dz] of RING) {
        if (gapAt((iz + dz) * nx + (ix + dx)) > 0) insideCount++
      }
      if (insideCount === 0) continue
      caveCellCount++

      // Walk the CCW ring, emitting each inside corner and a rim vertex
      // wherever the ring crosses `gap = 0`.
      const floorRing: number[] = []
      const ceilRing: number[] = []
      let allOpenSky = true
      for (let k = 0; k < RING.length; k++) {
        const [dxA, dzA] = RING[k]!
        const [dxB, dzB] = RING[(k + 1) % RING.length]!
        const ixA = ix + dxA
        const izA = iz + dzA
        const ixB = ix + dxB
        const izB = iz + dzB
        const insideA = gapAt(izA * nx + ixA) > 0
        const insideB = gapAt(izB * nx + ixB) > 0
        if (insideA) {
          floorRing.push(floorVertexAt(ixA, izA))
          ceilRing.push(ceilVertexAt(ixA, izA))
          if (!heightfieldNodeOpenSky(field, izA * nx + ixA)) allOpenSky = false
        }
        if (insideA !== insideB) {
          const rim = rimVertexAt(ixA, izA, ixB, izB)
          floorRing.push(rim)
          ceilRing.push(rim)
        }
      }
      if (floorRing.length < 3) continue
      emitFan(b, floorRing, false)
      // The mouth is an opening, not a roofed passage: drop the ceiling only
      // where every inside corner of the cell already breaks the surface, so
      // the portal and the terrain cutout stop on the same contour.
      if (!allOpenSky) {
        ceilRing.reverse()
        emitFan(b, ceilRing, false)
      }
    }
  }

  const positions = new Float32Array(b.positions)
  const indices = new Uint32Array(b.indices)
  const colors = new Float32Array(b.colors)
  const vertices = positions.length / 3
  return {
    positions,
    indices,
    colors,
    vertices,
    triangles: indices.length / 3,
    geometryBytes: positions.byteLength + indices.byteLength + colors.byteLength,
    rimVertexCount,
    caveCellCount,
    meshBuildMs: now() - t0,
  }
}

/**
 * Wraps heightfield mesh buffers in a `BufferGeometry`. Shared vertices, so
 * `computeVertexNormals()` produces real smooth shading.
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

/** `FrontSide` on purpose: it is the cheapest permanent detector for a
 *  winding regression. Do not "fix" a dark cave with `DoubleSide`. */
export function createHeightfieldCaveMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
    flatShading: false,
    side: FrontSide,
  })
}

export function createHeightfieldCaveMesh(field: CaveHeightfield): {
  mesh: Mesh
  buffers: HeightfieldMeshBuffers
} {
  const buffers = buildHeightfieldMeshBuffers(field)
  const mesh = new Mesh(createHeightfieldCaveGeometry(buffers), createHeightfieldCaveMaterial())
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = 'cave-heightfield'
  return { mesh, buffers }
}
