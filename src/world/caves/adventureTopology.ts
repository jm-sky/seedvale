/** Plan world-terrain-020 Stage A — the `adventure` production cave recipe.
 *
 *  Same `CaveTopology` contract, same terrain guardrails and the same route
 *  primitives as the natural recipe (`caveRoute.ts`); only the *layout* is
 *  different: a folded main route roughly 3-4x the natural exploration
 *  length, made of several passages and chambers, with one guaranteed and
 *  readable junction that opens a mandatory dead-end side branch to a side
 *  chamber while the main route carries on to a deep chamber and a final
 *  chamber.
 *
 *  The route folds instead of running straight so the rectangular XZ grid
 *  `buildCaveHeightfieldRepresentation()` allocates stays proportionate: each
 *  candidate layout is priced with `estimateHeightfieldGrid()` *before* the
 *  heightfield exists, and a layout over `ADVENTURE_MAX_HEIGHTFIELD_CELLS` is
 *  deterministically retried and finally rejected — never accommodated by
 *  changing the global heightfield config.
 *
 *  Node ids are stable and role-based (`adventure-junction`,
 *  `adventure-side-chamber`, `adventure-final-chamber`) because later stages
 *  anchor content to them; they must never be discovered by array position.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import type { CaveRecipeInput, Cursor, RadialStation, RouteContext } from './caveRoute'
import type { CaveTopology, CaveTopologyFeature, CaveTopologyNode, CaveTopologyNodeKind, CaveTopologyPoint, CaveTopologySegment } from './caveTopology'
import { CAVE_MOUTH_DEPTH } from '../caveGenerator'
import { LARGE_CAVE_MOUTH_WIDTH, tunnelDirection } from '../largeCaves'
import { estimateHeightfieldGrid } from './caveHeightfieldRepresentation'
import { makeCaveId } from './caveIdentity'
import { CAVE_RNG_SALT, createCaveRandom } from './caveRng'
import {
  lowerFeatureIfNeeded,
  MIN_DISCONNECTED_CLEARANCE,
  minGapBetweenPaths,
  pick,
  rotateXZ,
  walkSegment,
} from './caveRoute'
import { MOUTH_TRANSITION_RANGE } from './mouthOverburden'

const ENTRANCE_HEIGHT = 2.6

/** Gentler than `NATURAL_DESCENT_PER_METER`: the adventure route is ~3x
 *  longer, and the *unchanged* `MAX_TOTAL_DROP` still bounds the whole cave,
 *  so a long route has to spend its 12 m of drop budget more slowly. Local
 *  overburden adaptation still pushes the floor down wherever the hill is
 *  thin — only the "even where terrain is generous" baseline is gentler. */
export const ADVENTURE_DESCENT_PER_METER = 0.05

const PASSAGE_WIDTH: readonly [number, number] = [3.6, 4.6]
const PASSAGE_HEIGHT: readonly [number, number] = [4.4, 5.4]
/** The junction has to read as a deliberate choice of two ways, so it is
 *  wider than an ordinary widening — a narrow fissure would make the side
 *  branch look like scenery. */
const JUNCTION_WIDTH: readonly [number, number] = [7, 8]
const JUNCTION_HEIGHT: readonly [number, number] = [6, 7]
const CHAMBER_WIDTH: readonly [number, number] = [8, 9.5]
const CHAMBER_HEIGHT: readonly [number, number] = [7.5, 9]
const SIDE_CHAMBER_WIDTH: readonly [number, number] = [6.5, 7.5]
const SIDE_CHAMBER_HEIGHT: readonly [number, number] = [6, 7]
const FINAL_CHAMBER_WIDTH: readonly [number, number] = [9.5, 11]
const FINAL_CHAMBER_HEIGHT: readonly [number, number] = [8.5, 10]

/** Node id of the one guaranteed junction, and of the chambers/passages later
 *  stages anchor content to. Exported so tests and Stage B never go looking
 *  for "the last chamber in the array". */
export const ADVENTURE_JUNCTION_NODE_ID = 'adventure-junction'
export const ADVENTURE_SIDE_CHAMBER_NODE_ID = 'adventure-side-chamber'
export const ADVENTURE_DEEP_PASSAGE_NODE_ID = 'adventure-deep-passage'
export const ADVENTURE_DEEP_CHAMBER_NODE_ID = 'adventure-deep-chamber'
export const ADVENTURE_FINAL_PASSAGE_NODE_ID = 'adventure-final-passage'
export const ADVENTURE_FINAL_CHAMBER_NODE_ID = 'adventure-final-chamber'

