import { describe, expect, it } from 'vitest'
import { frogsTimeFactor } from './frogAmbience'

describe('frogsTimeFactor (plan world-016)', () => {
  it('is silent through the day', () => {
    expect(frogsTimeFactor(0.25)).toBe(0)
    expect(frogsTimeFactor(0.5)).toBe(0)
    expect(frogsTimeFactor(0.74)).toBe(0)
  })

  it('rises after dusk', () => {
    const justAfterDusk = frogsTimeFactor(0.78)
    expect(justAfterDusk).toBeGreaterThan(0)
    expect(justAfterDusk).toBeLessThan(1)
  })

  it('is fully active in the middle of the night', () => {
    expect(frogsTimeFactor(0.9)).toBe(1)
    expect(frogsTimeFactor(0.0)).toBe(1)
  })

  it('tapers off before dawn to a quiet pre-dawn stretch, then silences by dawn', () => {
    const preDawn = frogsTimeFactor(0.175)
    expect(preDawn).toBeGreaterThan(0)
    expect(preDawn).toBeLessThan(1)
    expect(frogsTimeFactor(0.2499)).toBe(0)
    expect(frogsTimeFactor(0.25)).toBe(0)
  })
})
