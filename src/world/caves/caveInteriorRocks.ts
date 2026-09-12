/** Plan world-terrain-022 — deterministic, presentation-only rock/boulder
 *  clutter scattered through cave interiors (both `natural` and `adventure`
 *  archetypes). Generic environmental dressing, not semantic content: see
 *  `caveContentAnchors.ts` for treasure/wagon/crate/lantern anchors, which
 *  this module reads only as read-only positions to steer clear of.
 *
 *  Split in two halves on purpose:
 *  - `resolveCaveInteriorRocks()` — pure placement data, no Three.js import,
 *    a function of `(archetype, topology, heightfield, contentAnchors)`
 *    only, so it is trivially unit-testable and independent of streaming.
 *  - `getCaveInteriorRockTemplates()` / `createCaveInteriorRocksGroup()` —
 *    thin rendering layer: a handful of shared template silhouettes
 *    instanced via `buildInstancedProps()` (`src/render/instancedProps.ts`),
 *    never one `Mesh`/`Geometry`/`Material` per rock.
 *
 *  Floor Y always comes from this cave's own retained
 *  `CaveHeightfieldRepresentation` via `sampleHeightfieldAt()` — never
 *  surface terrain, topology-node Y, or `Caves.queryGround()`. No collision
 *  or gameplay authority; disabled entirely, data included, when
 *  `?debugDisableSystems=caveInteriorRocks` is set (see `createCaves.ts`).
 *
 * @domain world-terrain
 */

import * as THREE from 'three'
import type { InstancedPropGroup, PropPlacement } from '../../render/instancedProps'
import type { CaveArchetype } from './caveArchetype'
import type { CaveTopology, CaveTopologyNode, CaveTopologyNodeKind, CaveTopologySegment } from './caveTopology'
import { buildInstancedProps } from '../../render/instancedProps'
import { createLargeRock, createRockCluster, type LargeRockPalette } from '../../settlement/decorProps'
import { CAVE_CONTENT_PLACEMENT, type CaveContentAnchor } from './caveContentAnchors'
import {
  chamberCandidates,
  footprintHolds,
  type Heading,
  incomingHeading,
  lateralDistance,
  passageWallCandidates,
  segmentLength,
  type Xz,
} from './caveHeightfieldPlacement'
import { type CaveHeightfieldRepresentation, sampleHeightfieldAt } from './caveHeightfieldRepresentation'
import { CAVE_RNG_SALT, createCaveRandom } from './caveRng'

// ---------------------------------------------------------------------------
// Pure placement
// ---------------------------------------------------------------------------

export type CaveInteriorRockSizeClass = 'small' | 'medium' | 'large'

/** Which shared template silhouette to instance — see
 *  `CAVE_INTERIOR_ROCK_TEMPLATE_SLOTS` below, the single source of truth
 *  both this resolver and `getCaveInteriorRockTemplates()` index against. */
export type CaveInteriorRockPlacement = {
  /** `${caveId}:rock:${index}` — stable for a given seed/topology (the
   *  index reflects deterministic generation order, not array position). */
  id: string
  caveId: string
  x: number
  /** `sampleHeightfieldAt(...).floorY` — the cave's own retained floor. */
  y: number
  z: number
  yaw: number
  /** Uniform multiplier on top of the template's own baked proportions. */
  scale: number
  sizeClass: CaveInteriorRockSizeClass
  templateIndex: number
}

export type CaveInteriorRocksInput = {
  archetype: CaveArchetype
  topology: CaveTopology
  heightfield: CaveHeightfieldRepresentation
  /** Existing semantic content (treasure/wagon/crates/lanterns) to steer
   *  clear of — a read-only XZ distance check against anchor positions and
   *  their own `CAVE_CONTENT_PLACEMENT` footprint, never anchor *roles* as a
   *  placement source. Pass `[]` for a natural cave (it has none anyway). */
  contentAnchors: readonly CaveContentAnchor[]
}