type LegSpec = {
  id: string
  kind: CaveTopologyNodeKind
  /** Turn (degrees) applied to the previous leg's heading, before the
   *  layout's fold sign. */
  turn: readonly [number, number]
  length: readonly [number, number]
  width: readonly [number, number]
  height: readonly [number, number]
  /** Passages wobble laterally; chambers/junctions keep a clean approach. */
  wobble?: number
}

/** The main route, mouth first. Turns run one way for the first half and the
 *  other way for the second, so the route folds into a compact "C" instead of
 *  either running tens of metres in one direction or spiralling back onto
 *  itself. */
const MAIN_LEGS: readonly LegSpec[] = [
  { id: 'adventure-transition', kind: 'passage', turn: [0, 0], length: [0, 0], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT },
  { id: 'adventure-passage-1', kind: 'passage', turn: [30, 40], length: [9, 12], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT, wobble: 1.8 },
  { id: 'adventure-chamber-1', kind: 'chamber', turn: [32, 42], length: [7.5, 9.5], width: CHAMBER_WIDTH, height: CHAMBER_HEIGHT },
  { id: 'adventure-passage-2', kind: 'passage', turn: [24, 34], length: [9, 12], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT, wobble: 1.8 },
  { id: ADVENTURE_JUNCTION_NODE_ID, kind: 'widening', turn: [-34, -26], length: [7.5, 9.5], width: JUNCTION_WIDTH, height: JUNCTION_HEIGHT },
  { id: ADVENTURE_DEEP_PASSAGE_NODE_ID, kind: 'passage', turn: [-38, -30], length: [9, 12], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT, wobble: 1.8 },
  { id: ADVENTURE_DEEP_CHAMBER_NODE_ID, kind: 'chamber', turn: [-34, -26], length: [7.5, 9.5], width: CHAMBER_WIDTH, height: CHAMBER_HEIGHT },
  { id: ADVENTURE_FINAL_PASSAGE_NODE_ID, kind: 'passage', turn: [-34, -26], length: [9, 12], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT, wobble: 1.8 },
  { id: ADVENTURE_FINAL_CHAMBER_NODE_ID, kind: 'chamber', turn: [-30, -22], length: [8, 10], width: FINAL_CHAMBER_WIDTH, height: FINAL_CHAMBER_HEIGHT },
]

/** Side branch, hung off the junction on the opposite side from the main
 *  continuation so the two ways are visibly different directions. */
const SIDE_LEGS: readonly LegSpec[] = [
  { id: 'adventure-side-passage', kind: 'passage', turn: [60, 72], length: [6.5, 8.5], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT },
  { id: ADVENTURE_SIDE_CHAMBER_NODE_ID, kind: 'chamber', turn: [14, 24], length: [6.5, 8], width: SIDE_CHAMBER_WIDTH, height: SIDE_CHAMBER_HEIGHT },
]

/**
 * Rectangular grid budget for one adventure cave, in heightfield cells.
 *
 * A natural cave costs roughly 18k cells at `DEFAULT_HEIGHTFIELD_CONFIG`; a
 * folded adventure route of ~3x the length costs roughly twice that. The cap
 * is deliberately finite and adventure-specific: it exists so a layout that
 * fans out instead of folding is rejected and retried, not so the global
 * `cellSize` can be relaxed.
 */
export const ADVENTURE_MAX_HEIGHTFIELD_CELLS = 72_000

/**
 * Whether a candidate adventure layout's rectangular XZ grid fits the
 * adventure cell budget. Checked before any heightfield exists, so an
 * over-wide layout is retried/rejected instead of being accommodated by
 * relaxing `DEFAULT_HEIGHTFIELD_CONFIG`.
 *
 * @domain world-terrain
 */
export function fitsAdventureFootprintBudget(
  topology: CaveTopology,
  maxCells: number = ADVENTURE_MAX_HEIGHTFIELD_CELLS,
): boolean {
  return estimateHeightfieldGrid(topology).cells <= maxCells
}

/** Deterministic layout attempts before the site is rejected for adventure.
 *  Each attempt draws the next values from the same layout stream and flips
 *  the fold direction, so a site that cannot fold one way gets a fair try the
 *  other way without any randomness leaking in from build order. */
const LAYOUT_ATTEMPTS = 4

const DEG = Math.PI / 180

type WalkedLeg = {
  spec: LegSpec
  point: CaveTopologyPoint
  width: number
  height: number
  interiorPoints: CaveTopologyPoint[]
  fromWidth: number
}

/** Stations for one walked leg, radii interpolated from the leg's own
 *  endpoints — the same radial-station model `minGapBetweenPaths()` consumes
 *  for the natural recipe's branch check. */
