/** Plan world-terrain-024 — the `dungeon` production cave recipe.
 *
 *  Same `CaveTopology` contract, same terrain guardrails and the same route
 *  primitives as the natural and adventure recipes (`caveRoute.ts`); only the
 *  *layout* is different: a folded network of successive chambers with two
 *  guaranteed junctions, each opening a dead-end side branch, and a deep
 *  final chamber. It is a larger recipe, not a second cave runtime.
 *
 *  The route folds (an S rather than a straight run) so the rectangular XZ
 *  grid `buildCaveHeightfieldRepresentation()` allocates stays proportionate:
 *  each candidate layout is priced with `estimateHeightfieldGrid()` *before*
 *  the heightfield exists, and a layout over `DUNGEON_MAX_HEIGHTFIELD_CELLS`
 *  is deterministically retried and finally rejected — never accommodated by
 *  changing the global heightfield config.
 *
 *  Node ids are stable and role-based (`dungeon-junction-1`,
 *  `dungeon-side-chamber-1`, `dungeon-final-chamber`, …) because later plans
 *  assign residents and resources to them; they must never be discovered by
 *  array position.
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
import { dungeonTopologyAcceptsUndergroundPool } from './caveUndergroundPool'
import { MOUTH_TRANSITION_RANGE } from './mouthOverburden'

const ENTRANCE_HEIGHT = 2.6

/** Gentler than `ADVENTURE_DESCENT_PER_METER`: the dungeon route is longer
 *  still, and the *unchanged* `MAX_TOTAL_DROP` still bounds the whole cave. */
export const DUNGEON_DESCENT_PER_METER = 0.035

const PASSAGE_WIDTH: readonly [number, number] = [3.6, 4.6]
const PASSAGE_HEIGHT: readonly [number, number] = [4.4, 5.4]
const JUNCTION_WIDTH: readonly [number, number] = [7, 8]
const JUNCTION_HEIGHT: readonly [number, number] = [6, 7]
const CHAMBER_WIDTH: readonly [number, number] = [8, 9.5]
const CHAMBER_HEIGHT: readonly [number, number] = [7.5, 9]
const SIDE_CHAMBER_WIDTH: readonly [number, number] = [6.5, 7.5]
const SIDE_CHAMBER_HEIGHT: readonly [number, number] = [6, 7]
const FINAL_CHAMBER_WIDTH: readonly [number, number] = [9.5, 11]
const FINAL_CHAMBER_HEIGHT: readonly [number, number] = [8.5, 10]

export const DUNGEON_JUNCTION_1_NODE_ID = 'dungeon-junction-1'
export const DUNGEON_JUNCTION_2_NODE_ID = 'dungeon-junction-2'
export const DUNGEON_CHAMBER_1_NODE_ID = 'dungeon-chamber-1'
export const DUNGEON_CHAMBER_2_NODE_ID = 'dungeon-chamber-2'
export const DUNGEON_CHAMBER_3_NODE_ID = 'dungeon-chamber-3'
export const DUNGEON_SIDE_CHAMBER_1_NODE_ID = 'dungeon-side-chamber-1'
export const DUNGEON_SIDE_CHAMBER_2_NODE_ID = 'dungeon-side-chamber-2'
export const DUNGEON_DEEP_CHAMBER_NODE_ID = 'dungeon-deep-chamber'
export const DUNGEON_FINAL_CHAMBER_NODE_ID = 'dungeon-final-chamber'
export const DUNGEON_SIDE_PASSAGE_1_NODE_ID = 'dungeon-side-passage-1'
export const DUNGEON_SIDE_PASSAGE_2_NODE_ID = 'dungeon-side-passage-2'

const REQUIRED_CHAMBER_IDS: readonly string[] = [
  DUNGEON_CHAMBER_1_NODE_ID,
  DUNGEON_SIDE_CHAMBER_1_NODE_ID,
  DUNGEON_CHAMBER_2_NODE_ID,
  DUNGEON_SIDE_CHAMBER_2_NODE_ID,
  DUNGEON_CHAMBER_3_NODE_ID,
  DUNGEON_DEEP_CHAMBER_NODE_ID,
  DUNGEON_FINAL_CHAMBER_NODE_ID,
]

