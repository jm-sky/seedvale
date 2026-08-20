import { describe, expect, it } from 'vitest'
import { computeEncumbrance } from './playerEncumbrance'

describe('computeEncumbrance (plan 164 §9)', () => {
  it('is unaffected at or under capacity', () => {
    expect(computeEncumbrance(0, 30)).toEqual({ speedMultiplier: 1, blocked: false, overloadFraction: 0 })
    expect(computeEncumbrance(30, 30)).toEqual({ speedMultiplier: 1, blocked: false, overloadFraction: 0 })
  })

  it('stays at full speed up through the 10% band', () => {
    const result = computeEncumbrance(33, 30) // 10% overloaded
    expect(result.blocked).toBe(false)
    expect(result.speedMultiplier).toBe(1)
    expect(result.overloadFraction).toBeCloseTo(0.1, 10)
  })

  it('reduces speed smoothly between 10% and 30% overloaded', () => {
    const atStart = computeEncumbrance(33, 30) // 10%
    const mid = computeEncumbrance(36, 30) // 20%
    const atEnd = computeEncumbrance(38.9, 30) // just under 30%
    expect(mid.speedMultiplier).toBeLessThan(atStart.speedMultiplier)
    expect(atEnd.speedMultiplier).toBeLessThan(mid.speedMultiplier)
    expect(mid.blocked).toBe(false)
    expect(atEnd.blocked).toBe(false)
    // Plan 164 §9 — 10-30% should land around 50-70% speed, never full/zero.
    expect(mid.speedMultiplier).toBeGreaterThan(0.4)
    expect(mid.speedMultiplier).toBeLessThan(0.8)
  })

  it('blocks movement at and above 30% overloaded', () => {
    const atThreshold = computeEncumbrance(39, 30) // exactly 30%
    const wayOver = computeEncumbrance(60, 30) // 100%
    expect(atThreshold.blocked).toBe(true)
    expect(atThreshold.speedMultiplier).toBe(0)
    expect(wayOver.blocked).toBe(true)
    expect(wayOver.speedMultiplier).toBe(0)
  })

  it('has no seam at the band edges (derivative 0 — no visible speed pop)', () => {
    const justBefore = computeEncumbrance(30 * 1.0999, 30)
    const justAfter = computeEncumbrance(30 * 1.1001, 30)
    expect(Math.abs(justBefore.speedMultiplier - justAfter.speedMultiplier)).toBeLessThan(0.01)
  })

  it('treats a non-positive capacity as unlimited (never divides by zero)', () => {
    expect(computeEncumbrance(50, 0)).toEqual({ speedMultiplier: 1, blocked: false, overloadFraction: 0 })
    expect(computeEncumbrance(50, -5)).toEqual({ speedMultiplier: 1, blocked: false, overloadFraction: 0 })
  })
})
