/** B3 descending-path movement trace — regression harness for RC1+RC2.
 *  Reconstructs PlayerController update order on the production Grota
 *  Czarnego Kamienia route (seed `1136726869`).
 *  No browser. See world-terrain-008 B3 recon notes.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import type { CaveTopology } from './caveTopology'
import { createBenchmarkWorldConfig } from '../../config/worldConfig'
import { measureSlope } from '../../fauna/createFauna'
import {
  CAMERA_DISTANCE_DEFAULT,
  CAMERA_DISTANCE_MIN,
} from '../../input/MouseLook'
import {
  CAMERA_GROUND_CLEARANCE,
  resolveCameraBoom,
} from '../../player/cameraBoom'
import {
  MOVE_SPEED,
  PLAYER_COLLISION_RADIUS,
  rockCeilingMaxY,
} from '../../player/PlayerController'
import { integrateVerticalMotion } from '../../player/verticalMotion'
import { type RawSampleParams, sampleHeightAt } from '../../terrain/chunkHeightmap'
import { applySlopeMovementConstraint, sampleSlope } from '../../terrain/slopeConstraint'
import { colliderActiveAtY, resolvePosition } from '../collision'
import { type LargeCaveSite, openingDirection } from '../largeCaves'
import { makeCaveId } from './caveIdentity'
import { buildCaveSdfColliders } from './caveSdfColliders'
import { buildCaveSdfRepresentation, type CaveSdfSpatialRepresentation } from './caveSdfField'
import {
  applyCaveGroundHysteresis,
  applyCaveInteriorHysteresis,
  buildCaveSdfColumnIndex,
  type CaveGroundHit,
  type CaveSdfColumnIndex,
  columnIntervalsAt,
  isCaveInteriorAt,
  occupancyContains,
  occupancyIntervalAt,
  queryColumnIndex,
} from './caveSdfQuery'
import { mouthAlong, mouthCarveDepth, mouthLateral } from './mouthCarve'
import { buildProductionCaveTopology } from './productionTopology'

const REPRO_SEED = 1136726869
const DT = 1 / 60
const LOOK_AT_OFFSET_FAR = 0.9
const LOOK_AT_OFFSET_NEAR = 1.6
const DEFAULT_PITCH = 0.35
const TERRAIN_STEPS = 20

const GROTA_CZARNEGO_KAMIENIA = {
  name: 'Grota Czarnego Kamienia',
  caveId: 'cave:0e3cce97',
  x: 135.84259216988767,
  z: -17.813611096688362,
}

const GROTA_MROCZNA = {
  name: 'Grota Mroczna',
  caveId: 'cave:7fd14c30',
  x: 316.00823859384826,
  z: 109.77792295821729,
}

function surfaceSampler(seed: number): (x: number, z: number) => number {
  const config = createBenchmarkWorldConfig({ seed, terrainResolution: 193, loadRadius: 4 })
  const t = config.terrain
  const params: RawSampleParams = {
    seed: config.seed,
    heightScale: t.heightScale,
    waterLevel: t.waterLevel,
    noiseScale: t.noiseScale,
    detailAmplitude: t.detailAmplitude,
    hillsScale: t.hillsScale,
    hillsAmplitude: t.hillsAmplitude,
    hillsFbm: t.hillsFbm,
    fbm: t.fbm,
    biome: t.biome,
    region: t.region,
  }
  return (x, z) => sampleHeightAt(x, z, params)
}

function siteFromEntrance(x: number, z: number, surfaceHeightAt: (x: number, z: number) => number): LargeCaveSite {
  return {
    x,
    z,
    yaw: measureSlope(x, z, 4, surfaceHeightAt).yaw,
    length: 12,
    variant: 0,
  }
}

type BuiltCave = {
  topology: CaveTopology
  sdf: CaveSdfSpatialRepresentation
  index: CaveSdfColumnIndex
  colliders: ReturnType<typeof buildCaveSdfColliders>
  surfaceHeightAt: (x: number, z: number) => number
}

function buildReproCave(x: number, z: number): BuiltCave {
  const surfaceHeightAt = surfaceSampler(REPRO_SEED)
  const site = siteFromEntrance(x, z, surfaceHeightAt)
  const topology = buildProductionCaveTopology({
    seed: REPRO_SEED,
    site,
    sampleHeight: surfaceHeightAt,
    sampleBaseHeight: surfaceHeightAt,
  })
  if (!topology) throw new Error(`production topology rejected site (${x}, ${z})`)
  const sdf = buildCaveSdfRepresentation(topology)
  const index = buildCaveSdfColumnIndex(sdf, topology, surfaceHeightAt)
  return {
    topology,
    sdf,
    index,
    colliders: buildCaveSdfColliders(index, surfaceHeightAt, sdf, topology.entrance),
    surfaceHeightAt,
  }
}

function carvedHeight(cave: BuiltCave, x: number, z: number): number {
  return cave.surfaceHeightAt(x, z) - mouthCarveDepth(x, z, cave.topology.entrance)
}

function lookAtOffset(distance: number): number {
  const zoomT = Math.min(1, Math.max(0, (distance - CAMERA_DISTANCE_MIN) / (CAMERA_DISTANCE_DEFAULT - CAMERA_DISTANCE_MIN)))
  return LOOK_AT_OFFSET_NEAR + (LOOK_AT_OFFSET_FAR - LOOK_AT_OFFSET_NEAR) * zoomT
}

type CameraMode = 'behind-toward-mouth' | 'default-yaw0' | 'behind-toward-chamber'

function cameraOffset(cave: BuiltCave, mode: CameraMode, pitch: number, distance: number): { x: number, y: number, z: number } {
  const out = openingDirection(cave.topology.entrance.yaw)
  const cosPitch = Math.cos(pitch)
  const sinPitch = Math.sin(pitch)
  if (mode === 'default-yaw0') {
    return {
      x: 0 * cosPitch * distance,
      y: sinPitch * distance,
      z: 1 * cosPitch * distance,
    }
  }
  // Camera behind the walker: offset along +openingDirection (mouth) or
  // −openingDirection (deeper interior).
  const along = mode === 'behind-toward-mouth' ? 1 : -1
  return {
    x: out.dx * along * cosPitch * distance,
    y: sinPitch * distance,
    z: out.dz * along * cosPitch * distance,
  }
}

type BoomClass = {
  originInCave: boolean
  originOpenSky: boolean
  marchKind: 'solid' | 'exit' | 'void' | 'no-occupancy'
  marchT: number | null
  firstMissStep: number | null
  firstMissY: number | null
  firstMissSurfaceY: number | null
  firstMissOcc: boolean
  resolvedOccupancy: boolean
  heightfieldClamped: boolean
}

function classifyBoom(
  cave: BuiltCave,
  originX: number,
  originY: number,
  originZ: number,
  camX: number,
  camY: number,
  camZ: number,
  result: { x: number, y: number, z: number, t: number },
): BoomClass {
  const occupancyAt = (x: number, y: number, z: number) => occupancyIntervalAt(cave.index, x, y, z)
  const originOcc = occupancyAt(originX, originY, originZ)
  const originInCave = originOcc !== null
  const dx = camX - originX
  const dy = camY - originY
  const dz = camZ - originZ
  if (!originInCave) {
    const yAlong = originY + dy * result.t
    return {
      originInCave: false,
      originOpenSky: false,
      marchKind: 'no-occupancy',
      marchT: null,
      firstMissStep: null,
      firstMissY: null,
      firstMissSurfaceY: null,
      firstMissOcc: false,
      resolvedOccupancy: occupancyAt(result.x, yAlong, result.z) !== null,
      heightfieldClamped: result.y >= cave.surfaceHeightAt(result.x, result.z) + CAMERA_GROUND_CLEARANCE - 0.02,
    }
  }
  const originOpenSky = Boolean(originOcc?.openSky)
  let previousT = 0
  let marchKind: BoomClass['marchKind'] = 'void'
  let marchT: number | null = null
  let firstMissStep: number | null = null
  let firstMissY: number | null = null
  let firstMissSurfaceY: number | null = null
  let firstMissOcc = true
  for (let i = 1; i <= TERRAIN_STEPS; i++) {
    const t = i / TERRAIN_STEPS
    const x = originX + dx * t
    const y = originY + dy * t
    const z = originZ + dz * t
    if (occupancyAt(x, y, z)) {
      previousT = t
      continue
    }
    if (firstMissStep === null) {
      firstMissStep = i
      firstMissY = y
      firstMissSurfaceY = cave.surfaceHeightAt(x, z)
      firstMissOcc = false
    }
    const groundY = cave.surfaceHeightAt(x, z)
    if (y >= groundY - 0.05) {
      marchKind = originOpenSky ? 'exit' : 'solid'
      marchT = previousT
      break
    }
    const prevX = originX + dx * previousT
    const prevY = originY + dy * previousT
    const prevZ = originZ + dz * previousT
    const prevOcc = occupancyAt(prevX, prevY, prevZ)
    const prevGround = cave.surfaceHeightAt(prevX, prevZ)
    if (originOpenSky && prevOcc?.openSky && prevOcc.ceilingY >= prevGround - 0.3) {
      marchKind = 'exit'
      marchT = previousT
    } else {
      marchKind = 'solid'
      marchT = previousT
    }
    break
  }
  const yAlong = originY + dy * result.t
  const resolvedOcc = occupancyAt(result.x, yAlong, result.z)
  const surfaceAtCam = cave.surfaceHeightAt(result.x, result.z)
  return {
    originInCave,
    originOpenSky,
    marchKind,
    marchT,
    firstMissStep,
    firstMissY,
    firstMissSurfaceY,
    firstMissOcc,
    resolvedOccupancy: resolvedOcc !== null,
    heightfieldClamped: resolvedOcc === null && result.y >= surfaceAtCam + CAMERA_GROUND_CLEARANCE - 0.02,
  }
}

type TickRow = {
  tick: number
  along: number
  lateral: number
  x: number
  yBefore: number
  z: number
  wishX: number
  wishZ: number
  slopeDeg: number
  surfaceY: number
  carvedY: number
  rawHit: CaveGroundHit | null
  hystereticHit: CaveGroundHit | null
  hysteresisRetained: boolean
  floorY: number | null
  ceilingY: number | null
  openSky: boolean
  groundSource: 'cave' | 'surface'
  adapterCeiling: number | null
  occupancyAtFeet: boolean
  occupancyAtLookAt: boolean
  queryInteriorRaw: boolean
  queryInterior: boolean
  vyBefore: number
  vyAfter: number
  groundedBefore: boolean
  groundedAfter: boolean
  yBeforeVertical: number
  yAfterVertical: number
  playerYJump: number
  colliderPush: number
  lookAtY: number
  desiredCamY: number
  camX: number
  camY: number
  camZ: number
  camT: number
  camSurfaceY: number
  camOccupancy: boolean
  camAlong: number
  boom: BoomClass
  sdfAtPlayer: number
  sdfAtLookAt: number
  sdfAtCam: number
}

type Divergence = {
  kind: string
  tick: number
  prev: TickRow
  row: TickRow
  next: TickRow | null
}

function simulateWalk(cave: BuiltCave, cameraMode: CameraMode): { ticks: TickRow[], divergences: Divergence[] } {
  const { entrance } = cave.topology
  const out = openingDirection(entrance.yaw)
  const inward = { x: -out.dx, z: -out.dz }
  const startAlong = 8
  const startX = entrance.x + out.dx * startAlong
  const startZ = entrance.z + out.dz * startAlong

  let x = startX
  let y = carvedHeight(cave, startX, startZ)
  let z = startZ
  let vy = 0
  let grounded = true
  let lastGroundHit: CaveGroundHit | null = null
  let lastInteriorRaw: boolean | null = null
  let interiorConfirmed = false

  const offset = cameraOffset(cave, cameraMode, DEFAULT_PITCH, CAMERA_DISTANCE_DEFAULT)
  const lookOff = lookAtOffset(CAMERA_DISTANCE_DEFAULT)
  const ticks: TickRow[] = []
  const maxTicks = 280

  for (let tick = 0; tick < maxTicks; tick++) {
    const along = mouthAlong(x, z, entrance)
    if (along < -14) break

    const yBefore = y
    const surfaceY = cave.surfaceHeightAt(x, z)
    const carvedY = carvedHeight(cave, x, z)
    const slope = sampleSlope(x, z, (sx, sz) => carvedHeight(cave, sx, sz))
    const wishFull = { x: inward.x * MOVE_SPEED * DT, z: inward.z * MOVE_SPEED * DT }
    const slopeWish = applySlopeMovementConstraint(wishFull.x, wishFull.z, x, z, (sx, sz) => carvedHeight(cave, sx, sz))
    const candidateX = x + slopeWish.x
    const candidateZ = z + slopeWish.z
    const active = cave.colliders.filter((c) => colliderActiveAtY(c, y))
    const resolved = resolvePosition(candidateX, candidateZ, PLAYER_COLLISION_RADIUS, active)
    const colliderPush = Math.hypot(resolved.x - candidateX, resolved.z - candidateZ)
    x = resolved.x
    z = resolved.z

    const rawHit = queryColumnIndex(cave.index, x, y, z)
    const hyst = applyCaveGroundHysteresis(rawHit, y, surfaceY, lastGroundHit)
    const hysteresisRetained = rawHit === null && hyst.hit !== null
    lastGroundHit = hyst.remember
    const adapterCeiling = hyst.hit ? (hyst.hit.openSky ? null : hyst.hit.ceilingY) : null
    const groundSource: 'cave' | 'surface' = hyst.hit ? 'cave' : 'surface'
    const floorY = hyst.hit ? hyst.hit.floorY : carvedY
    const ceilingY = hyst.hit ? hyst.hit.ceilingY : null
    const yBeforeVertical = y
    const vyBefore = vy
    const groundedBefore = grounded
    const next = integrateVerticalMotion({
      y,
      verticalVelocity: vy,
      grounded,
      groundY: floorY,
      dt: DT,
      jumpRequested: false,
      maxY: rockCeilingMaxY(adapterCeiling, floorY),
    })
    y = next.y
    vy = next.verticalVelocity
    grounded = next.grounded

    const lookAtY = y + lookOff
    const occupancyAtFeet = occupancyContains(cave.index, x, y, z)
    const occupancyAtLookAt = occupancyContains(cave.index, x, lookAtY, z)
    const queryInteriorRaw = isCaveInteriorAt(cave.index, entrance, x, y, z)
    const interior = applyCaveInteriorHysteresis(queryInteriorRaw, lastInteriorRaw, interiorConfirmed)
    lastInteriorRaw = interior.rememberRaw
    interiorConfirmed = interior.interior

    const desiredX = x + offset.x
    const desiredY = lookAtY + offset.y
    const desiredZ = z + offset.z
    const boom = resolveCameraBoom({
      originX: x,
      originY: lookAtY,
      originZ: z,
      camX: desiredX,
      camY: desiredY,
      camZ: desiredZ,
      sampleHeight: (sx, sz) => carvedHeight(cave, sx, sz),
      colliders: cave.colliders.filter((c) => colliderActiveAtY(c, y)),
      occupancyAt: (ox, oy, oz) => occupancyIntervalAt(cave.index, ox, oy, oz),
    })
    const classified = classifyBoom(cave, x, lookAtY, z, desiredX, desiredY, desiredZ, boom)
    const camSurfaceY = cave.surfaceHeightAt(boom.x, boom.z)

    ticks.push({
      tick,
      along,
      lateral: mouthLateral(x, z, entrance),
      x,
      yBefore,
      z,
      wishX: slopeWish.x,
      wishZ: slopeWish.z,
      slopeDeg: (slope.angleRad * 180) / Math.PI,
      surfaceY,
      carvedY,
      rawHit,
      hystereticHit: hyst.hit,
      hysteresisRetained,
      floorY: hyst.hit ? hyst.hit.floorY : null,
      ceilingY,
      openSky: Boolean(hyst.hit?.openSky),
      groundSource,
      adapterCeiling,
      occupancyAtFeet,
      occupancyAtLookAt,
      queryInteriorRaw,
      queryInterior: interiorConfirmed,
      vyBefore,
      vyAfter: vy,
      groundedBefore,
      groundedAfter: grounded,
      yBeforeVertical,
      yAfterVertical: y,
      playerYJump: y - yBefore,
      colliderPush,
      lookAtY,
      desiredCamY: desiredY,
      camX: boom.x,
      camY: boom.y,
      camZ: boom.z,
      camT: boom.t,
      camSurfaceY,
      camOccupancy: occupancyContains(cave.index, boom.x, boom.y, boom.z),
      camAlong: mouthAlong(boom.x, boom.z, entrance),
      boom: classified,
      sdfAtPlayer: cave.sdf.sample(x, y + 1, z),
      sdfAtLookAt: cave.sdf.sample(x, lookAtY, z),
      sdfAtCam: cave.sdf.sample(boom.x, boom.y, boom.z),
    })
  }

  const divergences: Divergence[] = []
  const buried = (row: TickRow) => row.surfaceY - row.yAfterVertical > 1.2
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1]!
    const row = ticks[i]!
    const kinds: string[] = []
    if (row.playerYJump > 0.5 && row.yAfterVertical > prev.yAfterVertical + 0.5) {
      kinds.push('playerY-upward-jump')
    }
    if (prev.groundSource === 'cave' && row.groundSource === 'surface' && buried(prev)) {
      kinds.push('ground-cave-to-surface')
    }
    if (prev.occupancyAtFeet && !row.occupancyAtFeet && buried(row)) {
      kinds.push('occupancy-lost-underground')
    }
    if (prev.queryInterior && !row.queryInterior && buried(row)) {
      kinds.push('interior-lost-underground')
    }
    const interiorPlayer = row.queryInterior && row.along < 0
    const camOnSurface = row.camY >= row.camSurfaceY - 0.15
    const prevCamUnderground = prev.camY < prev.camSurfaceY - 0.5
    if (interiorPlayer && prevCamUnderground && camOnSurface && row.camY - prev.camY > 0.8) {
      kinds.push('cameraY-jump-to-surface')
    }
    if (interiorPlayer && row.boom.heightfieldClamped && !prev.boom.heightfieldClamped) {
      kinds.push('camera-heightfield-clamp')
    }
    if (interiorPlayer && prev.occupancyAtLookAt && !row.occupancyAtLookAt) {
      kinds.push('lookat-occupancy-lost')
    }
    if (interiorPlayer && row.boom.originInCave && !row.camOccupancy && row.camY >= row.camSurfaceY - 0.15) {
      kinds.push('camera-final-occupancy-null-surface-y')
    }
    if (interiorPlayer && prev.boom.originInCave && !row.boom.originInCave) {
      kinds.push('camera-origin-left-occupancy')
    }
    if (interiorPlayer && prev.boom.marchKind !== 'exit' && row.boom.marchKind === 'exit') {
      kinds.push('interior-origin-classified-as-mouth-exit')
    }
    if (
      interiorPlayer
      && prev.camY < prev.camSurfaceY - 0.3
      && camOnSurface
    ) {
      kinds.push('interior-camera-on-surface')
    }
    for (const kind of kinds) {
      divergences.push({
        kind,
        tick: row.tick,
        prev,
        row,
        next: ticks[i + 1] ?? null,
      })
    }
  }
  return { ticks, divergences }
}

function nearestAlong(ticks: TickRow[], target: number): TickRow {
  return ticks.reduce((best, t) => (Math.abs(t.along - target) < Math.abs(best.along - target) ? t : best), ticks[0]!)
}

function verticalSkyClearance(
  cave: BuiltCave,
  x: number,
  y: number,
  z: number,
): { hitsRock: boolean, surfaceY: number, firstSolidY: number | null } {
  const surfaceY = cave.surfaceHeightAt(x, z)
  let firstSolidY: number | null = null
  for (let sampleY = y; sampleY <= surfaceY + 0.05; sampleY += 0.1) {
    if (cave.sdf.sample(x, sampleY, z) >= 0) {
      firstSolidY = sampleY
      break
    }
  }
  return { hitsRock: firstSolidY !== null && firstSolidY < surfaceY - 0.05, surfaceY, firstSolidY }
}

describe('B3 descending movement trace: seed 1136726869', () => {
  let czarny: BuiltCave
  let mroczna: BuiltCave

  beforeAll(() => {
    czarny = buildReproCave(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z)
    mroczna = buildReproCave(GROTA_MROCZNA.x, GROTA_MROCZNA.z)
  })

  it('confirms Czarny Kamień identity, entrance and topology against current production', () => {
    const site = siteFromEntrance(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z, czarny.surfaceHeightAt)
    expect(makeCaveId(REPRO_SEED, site)).toBe(GROTA_CZARNEGO_KAMIENIA.caveId)
    expect(czarny.topology.caveId).toBe(GROTA_CZARNEGO_KAMIENIA.caveId)
    const { entrance } = czarny.topology
    expect(entrance.x).toBeCloseTo(GROTA_CZARNEGO_KAMIENIA.x, 6)
    expect(entrance.z).toBeCloseTo(GROTA_CZARNEGO_KAMIENIA.z, 6)
    expect(openingDirection(entrance.yaw).dx).toBeCloseTo(1, 5)
    const ids = czarny.topology.nodes.map((n) => n.id)
    expect(ids).toEqual(['entrance', 'transition', 'passage', 'widening-bend', 'chamber'])
    const transition = czarny.topology.nodes.find((n) => n.id === 'transition')!
    expect(mouthAlong(transition.position.x, transition.position.z, entrance)).toBeCloseTo(-3.75, 1)
  })

  it('player world Y / queryGround / occupancy / interior stay cave-owned through the descent', () => {
    const { ticks } = simulateWalk(czarny, 'behind-toward-mouth')
    const interior = ticks.filter((t) => t.along <= 0 && t.along >= -12)
    expect(interior.length).toBeGreaterThan(40)
    expect(Math.max(...ticks.map((t) => t.playerYJump))).toBeLessThan(0.5)
    expect(interior.every((t) => t.groundSource === 'cave')).toBe(true)
    expect(interior.every((t) => t.occupancyAtFeet)).toBe(true)
    expect(interior.filter((t) => t.along < -0.5).every((t) => t.queryInterior)).toBe(true)
    expect(interior.filter((t) => t.along < -0.5).every((t) => !t.openSky)).toBe(true)
  })

  it('behind-mouth boom shortens in the descending interior instead of jumping toward the hillside', () => {
    const { ticks } = simulateWalk(czarny, 'behind-toward-mouth')
    const at35 = nearestAlong(ticks, -3.5)
    const at4 = nearestAlong(ticks, -4.0)
    const at5 = nearestAlong(ticks, -5.0)
    for (const row of [at35, at4, at5]) {
      expect(row.queryInterior).toBe(true)
      expect(row.groundSource).toBe('cave')
      expect(row.occupancyAtFeet).toBe(true)
      expect(row.camY).toBeLessThan(row.camSurfaceY - 1.5)
      expect(row.boom.heightfieldClamped).toBe(false)
      expect(row.camOccupancy).toBe(true)
    }
    expect(at4.playerYJump).toBeLessThan(0.5)
    expect(at4.camY - at35.camY).toBeLessThan(0.8)
    expect(at4.camAlong).toBeLessThan(-1.2)
    expect(at4.along - at4.camAlong).toBeLessThan(3.5)
    expect(at5.camAlong).toBeLessThan(-1.2)
  })

  it('interior occupancy-null after a solid march does not clamp camera Y to the hillside', () => {
    const { ticks, divergences } = simulateWalk(czarny, 'default-yaw0')
    const clamp = divergences.find((d) => d.kind === 'camera-heightfield-clamp')
    expect(clamp).toBeUndefined()
    const around108 = nearestAlong(ticks, -10.8)
    expect(around108.queryInterior).toBe(true)
    expect(around108.groundSource).toBe('cave')
    expect(around108.camY).toBeLessThan(around108.camSurfaceY - 1.5)
    expect(around108.camY).not.toBeCloseTo(around108.camSurfaceY + CAMERA_GROUND_CLEARANCE, 1)
    expect(around108.boom.heightfieldClamped).toBe(false)
    expect(around108.camOccupancy).toBe(true)
    const interior = ticks.filter((t) => t.queryInterior && t.along < -0.5)
    expect(interior.every((t) => !t.boom.heightfieldClamped)).toBe(true)
    expect(interior.every((t) => t.camY < t.camSurfaceY - 0.5)).toBe(true)
    expect(interior.every((t) => t.camOccupancy)).toBe(true)
  })

  it('query contracts at representative stations', () => {
    const { entrance } = czarny.topology
    const out = openingDirection(entrance.yaw)
    const stations = [
      { name: 'outside', along: 8, expectGround: 'surface', expectOcc: false, expectInterior: false },
      { name: 'mouth', along: 2.2, expectGround: 'cave', expectOcc: true, expectInterior: false },
      { name: 'shallow interior', along: -1, expectGround: 'cave', expectOcc: true, expectInterior: true },
      { name: 'descending', along: -5, expectGround: 'cave', expectOcc: true, expectInterior: true },
      { name: 'deep interior', along: -12, expectGround: 'cave', expectOcc: true, expectInterior: true },
    ] as const
    for (const station of stations) {
      const x = entrance.x + out.dx * station.along
      const z = entrance.z + out.dz * station.along
      const intervals = columnIntervalsAt(czarny.index, x, z)
      const y = station.name === 'outside'
        ? czarny.surfaceHeightAt(x, z)
        : (intervals[0]?.floorY ?? entrance.y) + 1.1
      const hit = queryColumnIndex(czarny.index, x, y, z)
      const occ = occupancyContains(czarny.index, x, y, z)
      const interior = isCaveInteriorAt(czarny.index, entrance, x, y, z)
      if (station.expectGround === 'surface') expect(hit).toBeNull()
      else expect(hit).not.toBeNull()
      expect(occ).toBe(station.expectOcc)
      expect(interior).toBe(station.expectInterior)
      if (station.name === 'mouth') expect(hit!.openSky).toBe(true)
      if (station.name === 'descending' || station.name === 'deep interior') expect(hit!.openSky).toBeFalsy()
    }
  })

  it('presentation leftover: doorway sky gap is out of scope; descent camera stays in occupancy', () => {
    const { ticks } = simulateWalk(czarny, 'behind-toward-mouth')
    const descent = nearestAlong(ticks, -4)
    expect(descent.camAlong).toBeLessThan(-1.2)
    expect(descent.camOccupancy).toBe(true)
    expect(descent.camY).toBeLessThan(descent.camSurfaceY - 1.5)
    const playerSky = verticalSkyClearance(czarny, descent.x, descent.yAfterVertical + 1.1, descent.z)
    expect(playerSky.hitsRock).toBe(true)
  })

  it('Grota Mroczna: same player contracts; behind-mouth boom stays cave-owned into the descent', () => {
    const site = siteFromEntrance(GROTA_MROCZNA.x, GROTA_MROCZNA.z, mroczna.surfaceHeightAt)
    expect(makeCaveId(REPRO_SEED, site)).toBe(GROTA_MROCZNA.caveId)
    const { ticks } = simulateWalk(mroczna, 'behind-toward-mouth')
    const interior = ticks.filter((t) => t.along < -0.5 && t.along >= -6)
    expect(interior.length).toBeGreaterThan(10)
    expect(interior.every((t) => t.groundSource === 'cave')).toBe(true)
    expect(interior.every((t) => t.occupancyAtFeet)).toBe(true)
    expect(interior.every((t) => t.queryInterior)).toBe(true)
    expect(Math.max(...ticks.map((t) => t.playerYJump))).toBeLessThan(0.5)
    const descent = nearestAlong(ticks, -5)
    expect(descent.camY).toBeLessThan(descent.camSurfaceY)
  })
})
