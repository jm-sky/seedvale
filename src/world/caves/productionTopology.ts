/** Plan world-terrain-008 Milestone B1 — production `CaveTopology` builder,
 *  extended by plan world-terrain-020 Stage A into an archetype dispatcher
 *  and by plan world-terrain-024 with the `dungeon` recipe.
 *
 *  This module owns the `natural` recipe (entrance → transition → irregular
 *  passage → widening/bend → main chamber → shelf|overhang, optional short
 *  branch) and routes `adventure` / `dungeon` to their own files. All recipes
 *  share one set of terrain-aware route primitives (`caveRoute.ts`) — the
 *  natural call sequence, parameters and RNG consumption are exactly what
 *  they have always been, so existing seeded caves do not move.
 *
 *  Reuses `pickLargeCaveSites()` for placement (siting/filtering stays owned
 *  by `largeCaves.ts`) and `makeCaveId()` for identity — topology generation
 *  and acceptance are owned here, in `adventureTopology.ts` and in
 *  `dungeonTopology.ts`; V1's
 *  tunnel/chamber `CaveDefinition` graph (`caveGenerator.ts`) is no longer in
 *  the loop.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import type { CaveArchetype } from './caveArchetype'
import type { CaveRecipeInput, Cursor, RadialStation } from './caveRoute'
import type { CaveTopology, CaveTopologyFeature, CaveTopologyNode, CaveTopologyPoint, CaveTopologySegment } from './caveTopology'
import { CAVE_MOUTH_DEPTH } from '../caveGenerator'
import { LARGE_CAVE_MOUTH_WIDTH, tunnelDirection } from '../largeCaves'
import { buildAdventureCaveTopology } from './adventureTopology'
import { makeCaveId } from './caveIdentity'
import { CAVE_RNG_SALT, createCaveRandom } from './caveRng'
import {
  lowerFeatureIfNeeded,
  MIN_DISCONNECTED_CLEARANCE,
  minGapBetweenPaths,
  NATURAL_DESCENT_PER_METER,
  pick,
  rotateXZ,
  type RouteContext,
  walkSegment,
} from './caveRoute'
import { buildDungeonCaveTopology } from './dungeonTopology'
import { MOUTH_TRANSITION_RANGE } from './mouthOverburden'

export {
  FLOOR_RAMP_STATION_SPACING,
  MAX_TRAVERSABLE_FLOOR_GRADE,
  maxCenterlineFloorGrade,
  MIN_DISCONNECTED_CLEARANCE,
  minGapBetweenPaths,
} from './caveRoute'

const ENTRANCE_HEIGHT = 2.6

// Plan §7 starting cross-section ranges — width/height, metres. Production
// caves are wider/taller than the Milestone-A spike, mainly in cross-section,
// not route length.
const PASSAGE_WIDTH: readonly [number, number] = [3.5, 4.5]
const PASSAGE_HEIGHT: readonly [number, number] = [4.5, 5.5]
const WIDENING_WIDTH: readonly [number, number] = [5, 6]
const WIDENING_HEIGHT: readonly [number, number] = [5.5, 6.5]
const CHAMBER_WIDTH: readonly [number, number] = [9, 10]
const CHAMBER_HEIGHT: readonly [number, number] = [9, 11]

const BRANCH_CHANCE = 0.35

/** What a production recipe needs to build and accept a topology.
 *  `archetype` defaults to `natural`, so every pre-world-terrain-020 caller
 *  keeps the recipe (and the output) it always had. */
export type ProductionTopologyInput = CaveRecipeInput & {
  archetype?: CaveArchetype
}

/**
 * Builds the production topology for `input.site` under the requested
 * archetype, or `null` if no reasonable route fits under the local terrain
 * (the site is rejected outright rather than forced above the surface —
 * plan world-terrain-008 §8).
 *
 * A `null` for `adventure` or `dungeon` does not mean the site has no cave:
 * `createCaves()` either moves the matching guarantee to the next candidate
 * or falls back through the remaining recipes for that same site.
 *
 * @domain world-terrain
 */
export function buildProductionCaveTopology(input: ProductionTopologyInput): CaveTopology | null {
  const archetype = input.archetype ?? 'natural'
  switch (archetype) {
    case 'adventure':
      return buildAdventureCaveTopology(input)
    case 'dungeon':
      return buildDungeonCaveTopology(input)
    case 'natural':
      return buildNaturalCaveTopology(input)
  }
}

/**
 * The long-standing `natural` recipe. Frozen by plan world-terrain-020: for
 * the same seed + site its output and acceptance behaviour are a regression
 * fixture, so dimensions, `BRANCH_CHANCE`, thresholds and RNG call order must
 * not be retuned while other archetypes are added.
 *
 * @domain world-terrain
 */