export const CAVE_INTERIOR_ROCK_TEMPLATE_SLOTS = {
  clusterSmall: 0,
  boulderMediumA: 1,
  boulderMediumB: 2,
  boulderLargeA: 3,
  boulderLargeB: 4,
} as const

type RockSizeSpec = {
  minGap: number
  footprintRadius: number
  maxCoreT: number
  minSpacing: number
  scaleRange: readonly [number, number]
  keepOffThroughLine: boolean
  throughLineMargin: number
}

/** Per-size-class placement guards. Deliberately conservative starting
 *  points — tune after browser verification, not a physical simulation. */
const ROCK_SIZE_SPEC: Record<CaveInteriorRockSizeClass, RockSizeSpec> = {
  small: {
    minGap: 0.9, footprintRadius: 0.3, maxCoreT: 0.95, minSpacing: 0.8,
    scaleRange: [0.5, 1.0], keepOffThroughLine: false, throughLineMargin: 0,
  },
  medium: {
    minGap: 1.6, footprintRadius: 0.65, maxCoreT: 0.72, minSpacing: 1.5,
    scaleRange: [0.85, 1.3], keepOffThroughLine: true, throughLineMargin: 0.55,
  },
  large: {
    minGap: 2.6, footprintRadius: 1.05, maxCoreT: 0.5, minSpacing: 2.6,
    scaleRange: [1.6, 2.3], keepOffThroughLine: true, throughLineMargin: 0.9,
  },
}

/** Candidate-attempt budget (attempted rock count) per unit of node
 *  floor-area proxy (`targetWidth^2 * 0.6`). Chambers read as noticeably
 *  more cluttered than tight passages; junctions/widenings sit between. */
const NODE_KIND_ROCK_DENSITY: Partial<Record<CaveTopologyNodeKind, number>> = {
  chamber: 0.11,
  widening: 0.07,
  passage: 0.035,
  constriction: 0.02,
}

const NODE_KIND_CLASS_WEIGHTS: Partial<Record<CaveTopologyNodeKind, { small: number, medium: number, large: number }>> = {
  chamber: { small: 0.5, medium: 0.35, large: 0.15 },
  widening: { small: 0.6, medium: 0.32, large: 0.08 },
  passage: { small: 0.78, medium: 0.22, large: 0 },
  constriction: { small: 0.9, medium: 0.1, large: 0 },
}

/** A node must be at least this wide/tall before large-boulder candidates
 *  are attempted there at all — "rare, in sufficiently wide/tall areas". */
const LARGE_MIN_NODE_WIDTH = 6.5
const LARGE_MIN_NODE_HEIGHT = 5.5
const LARGE_MAX_PER_CAVE = 3

/** Bounded candidate fan per attempt site (node ring / passage stride
 *  point) — mirrors `CONTENT_ANCHOR_CANDIDATE_LIMIT`'s bounded-list idea,
 *  scaled down since interior rocks sample many more sites per cave. */
const MAX_CANDIDATES_PER_SITE = 8
/** Attempts per node budget unit before giving up on that node — bounded,
 *  never an unbounded search. */
const NODE_ATTEMPT_FACTOR = 2

const SEGMENT_SAMPLE_STRIDE_M = 3.2
const MAX_SEGMENT_SAMPLES_PER_SEGMENT = 6
/** Attempted small/medium rocks per metre of passage length. */
const SEGMENT_ROCK_DENSITY = 0.045

/** Extra XZ margin kept beyond a content anchor's own footprint radius, so
 *  rocks read as "giving anchors breathing room" rather than just clearing
 *  a hard collision box. */
const CONTENT_ANCHOR_CLEARANCE_MARGIN = 0.35

const CLUSTER_CHANCE = 0.4
const CLUSTER_COMPANION_MAX = 2
const CLUSTER_COMPANION_MIN_DIST = 0.5
const CLUSTER_COMPANION_DIST_RANGE = 0.6

