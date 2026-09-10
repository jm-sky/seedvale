import { describe, expect, it } from 'vitest'
import { createBenchmarkWorldConfig } from '../config/worldConfig'
import { measureSlope } from '../fauna/createFauna'
import { type RawSampleParams, sampleHeightAt } from '../terrain/chunkHeightmap'
import { buildCaveSdfRepresentation } from '../world/caves/caveSdfField'
import { buildCaveSdfColumnIndex, occupancyIntervalAt, queryColumnIndex } from '../world/caves/caveSdfQuery'
import { buildProductionCaveTopology } from '../world/caves/productionTopology'
import { type LargeCaveSite, openingDirection } from '../world/largeCaves'
import {
  swimFeetY,
  worldWaterAppliesInCurrentSpace,
} from './worldWaterEligibility'

const WATER_LEVEL = 0.45

describe('worldWaterAppliesInCurrentSpace', () => {
  it('lets outdoor / non-cave samples use world water', () => {
    expect(worldWaterAppliesInCurrentSpace({ occupancy: null, caveCeiling: null })).toBe(true)
  })

  it('lets open-sky mouth/approach pits use world water', () => {
    expect(worldWaterAppliesInCurrentSpace({ occupancy: { openSky: true }, caveCeiling: null })).toBe(true)
  })

  it('does not treat a closed cave void as flooded by the ocean plane', () => {
    expect(worldWaterAppliesInCurrentSpace({ occupancy: { openSky: false }, caveCeiling: null })).toBe(false)
    expect(worldWaterAppliesInCurrentSpace({ occupancy: {}, caveCeiling: null })).toBe(false)
  })

  it('blocks world water when cave ground still has a rock ceiling even if occupancy is false', () => {
    expect(worldWaterAppliesInCurrentSpace({
      occupancy: null,
      caveCeiling: -0.016,
    })).toBe(false)
  })
})

describe('swimFeetY', () => {
  it('caps depth in deep water so the head stays near the surface', () => {
    expect(swimFeetY(WATER_LEVEL, -20)).toBeCloseTo(WATER_LEVEL - 1.2, 5)
  })

  it('sits on the seabed when shallower than the cap', () => {
    expect(swimFeetY(WATER_LEVEL, 0.1)).toBeCloseTo(0.1, 5)
  })
})

describe('closed cave interior below waterLevel (swim ownership)', () => {
  it('does not hand vertical ownership to outdoor water when cave floor is below the ocean plane', () => {
    const occupancy = { floorY: 0.109, ceilingY: 8.576, openSky: false }
    const groundY = occupancy.floorY
    const surfaceY = 11.191
    expect(groundY).toBeLessThan(WATER_LEVEL)
    expect(worldWaterAppliesInCurrentSpace({ occupancy, caveCeiling: occupancy.ceilingY })).toBe(false)
    expect(swimFeetY(WATER_LEVEL, surfaceY)).toBeCloseTo(surfaceY, 3)
  })

  it('does not swim when occupancy is false a few cm below a resolved cave floor', () => {
    const caveCeiling = -0.016
    const caveFloor = -2.642
    const playerY = caveFloor - 0.059
    const surfaceY = 10.621
    expect(playerY).toBeLessThan(caveFloor)
    expect(caveCeiling).toBeLessThan(WATER_LEVEL)
    expect(caveCeiling).toBeLessThan(surfaceY)
    expect(worldWaterAppliesInCurrentSpace({ occupancy: null, caveCeiling })).toBe(false)
    expect(swimFeetY(WATER_LEVEL, surfaceY)).toBeCloseTo(surfaceY, 3)
  })

  it('still swims on the outdoor water plane', () => {
    const groundY = 0.1
    expect(groundY).toBeLessThanOrEqual(WATER_LEVEL)
    expect(worldWaterAppliesInCurrentSpace({ occupancy: null, caveCeiling: null })).toBe(true)
    expect(swimFeetY(WATER_LEVEL, 0.1)).toBeCloseTo(0.1, 5)
  })
})

