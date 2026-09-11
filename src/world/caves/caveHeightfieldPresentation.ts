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
 *  normals come from the shared-vertex geometry (`computeVertexNormals`).
 *  Roughness is high-matte so vertex colours read as damp earth, not wet
 *  plastic. */
export function createCaveHeightfieldMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
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

/** Base spacing along the opening axis (metres). Jittered per-rock. */
const ROCK_STEP_ALONG = 0.55
const ROCK_ALONG_START = -2.4
const ROCK_ALONG_END = 2.75
const ROCK_ALONG_JITTER = 0.18
/** Fillers sit closer to the contour so they overlap the rim visually. */
const ROCK_OUTSIDE_BASE = 0.14
const ROCK_OUTSIDE_SPAN = 0.18
/** Anchors sit a little further out so a ~1.4 scale boulder does not fill the doorway. */
const ROCK_ANCHOR_OUTSIDE_EXTRA = 0.14
const ROCK_MARCH_MAX = 4
const ROCK_MARCH_STEP = 0.1
const ROCK_SINK_BASE = 0.18
const ROCK_SINK_SPAN = 0.14
const ROCK_MIN_SEPARATION = 0.42
const MAX_MOUTH_ROCKS = 30
const ANCHOR_SCALE_MIN = 1
const ANCHOR_SCALE_SPAN = 0.45
const FILLER_SCALE_MIN = 0.45
const FILLER_SCALE_SPAN = 0.45
/** Hillside / upper-rim samples, radians from −opening (into the hillside). */
const UPPER_RIM_ANGLES = [-0.85, -0.5, -0.25, 0, 0.25, 0.5, 0.85] as const

type MouthRockKind = 'anchor' | 'filler'

type MouthRockCandidate = {
  ax: number
  az: number
  dirX: number
  dirZ: number
  rim: number
  kind: MouthRockKind
  stepIndex: number
  side: number
}

/** Deterministic `[0,1)` from cave identity + placement indices. Independent
 *  of call order — not a sequential RNG. */
function mouthRockUnit(caveId: string, a: number, b: number, channel: number): number {
  let h = 0x811c9dc5
  for (let i = 0; i < caveId.length; i++) {
    h = Math.imul(h ^ caveId.charCodeAt(i), 0x01000193) >>> 0
  }
  h = Math.imul(h ^ (a + 1) * 0x85ebca6b, 0xc2b2ae35) >>> 0
  h = Math.imul(h ^ (b + 3) * 0x27d4eb2f, 0x165667b1) >>> 0
  h = Math.imul(h ^ (channel + 7) * 0x9e3779b9, 0x7feb352d) >>> 0
  h ^= h >>> 16
  return h / 4294967296
}

function marchToRim(
  mouthOpening: (x: number, z: number) => number,
  ox: number,
  oz: number,
  dx: number,
  dz: number,
): number {
  for (let d = 0.2; d <= ROCK_MARCH_MAX; d += ROCK_MARCH_STEP) {
    if (mouthOpening(ox + dx * d, oz + dz * d) < 0) return d
  }
  return 0
}

function sideKind(stepIndex: number, along: number): MouthRockKind {
  if (Math.abs(along) < 0.55) return 'anchor'
  if (stepIndex <= 1) return 'anchor'
  return 'filler'
}

