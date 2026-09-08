/** B2 recon diagnostic — production SDF vs the current gameplay proxy
 *  (`topologyToCaveDefinition` → `CaveVolume`) on the two 2026-09-08
 *  surface-snap repros. Pure/analytic: `sampleHeightAt` + production
 *  topology, no `ChunkManager`, no browser.
 *
 *  These tests pin the *current* mismatch so B2 can invert the failing
 *  gameplay contract. See
 *  `docs/plans/implementation-notes/world-terrain-008-underground-caves-v2-b2-recon.md`.
 */

import { describe, expect, it } from 'vitest'
import { createBenchmarkWorldConfig } from '../../config/worldConfig'
import { measureSlope } from '../../fauna/createFauna'
import { PLAYER_HEIGHT } from '../../player/PlayerController'
import { type RawSampleParams, sampleHeightAt } from '../../terrain/chunkHeightmap'
import { createCaveVolume, type CaveVolume } from '../caveVolume'
import { openingDirection, type LargeCaveSite } from '../largeCaves'
import { buildCaveSdfRepresentation, type CaveSdfSpatialRepresentation } from './caveSdfField'
import { makeCaveId } from './caveIdentity'
import { buildProductionCaveTopology } from './productionTopology'
import type { CaveTopology } from './caveTopology'
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
  return {
    topology,
    sdf: buildCaveSdfRepresentation(topology),
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

function countSdfWalkableOutsideProxy(cave: BuiltCave): { walkable: number, uncovered: number } {
  const { sdf, volume, surfaceHeightAt } = cave
  const { bounds } = sdf
  let walkable = 0
  let uncovered = 0
  for (let x = bounds.minX; x <= bounds.maxX; x += XZ_STEP) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += XZ_STEP) {
      const interval = lowestWalkableInterval(sdf.sample, surfaceHeightAt(x, z), x, z, bounds.minY, bounds.maxY)
      if (!interval) continue
      walkable++
      if (!volume.contains(x, interval.floorY + QUERY_ABOVE_FLOOR, z)) uncovered++
    }
  }
  return { walkable, uncovered }
}

/** Along a ground-plane ray from a node, at the *proxy* floor + 1 m (what
 *  `PlayerController.groundAt` actually stands the player on today). */
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

describe('B2 recon: CaveVolume proxy vs production SDF (seed 1136726869)', () => {
  it('reconstructs Grota Mroczna as cave:7fd14c30', () => {
    const surfaceHeightAt = surfaceSampler(REPRO_SEED)
    const site = siteFromEntrance(GROTA_MROCZNA.x, GROTA_MROCZNA.z, surfaceHeightAt)
    expect(makeCaveId(REPRO_SEED, site)).toBe(GROTA_MROCZNA.caveId)
    expect(buildReproCave(GROTA_MROCZNA.x, GROTA_MROCZNA.z).topology.caveId).toBe(GROTA_MROCZNA.caveId)
  })

  it('reconstructs Grota Czarnego Kamienia as cave:0e3cce97', () => {
    const surfaceHeightAt = surfaceSampler(REPRO_SEED)
    const site = siteFromEntrance(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z, surfaceHeightAt)
    expect(makeCaveId(REPRO_SEED, site)).toBe(GROTA_CZARNEGO_KAMIENIA.caveId)
    expect(buildReproCave(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z).topology.caveId).toBe(GROTA_CZARNEGO_KAMIENIA.caveId)
  })

  it('player-height SDF columns are almost entirely inside the proxy — leftover cells are iso-boundary noise, not the repro', () => {
    for (const cave of [GROTA_MROCZNA, GROTA_CZARNEGO_KAMIENIA]) {
      const report = countSdfWalkableOutsideProxy(buildReproCave(cave.x, cave.z))
      expect(report.walkable).toBeGreaterThan(50)
      expect(report.uncovered / report.walkable).toBeLessThan(0.01)
    }
  })

  it('Grota Czarnego Kamienia: at the proxy floor, the SDF wall is well inside the proxy / collider ring', () => {
    const cave = buildReproCave(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z)
    const chamber = cave.topology.nodes.find((n) => n.id === 'chamber')!
    const into = openingDirection(cave.topology.entrance.yaw)
    // Sideways from the chamber — away from the incoming tunnel.
    const side = { dx: -into.dz, dz: into.dx }
    const hit = wallApproach(cave, chamber.position, side.dx, side.dz)
    expect(hit.sdfWallDistance).not.toBeNull()
    expect(hit.proxyExitDistance).not.toBeNull()
    // Visual wall (SDF zero at standing height on the flat proxy floor)
    // is metres inside the containment/collider ring — walking "to the
    // wall" clips through mesh, then leaving the proxy snaps to surface.
    expect(hit.sdfWallDistance!).toBeLessThan(hit.colliderRingDistance - 1)
    expect(hit.proxyExitDistance!).toBeGreaterThan(hit.sdfWallDistance! + 1)
  })

  it('Grota Mroczna: mouth-floor Y is contained only in a tight disc; a step outward at the same Y leaves the cave', () => {
    const cave = buildReproCave(GROTA_MROCZNA.x, GROTA_MROCZNA.z)
    const { entrance } = cave.topology
    const out = openingDirection(entrance.yaw)
    const y = entrance.y + 0.2
    expect(cave.volume.contains(entrance.x, y, entrance.z)).toBe(true)
    // Carved approach is centred 2.2 m outward with radius 3.2 m
    // (`createCaves.ts`); the entrance disc is only width/2+PROXY_MARGIN.
    const outsideApproach = 3.5
    const x = entrance.x + out.dx * outsideApproach
    const z = entrance.z + out.dz * outsideApproach
    expect(cave.volume.contains(x, y, z)).toBe(false)
    const surfaceY = cave.surfaceHeightAt(x, z)
    // Standing in the approach pit then leaving containment snaps *up*
    // because surface ground is above the player (`STEP_DOWN_MAX` only
    // limits downward snaps).
    expect(surfaceY).toBeGreaterThan(y + 0.45)
  })

  it('proxy sampleFloor is a flat plane; SDF floor rises toward the chamber wall', () => {
    const cave = buildReproCave(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z)
    const chamber = cave.topology.nodes.find((n) => n.id === 'chamber')!
    const proxyFloor = cave.volume.sampleFloor(chamber.position.x, chamber.position.z)
    expect(proxyFloor).not.toBeNull()
    const into = openingDirection(cave.topology.entrance.yaw)
    const side = { dx: -into.dz, dz: into.dx }
    const d = 2.2
    const x = chamber.position.x + side.dx * d
    const z = chamber.position.z + side.dz * d
    const interval = lowestWalkableInterval(
      cave.sdf.sample,
      cave.surfaceHeightAt(x, z),
      x,
      z,
      cave.sdf.bounds.minY,
      cave.sdf.bounds.maxY,
    )
    expect(interval).not.toBeNull()
    expect(interval!.floorY).toBeGreaterThan(proxyFloor! + 0.3)
  })
})