type LegSpec = {
  id: string
  kind: CaveTopologyNodeKind
  turn: readonly [number, number]
  length: readonly [number, number]
  width: readonly [number, number]
  height: readonly [number, number]
  wobble?: number
}

/** Main route, mouth first. Turns form an S-fold: first arc, reverse, second
 *  arc, then a closing fold into the deep/final chambers so the footprint
 *  stays compact instead of running tens of metres in one direction. */
const MAIN_LEGS: readonly LegSpec[] = [
  { id: 'dungeon-transition', kind: 'passage', turn: [0, 0], length: [0, 0], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT },
  { id: 'dungeon-passage-1', kind: 'passage', turn: [30, 40], length: [8, 10.5], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT, wobble: 1.8 },
  { id: DUNGEON_CHAMBER_1_NODE_ID, kind: 'chamber', turn: [30, 38], length: [7, 8.5], width: CHAMBER_WIDTH, height: CHAMBER_HEIGHT },
  { id: 'dungeon-passage-2', kind: 'passage', turn: [22, 32], length: [8, 10.5], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT, wobble: 1.8 },
  { id: DUNGEON_JUNCTION_1_NODE_ID, kind: 'widening', turn: [-34, -26], length: [7, 8.5], width: JUNCTION_WIDTH, height: JUNCTION_HEIGHT },
  { id: 'dungeon-passage-3', kind: 'passage', turn: [-38, -30], length: [8, 10.5], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT, wobble: 1.8 },
  { id: DUNGEON_CHAMBER_2_NODE_ID, kind: 'chamber', turn: [-34, -26], length: [7, 8.5], width: CHAMBER_WIDTH, height: CHAMBER_HEIGHT },
  { id: 'dungeon-passage-4', kind: 'passage', turn: [-30, -22], length: [8, 10.5], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT, wobble: 1.8 },
  { id: DUNGEON_JUNCTION_2_NODE_ID, kind: 'widening', turn: [26, 34], length: [7, 8.5], width: JUNCTION_WIDTH, height: JUNCTION_HEIGHT },
  { id: 'dungeon-passage-5', kind: 'passage', turn: [30, 40], length: [8, 10.5], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT, wobble: 1.8 },
  { id: DUNGEON_CHAMBER_3_NODE_ID, kind: 'chamber', turn: [26, 34], length: [7, 8.5], width: CHAMBER_WIDTH, height: CHAMBER_HEIGHT },
  { id: 'dungeon-deep-passage', kind: 'passage', turn: [24, 32], length: [8, 10.5], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT, wobble: 1.8 },
  { id: DUNGEON_DEEP_CHAMBER_NODE_ID, kind: 'chamber', turn: [-32, -24], length: [7, 8.5], width: CHAMBER_WIDTH, height: CHAMBER_HEIGHT },
  { id: 'dungeon-final-passage', kind: 'passage', turn: [-34, -26], length: [8, 10.5], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT, wobble: 1.8 },
  { id: DUNGEON_FINAL_CHAMBER_NODE_ID, kind: 'chamber', turn: [-28, -20], length: [8, 9.5], width: FINAL_CHAMBER_WIDTH, height: FINAL_CHAMBER_HEIGHT },
]

type SideSpec = {
  junctionId: string
  legs: readonly LegSpec[]
}

const SIDE_BRANCHES: readonly SideSpec[] = [
  {
    junctionId: DUNGEON_JUNCTION_1_NODE_ID,
    legs: [
      { id: DUNGEON_SIDE_PASSAGE_1_NODE_ID, kind: 'passage', turn: [60, 72], length: [6, 8], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT },
      { id: DUNGEON_SIDE_CHAMBER_1_NODE_ID, kind: 'chamber', turn: [12, 22], length: [6, 7.5], width: SIDE_CHAMBER_WIDTH, height: SIDE_CHAMBER_HEIGHT },
    ],
  },
  {
    junctionId: DUNGEON_JUNCTION_2_NODE_ID,
    // Opposite to the main continuation past junction 2 (that continuation
    // turns *with* the layout sign, so this branch turns against it).
    legs: [
      { id: DUNGEON_SIDE_PASSAGE_2_NODE_ID, kind: 'passage', turn: [-72, -60], length: [6, 8], width: PASSAGE_WIDTH, height: PASSAGE_HEIGHT },
      { id: DUNGEON_SIDE_CHAMBER_2_NODE_ID, kind: 'chamber', turn: [-22, -12], length: [6, 7.5], width: SIDE_CHAMBER_WIDTH, height: SIDE_CHAMBER_HEIGHT },
    ],
  },
]

