import { describe, expect, it } from 'vitest'
import type { RiverChannelSegment } from './chunkHeightmap'
import { sampleLocalWater } from './waterSample'

const WATER_LEVEL = 10

function riverSegment(overrides: Partial<RiverChannelSegment> = {}): RiverChannelSegment {
  return {
    ax: -10,
    az: 0,
    aBedH: 18,
    aWaterH: 19,
    aWaterHalfWidth: 2,
    aChannelHalfWidth: 4,
    bx: 10,
    bz: 0,
    bBedH: 18,
    bWaterH: 19,
    bWaterHalfWidth: 2,
    bChannelHalfWidth: 4,
    ...overrides,
  }
}

describe('sampleLocalWater (plan fauna-015)', () => {
  it('reports dry land when the clamped height sits above waterLevel and there is no river here', () => {
    const sample = sampleLocalWater(WATER_LEVEL + 5, WATER_LEVEL + 5, WATER_LEVEL, [], 0, 0)
    expect(sample.present).toBe(false)
  })

  it('reports lake/ocean depth from floorHeight vs. the global waterLevel', () => {
    const sample = sampleLocalWater(WATER_LEVEL, WATER_LEVEL - 3, WATER_LEVEL, [], 0, 0)
    expect(sample).toEqual({ present: true, waterSurfaceHeight: WATER_LEVEL, floorHeight: WATER_LEVEL - 3, depth: 3 })
  })

  it('never reports negative depth even if floorHeight sits above waterLevel', () => {
    const sample = sampleLocalWater(WATER_LEVEL, WATER_LEVEL + 1, WATER_LEVEL, [], 0, 0)
    expect(sample).toEqual({ present: true, waterSurfaceHeight: WATER_LEVEL, floorHeight: WATER_LEVEL + 1, depth: 0 })
  })

  it('uses the river channel canonical water/bed height, not the global waterLevel, when inside a river channel', () => {
    // River bed (18) sits well above the global waterLevel (10) — a mountain
    // stream. The clamped `heights` field for such a point never dips below
    // waterLevel, so only the river channel data can report it as water.
    const segments = [riverSegment()]
    const sample = sampleLocalWater(WATER_LEVEL + 20, WATER_LEVEL + 20, WATER_LEVEL, segments, 0, 0)
    expect(sample).toEqual({ present: true, waterSurfaceHeight: 19, floorHeight: 18, depth: 1 })
  })

  it('falls back to the lake/ocean check outside the river channel even when river segments are loaded nearby', () => {
    const segments = [riverSegment()]
    // Far across the bank from the river's centerline (halfWidth 2, well outside).
    const sample = sampleLocalWater(WATER_LEVEL + 20, WATER_LEVEL + 20, WATER_LEVEL, segments, 0, 50)
    expect(sample.present).toBe(false)
  })

  it('river data wins over a coincidentally-water-clamped height at the same point', () => {
    const segments = [riverSegment()]
    // Even if the (contrived) clamped height also reads as lake/ocean water,
    // being inside the river channel must resolve to the river's own numbers.
    const sample = sampleLocalWater(WATER_LEVEL, WATER_LEVEL - 100, WATER_LEVEL, segments, 0, 0)
    expect(sample).toEqual({ present: true, waterSurfaceHeight: 19, floorHeight: 18, depth: 1 })
  })
})