function legStations(from: { x: number, z: number, radius: number }, leg: WalkedLeg): RadialStation[] {
  const toRadius = leg.width / 2
  const count = leg.interiorPoints.length
  const out: RadialStation[] = [from]
  leg.interiorPoints.forEach((p, i) => {
    const t = (i + 1) / (count + 1)
    out.push({ x: p.x, z: p.z, radius: from.radius + (toRadius - from.radius) * t })
  })
  out.push({ x: leg.point.x, z: leg.point.z, radius: toRadius })
  return out
}

type Layout = {
  /** Per-leg turn/length draws for the main route and the side branch. */
  main: { turn: number, length: number }[]
  side: { turn: number, length: number }[]
  sign: number
}

/** One deterministic layout attempt. The main route and the side branch draw
 *  from their own streams, so retuning one never shifts the other. */
function drawLayout(
  layoutRandom: () => number,
  branchRandom: () => number,
  sign: number,
  transitionLength: number,
): Layout {
  const main = MAIN_LEGS.map((spec, i) => ({
    turn: i === 0 ? 0 : sign * pick(spec.turn, layoutRandom()) * DEG,
    length: i === 0 ? transitionLength : pick(spec.length, layoutRandom()),
  }))
  const side = SIDE_LEGS.map((spec) => ({
    turn: sign * pick(spec.turn, branchRandom()) * DEG,
    length: pick(spec.length, branchRandom()),
  }))
  return { main, side, sign }
}

type Attempt = {
  nodes: CaveTopologyNode[]
  segments: CaveTopologySegment[]
  features: CaveTopologyFeature[]
}

/**
 * Builds one `adventure` cave topology for `input.site`, or `null` when no
 * deterministic layout attempt fits under the local terrain while keeping
 * every production guardrail (overburden, traversable grade, total drop,
 * disconnected-passage clearance) and the adventure footprint budget.
 *
 * Rejection is a legitimate outcome: `createCaves()` answers it by trying the
 * next home candidate, or by falling back to the unchanged natural recipe.
 *
 * @domain world-terrain
 */
export function buildAdventureCaveTopology(input: CaveRecipeInput): CaveTopology | null {
  const { seed, site, sampleHeight, sampleBaseHeight } = input
  const caveId = makeCaveId(seed, site)
  const layoutRandom = createCaveRandom(caveId, CAVE_RNG_SALT.adventureLayout)
  const shapeRandom = createCaveRandom(caveId, CAVE_RNG_SALT.adventureShape)
  const branchRandom = createCaveRandom(caveId, CAVE_RNG_SALT.adventureBranch)
  const featureRandom = createCaveRandom(caveId, CAVE_RNG_SALT.adventureFeature)

  const into = tunnelDirection(site.yaw)
  const mouthFloorY = sampleHeight(site.x, site.z) - CAVE_MOUTH_DEPTH
  const entrance: CaveEntrance = { x: site.x, y: mouthFloorY, z: site.z, yaw: site.yaw, width: LARGE_CAVE_MOUTH_WIDTH, height: ENTRANCE_HEIGHT }
  const entrancePoint: CaveTopologyPoint = { x: entrance.x, y: mouthFloorY, z: entrance.z }
  const ctx: RouteContext = {
    mouthFloorY,
    entrance,
    sampleBaseHeight,
    descentPerMeter: ADVENTURE_DESCENT_PER_METER,
  }

  // Past `MOUTH_TRANSITION_RANGE` so the thin-roof -> `MIN_OVERBURDEN` step is
  // absorbed by the first ramp rather than a floor cliff behind the mouth —
  // the same rule the natural recipe uses.
  const transitionLength = MOUTH_TRANSITION_RANGE + 1.2 + shapeRandom() * 1
  const mainSize = MAIN_LEGS.map((spec) => ({
    width: pick(spec.width, shapeRandom()),
    height: pick(spec.height, shapeRandom()),
  }))
  const sideSize = SIDE_LEGS.map((spec) => ({
    width: pick(spec.width, shapeRandom()),
    height: pick(spec.height, shapeRandom()),
  }))
  const baseSign = layoutRandom() < 0.5 ? -1 : 1

  for (let attempt = 0; attempt < LAYOUT_ATTEMPTS; attempt++) {
    const layout = drawLayout(layoutRandom, branchRandom, baseSign * (attempt % 2 === 0 ? 1 : -1), transitionLength)
    // Fresh centerline wobble per attempt so a retry is a genuinely different
    // route, not the same one re-walked.
    const wobbleRandom = createCaveRandom(`${caveId}:${attempt}`, CAVE_RNG_SALT.adventureCenterline)
    const built = tryLayout(ctx, layout, mainSize, sideSize, entrance, entrancePoint, into, wobbleRandom, featureRandom)
    if (!built) continue
    const topology: CaveTopology = {
      caveId,
      seed,
      entrance,
      nodes: built.nodes,
      segments: built.segments,
      features: built.features,
      minClearance: 2.4,
    }
    if (!fitsAdventureFootprintBudget(topology)) continue
    return topology
  }
  return null
}

