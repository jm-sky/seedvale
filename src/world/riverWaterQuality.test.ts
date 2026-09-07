import { describe, expect, it } from 'vitest'
import { DEFAULT_RIVER_THRESHOLDS } from '../terrain/riverNetwork'
import {
  applyRiverWaterQualityModifiers,
  CALIBRATED_HIGH_RIVER_ELEVATION,
  classifyBaseRiverWaterQuality,
} from './riverWaterQuality'

const Ehigh = CALIBRATED_HIGH_RIVER_ELEVATION

describe('classifyBaseRiverWaterQuality (plan world-017 §9.1)', () => {
  it('is safe for a minimal-flow small stream at/above Ehigh', () => {
    expect(classifyBaseRiverWaterQuality({ accumulation: DEFAULT_RIVER_THRESHOLDS.stream, elevation: Ehigh })).toBe('safe')
  })

  it('is safe for the last small-stream accumulation value below the river threshold', () => {
    expect(classifyBaseRiverWaterQuality({ accumulation: DEFAULT_RIVER_THRESHOLDS.river - 1, elevation: Ehigh })).toBe('safe')
  })

  it('is unsafe exactly at the canonical river boundary, even at very high elevation', () => {
    expect(classifyBaseRiverWaterQuality({ accumulation: DEFAULT_RIVER_THRESHOLDS.river, elevation: 1000 })).toBe('unsafe')
  })

  it('is unsafe at the major-river boundary, even at very high elevation', () => {
    expect(classifyBaseRiverWaterQuality({ accumulation: DEFAULT_RIVER_THRESHOLDS.majorRiver, elevation: 1000 })).toBe('unsafe')
  })

  it('is unsafe for a small stream just below the elevation threshold', () => {
    expect(classifyBaseRiverWaterQuality({ accumulation: DEFAULT_RIVER_THRESHOLDS.stream, elevation: Ehigh - 0.01 })).toBe('unsafe')
  })

  it('is safe exactly at the elevation threshold (inclusive)', () => {
    expect(classifyBaseRiverWaterQuality({ accumulation: DEFAULT_RIVER_THRESHOLDS.stream, elevation: Ehigh })).toBe('safe')
  })

  it('is unsafe for a lowland small stream', () => {
    expect(classifyBaseRiverWaterQuality({ accumulation: 20, elevation: -10 })).toBe('unsafe')
  })

  it('is unsafe for a larger upstream/tributary river even at high elevation', () => {
    expect(classifyBaseRiverWaterQuality({ accumulation: 120, elevation: 1000 })).toBe('unsafe')
  })

  it('is unsafe for a downstream/major river', () => {
    expect(classifyBaseRiverWaterQuality({ accumulation: 500, elevation: 1000 })).toBe('unsafe')
  })

  it('elevation can never promote a large river to safe', () => {
    expect(classifyBaseRiverWaterQuality({ accumulation: DEFAULT_RIVER_THRESHOLDS.river, elevation: Number.POSITIVE_INFINITY })).toBe('unsafe')
  })
})

describe('applyRiverWaterQualityModifiers (plan world-017 §4, §9.2)', () => {
  it('degrades a safe base to unsafe when near a settlement', () => {
    expect(applyRiverWaterQualityModifiers('safe', { nearSettlement: true })).toBe('unsafe')
  })

  it('leaves a safe base alone when far from any settlement', () => {
    expect(applyRiverWaterQualityModifiers('safe', { nearSettlement: false })).toBe('safe')
  })

  it('never upgrades an unsafe base, near or far', () => {
    expect(applyRiverWaterQualityModifiers('unsafe', { nearSettlement: true })).toBe('unsafe')
    expect(applyRiverWaterQualityModifiers('unsafe', { nearSettlement: false })).toBe('unsafe')
  })
})
