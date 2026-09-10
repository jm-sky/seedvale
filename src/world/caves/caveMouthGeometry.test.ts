/** Deterministic Cave V2 mouth geometry: topology entrance → derived
 *  contract → terrain trench + SDF aperture/hood/sides.
 *
 *  Seed `1136726869` / `cave:0e3cce97` is the Grota Czarnego Kamienia
 *  doorway the player verified for B3 mechanics.
 *
 * @domain world-terrain
 */

import { describe, expect, it } from 'vitest'
import { createBenchmarkWorldConfig } from '../../config/worldConfig'
import { measureSlope } from '../../fauna/createFauna'
import { type RawSampleParams, sampleHeightAt } from '../../terrain/chunkHeightmap'
import { openingDirection } from '../largeCaves'
import { makeCaveId } from './caveIdentity'
import { buildCaveSdfRepresentation } from './caveSdfField'
import {
  deriveMouthGeometry,
  inMouthAperture,
  mouthAlong,
  mouthCarveDepth,
  mouthCarveDiscs,
} from './mouthCarve'
import { buildProductionCaveTopology } from './productionTopology'

const REPRO_SEED = 1136726869
const GROTA_CZARNEGO_KAMIENIA = {
  caveId: 'cave:0e3cce97',
  x: 135.84259216988767,
  z: -17.813611096688362,
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

describe('deriveMouthGeometry', () => {
  it('derives aperture, frame and trench from entrance width/height', () => {
    const mouth = deriveMouthGeometry({ x: 10, y: 4, z: -3, yaw: 0.4, width: 3, height: 2.6 })
    expect(mouth.apertureWidth).toBe(3)
    expect(mouth.apertureHeight).toBe(2.6)
    expect(mouth.apertureHalfWidth).toBe(1.5)
    expect(mouth.floorY).toBe(4)
    expect(mouth.ceilingY).toBe(6.6)
    expect(mouth.mouthPitRadius).toBeCloseTo(1.65)
    expect(mouth.approachRadius).toBeCloseTo(3.2)
    expect(mouth.frameOutward).toBeGreaterThan(mouth.apertureOutward * 0.5)
  })

  it('keeps the 3D aperture off the hood and sides', () => {
    const mouth = deriveMouthGeometry({ x: 0, y: 0, z: 0, yaw: 0, width: 3, height: 2.6 })
    expect(inMouthAperture(0.4, 0, 1.3, mouth)).toBe(true)
    expect(inMouthAperture(0.4, 0, mouth.lintelY + 0.05, mouth)).toBe(false)
    expect(inMouthAperture(0.4, 2.0, 1.3, mouth)).toBe(false)
    expect(inMouthAperture(-0.2, 0, 1.3, mouth)).toBe(false)
  })
})

describe('mouth carve trench', () => {
  it('emits the shared mouth+approach discs from the derived contract', () => {
    const entrance = { x: 0, y: 1, z: 0, yaw: 0, width: 3, height: 2.6 }
    const mouth = deriveMouthGeometry(entrance)
    const discs = mouthCarveDiscs(entrance)
    expect(discs).toHaveLength(2)
    expect(discs.map((d) => d.radius).sort((a, b) => a - b)).toEqual(
      [mouth.mouthPitRadius, mouth.approachRadius].sort((a, b) => a - b),
    )
    expect(mouthCarveDepth(0, mouth.approachOffset, entrance)).toBeGreaterThan(0.2)
    expect(mouthCarveDepth(mouth.approachRadius + 0.4, mouth.approachOffset, entrance)).toBe(0)
  })
})

describe('seed 1136726869 / cave:0e3cce97 mouth field', () => {
  const surfaceHeightAt = surfaceSampler(REPRO_SEED)
  const site = {
    x: GROTA_CZARNEGO_KAMIENIA.x,
    z: GROTA_CZARNEGO_KAMIENIA.z,
    yaw: measureSlope(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z, 4, surfaceHeightAt).yaw,
    length: 12,
    variant: 0,
  }
  const topology = buildProductionCaveTopology({
    seed: REPRO_SEED,
    site,
    sampleHeight: surfaceHeightAt,
    sampleBaseHeight: surfaceHeightAt,
  })
  if (!topology) throw new Error('production topology rejected Grota Czarnego Kamienia')
  const sdf = buildCaveSdfRepresentation(topology, undefined, false)
  const { entrance } = topology
  const mouth = deriveMouthGeometry(entrance)
  const out = openingDirection(entrance.yaw)

  const sampleAt = (along: number, lateral: number, y: number): number => {
    const x = entrance.x + out.dx * along - out.dz * lateral
    const z = entrance.z + out.dz * along + out.dx * lateral
    return sdf.sample(x, y, z)
  }

  it('keeps the cave identity and entrance intent', () => {
    expect(makeCaveId(REPRO_SEED, site)).toBe(GROTA_CZARNEGO_KAMIENIA.caveId)
    expect(topology.caveId).toBe(GROTA_CZARNEGO_KAMIENIA.caveId)
    expect(entrance.width).toBe(3)
    expect(entrance.height).toBe(2.6)
  })

  it('opens the aperture in the SDF and frames it with hood/sides/lip', () => {
    const midY = mouth.floorY + mouth.apertureHeight * 0.5
    expect(sampleAt(0.2, 0, midY)).toBeLessThan(0)
    expect(sampleAt(0.45, 0, mouth.lintelY + mouth.hoodHeight * 0.25)).toBeGreaterThan(0)
    expect(sampleAt(0.25, mouth.apertureHalfWidth + mouth.frameThickness * 0.55, midY)).toBeGreaterThan(0)
    expect(sampleAt(0.15, 0, mouth.floorY - mouth.lipDepth * 0.5)).toBeGreaterThan(0)
    expect(sampleAt(-1.2, 0, midY)).toBeLessThan(0)
  })

  it('keeps an open-sky approach recess from the shared carve discs', () => {
    const along = 2.2
    const x = entrance.x + out.dx * along
    const z = entrance.z + out.dz * along
    expect(mouthAlong(x, z, entrance)).toBeCloseTo(along, 5)
    expect(mouthCarveDepth(x, z, entrance)).toBeGreaterThan(0.2)
    const farX = entrance.x + out.dx * 8
    const farZ = entrance.z + out.dz * 8
    expect(mouthCarveDepth(farX, farZ, entrance)).toBe(0)
  })
})