function tryLayout(
  ctx: RouteContext,
  layout: Layout,
  mainSize: readonly { width: number, height: number }[],
  sideSize: readonly { width: number, height: number }[],
  entrance: CaveEntrance,
  entrancePoint: CaveTopologyPoint,
  into: { dx: number, dz: number },
  wobbleRandom: () => number,
  featureRandom: () => number,
): Attempt | null {
  const cursor: Cursor = { x: entrance.x, y: entrance.y, z: entrance.z, rejected: false }
  let heading = { dx: into.dx, dz: into.dz }
  let fromWidth = entrance.width
  let fromHeight = entrance.height
  let fromPoint = entrancePoint

  const legs: WalkedLeg[] = []
  const segments: CaveTopologySegment[] = []
  let junctionCursor: Cursor | null = null
  let junctionHeading = heading

  for (let i = 0; i < MAIN_LEGS.length; i++) {
    const spec = MAIN_LEGS[i]!
    const draw = layout.main[i]!
    const size = mainSize[i]!
    heading = rotateXZ(heading.dx, heading.dz, draw.turn)
    const toXZ = { x: cursor.x + heading.dx * draw.length, z: cursor.z + heading.dz * draw.length }
    const walk = walkSegment(
      ctx, cursor, fromWidth, fromHeight, toXZ, size.width, size.height,
      spec.wobble
        ? { perpDx: -heading.dz, perpDz: heading.dx, random: wobbleRandom, amplitude: spec.wobble }
        : undefined,
    )
    if (cursor.rejected) return null
    legs.push({ spec, point: walk.toPoint, width: size.width, height: size.height, interiorPoints: walk.interiorPoints, fromWidth })
    segments.push({
      id: `seg-${spec.id}`,
      from: i === 0 ? 'entrance' : MAIN_LEGS[i - 1]!.id,
      to: spec.id,
      centerline: [fromPoint, ...walk.interiorPoints, walk.toPoint],
    })
    if (spec.id === ADVENTURE_JUNCTION_NODE_ID) {
      junctionCursor = { ...cursor }
      junctionHeading = heading
    }
    fromWidth = size.width
    fromHeight = size.height
    fromPoint = walk.toPoint
  }
  if (!junctionCursor) return null

  const nodes: CaveTopologyNode[] = [
    { id: 'entrance', kind: 'entrance', position: entrancePoint, targetWidth: entrance.width, targetHeight: entrance.height },
    ...legs.map((leg) => ({
      id: leg.spec.id,
      kind: leg.spec.kind,
      position: leg.point,
      targetWidth: leg.width,
      targetHeight: leg.height,
    })),
  ]

  // Main-route self separation: two legs that are not neighbours in the route
  // must stay far enough apart that the representation's smooth union cannot
  // bridge them into a shortcut and make the junction meaningless.
  const mainStationsPerLeg: RadialStation[][] = []
  let prev: RadialStation = { x: entrancePoint.x, z: entrancePoint.z, radius: entrance.width / 2 }
  for (const leg of legs) {
    const stations = legStations(prev, leg)
    mainStationsPerLeg.push(stations)
    prev = stations[stations.length - 1]!
  }
  const nowhere = { x: Infinity, z: Infinity }
  for (let i = 0; i < mainStationsPerLeg.length; i++) {
    for (let j = i + 2; j < mainStationsPerLeg.length; j++) {
      // Legs one leg apart share the node that connects them, so ordinary
      // route curvature legitimately brings them close — they only have to
      // stay out of each other's tube. Legs further apart are what a
      // smooth-union shortcut would actually bypass (the junction included),
      // so those carry the full disconnected-passage clearance.
      const required = j - i >= 3 ? MIN_DISCONNECTED_CLEARANCE : 0
      if (minGapBetweenPaths(mainStationsPerLeg[i]!, mainStationsPerLeg[j]!, nowhere, 0) < required) {
        return null
      }
    }
  }

  // Mandatory side branch — never the natural recipe's 35% roll. An adventure
  // cave without its junction/side chamber is not an adventure cave, so a
  // branch that cannot keep its clearance fails the whole layout attempt.
  const junctionLeg = legs.find((leg) => leg.spec.id === ADVENTURE_JUNCTION_NODE_ID)!
  const branchCursor: Cursor = { ...junctionCursor }
  let branchHeading = junctionHeading
  let branchFromWidth = junctionLeg.width
  let branchFromHeight = junctionLeg.height
  let branchFromPoint = junctionLeg.point
  const sideStations: RadialStation[] = [{ x: junctionLeg.point.x, z: junctionLeg.point.z, radius: junctionLeg.width / 2 }]
  const sideSegments: CaveTopologySegment[] = []
  const sideNodes: CaveTopologyNode[] = []
  for (let i = 0; i < SIDE_LEGS.length; i++) {
    const spec = SIDE_LEGS[i]!
    const draw = layout.side[i]!
    const size = sideSize[i]!
    // Opposite side from the main continuation: past the junction the main
    // route turns against `layout.sign` while the branch turns with it, so
    // the two ways leave the junction ~100 degrees apart and read as a real
    // choice rather than a crack beside the corridor.
    branchHeading = rotateXZ(branchHeading.dx, branchHeading.dz, draw.turn)
    const toXZ = { x: branchCursor.x + branchHeading.dx * draw.length, z: branchCursor.z + branchHeading.dz * draw.length }
    const walk = walkSegment(ctx, branchCursor, branchFromWidth, branchFromHeight, toXZ, size.width, size.height)
    if (branchCursor.rejected) return null
    const from = sideStations[sideStations.length - 1]!
    for (const s of legStations(from, { spec, point: walk.toPoint, width: size.width, height: size.height, interiorPoints: walk.interiorPoints, fromWidth: branchFromWidth }).slice(1)) {
      sideStations.push(s)
    }
    sideNodes.push({ id: spec.id, kind: spec.kind, position: walk.toPoint, targetWidth: size.width, targetHeight: size.height })
    sideSegments.push({
      id: `seg-${spec.id}`,
      from: i === 0 ? ADVENTURE_JUNCTION_NODE_ID : SIDE_LEGS[i - 1]!.id,
      to: spec.id,
      centerline: [branchFromPoint, ...walk.interiorPoints, walk.toPoint],
    })
    branchFromWidth = size.width
    branchFromHeight = size.height
    branchFromPoint = walk.toPoint
  }

  const allMainStations = mainStationsPerLeg.flat()
  const gap = minGapBetweenPaths(
    allMainStations,
    sideStations,
    junctionLeg.point,
    junctionLeg.width / 2 + 1,
  )
  if (gap < MIN_DISCONNECTED_CLEARANCE) return null

  nodes.push(...sideNodes)
  segments.push(...sideSegments)

  const features = [
    chamberFeature(ctx, nodes.find((n) => n.id === 'adventure-chamber-1')!, featureRandom),
    chamberFeature(ctx, nodes.find((n) => n.id === ADVENTURE_FINAL_CHAMBER_NODE_ID)!, featureRandom),
  ]
  return { nodes, segments, features }
}

