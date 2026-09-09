/** B3 collision + camera regression — production SDF occupancy vs Grota
 *  Czarnego Kamienia (seed `1136726869`, `cave:0e3cce97`). Pure/analytic:
 *  `sampleHeightAt` + production topology, no `ChunkManager`, no browser.
 *
 *  See `docs/plans/implementation-notes/world-terrain-008-underground-caves-v2-b3-recon.md`.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import type { CaveTopology } from './caveTopology'
import { createBenchmarkWorldConfig } from '../../config/worldConfig'
import { measureSlope } from '../../fauna/createFauna'
import {
  CAMERA_GROUND_CLEARANCE,
  CAMERA_OCCLUDER_MIN_RADIUS,
  resolveCameraBoom,
} from '../../player/cameraBoom'
import { PLAYER_COLLISION_RADIUS } from '../../player/PlayerController'
import { type RawSampleParams, sampleHeightAt } from '../../terrain/chunkHeightmap'
import { colliderActiveAtY, colliderContainsPoint, resolvePosition } from '../collision'
import { type LargeCaveSite, openingDirection } from '../largeCaves'
import { makeCaveId } from './caveIdentity'
import { buildCaveSdfColliders, CAVE_SDF_BEAD_RADIUS } from './caveSdfColliders'
import { buildCaveSdfRepresentation, type CaveSdfSpatialRepresentation } from './caveSdfField'
import {
  applyCaveGroundHysteresis,
  buildCaveSdfColumnIndex,
  type CaveSdfColumnIndex,
  occupancyContains,
  occupancyIntervalAt,
  queryColumnIndex,
} from './caveSdfQuery'
import { buildProductionCaveTopology } from './productionTopology'

const REPRO_SEED = 1136726869

const GROTA_CZARNEGO_KAMIENIA = {
  caveId: 'cave:0e3cce97',
  x: 135.84259216988767,
  z: -17.813611096688362,
}

const QUERY_ABOVE_FLOOR = 1
const RAY_STEP = 0.1

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

function chamberSideHeading(topology: CaveTopology): { dx: number, dz: number, origin: { x: number, y: number, z: number } } {
  const chamber = topology.nodes.find((n) => n.id === 'chamber')!
  const into = openingDirection(topology.entrance.yaw)
  return {
    origin: chamber.position,
    dx: -into.dz,
    dz: into.dx,
  }
}

function walkBowlTowardWall(
  cave: BuiltCave,
  origin: { x: number, z: number },
  dx: number,
  dz: number,
  startY: number,
): { sdfWall: number | null, pushAt: number | null, yAtWall: number } {
  const len = Math.hypot(dx, dz)
  const ux = dx / len
  const uz = dz / len
  let y = startY
  let sdfWall: number | null = null
  let pushAt: number | null = null
  for (let d = 0; d <= 12; d += RAY_STEP) {
    const x = origin.x + ux * d
    const z = origin.z + uz * d
    const occ = occupancyIntervalAt(cave.index, x, y, z)
    if (occ) y = occ.floorY + QUERY_ABOVE_FLOOR
    if (sdfWall === null && cave.sdf.sample(x, y, z) >= 0) sdfWall = d
    if (pushAt === null) {
      const active = cave.colliders.filter((c) => colliderActiveAtY(c, y))
      const resolved = resolvePosition(x, z, PLAYER_COLLISION_RADIUS, active)
      if (Math.hypot(resolved.x - x, resolved.z - z) > 0.02) pushAt = d
    }
    if (sdfWall !== null && pushAt !== null) break
  }
  return { sdfWall, pushAt, yAtWall: y }
}

describe('B3 collision: seed 1136726869 Grota Czarnego Kamienia', () => {
  let cave: BuiltCave

  beforeAll(() => {
    cave = buildReproCave(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z)
  })

  it('reconstructs cave:0e3cce97', () => {
    const surfaceHeightAt = surfaceSampler(REPRO_SEED)
    const site = siteFromEntrance(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z, surfaceHeightAt)
    expect(makeCaveId(REPRO_SEED, site)).toBe(GROTA_CZARNEGO_KAMIENIA.caveId)
    expect(cave.topology.caveId).toBe(GROTA_CZARNEGO_KAMIENIA.caveId)
  })

  it('derived collision boundary matches strict SDF occupancy on the bowl heading', () => {
    const { origin, dx, dz } = chamberSideHeading(cave.topology)
    const hit = queryColumnIndex(cave.index, origin.x, origin.y + QUERY_ABOVE_FLOOR, origin.z)
    expect(hit).not.toBeNull()
    const y = hit!.floorY + QUERY_ABOVE_FLOOR
    const walked = walkBowlTowardWall(cave, origin, dx, dz, y)
    expect(walked.sdfWall).not.toBeNull()
    expect(walked.pushAt).not.toBeNull()
    expect(Math.abs(walked.pushAt! - walked.sdfWall!)).toBeLessThan(0.4)
    expect(walked.pushAt!).toBeLessThan(5.2)
  })

  it('player cannot cross the cave wall: 0.5 m past the iso is pushed back into void', () => {
    const { origin, dx, dz } = chamberSideHeading(cave.topology)
    const hit = queryColumnIndex(cave.index, origin.x, origin.y + QUERY_ABOVE_FLOOR, origin.z)
    const y = hit!.floorY + QUERY_ABOVE_FLOOR
    const walked = walkBowlTowardWall(cave, origin, dx, dz, y)
    const sdfWall = walked.sdfWall!
    const len = Math.hypot(dx, dz)
    const ux = dx / len
    const uz = dz / len
    const x = origin.x + ux * (sdfWall + 0.5)
    const z = origin.z + uz * (sdfWall + 0.5)
    const yAt = walked.yAtWall
    const active = cave.colliders.filter((c) => colliderActiveAtY(c, yAt))
    const resolved = resolvePosition(x, z, PLAYER_COLLISION_RADIUS, active)
    expect(Math.hypot(resolved.x - x, resolved.z - z)).toBeGreaterThan(0.1)
    const distPast = Math.hypot(x - origin.x, z - origin.z)
    const distResolved = Math.hypot(resolved.x - origin.x, resolved.z - origin.z)
    expect(distResolved).toBeLessThan(distPast)
    expect(cave.sdf.sample(resolved.x, yAt, resolved.z)).toBeLessThan(cave.sdf.sample(x, yAt, z))
  })

  it('cave colliders are Y-aware: hillside above the chamber is not blocked', () => {
    const chamber = cave.topology.nodes.find((n) => n.id === 'chamber')!
    const surfaceY = cave.surfaceHeightAt(chamber.position.x, chamber.position.z)
    const blockingHillside = cave.colliders.filter(
      (c) => colliderActiveAtY(c, surfaceY) && colliderContainsPoint(c, chamber.position.x, chamber.position.z),
    )
    expect(blockingHillside.length).toBe(0)
    const hit = queryColumnIndex(cave.index, chamber.position.x, chamber.position.y + QUERY_ABOVE_FLOOR, chamber.position.z)
    expect(hit).not.toBeNull()
    const y = hit!.floorY + QUERY_ABOVE_FLOOR
    expect(cave.colliders.some((c) => colliderActiveAtY(c, y))).toBe(true)
  })

  it('surface entity above the cave does not collide; NPC/fauna Y-filter matches', () => {
    const chamber = cave.topology.nodes.find((n) => n.id === 'chamber')!
    const x = chamber.position.x
    const z = chamber.position.z
    const surfaceY = cave.surfaceHeightAt(x, z)
    const surfaceWalkable = !cave.colliders.some(
      (c) => colliderActiveAtY(c, surfaceY) && Math.hypot(
        resolvePosition(x, z, PLAYER_COLLISION_RADIUS, [c]).x - x,
        resolvePosition(x, z, PLAYER_COLLISION_RADIUS, [c]).z - z,
      ) > 0.01,
    )
    expect(surfaceWalkable).toBe(true)
    expect(queryColumnIndex(cave.index, x, surfaceY, z)).toBeNull()
    expect(occupancyContains(cave.index, x, surfaceY, z)).toBe(false)
  })

  it('derived colliders are deterministic', () => {
    const again = buildCaveSdfColliders(cave.index, cave.surfaceHeightAt, cave.sdf, cave.topology.entrance)
    expect(again).toEqual(cave.colliders)
  })

  it('strict occupancy hugs the SDF wall closer than FLOOR_GRACE queryGround', () => {
    const { origin, dx, dz } = chamberSideHeading(cave.topology)
    const proxyFloorY = origin.y + QUERY_ABOVE_FLOOR
    const len = Math.hypot(dx, dz)
    const ux = dx / len
    const uz = dz / len
    let occupancyMiss: number | null = null
    let groundMiss: number | null = null
    let sdfWall: number | null = null
    for (let d = 0; d <= 8; d += RAY_STEP) {
      const x = origin.x + ux * d
      const z = origin.z + uz * d
      if (sdfWall === null && cave.sdf.sample(x, proxyFloorY, z) >= 0) sdfWall = d
      if (occupancyMiss === null && !occupancyContains(cave.index, x, proxyFloorY, z)) occupancyMiss = d
      if (groundMiss === null && !queryColumnIndex(cave.index, x, proxyFloorY, z)) groundMiss = d
    }
    expect(sdfWall).not.toBeNull()
    expect(occupancyMiss).not.toBeNull()
    expect(Math.abs(occupancyMiss! - sdfWall!)).toBeLessThan(0.55)
    if (groundMiss !== null) {
      expect(occupancyMiss!).toBeLessThanOrEqual(groundMiss + 1e-6)
    }
  })
})

describe('B3 camera: Grota Czarnego Kamienia occupancy', () => {
  let cave: BuiltCave

  beforeAll(() => {
    cave = buildReproCave(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z)
  })

  function occupancyAt(x: number, y: number, z: number) {
    return occupancyIntervalAt(cave.index, x, y, z)
  }

  it('boom stops at the cave wall and stays in occupancy', () => {
    const { origin, dx, dz } = chamberSideHeading(cave.topology)
    const hit = queryColumnIndex(cave.index, origin.x, origin.y + QUERY_ABOVE_FLOOR, origin.z)
    const y = hit!.floorY + 1.4
    const len = Math.hypot(dx, dz)
    const result = resolveCameraBoom({
      originX: origin.x,
      originY: y,
      originZ: origin.z,
      camX: origin.x + (dx / len) * 12,
      camY: y,
      camZ: origin.z + (dz / len) * 12,
      sampleHeight: cave.surfaceHeightAt,
      colliders: cave.colliders,
      occupancyAt,
    })
    expect(result.t).toBeLessThan(1)
    expect(occupancyAt(result.x, result.y, result.z)).not.toBeNull()
    expect(CAVE_SDF_BEAD_RADIUS).toBeLessThan(CAMERA_OCCLUDER_MIN_RADIUS)
  })

  it('boom respects the ceiling and does not reach the surface', () => {
    const chamber = cave.topology.nodes.find((n) => n.id === 'chamber')!
    const hit = queryColumnIndex(cave.index, chamber.position.x, chamber.position.y + 1, chamber.position.z)
    expect(hit).not.toBeNull()
    const originY = hit!.floorY + 1.5
    const surfaceY = cave.surfaceHeightAt(chamber.position.x, chamber.position.z)
    const result = resolveCameraBoom({
      originX: chamber.position.x,
      originY,
      originZ: chamber.position.z,
      camX: chamber.position.x,
      camY: surfaceY + 8,
      camZ: chamber.position.z + 1,
      sampleHeight: cave.surfaceHeightAt,
      colliders: [],
      occupancyAt,
    })
    expect(result.t).toBeLessThan(1)
    expect(result.y).toBeLessThan(surfaceY)
    expect(result.y).toBeLessThan(hit!.ceilingY + CAMERA_GROUND_CLEARANCE + 0.4)
  })

  it('interior boom does not escape to surface + clearance through overburden', () => {
    const chamber = cave.topology.nodes.find((n) => n.id === 'chamber')!
    const hit = queryColumnIndex(cave.index, chamber.position.x, chamber.position.y + 1, chamber.position.z)
    const originY = hit!.floorY + 1.4
    const surfaceY = cave.surfaceHeightAt(chamber.position.x, chamber.position.z)
    const result = resolveCameraBoom({
      originX: chamber.position.x,
      originY,
      originZ: chamber.position.z,
      camX: chamber.position.x + 10,
      camY: originY + 2,
      camZ: chamber.position.z + 10,
      sampleHeight: cave.surfaceHeightAt,
      colliders: [],
      occupancyAt,
    })
    expect(result.y).toBeLessThan(surfaceY)
    expect(result.y).not.toBeCloseTo(surfaceY + CAMERA_GROUND_CLEARANCE, 0)
  })

  it('mouth look-out is allowed without collapsing onto minT', () => {
    const { entrance } = cave.topology
    const out = openingDirection(entrance.yaw)
    const originY = entrance.y + 1.1
    expect(occupancyAt(entrance.x, originY, entrance.z)).not.toBeNull()
    const result = resolveCameraBoom({
      originX: entrance.x,
      originY,
      originZ: entrance.z,
      camX: entrance.x + out.dx * 12,
      camY: originY + 1,
      camZ: entrance.z + out.dz * 12,
      sampleHeight: cave.surfaceHeightAt,
      colliders: [],
      occupancyAt,
    })
    expect(result.t).toBeGreaterThan(0.2)
    const along = Math.hypot(result.x - entrance.x, result.z - entrance.z)
    expect(along).toBeGreaterThan(1)
  })

  it('B2 underground-miss hysteresis still holds past the visual wall', () => {
    const { origin, dx, dz } = chamberSideHeading(cave.topology)
    const hit = queryColumnIndex(cave.index, origin.x, origin.y + QUERY_ABOVE_FLOOR, origin.z)
    const y = hit!.floorY + QUERY_ABOVE_FLOOR
    const walked = walkBowlTowardWall(cave, origin, dx, dz, y)
    const sdfWall = walked.sdfWall!
    const len = Math.hypot(dx, dz)
    const x = origin.x + (dx / len) * (sdfWall + 0.6)
    const z = origin.z + (dz / len) * (sdfWall + 0.6)
    const missed = queryColumnIndex(cave.index, x, walked.yAtWall, z)
    const surfaceY = cave.surfaceHeightAt(x, z)
    const held = applyCaveGroundHysteresis(missed, walked.yAtWall, surfaceY, hit)
    expect(held.hit).not.toBeNull()
    expect(held.hit!.floorY).toBeLessThan(surfaceY - 1)
  })
})
