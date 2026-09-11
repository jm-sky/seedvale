/** Production cave presentation from the heightfield representation (plan
 *  world-terrain-019 Milestone B) — the Three.js wrapper around
 *  `caveHeightfieldMesh.ts`. Builds one disposable group per activated cave:
 *  the welded floor/ceiling mesh, the presentation-only mouth underside mask
 *  and optional contour-driven rock framing.
 *
 *  Ownership: `createCaves()` decides *when* (streaming controller) and owns
 *  the shared materials; this module only assembles scene objects. Nothing
 *  here carries collision or gameplay authority — cave ground/occupancy stay
 *  on their own spatial queries.
 *
 * @domain world-terrain
 */

import * as THREE from 'three'
import { createLargeRock } from '../../settlement/decorProps'
import {
  buildHeightfieldMeshBuffers,
  buildMouthUndersideMaskBuffers,
  type HeightfieldMeshBuffers,
} from './caveHeightfieldMesh'
import {
  type CaveHeightfieldRepresentation,
  mouthOpeningAt,
  type SurfaceSampler,
} from './caveHeightfieldRepresentation'
import { openingDirection } from './caveOrientation'

/** `FrontSide` on purpose: it is the cheapest permanent detector for a
 *  winding regression. Do not "fix" a dark cave with `DoubleSide`. Smooth
 *  normals come from the shared-vertex geometry (`computeVertexNormals`). */
export function createCaveHeightfieldMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
    flatShading: false,
    side: THREE.FrontSide,
  })
}

/** Dark matte rock, matched to the cave ceiling colour but darker so a
 *  crack-view reads as interior earth rather than a second terrain. */
export function createMouthUndersideMaskMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x2a2420,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide,
  })
}

/**
 * Wraps heightfield mesh buffers in a `BufferGeometry`. Shared vertices, so
 * `computeVertexNormals()` produces real smooth shading.
 *
 * @domain world-terrain
 */
export function createCaveHeightfieldGeometry(buffers: HeightfieldMeshBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * Presentation-only dark-rock beam under the terrain around the mouth
 * contour. Created and disposed with the cave group. No collision, no
 * gameplay authority. Returns `null` when there is no opening to mask.
 *
 * @domain world-terrain
 */
export function createMouthUndersideMask(
  field: CaveHeightfieldRepresentation,
  mouthOpening: (x: number, z: number) => number,
  walkSurfaceAt: SurfaceSampler,
  material: THREE.Material,
): THREE.Mesh | null {
  const buffers = buildMouthUndersideMaskBuffers(field, mouthOpening, walkSurfaceAt)
  if (buffers.vertices === 0) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.name = 'cave-mouth-mask'
  return mesh
}

/** Rock steps along the opening axis (metres). */
const ROCK_STEP_ALONG = 0.9
const ROCK_STEPS: readonly number[] = [-2, -1, 0, 1, 2, 3]
/** Rock centre this far *outside* the contour, on the terrain side. */
const ROCK_OUTSIDE = 0.35
const ROCK_MARCH_MAX = 4
const ROCK_MARCH_STEP = 0.1
const ROCK_SINK = 0.25

/**
 * Rock framing for the mouth — **presentation only**, derived from the
 * actual opening contour: for a few steps along the opening axis it marches
 * laterally until `mouthOpening` turns negative (the terrain edge) and drops
 * a rock just beyond it, on the walk surface. The rocks therefore sit on the
 * terrain side of the cut by construction and the corridor stays clear. No
 * collision — they can never be an invisible blocker, and the entrance must
 * read/traverse correctly without them (`?debugDisableSystems=caveMouthRocks`).
 *
 * Replaces the V1 `createLargeCaveVisual()` trench arrangement, which put an
 * arc of rocks across the approach on the un-carved base height.
 *
 * @domain world-terrain
 */
export function createMouthRocks(
  field: CaveHeightfieldRepresentation,
  mouthOpening: (x: number, z: number) => number,
  walkSurfaceAt: SurfaceSampler,
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'cave-mouth-rocks'
  const out = openingDirection(field.entrance.yaw)
  const sideX = -out.dz
  const sideZ = out.dx
  let variant = 0.17
  for (const step of ROCK_STEPS) {
    const along = step * ROCK_STEP_ALONG
    const ax = field.entrance.x + out.dx * along
    const az = field.entrance.z + out.dz * along
    for (const sign of [-1, 1]) {
      let rim = 0
      for (let d = 0.2; d <= ROCK_MARCH_MAX; d += ROCK_MARCH_STEP) {
        if (mouthOpening(ax + sideX * sign * d, az + sideZ * sign * d) < 0) {
          rim = d
          break
        }
      }
      if (rim <= 0) continue
      variant = (variant + 0.37) % 1
      const scale = 0.7 + variant * 0.5
      const rock = createLargeRock(scale, variant)
      const rx = ax + sideX * sign * (rim + ROCK_OUTSIDE)
      const rz = az + sideZ * sign * (rim + ROCK_OUTSIDE)
      rock.position.set(rx, walkSurfaceAt(rx, rz) - ROCK_SINK, rz)
      rock.rotation.y = variant * Math.PI * 2
      group.add(rock)
    }
  }
  return group
}

export type CaveHeightfieldPresentation = {
  group: THREE.Group
  buffers: HeightfieldMeshBuffers
  maskVertices: number
  rockCount: number
  /** Main-thread assembly time, mesh buffers included. */
  assembleMs: number
}

/**
 * Assembles the full presentation group for one cave from its retained
 * heightfield. Synchronous — heightfield mesh assembly is one pass over
 * ~10–20k nodes, small enough that the SDF extraction worker is not needed.
 * The caller adds the group to the scene and later disposes it with
 * `disposeObject3D()`; `caveMaterial` / `maskMaterial` are shared and must
 * be flagged `userData.sharedGpu` by their owner.
 *
 * @domain world-terrain
 */
export function createCaveHeightfieldPresentation(input: {
  field: CaveHeightfieldRepresentation
  walkSurfaceAt: SurfaceSampler
  caveMaterial: THREE.Material
  maskMaterial: THREE.Material
  rocks: boolean
}): CaveHeightfieldPresentation {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const { field, walkSurfaceAt } = input
  const buffers = buildHeightfieldMeshBuffers(field)
  const group = new THREE.Group()
  group.name = `cave:${field.caveId}`

  const mesh = new THREE.Mesh(createCaveHeightfieldGeometry(buffers), input.caveMaterial)
  mesh.name = `cave-interior:${field.caveId}`
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)

  const mouthOpening = (x: number, z: number): number => mouthOpeningAt(field, walkSurfaceAt, x, z)
  const mask = createMouthUndersideMask(field, mouthOpening, walkSurfaceAt, input.maskMaterial)
  if (mask) group.add(mask)

  let rockCount = 0
  if (input.rocks) {
    const rocks = createMouthRocks(field, mouthOpening, walkSurfaceAt)
    rockCount = rocks.children.length
    if (rockCount > 0) group.add(rocks)
  }

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return {
    group,
    buffers,
    maskVertices: mask ? (mask.geometry.getAttribute('position') as THREE.BufferAttribute).count : 0,
    rockCount,
    assembleMs: now - t0,
  }
}
