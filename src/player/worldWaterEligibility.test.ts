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
    expect(worldWaterAppliesInCurrentSpace(null)).toBe(true)
  })

  it('lets open-sky mouth/approach pits use world water', () => {
    expect(worldWaterAppliesInCurrentSpace({ openSky: true })).toBe(true)
  })

  it('does not treat a closed cave void as flooded by the ocean plane', () => {
    expect(worldWaterAppliesInCurrentSpace({ openSky: false })).toBe(false)
    expect(worldWaterAppliesInCurrentSpace({})).toBe(false)
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
    expect(worldWaterAppliesInCurrentSpace(occupancy)).toBe(false)
    // Pre-fix swim path: cave floor <= waterLevel used outdoor sampleFloor and
    // teleported to the hillside / water mesh (~surfaceY), not the cave floor.
    expect(swimFeetY(WATER_LEVEL, surfaceY)).toBeCloseTo(surfaceY, 3)
  })

  it('still swims on the outdoor water plane', () => {
    const groundY = 0.1
    expect(groundY).toBeLessThanOrEqual(WATER_LEVEL)
    expect(worldWaterAppliesInCurrentSpace(null)).toBe(true)
    expect(swimFeetY(WATER_LEVEL, 0.1)).toBeCloseTo(0.1, 5)
  })
})

describe('seed 1136726869 closed interior below waterLevel', () => {
  const SEED = 1136726869
  const ENTRANCE = { x: 135.84259216988767, z: -17.813611096688362 }
  /** Live failing tick class: descending interior, cave floor already below ocean. */
  const SAMPLE = { x: 119.13665638618887, y: 1.06252, z: -16.365048752186787 }

  it('strict occupancy is closed cave and world water must not own vertical motion', () => {
    const config = createBenchmarkWorldConfig({ seed: SEED, terrainResolution: 193, loadRadius: 4 })
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
      x: ENTRANCE.x,
      z: ENTRANCE.z,
      yaw: measureSlope(ENTRANCE.x, ENTRANCE.z, 4, sampleHeight).yaw,
      length: 12,
      variant: 0,
    }
    const topology = buildProductionCaveTopology({
      seed: SEED,
      site,
      sampleHeight,
      sampleBaseHeight: sampleHeight,
    })
    expect(topology).not.toBeNull()
    const sdf = buildCaveSdfRepresentation(topology!)
    const index = buildCaveSdfColumnIndex(sdf, topology!, sampleHeight)

    const occupancy = occupancyIntervalAt(index, SAMPLE.x, SAMPLE.y, SAMPLE.z)
    expect(occupancy, 'strict occupancy at the live descending sample').not.toBeNull()
    expect(occupancy!.openSky === true).toBe(false)

    const cave = queryColumnIndex(index, SAMPLE.x, SAMPLE.y, SAMPLE.z)
    expect(cave).not.toBeNull()
    expect(cave!.floorY).toBeLessThan(t.waterLevel)

    const surfaceY = sampleHeight(SAMPLE.x, SAMPLE.z)
    expect(surfaceY).toBeGreaterThan(SAMPLE.y + 2)
    expect(worldWaterAppliesInCurrentSpace(occupancy)).toBe(false)
    expect(swimFeetY(t.waterLevel, surfaceY)).toBeCloseTo(surfaceY, 2)

    const out = openingDirection(topology!.entrance.yaw)
    const mouthX = topology!.entrance.x + out.dx * 0.4
    const mouthZ = topology!.entrance.z + out.dz * 0.4
    const mouthY = sampleHeight(mouthX, mouthZ) - 0.3
    const mouthOcc = occupancyIntervalAt(index, mouthX, mouthY, mouthZ)
    if (mouthOcc?.openSky) {
      expect(worldWaterAppliesInCurrentSpace(mouthOcc)).toBe(true)
    }
  })
})