/**
 * Rock framing for the mouth — **presentation only**, derived from the
 * actual opening contour. Dense, irregular samples along the opening axis
 * march laterally until `mouthOpening` turns negative (the terrain edge);
 * a second hillside arc covers the upper/back rim. Anchor boulders build
 * the portal silhouette; smaller fillers mask hairline cutout seams. Rocks
 * sit on the walk surface, on the terrain side of the cut, so the corridor
 * stays clear. No collision — they can never be an invisible blocker, and
 * the entrance must read/traverse correctly without them
 * (`?debugDisableSystems=caveMouthRocks`).
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
  const caveId = field.caveId
  const candidates: MouthRockCandidate[] = []

  const stepCount = Math.floor((ROCK_ALONG_END - ROCK_ALONG_START) / ROCK_STEP_ALONG) + 1
  for (let i = 0; i < stepCount; i++) {
    const baseAlong = ROCK_ALONG_START + i * ROCK_STEP_ALONG
    for (const sign of [-1, 1] as const) {
      const along = baseAlong + (mouthRockUnit(caveId, i, sign, 0) - 0.5) * ROCK_ALONG_JITTER
      const ax = field.entrance.x + out.dx * along
      const az = field.entrance.z + out.dz * along
      const rim = marchToRim(mouthOpening, ax, az, sideX * sign, sideZ * sign)
      if (rim <= 0) continue
      candidates.push({
        ax,
        az,
        dirX: sideX * sign,
        dirZ: sideZ * sign,
        rim,
        kind: sideKind(i, along),
        stepIndex: i,
        side: sign,
      })
    }
  }

  for (let a = 0; a < UPPER_RIM_ANGLES.length; a++) {
    const angle = UPPER_RIM_ANGLES[a]!
    const ca = Math.cos(angle)
    const sa = Math.sin(angle)
    const dirX = -out.dx * ca + sideX * sa
    const dirZ = -out.dz * ca + sideZ * sa
    const originAlong = -0.12 + (mouthRockUnit(caveId, a, 0, 6) - 0.5) * 0.16
    const ax = field.entrance.x + out.dx * originAlong
    const az = field.entrance.z + out.dz * originAlong
    const rim = marchToRim(mouthOpening, ax, az, dirX, dirZ)
    if (rim <= 0) continue
    candidates.push({
      ax,
      az,
      dirX,
      dirZ,
      rim,
      kind: angle === 0 ? 'anchor' : 'filler',
      stepIndex: 100 + a,
      side: 0,
    })
  }

  candidates.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'anchor' ? -1 : 1
    return left.stepIndex - right.stepIndex
  })

  for (const candidate of candidates) {
    if (group.children.length >= MAX_MOUTH_ROCKS) break
    const vOut = mouthRockUnit(caveId, candidate.stepIndex, candidate.side, 1)
    const vScale = mouthRockUnit(caveId, candidate.stepIndex, candidate.side, 2)
    const vYaw = mouthRockUnit(caveId, candidate.stepIndex, candidate.side, 3)
    const vSink = mouthRockUnit(caveId, candidate.stepIndex, candidate.side, 4)
    const extra = candidate.kind === 'anchor' ? ROCK_ANCHOR_OUTSIDE_EXTRA : 0
    const outside = ROCK_OUTSIDE_BASE + extra + vOut * ROCK_OUTSIDE_SPAN
    const dist = candidate.rim + outside
    let rx = candidate.ax + candidate.dirX * dist
    let rz = candidate.az + candidate.dirZ * dist
    if (mouthOpening(rx, rz) >= 0) {
      let pushed = false
      for (let extraD = ROCK_MARCH_STEP; extraD <= 0.8; extraD += ROCK_MARCH_STEP) {
        const px = candidate.ax + candidate.dirX * (dist + extraD)
        const pz = candidate.az + candidate.dirZ * (dist + extraD)
        if (mouthOpening(px, pz) < 0) {
          rx = px
          rz = pz
          pushed = true
          break
        }
      }
      if (!pushed) continue
    }
    let tooClose = false
    for (const child of group.children) {
      if (Math.hypot(child.position.x - rx, child.position.z - rz) < ROCK_MIN_SEPARATION) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    const scale = candidate.kind === 'anchor'
      ? ANCHOR_SCALE_MIN + vScale * ANCHOR_SCALE_SPAN
      : FILLER_SCALE_MIN + vScale * FILLER_SCALE_SPAN
    const rock = createLargeRock(scale, vScale)
    rock.name = `cave-mouth-rock:${candidate.kind}`
    rock.userData.mouthRockKind = candidate.kind
    rock.position.set(rx, walkSurfaceAt(rx, rz) - (ROCK_SINK_BASE + vSink * ROCK_SINK_SPAN), rz)
    rock.rotation.y = vYaw * Math.PI * 2
    group.add(rock)
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