function buildSeedCave(seed: number, entrance: { x: number, z: number }) {
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
  const sampleHeight = (x: number, z: number) => sampleHeightAt(x, z, params)
  const site: LargeCaveSite = {
    x: entrance.x,
    z: entrance.z,
    yaw: measureSlope(entrance.x, entrance.z, 4, sampleHeight).yaw,
    length: 12,
    variant: 0,
  }
  const topology = buildProductionCaveTopology({
    seed,
    site,
    sampleHeight,
    sampleBaseHeight: sampleHeight,
  })
  if (!topology) throw new Error('production topology rejected site')
  const sdf = buildCaveSdfRepresentation(topology)
  const index = buildCaveSdfColumnIndex(sdf, topology, sampleHeight)
  return { topology, index, sampleHeight, waterLevel: t.waterLevel }
}

describe('seed 1136726869 closed interior below waterLevel', () => {
  const SEED = 1136726869
  const ENTRANCE = { x: 135.84259216988767, z: -17.813611096688362 }

  it('strict occupancy is closed cave and world water must not own vertical motion', () => {
    const SAMPLE = { x: 119.13665638618887, y: 1.06252, z: -16.365048752186787 }
    const built = buildSeedCave(SEED, ENTRANCE)
    const occupancy = occupancyIntervalAt(built.index, SAMPLE.x, SAMPLE.y, SAMPLE.z)
    expect(occupancy, 'strict occupancy at the live descending sample').not.toBeNull()
    expect(occupancy!.openSky === true).toBe(false)

    const cave = queryColumnIndex(built.index, SAMPLE.x, SAMPLE.y, SAMPLE.z)
    expect(cave).not.toBeNull()
    expect(cave!.floorY).toBeLessThan(built.waterLevel)
    expect(cave!.openSky === true).toBe(false)

    const surfaceY = built.sampleHeight(SAMPLE.x, SAMPLE.z)
    expect(surfaceY).toBeGreaterThan(SAMPLE.y + 2)
    expect(worldWaterAppliesInCurrentSpace({
      occupancy,
      caveCeiling: cave!.openSky ? null : cave!.ceilingY,
    })).toBe(false)
    expect(swimFeetY(built.waterLevel, surfaceY)).toBeCloseTo(surfaceY, 2)

    const out = openingDirection(built.topology.entrance.yaw)
    const mouthX = built.topology.entrance.x + out.dx * 0.4
    const mouthZ = built.topology.entrance.z + out.dz * 0.4
    const mouthY = built.sampleHeight(mouthX, mouthZ) - 0.3
    const mouthOcc = occupancyIntervalAt(built.index, mouthX, mouthY, mouthZ)
    if (mouthOcc?.openSky) {
      expect(worldWaterAppliesInCurrentSpace({ occupancy: mouthOcc, caveCeiling: null })).toBe(true)
    }
  })

  it('does not hand swim ownership when occupancy is false a few cm below resolved cave ground', () => {
    const SAMPLE = { x: 114.104762, y: -2.701728, z: -16.028385 }
    const built = buildSeedCave(SEED, ENTRANCE)
    const probe = queryColumnIndex(built.index, SAMPLE.x, SAMPLE.y, SAMPLE.z)
      ?? queryColumnIndex(built.index, SAMPLE.x, SAMPLE.y + 0.5, SAMPLE.z)
    expect(probe, 'column still has cave ground near the live chamber sample').not.toBeNull()
    expect(probe!.openSky === true).toBe(false)

    const y = probe!.floorY - 0.059
    const occupancy = occupancyIntervalAt(built.index, SAMPLE.x, y, SAMPLE.z)
    expect(occupancy).toBeNull()

    const cave = queryColumnIndex(built.index, SAMPLE.x, y, SAMPLE.z)
    expect(cave).not.toBeNull()
    expect(cave!.openSky === true).toBe(false)
    expect(y).toBeLessThan(cave!.floorY)
    expect(cave!.ceilingY).toBeLessThan(built.waterLevel)

    const surfaceY = built.sampleHeight(SAMPLE.x, SAMPLE.z)
    expect(surfaceY).toBeGreaterThan(cave!.ceilingY + 2)
    expect(worldWaterAppliesInCurrentSpace({
      occupancy,
      caveCeiling: cave!.ceilingY,
    })).toBe(false)
    expect(swimFeetY(built.waterLevel, surfaceY)).toBeCloseTo(surfaceY, 1)
  })
})