/** Hard safety cap independent of the area-derived budgets above — density
 *  should scale with usable cave area (see per-`kind`/per-metre constants),
 *  this only bounds worst-case total work/clutter for an unusually large
 *  adventure cave. */
const MAX_INTERIOR_ROCKS_PER_CAVE = 90

const EMPTY_PLACEMENTS: readonly CaveInteriorRockPlacement[] = Object.freeze([])

function nodeArea(node: CaveTopologyNode): number {
  return node.targetWidth * node.targetWidth * 0.6
}

function segmentHalfWidth(topology: CaveTopology, seg: CaveTopologySegment): number {
  const from = topology.nodes.find((n) => n.id === seg.from)
  const to = topology.nodes.find((n) => n.id === seg.to)
  const width = Math.min(from?.targetWidth ?? 3, to?.targetWidth ?? 3)
  return width / 2
}

function pickSizeClass(kind: CaveTopologyNodeKind, canLarge: boolean, random: () => number): CaveInteriorRockSizeClass {
  const weights = NODE_KIND_CLASS_WEIGHTS[kind] ?? { small: 1, medium: 0, large: 0 }
  const r = random()
  if (canLarge && r < weights.large) return 'large'
  if (r < weights.large + weights.medium) return 'medium'
  return 'small'
}

function pickTemplateIndex(sizeClass: CaveInteriorRockSizeClass, random: () => number): number {
  if (sizeClass === 'small') return CAVE_INTERIOR_ROCK_TEMPLATE_SLOTS.clusterSmall
  if (sizeClass === 'medium') {
    return random() < 0.5
      ? CAVE_INTERIOR_ROCK_TEMPLATE_SLOTS.boulderMediumA
      : CAVE_INTERIOR_ROCK_TEMPLATE_SLOTS.boulderMediumB
  }
  return random() < 0.5
    ? CAVE_INTERIOR_ROCK_TEMPLATE_SLOTS.boulderLargeA
    : CAVE_INTERIOR_ROCK_TEMPLATE_SLOTS.boulderLargeB
}

/**
 * Resolves deterministic interior rock/boulder placements for one cave.
 * Presentation-only: never touches collision/occupancy, never persisted,
 * independent of streaming/activation order. Both `natural` and `adventure`
 * caves receive output (unlike `resolveCaveContentAnchors`, which is
 * adventure-only) — density derives from usable node/passage area rather
 * than a fixed per-cave count, so a longer adventure cave naturally gets
 * more clutter than a short natural one.
 *
 * @domain world-terrain
 */
