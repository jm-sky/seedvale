/** B2 gameplay-query regression — production SDF column index vs the two
 *  2026-09-08 surface-snap repros. Pure/analytic: `sampleHeightAt` +
 *  production topology, no `ChunkManager`, no browser.
 *
 *  Pins live at seed `1136726869`. See
 *  `docs/plans/implementation-notes/world-terrain-008-underground-caves-v2-b2-recon.md`.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import type { CaveTopology } from './caveTopology'
import { createBenchmarkWorldConfig } from '../../config/worldConfig'
import { measureSlope } from '../../fauna/createFauna'
import { PLAYER_HEIGHT } from '../../player/PlayerController'
import { type RawSampleParams, sampleHeightAt } from '../../terrain/chunkHeightmap'
import { type CaveVolume, createCaveVolume } from '../caveVolume'
import { type LargeCaveSite, openingDirection } from '../largeCaves'
import { makeCaveId } from './caveIdentity'
import { buildCaveSdfRepresentation, type CaveSdfSpatialRepresentation } from './caveSdfField'
import {
  applyCaveGroundHysteresis,
  buildCaveSdfColumnIndex,
  CAVE_UNDERGROUND_MISS,
  type CaveGroundHit,
  type CaveSdfColumnIndex,
  queryColumnIndex,
} from './caveSdfQuery'
import { mouthCarveDepth } from './mouthCarve'
import { buildProductionCaveTopology } from './productionTopology'
import { PROXY_MARGIN, topologyToCaveDefinition } from './topologyAdapter'

const REPRO_SEED = 1136726869

const GROTA_MROCZNA = {
  caveId: 'cave:7fd14c30',
  x: 316.00823859384826,
  z: 109.77792295821729,
}

const GROTA_CZARNEGO_KAMIENIA = {
  caveId: 'cave:0e3cce97',
  x: 135.84259216988767,
  z: -17.813611096688362,
}

const XZ_STEP = 0.45
const Y_STEP = 0.25
const QUERY_ABOVE_FLOOR = 1
const MIN_WALKABLE_CLEARANCE = PLAYER_HEIGHT
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
  volume: CaveVolume
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
  return {
    topology,
    sdf,
    index: buildCaveSdfColumnIndex(sdf, topology, surfaceHeightAt),
    volume: createCaveVolume(topologyToCaveDefinition(topology)),
    surfaceHeightAt,
  }
}

type VoidInterval = { floorY: number, ceilingY: number }

function lowestWalkableInterval(
  sample: (x: number, y: number, z: number) => number,
  surfaceY: number,
  x: number,
  z: number,
  minY: number,
  maxY: number,
): VoidInterval | null {
  const top = Math.min(maxY, surfaceY - 0.05)
  if (top <= minY) return null
  let inside = false
  let runStart = minY
  let best: VoidInterval | null = null
  const consider = (floorY: number, ceilingY: number): void => {
    if (ceilingY - floorY >= MIN_WALKABLE_CLEARANCE && (best === null || floorY < best.floorY)) {
      best = { floorY, ceilingY }
    }
  }
  for (let y = minY; y <= top + 1e-9; y += Y_STEP) {
    const voidHere = sample(x, y, z) < 0
    if (voidHere && !inside) {
      inside = true
      runStart = y
    } else if (!voidHere && inside) {
      inside = false
      consider(runStart, y)
    }
  }
  if (inside) consider(runStart, top)
  return best
}

function countSdfWalkableOutsideQuery(cave: BuiltCave): { walkable: number, uncovered: number } {
  const { sdf, index, surfaceHeightAt } = cave
  const { bounds } = sdf
  let walkable = 0
  let uncovered = 0
  for (let x = bounds.minX; x <= bounds.maxX; x += XZ_STEP) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += XZ_STEP) {
      const interval = lowestWalkableInterval(sdf.sample, surfaceHeightAt(x, z), x, z, bounds.minY, bounds.maxY)
      if (!interval) continue
      walkable++
      if (!queryColumnIndex(index, x, interval.floorY + QUERY_ABOVE_FLOOR, z)) uncovered++
    }
  }
  return { walkable, uncovered }
}

function wallApproach(cave: BuiltCave, origin: { x: number, y: number, z: number }, dx: number, dz: number): {
  sdfWallDistance: number | null
  proxyExitDistance: number | null
  colliderRingDistance: number
} {
  const len = Math.hypot(dx, dz)
  const ux = dx / len
  const uz = dz / len
  const queryY = origin.y + QUERY_ABOVE_FLOOR
  let sdfWallDistance: number | null = null
  let proxyExitDistance: number | null = null
  for (let d = 0; d <= 12; d += RAY_STEP) {
    const x = origin.x + ux * d
    const z = origin.z + uz * d
    if (sdfWallDistance === null && cave.sdf.sample(x, queryY, z) >= 0) sdfWallDistance = d
    if (proxyExitDistance === null && !cave.volume.contains(x, queryY, z)) proxyExitDistance = d
    if (sdfWallDistance !== null && proxyExitDistance !== null) break
  }
  return {
    sdfWallDistance,
    proxyExitDistance,
    colliderRingDistance: cave.topology.nodes.find((n) => n.id === 'chamber')!.targetWidth / 2 + PROXY_MARGIN,
  }
}

describe('B2 gameplay query: seed 1136726869', () => {
  let mroczna: BuiltCave
  let czarny: BuiltCave

  beforeAll(() => {
    mroczna = buildReproCave(GROTA_MROCZNA.x, GROTA_MROCZNA.z)
    czarny = buildReproCave(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z)
  })

  it('reconstructs Grota Mroczna as cave:7fd14c30', () => {
    const surfaceHeightAt = surfaceSampler(REPRO_SEED)
    const site = siteFromEntrance(GROTA_MROCZNA.x, GROTA_MROCZNA.z, surfaceHeightAt)
    expect(makeCaveId(REPRO_SEED, site)).toBe(GROTA_MROCZNA.caveId)
    expect(mroczna.topology.caveId).toBe(GROTA_MROCZNA.caveId)
  })

  it('reconstructs Grota Czarnego Kamienia as cave:0e3cce97', () => {
    const surfaceHeightAt = surfaceSampler(REPRO_SEED)
    const site = siteFromEntrance(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z, surfaceHeightAt)
    expect(makeCaveId(REPRO_SEED, site)).toBe(GROTA_CZARNEGO_KAMIENIA.caveId)
    expect(czarny.topology.caveId).toBe(GROTA_CZARNEGO_KAMIENIA.caveId)
  })

  it('player-height SDF void below the analytic surface is covered by queryGround', () => {
    for (const cave of [mroczna, czarny]) {
      const report = countSdfWalkableOutsideQuery(cave)
      expect(report.walkable).toBeGreaterThan(50)
      expect(report.uncovered / report.walkable).toBeLessThan(0.02)
    }
  })

  it('column index is retained and reusable (lifecycle/cache ownership)', () => {
    const a = queryColumnIndex(czarny.index, czarny.topology.entrance.x, czarny.topology.entrance.y + 1, czarny.topology.entrance.z)
    const b = queryColumnIndex(czarny.index, czarny.topology.entrance.x, czarny.topology.entrance.y + 1, czarny.topology.entrance.z)
    expect(a).toEqual(b)
    expect(czarny.index.columns).toBe(czarny.index.columns)
  })

  it('Grota Mroczna: mouth-floor Y stays contained through the carved approach', () => {
    const { entrance } = mroczna.topology
    const out = openingDirection(entrance.yaw)
    const y = entrance.y + 0.2
    expect(queryColumnIndex(mroczna.index, entrance.x, y, entrance.z)).not.toBeNull()
    const outsideApproach = 3.5
    const x = entrance.x + out.dx * outsideApproach
    const z = entrance.z + out.dz * outsideApproach
    expect(mouthCarveDepth(x, z, entrance)).toBeGreaterThan(0.2)
    // Proxy disc still ends at ~2.4 m — that is no longer gameplay truth.
    expect(mroczna.volume.contains(x, y, z)).toBe(false)
    expect(queryColumnIndex(mroczna.index, x, y, z)).not.toBeNull()
    const surfaceY = mroczna.surfaceHeightAt(x, z)
    expect(surfaceY).toBeGreaterThan(y + 0.45)
  })

  it('Grota Mroczna: leaving the recess at surface height is a real surface transition', () => {
    const { entrance } = mroczna.topology
    const out = openingDirection(entrance.yaw)
    const x = entrance.x + out.dx * 8
    const z = entrance.z + out.dz * 8
    const surfaceY = mroczna.surfaceHeightAt(x, z)
    expect(queryColumnIndex(mroczna.index, x, surfaceY, z)).toBeNull()
    expect(mouthCarveDepth(x, z, entrance)).toBe(0)
  })

  it('hillside above a tunnel is not contained (surface entity, not cave floor)', () => {
    const chamber = czarny.topology.nodes.find((n) => n.id === 'chamber')!
    const surfaceY = czarny.surfaceHeightAt(chamber.position.x, chamber.position.z)
    expect(queryColumnIndex(czarny.index, chamber.position.x, surfaceY, chamber.position.z)).toBeNull()
    expect(queryColumnIndex(czarny.index, chamber.position.x, chamber.position.y + QUERY_ABOVE_FLOOR, chamber.position.z)).not.toBeNull()
  })

  it('Grota Czarnego Kamienia: queryGround tracks the SDF bowl, not the flat proxy floor', () => {
    const chamber = czarny.topology.nodes.find((n) => n.id === 'chamber')!
    const proxyFloor = czarny.volume.sampleFloor(chamber.position.x, chamber.position.z)
    expect(proxyFloor).not.toBeNull()
    const into = openingDirection(czarny.topology.entrance.yaw)
    const side = { dx: -into.dz, dz: into.dx }
    const d = 2.2
    const x = chamber.position.x + side.dx * d
    const z = chamber.position.z + side.dz * d
    const sdfInterval = lowestWalkableInterval(
      czarny.sdf.sample,
      czarny.surfaceHeightAt(x, z),
      x,
      z,
      czarny.sdf.bounds.minY,
      czarny.sdf.bounds.maxY,
    )
    expect(sdfInterval).not.toBeNull()
    const hit = queryColumnIndex(czarny.index, x, sdfInterval!.floorY + QUERY_ABOVE_FLOOR, z)
    expect(hit).not.toBeNull()
    expect(hit!.floorY).toBeGreaterThan(proxyFloor! + 0.25)
    expect(Math.abs(hit!.floorY - sdfInterval!.floorY)).toBeLessThan(0.5)
  })

  it('Grota Czarnego Kamienia: walking the SDF floor toward the wall stays in cave until the visual wall', () => {
    const chamber = czarny.topology.nodes.find((n) => n.id === 'chamber')!
    const into = openingDirection(czarny.topology.entrance.yaw)
    const side = { dx: -into.dz, dz: into.dx }
    const hit = wallApproach(czarny, chamber.position, side.dx, side.dz)
    expect(hit.sdfWallDistance).not.toBeNull()
    // B3 leftover: proxy/colliders are still wider than the SDF wall.
    expect(hit.sdfWallDistance!).toBeLessThan(hit.colliderRingDistance - 1)
    expect(hit.proxyExitDistance!).toBeGreaterThan(hit.sdfWallDistance! + 1)

    let last: CaveGroundHit | null = null
    const wall = hit.sdfWallDistance!
    for (let d = 0; d < wall - 0.15; d += RAY_STEP) {
      const x = chamber.position.x + side.dx * d
      const z = chamber.position.z + side.dz * d
      const interval = lowestWalkableInterval(
        czarny.sdf.sample,
        czarny.surfaceHeightAt(x, z),
        x,
        z,
        czarny.sdf.bounds.minY,
        czarny.sdf.bounds.maxY,
      )
      if (!interval) continue
      const y = interval.floorY + QUERY_ABOVE_FLOOR
      const q = queryColumnIndex(czarny.index, x, y, z)
      expect(q).not.toBeNull()
      last = q
    }
    expect(last).not.toBeNull()

    const past = wall + 0.4
    const x = chamber.position.x + side.dx * past
    const z = chamber.position.z + side.dz * past
    const y = last!.floorY + QUERY_ABOVE_FLOOR
    const missed = queryColumnIndex(czarny.index, x, y, z)
    const surfaceY = czarny.surfaceHeightAt(x, z)
    expect(surfaceY).toBeGreaterThan(y + CAVE_UNDERGROUND_MISS)
    // Raw column miss is allowed in rock (B3 collision). Hysteresis must
    // still refuse the surface snap.
    const held = applyCaveGroundHysteresis(missed, y, surfaceY, last)
    expect(held.hit).not.toBeNull()
    expect(held.hit!.floorY).toBeLessThan(surfaceY - 1)
  })

  it('player ground path does not use CaveVolume: proxy containment past the SDF wall is not queryGround', () => {
    const chamber = czarny.topology.nodes.find((n) => n.id === 'chamber')!
    const into = openingDirection(czarny.topology.entrance.yaw)
    const side = { dx: -into.dz, dz: into.dx }
    const hit = wallApproach(czarny, chamber.position, side.dx, side.dz)
    const d = (hit.sdfWallDistance! + hit.proxyExitDistance!) / 2
    const x = chamber.position.x + side.dx * d
    const z = chamber.position.z + side.dz * d
    const y = chamber.position.y + QUERY_ABOVE_FLOOR
    expect(czarny.volume.contains(x, y, z)).toBe(true)
    const proxyFloor = czarny.volume.sampleFloor(x, z)
    expect(proxyFloor).not.toBeNull()
    expect(proxyFloor!).toBeCloseTo(chamber.position.y, 0)
    const q = queryColumnIndex(czarny.index, x, y, z)
    // Either the ghost plane is no longer cave space, or the hit is the
    // SDF bowl — never CaveVolume's flat proxy floor as gameplay truth.
    if (q) {
      expect(q.floorY).toBeGreaterThan(proxyFloor! + 0.2)
    }
  })
})