/**
 * Rectangular grid budget for one dungeon cave, in heightfield cells.
 *
 * Chosen from generated gentle-hill fixtures (not as a multiple of
 * `ADVENTURE_MAX_HEIGHTFIELD_CELLS`): a folded dungeon of ~7 chambers prices
 * at roughly 62–84k cells at `DEFAULT_HEIGHTFIELD_CONFIG`. The cap exists
 * so a layout that fans out instead of folding is rejected and retried.
 */
export const DUNGEON_MAX_HEIGHTFIELD_CELLS = 110_000

/** Deterministic layout attempts before the site is rejected for dungeon. */
export const DUNGEON_LAYOUT_ATTEMPTS = 6

const MIN_DUNGEON_CHAMBERS = 5
const MIN_DUNGEON_BRANCH_DECISIONS = 2

const DEG = Math.PI / 180

type WalkedLeg = {
  spec: LegSpec
  point: CaveTopologyPoint
  width: number
  height: number
  interiorPoints: CaveTopologyPoint[]
  fromWidth: number
}

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
  main: { turn: number, length: number }[]
  sides: { turn: number, length: number }[][]
  sign: number
}

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
  const sides = SIDE_BRANCHES.map((branch) => branch.legs.map((spec) => ({
    turn: sign * pick(spec.turn, branchRandom()) * DEG,
    length: pick(spec.length, branchRandom()),
  })))
  return { main, sides, sign }
}

type Attempt = {
  nodes: CaveTopologyNode[]
  segments: CaveTopologySegment[]
  features: CaveTopologyFeature[]
}

/**
 * Whether a candidate dungeon layout's rectangular XZ grid fits the dungeon
 * cell budget. Checked before any heightfield exists.
 *
 * @domain world-terrain
 */
export function fitsDungeonFootprintBudget(
  topology: CaveTopology,
  maxCells: number = DUNGEON_MAX_HEIGHTFIELD_CELLS,
): boolean {
  return estimateHeightfieldGrid(topology).cells <= maxCells
}

function outgoingDegree(topology: Pick<CaveTopology, 'segments'>, nodeId: string): number {
  let n = 0
  for (const seg of topology.segments) {
    if (seg.from === nodeId) n++
  }
  return n
}

/** Graph branch decisions: nodes with two or more outgoing segments. */
export function dungeonBranchDecisionCount(topology: Pick<CaveTopology, 'segments'>): number {
  const seen = new Set<string>()
  let n = 0
  for (const seg of topology.segments) {
    if (seen.has(seg.from)) continue
    seen.add(seg.from)
    if (outgoingDegree(topology, seg.from) >= 2) n++
  }
  return n
}

function chambersReachableFromEntrance(topology: Pick<CaveTopology, 'nodes' | 'segments'>): boolean {
  const adjacency = new Map<string, string[]>()
  for (const segment of topology.segments) {
    if (!adjacency.has(segment.from)) adjacency.set(segment.from, [])
    if (!adjacency.has(segment.to)) adjacency.set(segment.to, [])
    adjacency.get(segment.from)!.push(segment.to)
    adjacency.get(segment.to)!.push(segment.from)
  }
  const visited = new Set<string>(['entrance'])
  const queue = ['entrance']
  for (let i = 0; i < queue.length; i++) {
    for (const neighbor of adjacency.get(queue[i]!) ?? []) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      queue.push(neighbor)
    }
  }
  return topology.nodes.every((node) => node.kind !== 'chamber' || visited.has(node.id))
}