export function resolveCaveInteriorRocks(input: CaveInteriorRocksInput): readonly CaveInteriorRockPlacement[] {
  const { topology, heightfield, contentAnchors } = input
  const random = createCaveRandom(topology.caveId, CAVE_RNG_SALT.interiorRocks)
  const accepted: CaveInteriorRockPlacement[] = []
  let nextIndex = 0
  let largeCount = 0

  const tooCloseToAnchor = (x: number, z: number, footprintRadius: number): boolean => {
    for (const anchor of contentAnchors) {
      const anchorRadius = CAVE_CONTENT_PLACEMENT[anchor.role]?.footprintRadius ?? 0.5
      const clear = anchorRadius + footprintRadius + CONTENT_ANCHOR_CLEARANCE_MARGIN
      if (Math.hypot(anchor.x - x, anchor.z - z) < clear) return true
    }
    return false
  }

  const tooCloseToAccepted = (x: number, z: number, spec: RockSizeSpec): boolean => {
    for (const other of accepted) {
      const otherSpec = ROCK_SIZE_SPEC[other.sizeClass]
      const minDist = Math.min(spec.minSpacing, otherSpec.minSpacing)
      if (Math.hypot(other.x - x, other.z - z) < minDist) return true
    }
    return false
  }

  const tryAccept = (
    x: number,
    z: number,
    sizeClass: CaveInteriorRockSizeClass,
    throughCtx: { origin: Xz, heading: Heading } | null,
  ): boolean => {
    if (accepted.length >= MAX_INTERIOR_ROCKS_PER_CAVE) return false
    if (sizeClass === 'large' && largeCount >= LARGE_MAX_PER_CAVE) return false
    const spec = ROCK_SIZE_SPEC[sizeClass]
    const sample = sampleHeightfieldAt(heightfield, x, z)
    if (sample.outsideGrid || sample.openSky || sample.gap <= 0) return false
    if (sample.gap < spec.minGap || sample.coreT > spec.maxCoreT) return false
    if (!footprintHolds(heightfield, x, z, spec.footprintRadius, spec.minGap)) return false
    if (spec.keepOffThroughLine && throughCtx) {
      if (lateralDistance(x, z, throughCtx.origin, throughCtx.heading) < spec.throughLineMargin) return false
    }
    if (tooCloseToAnchor(x, z, spec.footprintRadius)) return false
    if (tooCloseToAccepted(x, z, spec)) return false

    const yaw = random() * Math.PI * 2
    const scale = spec.scaleRange[0] + random() * (spec.scaleRange[1] - spec.scaleRange[0])
    const templateIndex = pickTemplateIndex(sizeClass, random)
    accepted.push(Object.freeze({
      id: `${topology.caveId}:rock:${nextIndex++}`,
      caveId: topology.caveId,
      x,
      y: sample.floorY,
      z,
      yaw,
      scale,
      sizeClass,
      templateIndex,
    }))
    if (sizeClass === 'large') largeCount++
    return true
  }

  const addClusterCompanions = (
    x: number,
    z: number,
    parentSize: CaveInteriorRockSizeClass,
    throughCtx: { origin: Xz, heading: Heading } | null,
  ): void => {
    if (parentSize === 'small') return
    if (random() >= CLUSTER_CHANCE) return
    const count = 1 + (random() < 0.4 ? 1 : 0)
    for (let i = 0; i < Math.min(count, CLUSTER_COMPANION_MAX); i++) {
      const angle = random() * Math.PI * 2
      const dist = CLUSTER_COMPANION_MIN_DIST + random() * CLUSTER_COMPANION_DIST_RANGE
      tryAccept(x + Math.cos(angle) * dist, z + Math.sin(angle) * dist, 'small', throughCtx)
    }
  }

  // ---- Node-anchored candidates: chambers/widenings/passages/constrictions
  for (const node of topology.nodes) {
    if (node.kind === 'entrance') continue
    const density = NODE_KIND_ROCK_DENSITY[node.kind] ?? 0
    if (density <= 0) continue
    const budget = Math.max(0, Math.round(nodeArea(node) * density))
    if (budget <= 0) continue
    const heading = incomingHeading(topology, node.id)
    const throughCtx = { origin: { x: node.position.x, z: node.position.z }, heading }
    const canLarge = node.targetWidth >= LARGE_MIN_NODE_WIDTH && node.targetHeight >= LARGE_MIN_NODE_HEIGHT

    let placedHere = 0
    // A qualifying chamber gets one deliberate large-boulder attempt before
    // the weighted small/medium/large mix below — "rare, in sufficiently
    // wide/tall areas" reads as an intentional choice, not a coin flip that
    // may never land even in a cave built specifically wide enough for one.
    if (canLarge) {
      const largeCandidates = chamberCandidates(node, heading, random() < 0.5 ? -1 : 1, MAX_CANDIDATES_PER_SITE)
      for (const c of largeCandidates) {
        if (tryAccept(c.x, c.z, 'large', throughCtx)) {
          placedHere++
          break
        }
      }
    }
    const maxAttempts = budget * NODE_ATTEMPT_FACTOR
    for (let attempt = 0; attempt < maxAttempts && placedHere < budget; attempt++) {
      const preferredSign = random() < 0.5 ? -1 : 1
      const candidates = chamberCandidates(node, heading, preferredSign, MAX_CANDIDATES_PER_SITE)
      const sizeClass = pickSizeClass(node.kind, canLarge, random)
      for (const c of candidates) {
        if (tryAccept(c.x, c.z, sizeClass, throughCtx)) {
          placedHere++
          addClusterCompanions(c.x, c.z, sizeClass, throughCtx)
          break
        }
      }
    }
  }

  // ---- Segment-walk candidates: sparse wall-hugging small/medium rocks
  // along passage stretches between the (few, named) topology nodes above.
  for (const seg of topology.segments) {
    const total = segmentLength(seg)
    if (total < 1e-3) continue
    const steps = Math.min(MAX_SEGMENT_SAMPLES_PER_SEGMENT, Math.max(1, Math.round(total / SEGMENT_SAMPLE_STRIDE_M)))
    const budget = Math.round(total * SEGMENT_ROCK_DENSITY)
    if (budget <= 0) continue
    const halfWidth = segmentHalfWidth(topology, seg)

    let placedHere = 0
    for (let i = 0; i < steps && placedHere < budget; i++) {
      const t = (i + 0.5) / steps
      const preferredSign = random() < 0.5 ? -1 : 1
      const { candidates, along, heading } = passageWallCandidates(seg, t, preferredSign, halfWidth, MAX_CANDIDATES_PER_SITE)
      const throughCtx = { origin: along, heading }
      const sizeClass: CaveInteriorRockSizeClass = random() < 0.75 ? 'small' : 'medium'
      for (const c of candidates) {
        if (tryAccept(c.x, c.z, sizeClass, throughCtx)) {
          placedHere++
          break
        }
      }
    }
  }

  return accepted.length === 0 ? EMPTY_PLACEMENTS : Object.freeze(accepted)
}