/** A shelf or an overhang against one chamber wall — the plan's "at least one
 *  genuine 3D feature" contract, adapted to local overburden exactly like the
 *  natural recipe's. */
function chamberFeature(
  ctx: RouteContext,
  chamber: CaveTopologyNode,
  featureRandom: () => number,
): CaveTopologyFeature {
  const wantsShelf = featureRandom() < 0.5
  const angle = featureRandom() * Math.PI * 2
  const offset = { dx: Math.cos(angle), dz: Math.sin(angle) }
  const radius = chamber.targetWidth / 2
  return lowerFeatureIfNeeded(ctx, wantsShelf
    ? {
        id: `${chamber.id}-shelf`,
        kind: 'shelf',
        anchorNodeId: chamber.id,
        position: {
          x: chamber.position.x + offset.dx * radius * 0.55,
          y: chamber.position.y + chamber.targetHeight * 0.35,
          z: chamber.position.z + offset.dz * radius * 0.55,
        },
        size: { width: 2.6 + featureRandom() * 1.2, height: 0.4 + featureRandom() * 0.5, depth: 1.8 + featureRandom() * 0.8 },
      }
    : {
        id: `${chamber.id}-overhang`,
        kind: 'overhang',
        anchorNodeId: chamber.id,
        position: {
          x: chamber.position.x - offset.dx * radius * 0.4,
          y: chamber.position.y + chamber.targetHeight * 0.68,
          z: chamber.position.z - offset.dz * radius * 0.4,
        },
        size: { width: 3.0 + featureRandom() * 1.2, height: 1.0 + featureRandom() * 0.6, depth: 2.0 + featureRandom() * 0.8 },
      })
}