/**
 * Minimal dungeon semantic contract: enough chambers, two real graph
 * junctions, a side chamber, a deep/final end, and every chamber reachable
 * from the entrance. Layouts that fail this are retried/rejected, never
 * quietly labelled dungeon.
 *
 * @domain world-terrain
 */
export function meetsDungeonSemanticContract(topology: CaveTopology): boolean {
  const chambers = topology.nodes.filter((n) => n.kind === 'chamber')
  if (chambers.length < MIN_DUNGEON_CHAMBERS) return false
  const ids = new Set(topology.nodes.map((n) => n.id))
  for (const id of REQUIRED_CHAMBER_IDS) {
    if (!ids.has(id)) return false
  }
  if (!ids.has(DUNGEON_JUNCTION_1_NODE_ID) || !ids.has(DUNGEON_JUNCTION_2_NODE_ID)) return false
  if (dungeonBranchDecisionCount(topology) < MIN_DUNGEON_BRANCH_DECISIONS) return false
  const sideDeadEnd = !topology.segments.some((s) => s.from === DUNGEON_SIDE_CHAMBER_1_NODE_ID)
  if (!sideDeadEnd) return false
  return chambersReachableFromEntrance(topology)
}

/**
 * Builds one `dungeon` cave topology for `input.site`, or `null` when no
 * deterministic layout attempt fits under the local terrain while keeping
 * every production guardrail, the dungeon semantic contract, and the dungeon
 * footprint budget.
 *
 * @domain world-terrain
 */
export function buildDungeonCaveTopology(input: CaveRecipeInput): CaveTopology | null {
  const { seed, site, sampleHeight, sampleBaseHeight } = input
  const caveId = makeCaveId(seed, site)
  const layoutRandom = createCaveRandom(caveId, CAVE_RNG_SALT.dungeonLayout)
  const shapeRandom = createCaveRandom(caveId, CAVE_RNG_SALT.dungeonShape)
  const branchRandom = createCaveRandom(caveId, CAVE_RNG_SALT.dungeonBranch)
  const featureRandom = createCaveRandom(caveId, CAVE_RNG_SALT.dungeonFeature)

  const into = tunnelDirection(site.yaw)
  const mouthFloorY = sampleHeight(site.x, site.z) - CAVE_MOUTH_DEPTH
  const entrance: CaveEntrance = { x: site.x, y: mouthFloorY, z: site.z, yaw: site.yaw, width: LARGE_CAVE_MOUTH_WIDTH, height: ENTRANCE_HEIGHT }
  const entrancePoint: CaveTopologyPoint = { x: entrance.x, y: mouthFloorY, z: entrance.z }
  const ctx: RouteContext = {
    mouthFloorY,
    entrance,
    sampleBaseHeight,
    descentPerMeter: DUNGEON_DESCENT_PER_METER,
  }

  const transitionLength = MOUTH_TRANSITION_RANGE + 1.2 + shapeRandom() * 1
  const mainSize = MAIN_LEGS.map((spec) => ({
    width: pick(spec.width, shapeRandom()),
    height: pick(spec.height, shapeRandom()),
  }))
  const sideSize = SIDE_BRANCHES.map((branch) => branch.legs.map((spec) => ({
    width: pick(spec.width, shapeRandom()),
    height: pick(spec.height, shapeRandom()),
  })))
  const baseSign = layoutRandom() < 0.5 ? -1 : 1

  for (let attempt = 0; attempt < DUNGEON_LAYOUT_ATTEMPTS; attempt++) {
    const layout = drawLayout(layoutRandom, branchRandom, baseSign * (attempt % 2 === 0 ? 1 : -1), transitionLength)
    const wobbleRandom = createCaveRandom(`${caveId}:${attempt}`, CAVE_RNG_SALT.dungeonCenterline)
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
    if (!meetsDungeonSemanticContract(topology)) continue
    if (!fitsDungeonFootprintBudget(topology)) continue
    if (!dungeonTopologyAcceptsUndergroundPool(topology, sampleBaseHeight)) continue
    return topology
  }
  return null
}