// ---------------------------------------------------------------------------
// Rendering — shared instanced templates
// ---------------------------------------------------------------------------

function markSharedGpu(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry.userData.sharedGpu = true
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach((m) => { m.userData.sharedGpu = true })
    else mat.userData.sharedGpu = true
  })
}

function setTemplateShadow(root: THREE.Object3D, cast: boolean): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = cast
    mesh.receiveShadow = true
  })
}

/** Recenters XZ on the template's true bounding-box center and drops Y so
 *  the box's bottom sits at local y=0, then sinks it back down slightly for
 *  a "partly embedded in the floor" read. Deliberately does **not** call
 *  `prepareProp()` (`assets/loadGltf.ts`) — that renormalizes scale to a
 *  target height, which would erase `createLargeRock`/`createRockCluster`'s
 *  own deterministic non-uniform jitter baked into the mesh. Only the
 *  template root's own transform changes; `buildInstancedProps()` composes
 *  it with each placement exactly like every other instanced prop. */
function prepareInteriorRockTemplate(root: THREE.Group, sinkFraction: number): THREE.Group {
  const box = new THREE.Box3().setFromObject(root)
  const center = new THREE.Vector3()
  box.getCenter(center)
  const height = Math.max(0, box.max.y - box.min.y)
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y + height * sinkFraction
  return root
}

/** New `Group` wrapping the same geometry/material as `source` by
 *  reference (no GPU duplication), only varying `castShadow` — needed
 *  because `InstancedMesh.castShadow` is one flag for the whole bucket, and
 *  small stones should stay shadowless while large boulders may cast. */
function cloneRockShellWithShadow(source: THREE.Group, castShadow: boolean, name: string): THREE.Group {
  const group = new THREE.Group()
  group.name = name
  source.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const clone = new THREE.Mesh(mesh.geometry, mesh.material)
    clone.position.copy(mesh.position)
    clone.rotation.copy(mesh.rotation)
    clone.scale.copy(mesh.scale)
    clone.castShadow = castShadow
    clone.receiveShadow = true
    group.add(clone)
  })
  return group
}

const INTERIOR_ROCK_SINK_FRACTION = 0.18

/** Warm brown blotches matched to cave heightfield rim/floor tones
 *  (`RIM_COLOR` / `FLOOR_COLOR` in `caveHeightfieldMesh.ts`), lifted well
 *  above rim hexes so vertex-colour height shading still reads with walls
 *  under cave lighting (not muddy). */