export function buildNaturalCaveTopology(input: CaveRecipeInput): CaveTopology | null {
  const { seed, site, sampleHeight, sampleBaseHeight } = input
  const caveId = makeCaveId(seed, site)
  const structureRandom = createCaveRandom(caveId, CAVE_RNG_SALT.structure)
  const featureRandom = createCaveRandom(caveId, CAVE_RNG_SALT.feature)
  const centerlineRandom = createCaveRandom(caveId, CAVE_RNG_SALT.centerline)
  const branchRandom = createCaveRandom(caveId, CAVE_RNG_SALT.branch)

  const into = tunnelDirection(site.yaw)
  const perp = { dx: -into.dz, dz: into.dx }

  const mouthFloorY = sampleHeight(site.x, site.z) - CAVE_MOUTH_DEPTH
  const entrance: CaveEntrance = { x: site.x, y: mouthFloorY, z: site.z, yaw: site.yaw, width: LARGE_CAVE_MOUTH_WIDTH, height: ENTRANCE_HEIGHT }
  const entrancePoint: CaveTopologyPoint = { x: entrance.x, y: mouthFloorY, z: entrance.z }
  const ctx: RouteContext = {
    mouthFloorY,
    entrance,
    sampleBaseHeight,
    descentPerMeter: NATURAL_DESCENT_PER_METER,
  }

  // Past `MOUTH_TRANSITION_RANGE` so the thin-roof → `MIN_OVERBURDEN` step is
  // absorbed by this ramp instead of a 1 m floor cliff at 4 m from the mouth.
  const transitionLength = MOUTH_TRANSITION_RANGE + 1.2 + structureRandom() * 1
  const passageLength = 6 + structureRandom() * 2
  const bendLength = 5 + structureRandom() * 1.5
  const chamberOffsetLength = 6 + structureRandom() * 2

  const bendSign = structureRandom() < 0.5 ? -1 : 1
  const bendAngle = bendSign * ((16 + structureRandom() * 20) * Math.PI) / 180
  const bendDir = rotateXZ(into.dx, into.dz, bendAngle)
  const chamberDir = rotateXZ(bendDir.dx, bendDir.dz, bendAngle * 0.35)

  const transitionWidth = pick(PASSAGE_WIDTH, structureRandom())
  const transitionHeight = pick(PASSAGE_HEIGHT, structureRandom())
  const passageWidth = pick(PASSAGE_WIDTH, structureRandom())
  const passageHeight = pick(PASSAGE_HEIGHT, structureRandom())
  const bendWidth = pick(WIDENING_WIDTH, structureRandom())
  const bendHeight = pick(WIDENING_HEIGHT, structureRandom())
  const chamberWidth = pick(CHAMBER_WIDTH, structureRandom())
  const chamberHeight = pick(CHAMBER_HEIGHT, structureRandom())

  const transitionXZ = { x: entrance.x + into.dx * transitionLength, z: entrance.z + into.dz * transitionLength }
  const passageXZ = { x: transitionXZ.x + into.dx * passageLength, z: transitionXZ.z + into.dz * passageLength }
  const bendXZ = { x: passageXZ.x + bendDir.dx * bendLength, z: passageXZ.z + bendDir.dz * bendLength }
  const chamberXZ = { x: bendXZ.x + chamberDir.dx * chamberOffsetLength, z: bendXZ.z + chamberDir.dz * chamberOffsetLength }

  const cursor: Cursor = { x: entrance.x, y: mouthFloorY, z: entrance.z, rejected: false }

  const seg1 = walkSegment(ctx, cursor, entrance.width, entrance.height, transitionXZ, transitionWidth, transitionHeight)
  if (cursor.rejected) return null
  const transitionPoint = seg1.toPoint

  const seg2 = walkSegment(
    ctx, cursor, transitionWidth, transitionHeight, passageXZ, passageWidth, passageHeight,
    { perpDx: perp.dx, perpDz: perp.dz, random: centerlineRandom, amplitude: 1.8 },
  )
  if (cursor.rejected) return null
  const passagePoint = seg2.toPoint

  const seg3 = walkSegment(ctx, cursor, passageWidth, passageHeight, bendXZ, bendWidth, bendHeight)
  if (cursor.rejected) return null
  const bendPoint = seg3.toPoint
  const bendCursorSnapshot: Cursor = { ...cursor }

  const seg4 = walkSegment(ctx, cursor, bendWidth, bendHeight, chamberXZ, chamberWidth, chamberHeight)
  if (cursor.rejected) return null
  const chamberPoint = seg4.toPoint

  const nodes: CaveTopologyNode[] = [
    { id: 'entrance', kind: 'entrance', position: entrancePoint, targetWidth: entrance.width, targetHeight: entrance.height },
    { id: 'transition', kind: 'passage', position: transitionPoint, targetWidth: transitionWidth, targetHeight: transitionHeight },
    { id: 'passage', kind: 'passage', position: passagePoint, targetWidth: passageWidth, targetHeight: passageHeight },
    { id: 'widening-bend', kind: 'widening', position: bendPoint, targetWidth: bendWidth, targetHeight: bendHeight },
    { id: 'chamber', kind: 'chamber', position: chamberPoint, targetWidth: chamberWidth, targetHeight: chamberHeight },
  ]

  const segments: CaveTopologySegment[] = [
    { id: 'seg-transition', from: 'entrance', to: 'transition', centerline: [entrancePoint, ...seg1.interiorPoints, transitionPoint] },
    { id: 'seg-passage', from: 'transition', to: 'passage', centerline: [transitionPoint, ...seg2.interiorPoints, passagePoint] },
    { id: 'seg-bend', from: 'passage', to: 'widening-bend', centerline: [passagePoint, ...seg3.interiorPoints, bendPoint] },
    { id: 'seg-chamber', from: 'widening-bend', to: 'chamber', centerline: [bendPoint, ...seg4.interiorPoints, chamberPoint] },
  ]

  const wantsShelf = featureRandom() < 0.5
  const featureOffset = rotateXZ(chamberDir.dx, chamberDir.dz, Math.PI / 2)
  const chamberRadius = chamberWidth / 2
  const feature: CaveTopologyFeature = lowerFeatureIfNeeded(
    ctx,
    wantsShelf
      ? {
          id: 'chamber-shelf',
          kind: 'shelf',
          anchorNodeId: 'chamber',
          position: {
            x: chamberPoint.x + featureOffset.dx * chamberRadius * 0.55,
            y: chamberPoint.y + chamberHeight * 0.35,
            z: chamberPoint.z + featureOffset.dz * chamberRadius * 0.55,
          },
          size: { width: 2.6 + featureRandom() * 1.2, height: 0.4 + featureRandom() * 0.5, depth: 1.8 + featureRandom() * 0.8 },
        }
      : {
          id: 'chamber-overhang',
          kind: 'overhang',
          anchorNodeId: 'chamber',
          position: {
            x: chamberPoint.x - featureOffset.dx * chamberRadius * 0.4,
            y: chamberPoint.y + chamberHeight * 0.68,
            z: chamberPoint.z - featureOffset.dz * chamberRadius * 0.4,
          },
          size: { width: 3.0 + featureRandom() * 1.2, height: 1.0 + featureRandom() * 0.6, depth: 2.0 + featureRandom() * 0.8 },
        },
  )

  // Optional short branch (plan §7/§8: stress capability, never required for
  // L1). Dropped silently — never rejects the whole site — if it can't reach
  // a valid depth or would come close enough to the main route to risk an
  // accidental smooth-union bridge.
  if (branchRandom() < BRANCH_CHANCE) {
    const branchAngle = (branchRandom() < 0.5 ? -1 : 1) * ((45 + branchRandom() * 25) * Math.PI) / 180
    const branchDir = rotateXZ(bendDir.dx, bendDir.dz, branchAngle)
    const branchLength = 5 + branchRandom() * 3
    const branchWidth = pick(PASSAGE_WIDTH, branchRandom())
    const branchHeight = pick(PASSAGE_HEIGHT, branchRandom())
    const branchXZ = { x: bendPoint.x + branchDir.dx * branchLength, z: bendPoint.z + branchDir.dz * branchLength }

    const branchCursor: Cursor = { ...bendCursorSnapshot }
    const branchWalk = walkSegment(ctx, branchCursor, bendWidth, bendHeight, branchXZ, branchWidth, branchHeight)
    if (!branchCursor.rejected) {
      const branchPoint = branchWalk.toPoint
      const mainStations: RadialStation[] = [
        { x: entrancePoint.x, z: entrancePoint.z, radius: entrance.width / 2 },
        { x: transitionPoint.x, z: transitionPoint.z, radius: transitionWidth / 2 },
        ...seg2.interiorPoints.map((p, i) => ({
          x: p.x,
          z: p.z,
          radius: (transitionWidth + (passageWidth - transitionWidth) * ((i + 1) / 3)) / 2,
        })),
        { x: passagePoint.x, z: passagePoint.z, radius: passageWidth / 2 },
        { x: bendPoint.x, z: bendPoint.z, radius: bendWidth / 2 },
        { x: chamberPoint.x, z: chamberPoint.z, radius: chamberWidth / 2 },
      ]
      const branchStations: RadialStation[] = [
        { x: bendPoint.x, z: bendPoint.z, radius: bendWidth / 2 },
        { x: branchPoint.x, z: branchPoint.z, radius: branchWidth / 2 },
      ]
      const minGap = minGapBetweenPaths(mainStations, branchStations, bendPoint, bendWidth / 2 + 1)
      if (minGap >= MIN_DISCONNECTED_CLEARANCE) {
        nodes.push({ id: 'branch-chamber', kind: 'chamber', position: branchPoint, targetWidth: branchWidth, targetHeight: branchHeight })
        segments.push({ id: 'seg-branch', from: 'widening-bend', to: 'branch-chamber', centerline: [bendPoint, ...branchWalk.interiorPoints, branchPoint] })
      }
    }
  }

  return {
    caveId,
    seed,
    entrance,
    nodes,
    segments,
    features: [feature],
    minClearance: 2.4,
  }
}