function tryLayout(
  ctx: RouteContext,
  layout: Layout,
  mainSize: readonly { width: number, height: number }[],
  sideSize: readonly { width: number, height: number }[][],
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
  const junctionById = new Map<string, { cursor: Cursor, heading: { dx: number, dz: number } }>()

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
    if (spec.id === DUNGEON_JUNCTION_1_NODE_ID || spec.id === DUNGEON_JUNCTION_2_NODE_ID) {
      junctionById.set(spec.id, { cursor: { ...cursor }, heading: { ...heading } })
    }
    fromWidth = size.width
    fromHeight = size.height
    fromPoint = walk.toPoint
  }
  if (junctionById.size !== SIDE_BRANCHES.length) return null

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
      const required = j - i >= 3 ? MIN_DISCONNECTED_CLEARANCE : 0
      if (minGapBetweenPaths(mainStationsPerLeg[i]!, mainStationsPerLeg[j]!, nowhere, 0) < required) {
        return null
      }
    }
  }

  const allMainStations = mainStationsPerLeg.flat()
  const sideStationSets: RadialStation[][] = []

  for (let b = 0; b < SIDE_BRANCHES.length; b++) {
    const branch = SIDE_BRANCHES[b]!
    const junction = junctionById.get(branch.junctionId)
    const junctionLeg = legs.find((leg) => leg.spec.id === branch.junctionId)
    if (!junction || !junctionLeg) return null
    const branchCursor: Cursor = { ...junction.cursor }
    let branchHeading = junction.heading
    let branchFromWidth = junctionLeg.width
    let branchFromHeight = junctionLeg.height
    let branchFromPoint = junctionLeg.point
    const sideStations: RadialStation[] = [{ x: junctionLeg.point.x, z: junctionLeg.point.z, radius: junctionLeg.width / 2 }]
    for (let i = 0; i < branch.legs.length; i++) {
      const spec = branch.legs[i]!
      const draw = layout.sides[b]![i]!
      const size = sideSize[b]![i]!
      branchHeading = rotateXZ(branchHeading.dx, branchHeading.dz, draw.turn)
      const toXZ = { x: branchCursor.x + branchHeading.dx * draw.length, z: branchCursor.z + branchHeading.dz * draw.length }
      const walk = walkSegment(ctx, branchCursor, branchFromWidth, branchFromHeight, toXZ, size.width, size.height)
      if (branchCursor.rejected) return null
      const from = sideStations[sideStations.length - 1]!
      for (const s of legStations(from, {
        spec, point: walk.toPoint, width: size.width, height: size.height,
        interiorPoints: walk.interiorPoints, fromWidth: branchFromWidth,
      }).slice(1)) {
        sideStations.push(s)
      }
      nodes.push({ id: spec.id, kind: spec.kind, position: walk.toPoint, targetWidth: size.width, targetHeight: size.height })
      segments.push({
        id: `seg-${spec.id}`,
        from: i === 0 ? branch.junctionId : branch.legs[i - 1]!.id,
        to: spec.id,
        centerline: [branchFromPoint, ...walk.interiorPoints, walk.toPoint],
      })
      branchFromWidth = size.width
      branchFromHeight = size.height
      branchFromPoint = walk.toPoint
    }
    const gap = minGapBetweenPaths(
      allMainStations,
      sideStations,
      junctionLeg.point,
      junctionLeg.width / 2 + 1,
    )
    if (gap < MIN_DISCONNECTED_CLEARANCE) return null
    sideStationSets.push(sideStations)
  }

  for (let i = 0; i < sideStationSets.length; i++) {
    for (let j = i + 1; j < sideStationSets.length; j++) {
      if (minGapBetweenPaths(sideStationSets[i]!, sideStationSets[j]!, nowhere, 0) < MIN_DISCONNECTED_CLEARANCE) {
        return null
      }
    }
  }

  const features = [
    chamberFeature(ctx, nodes.find((n) => n.id === DUNGEON_CHAMBER_1_NODE_ID)!, featureRandom),
    chamberFeature(ctx, nodes.find((n) => n.id === DUNGEON_FINAL_CHAMBER_NODE_ID)!, featureRandom),
  ]
  return { nodes, segments, features }
}

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
