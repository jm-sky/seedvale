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
import type { CaveContentAnchor } from './caveContentAnchors'
import { createLargeRock } from '../../settlement/decorProps'
import {
  createCaveAdventurePropsGroup,
  getCaveAdventurePropTemplates,
} from './caveAdventureProps'
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
import {
  type CaveInteriorRockPlacement,
  createCaveInteriorRocksGroup,
  getCaveInteriorRockTemplates,
} from './caveInteriorRocks'
import { openingDirection } from './caveOrientation'

export { createCaveHeightfieldMaterial } from './caveHeightfieldMaterial'

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

/** Spacing along the opening axis (metres). Denser than the original 0.9 m
 *  six-step frame, but the same contour-outside placement: rocks that sit
 *  too close / too large overlap the void, the capsule clips into solid
 *  (`gap < minGap`, not `openSky`) while Y is still the pit floor, and
 *  `resolveHorizontal` snaps entrance-ward. */
const ROCK_ALONGS: readonly number[] = [
  -2.7,
  -2.25,
  -1.8,
  -1.35,
  -0.9,
  -0.45,
  0,
  0.45,
  0.9,
  1.35,
  1.8,
  2.25,
]

const ROCK_OUTSIDE = 0.4
const ROCK_ANCHOR_OUTSIDE = 0.65
const ROCK_MARCH_MAX = 4
const ROCK_MARCH_STEP = 0.1
const ROCK_SINK = 0.25
/** Extra pair of substantial flanking rocks, one per side, further out than
 *  the existing anchor along the same radial line — conceals the remaining
 *  left/right terrain-to-cave seam. Must clear the anchor's worst-case
 *  combined horizontal footprint: `createLargeRock`'s per-axis jitter reaches
 *  ~1.35x, so with both anchor and outer-anchor drawn from the same
 *  ~1.05-1.25 scale range, minimum safe center separation beyond
 *  `ROCK_ANCHOR_OUTSIDE` is roughly `0.9*1.35*(1.25+1.25) ≈ 3.0`; 3.2 m
 *  leaves a small margin. */
const ROCK_OUTER_ANCHOR_OUTSIDE = ROCK_ANCHOR_OUTSIDE + 3.2
/** Same scale range as the existing anchors (~1.05-1.25) — substantial, not
 *  bigger than the established anchor rocks. */
const ROCK_OUTER_ANCHOR_SCALE_BASE = 1.05
const ROCK_OUTER_ANCHOR_SCALE_RANGE = 0.2

