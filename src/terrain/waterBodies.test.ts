import { describe, expect, it } from 'vitest'
import {
  computeBodyScale,
  detectWaterBodies,
  LAKE_SCALE_MAX,
  lakeScaleFor,
  OCEAN_BODY_SCALE_DISCARD,
  oceanMixAt,
} from './waterBodies'

const OCEAN_THRESHOLD = 0.32
const COAST_THRESHOLD = 0.45

function filledHeights(resolution: number, waterLevel: number, water: boolean): Float32Array {
  const heights = new Float32Array(resolution * resolution)
  heights.fill(water ? waterLevel : waterLevel + 1)
  return heights
}

describe('lakeScaleFor', () => {
  it('is 0 below the small-pond floor and 1 at saturate', () => {
    expect(lakeScaleFor(0)).toBe(0)
    expect(lakeScaleFor(4)).toBe(0)
    expect(lakeScaleFor(300)).toBe(1)
    expect(lakeScaleFor(152)).toBeGreaterThan(0.4)
    expect(lakeScaleFor(152)).toBeLessThan(0.6)
  })
})

describe('oceanMixAt', () => {
  it('is 1 at/below oceanThreshold and 0 at/above coastThreshold', () => {
    expect(oceanMixAt(0.1, OCEAN_THRESHOLD, COAST_THRESHOLD)).toBe(1)
    expect(oceanMixAt(OCEAN_THRESHOLD, OCEAN_THRESHOLD, COAST_THRESHOLD)).toBe(1)
    expect(oceanMixAt(COAST_THRESHOLD, OCEAN_THRESHOLD, COAST_THRESHOLD)).toBe(0)
    expect(oceanMixAt(0.8, OCEAN_THRESHOLD, COAST_THRESHOLD)).toBe(0)
  })
})

describe('computeBodyScale', () => {
  const resolution = 16
  const waterLevel = 0
  const step = 1

  it('marks land as 0', () => {
    const heights = filledHeights(resolution, waterLevel, false)
    const detection = detectWaterBodies(heights, resolution, waterLevel, step)
    const continentalness = new Float32Array(resolution * resolution).fill(0.2)
    const scale = computeBodyScale(detection, {
      continentalness,
      oceanThreshold: OCEAN_THRESHOLD,
      coastThreshold: COAST_THRESHOLD,
    })
    expect(scale.every((v) => v === 0)).toBe(true)
  })

  it('does not promote a huge inland lake to ocean (area >> 35% of the chunk)', () => {
    const heights = filledHeights(resolution, waterLevel, true)
    const detection = detectWaterBodies(heights, resolution, waterLevel, step)
    expect(detection.bodies[0]!.worldArea).toBe(resolution * resolution)
    const continentalness = new Float32Array(resolution * resolution).fill(0.7)
    const scale = computeBodyScale(detection, {
      continentalness,
      oceanThreshold: OCEAN_THRESHOLD,
      coastThreshold: COAST_THRESHOLD,
    })
    expect(Math.max(...scale)).toBeLessThan(OCEAN_BODY_SCALE_DISCARD)
    expect(Math.max(...scale)).toBeCloseTo(LAKE_SCALE_MAX, 5)
  })

  it('marks cells below oceanThreshold as ocean (bodyScale 1)', () => {
    const heights = filledHeights(resolution, waterLevel, true)
    const detection = detectWaterBodies(heights, resolution, waterLevel, step)
    const continentalness = new Float32Array(resolution * resolution).fill(0.2)
    const scale = computeBodyScale(detection, {
      continentalness,
      oceanThreshold: OCEAN_THRESHOLD,
      coastThreshold: COAST_THRESHOLD,
    })
    expect(scale.every((v) => v === 1)).toBe(true)
  })

  it('splits a flooded grid: inland cells stay lakes, ocean-threshold cells are 1', () => {
    const heights = filledHeights(resolution, waterLevel, true)
    const detection = detectWaterBodies(heights, resolution, waterLevel, step)
    const continentalness = new Float32Array(resolution * resolution)
    for (let i = 0; i < continentalness.length; i++) {
      continentalness[i] = i < continentalness.length / 2 ? 0.2 : 0.7
    }
    const scale = computeBodyScale(detection, {
      continentalness,
      oceanThreshold: OCEAN_THRESHOLD,
      coastThreshold: COAST_THRESHOLD,
    })
    const half = scale.length / 2
    expect(scale.slice(0, half).every((v) => v === 1)).toBe(true)
    expect(Math.max(...scale.slice(half))).toBeLessThan(OCEAN_BODY_SCALE_DISCARD)
  })
})
