import { describe, expect, it } from 'vitest'
import {
  PHYSICAL_WORK_STRENGTH_NEUTRAL,
  physicalWorkDuration,
  physicalWorkSpeedMultiplier,
} from './physicalWorkStrength'
import { PLAYER_STARTING_ATTRIBUTES } from './PlayerController'

describe('physicalWorkSpeedMultiplier', () => {
  it('maps the documented boundary/neutral/starting points exactly (plan npc-020 §3)', () => {
    expect(physicalWorkSpeedMultiplier(0)).toBeCloseTo(0.75, 5)
    expect(physicalWorkSpeedMultiplier(0.25)).toBeCloseTo(0.875, 5)
    expect(physicalWorkSpeedMultiplier(0.5)).toBeCloseTo(1.00, 5)
    expect(physicalWorkSpeedMultiplier(0.75)).toBeCloseTo(1.125, 5)
    expect(physicalWorkSpeedMultiplier(1)).toBeCloseTo(1.25, 5)
    expect(physicalWorkSpeedMultiplier(PLAYER_STARTING_ATTRIBUTES.strength)).toBeCloseTo(1.05, 5)
  })

  it('is neutral at PHYSICAL_WORK_STRENGTH_NEUTRAL', () => {
    expect(physicalWorkSpeedMultiplier(PHYSICAL_WORK_STRENGTH_NEUTRAL)).toBeCloseTo(1.0, 5)
  })
})

describe('physicalWorkDuration', () => {
  it('preserves legacy duration exactly at Strength 0.5', () => {
    expect(physicalWorkDuration(2, 0.5)).toBe(2)
    expect(physicalWorkDuration(1.6, PHYSICAL_WORK_STRENGTH_NEUTRAL)).toBe(1.6)
  })

  it('shortens duration as Strength increases (monotonic)', () => {
    const weak = physicalWorkDuration(10, 0)
    const mid = physicalWorkDuration(10, 0.5)
    const start = physicalWorkDuration(10, 0.6)
    const strong = physicalWorkDuration(10, 1)
    expect(weak).toBeCloseTo(10 / 0.75, 5)
    expect(mid).toBe(10)
    expect(start).toBeCloseTo(10 / 1.05, 5)
    expect(strong).toBeCloseTo(8, 5)
    expect(weak).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(start)
    expect(start).toBeGreaterThan(strong)
  })
})
