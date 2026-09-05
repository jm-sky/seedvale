/** Deterministic regression for the 2026-09-05 Cave V2 SDF repro
 *  (`?seed=1922931019&caveSpike=sdf`, cave `cave:641d64fc` at
 *  x = -425.138…, z = 153.052…): the spike cave's entrance rendered as a
 *  black dome standing out of the meadow, and walking the tunnel teleported
 *  the player onto the surface.
 *
 *  Everything here is pure and analytic — `sampleHeightAt` with the same
 *  `RawSampleParams` `ChunkManager` builds for its `sampleBaseHeight`
 *  fallback, so the world's terrain is reproduced exactly without a
 *  `ChunkManager`, a renderer or a browser.
 */

import { describe, expect, it } from 'vitest'
import type { CaveEntrance } from '../caveVolume'
import { createBenchmarkWorldConfig } from '../../config/worldConfig'
import { measureSlope } from '../../fauna/createFauna'
import { type RawSampleParams, sampleHeightAt } from '../../terrain/chunkHeightmap'
import { CAVE_MOUTH_DEPTH } from '../caveGenerator'
import { createCaveVolume } from '../caveVolume'
import { LARGE_CAVE_MOUTH_WIDTH } from '../largeCaves'
import { buildSdfCaveMesh, DEFAULT_SDF_PARAMS } from './sdfCaveMesh'
import { buildSpikeTestTopology, spikeOverburdenRequirement } from './spikeTestCave'
import { topologyToCaveDefinition } from './topologyAdapter'
import type * as THREE from 'three'

const REPRO_SEED = 1922931019
const REPRO_SITE_X = -425.1383787947449
const REPRO_SITE_Z = 153.05214273497208
/** Coarser than the default so the grid stays cheap under vitest. */
const TEST_SDF_PARAMS = { ...DEFAULT_SDF_PARAMS, cellSize: 0.5 }

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

/** The entrance `caveGenerator.ts` derives for this site: the carved mouth
 *  recess floor, opening downhill. */
function reproEntrance(surfaceHeightAt: (x: number, z: number) => number): CaveEntrance {
  return {
    x: REPRO_SITE_X,
    y: surfaceHeightAt(REPRO_SITE_X, REPRO_SITE_Z) - CAVE_MOUTH_DEPTH,
    z: REPRO_SITE_Z,
    yaw: measureSlope(REPRO_SITE_X, REPRO_SITE_Z, 4, surfaceHeightAt).yaw,
    width: LARGE_CAVE_MOUTH_WIDTH,
    height: 2.6,
  }
}

/** Worst `surface - ceiling` shortfall over the walkable footprint, measured
 *  against what `spikeOverburdenRequirement` allows at that distance.
 *  Positive means the roof is too thin (or missing) somewhere. */
function overburdenShortfall(
  surfaceHeightAt: (x: number, z: number) => number,
  topology: ReturnType<typeof buildSpikeTestTopology>,
): { shortfall: number, at: { x: number, z: number } } {
  const definition = topologyToCaveDefinition(topology)
  const volume = createCaveVolume(definition)
  const bounds = definition.bounds
  let shortfall = -Infinity
  let at = { x: 0, z: 0 }
  for (let x = bounds.minX; x <= bounds.maxX; x += 0.25) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += 0.25) {
      const ceiling = volume.sampleCeiling(x, z)
      if (ceiling === null) continue
      const required = spikeOverburdenRequirement(
        topology.entrance,
        Math.hypot(x - topology.entrance.x, z - topology.entrance.z),
      )
      if (required === null) continue
      const value = required - (surfaceHeightAt(x, z) - ceiling)
      if (value > shortfall) {
        shortfall = value
        at = { x, z }
      }
    }
  }
  return { shortfall, at }
}

describe('Cave V2 spike surface integration (seed 1922931019 / cave:641d64fc)', () => {
  const surfaceHeightAt = surfaceSampler(REPRO_SEED)
  const entrance = reproEntrance(surfaceHeightAt)

  it('keeps the required overburden over the whole walkable footprint, not just the centerline', () => {
    const topology = buildSpikeTestTopology(REPRO_SEED, entrance, { surfaceHeightAt })
    const { shortfall, at } = overburdenShortfall(surfaceHeightAt, topology)
    // Reported as an object so a failure names the offending point.
    expect(shortfall <= 0 ? null : { shortfall, at }).toBeNull()
  })

  it('is terrain-blind without a surface sampler — the regression this guards', () => {
    const blind = buildSpikeTestTopology(REPRO_SEED, entrance)
    expect(overburdenShortfall(surfaceHeightAt, blind).shortfall).toBeGreaterThan(0)
  })

  it('never hands a walking entity back to the surface: the reported floor stays contained one step on', () => {
    const topology = buildSpikeTestTopology(REPRO_SEED, entrance, { surfaceHeightAt })
    const definition = topologyToCaveDefinition(topology)
    const volume = createCaveVolume(definition)
    const bounds = definition.bounds
    const step = 0.1
    const leaks: { x: number, z: number }[] = []
    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z += step) {
        const floor = volume.sampleFloor(x, z)
        if (floor === null) continue
        for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
          if (volume.sampleFloor(x + dx, z + dz) === null) continue
          if (!volume.contains(x + dx, floor, z + dz)) leaks.push({ x: x + dx, z: z + dz })
        }
      }
    }
    expect(leaks.slice(0, 5)).toEqual([])
  })

  it('puts no SDF geometry above the terrain and leaves the mouth open', () => {
    const topology = buildSpikeTestTopology(REPRO_SEED, entrance, { surfaceHeightAt })
    const { geometry } = buildSdfCaveMesh(topology, TEST_SDF_PARAMS, false, surfaceHeightAt)
    const positions = geometry.getAttribute('position')

    let worstAboveTerrain = -Infinity
    for (let i = 0; i < positions.count; i++) {
      const above = positions.getY(i) - surfaceHeightAt(positions.getX(i), positions.getZ(i))
      worstAboveTerrain = Math.max(worstAboveTerrain, above)
    }
    expect(worstAboveTerrain).toBeLessThanOrEqual(0)

    // An open portal means boundary edges (used by exactly one triangle) near
    // the mouth. The unclipped iso-surface is closed and has none.
    expect(boundaryEdgesNearMouth(geometry, entrance)).toBeGreaterThan(0)
    const unclipped = buildSdfCaveMesh(topology, TEST_SDF_PARAMS).geometry
    expect(boundaryEdgesNearMouth(unclipped, entrance)).toBe(0)
  })
})

function boundaryEdgesNearMouth(geometry: THREE.BufferGeometry, entrance: CaveEntrance): number {
  const index = geometry.getIndex()!
  const positions = geometry.getAttribute('position')
  const uses = new Map<string, number>()
  for (let i = 0; i < index.count; i += 3) {
    const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
    for (let e = 0; e < 3; e++) {
      const a = tri[e]!
      const b = tri[(e + 1) % 3]!
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      uses.set(key, (uses.get(key) ?? 0) + 1)
    }
  }
  let count = 0
  for (const [key, used] of uses) {
    if (used !== 1) continue
    const [a, b] = key.split(':').map(Number) as [number, number]
    const mx = (positions.getX(a) + positions.getX(b)) / 2
    const mz = (positions.getZ(a) + positions.getZ(b)) / 2
    if (Math.hypot(mx - entrance.x, mz - entrance.z) <= 4) count++
  }
  return count
}