const CAVE_INTERIOR_BOULDER_PALETTE: LargeRockPalette = {
  base: new THREE.Color(0x9a8a7a),
  cool: new THREE.Color(0x7e756c),
  warm: new THREE.Color(0xa88a68),
  moss: new THREE.Color(0x847a68),
}

let _templates: THREE.Object3D[] | null = null

/**
 * Lazily builds and memoizes the ~2-3 shared rock silhouettes used for
 * every cave's interior clutter (module-level singleton — never rebuilt per
 * cave/activation). Index order matches `CAVE_INTERIOR_ROCK_TEMPLATE_SLOTS`.
 * Geometry/material are marked `userData.sharedGpu` so the existing
 * `disposeObject3D()` path (`createCaves.ts`'s `disposePresentation()`)
 * never frees them when one cave's presentation is disposed while other
 * active caves still reference the same templates.
 *
 * @domain world-terrain
 */
export function getCaveInteriorRockTemplates(): readonly THREE.Object3D[] {
  if (_templates) return _templates

  const clusterSmall = prepareInteriorRockTemplate(
    createRockCluster(1, 0.5, 0x9d8a82),
    INTERIOR_ROCK_SINK_FRACTION,
  )
  clusterSmall.name = 'cave-interior-rock-template:cluster-small'
  setTemplateShadow(clusterSmall, false)

  const boulderSourceA = createLargeRock(1, 0.18, CAVE_INTERIOR_BOULDER_PALETTE)
  const boulderMediumA = prepareInteriorRockTemplate(
    cloneRockShellWithShadow(boulderSourceA, false, 'cave-interior-rock-template:boulder-medium-a'),
    INTERIOR_ROCK_SINK_FRACTION,
  )
  const boulderLargeA = prepareInteriorRockTemplate(
    cloneRockShellWithShadow(boulderSourceA, true, 'cave-interior-rock-template:boulder-large-a'),
    INTERIOR_ROCK_SINK_FRACTION,
  )

  const boulderSourceB = createLargeRock(1, 0.74, CAVE_INTERIOR_BOULDER_PALETTE)
  const boulderMediumB = prepareInteriorRockTemplate(
    cloneRockShellWithShadow(boulderSourceB, false, 'cave-interior-rock-template:boulder-medium-b'),
    INTERIOR_ROCK_SINK_FRACTION,
  )
  const boulderLargeB = prepareInteriorRockTemplate(
    cloneRockShellWithShadow(boulderSourceB, true, 'cave-interior-rock-template:boulder-large-b'),
    INTERIOR_ROCK_SINK_FRACTION,
  )

  for (const root of [clusterSmall, boulderMediumA, boulderMediumB, boulderLargeA, boulderLargeB]) {
    markSharedGpu(root)
  }

  _templates = [clusterSmall, boulderMediumA, boulderMediumB, boulderLargeA, boulderLargeB]
  return _templates
}

/**
 * Builds one instanced group for a cave's resolved rock placements. Buckets
 * by `(templateIndex, primitive)` via the existing prop-instancing pipeline
 * (`buildInstancedProps`) — bounded `InstancedMesh` count, never one
 * `Mesh`/`Geometry`/`Material` per rock. Returns `undefined` for an empty
 * placement list (mirrors `buildInstancedProps`'s own convention).
 *
 * @domain world-terrain
 */
export function createCaveInteriorRocksGroup(
  placements: readonly CaveInteriorRockPlacement[],
  templates: readonly THREE.Object3D[],
): InstancedPropGroup | undefined {
  if (placements.length === 0) return undefined
  const propPlacements: PropPlacement[] = placements.map((p) => ({
    speciesIndex: p.templateIndex,
    x: p.x,
    z: p.z,
    groundY: p.y,
    rotationY: p.yaw,
    scale: p.scale,
  }))
  return buildInstancedProps(templates, propPlacements, 'cave-interior-rocks')
}