/**
 * Rock framing for the mouth — **presentation only**, derived from the
 * actual opening contour. Samples along the opening axis march laterally
 * until `mouthOpening` turns negative (the terrain edge) and drop a rock
 * just beyond it, on the walk surface. Two doorway-side anchors are
 * slightly larger and further out so they silhouette the portal without
 * overlapping the walkable void. A second, further-out pair of comparably
 * substantial "outer anchors" sits beyond the inner anchors on the same
 * radial line to help conceal the remaining left/right terrain-to-cave
 * seam. No collision — they can never be an
 * invisible blocker, and the entrance must read/traverse correctly without
 * them (`?debugDisableSystems=caveMouthRocks`).
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
  for (const along of ROCK_ALONGS) {
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
      const isAnchor = Math.abs(along) < 0.01
      const scale = isAnchor ? 1.05 + variant * 0.2 : 0.7 + variant * 0.45
      const outside = isAnchor ? ROCK_ANCHOR_OUTSIDE : ROCK_OUTSIDE
      const rock = createLargeRock(scale, variant)
      rock.name = isAnchor ? 'cave-mouth-rock:anchor' : 'cave-mouth-rock:filler'
      rock.userData.mouthRockKind = isAnchor ? 'anchor' : 'filler'
      const rx = ax + sideX * sign * (rim + outside)
      const rz = az + sideZ * sign * (rim + outside)
      if (mouthOpening(rx, rz) >= 0) continue
      rock.position.set(rx, walkSurfaceAt(rx, rz) - ROCK_SINK, rz)
      rock.rotation.y = variant * Math.PI * 2
      group.add(rock)
    }
  }

  // One additional substantial rock per side, mirrored, sitting further out
  // than the along=0 anchor on the same radial line — same march-then-place
  // pattern and safety guard as every rock above, presentation only.
  for (const sign of [-1, 1]) {
    let rim = 0
    for (let d = 0.2; d <= ROCK_MARCH_MAX; d += ROCK_MARCH_STEP) {
      if (mouthOpening(field.entrance.x + sideX * sign * d, field.entrance.z + sideZ * sign * d) < 0) {
        rim = d
        break
      }
    }
    if (rim <= 0) continue
    variant = (variant + 0.37) % 1
    const scale = ROCK_OUTER_ANCHOR_SCALE_BASE + variant * ROCK_OUTER_ANCHOR_SCALE_RANGE
    const rock = createLargeRock(scale, variant)
    rock.name = 'cave-mouth-rock:outerAnchor'
    rock.userData.mouthRockKind = 'outerAnchor'
    const rx = field.entrance.x + sideX * sign * (rim + ROCK_OUTER_ANCHOR_OUTSIDE)
    const rz = field.entrance.z + sideZ * sign * (rim + ROCK_OUTER_ANCHOR_OUTSIDE)
    if (mouthOpening(rx, rz) >= 0) continue
    rock.position.set(rx, walkSurfaceAt(rx, rz) - ROCK_SINK, rz)
    rock.rotation.y = variant * Math.PI * 2
    group.add(rock)
  }

  return group
}

export type CaveHeightfieldPresentation = {
  group: THREE.Group
  buffers: HeightfieldMeshBuffers
  maskVertices: number
  rockCount: number
  /** Interior rock/boulder clutter instance count (world-terrain-022) —
   *  0 when disabled or when no placement passed its guards. */
  interiorRockCount: number
  /** Adventure storytelling props (world-terrain-020 Stage D) — 0 for natural
   *  caves or when no presentation anchors resolved. */
  adventurePropCount: number
  /** PointLights attached under lantern props (bounded per cave). */
  adventureLanternLightCount: number
  /** Main-thread assembly time, mesh buffers included. */
  assembleMs: number
}

/**
 * Assembles the full presentation group for one cave from its retained
 * heightfield. Synchronous — heightfield mesh assembly is one pass over
 * ~10–20k nodes, small enough that the SDF extraction worker is not needed.
 * The caller adds the group to the scene and later disposes it with
 * `disposeObject3D()`; `caveMaterial` / `maskMaterial` are shared and must
 * be flagged `userData.sharedGpu` by their owner (as must the interior-rock
 * templates — see `caveInteriorRocks.ts`'s `getCaveInteriorRockTemplates()`).
 *
 * @domain world-terrain
 */
export function createCaveHeightfieldPresentation(input: {
  field: CaveHeightfieldRepresentation
  walkSurfaceAt: SurfaceSampler
  caveMaterial: THREE.Material
  maskMaterial: THREE.Material
  rocks: boolean
  /** Already-resolved interior clutter (`resolveCaveInteriorRocks`) — empty
   *  when the debug system is disabled. Rendering-only input; this module
   *  never resolves placements itself. */
  interiorRockPlacements: readonly CaveInteriorRockPlacement[]
  /** Stage B anchors minus treasure — only passed for `adventure` caves. */
  adventurePropAnchors: readonly CaveContentAnchor[]
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

  let interiorRockCount = 0
  if (input.interiorRockPlacements.length > 0) {
    const interiorRocks = createCaveInteriorRocksGroup(input.interiorRockPlacements, getCaveInteriorRockTemplates())
    if (interiorRocks) {
      interiorRocks.group.name = 'cave-interior-rocks'
      group.add(interiorRocks.group)
      interiorRockCount = input.interiorRockPlacements.length
    }
  }

  let adventurePropCount = 0
  let adventureLanternLightCount = 0
  if (input.adventurePropAnchors.length > 0) {
    const adventureProps = createCaveAdventurePropsGroup(
      input.adventurePropAnchors,
      getCaveAdventurePropTemplates(),
    )
    if (adventureProps.propCount > 0) {
      group.add(adventureProps.group)
      adventurePropCount = adventureProps.propCount
      adventureLanternLightCount = adventureProps.lanternLightCount
    }
  }

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return {
    group,
    buffers,
    maskVertices: mask ? (mask.geometry.getAttribute('position') as THREE.BufferAttribute).count : 0,
    rockCount,
    interiorRockCount,
    adventurePropCount,
    adventureLanternLightCount,
    assembleMs: now - t0,
  }
}
