import { describe, expect, it } from 'vitest'
import {
  deterministicEveningOfferWindowStart,
  isWithinEveningOfferWindow,
} from './guardEveningOfferWindow'

describe('guardEveningOfferWindow', () => {
  it('is deterministic for the same day inputs', () => {
    const a = deterministicEveningOfferWindowStart(42, 'home:npc:1', 3.25)
    const b = deterministicEveningOfferWindowStart(42, 'home:npc:1', 3.9)
    expect(a).toBe(b)
  })

  it('varies across days', () => {
    const day0 = deterministicEveningOfferWindowStart(42, 'home:npc:1', 0.1)
    const day1 = deterministicEveningOfferWindowStart(42, 'home:npc:1', 1.1)
    expect(day0).not.toBe(day1)
  })

  it('matches membership for a point inside the window', () => {
    const start = deterministicEveningOfferWindowStart(7, 'home:npc:guard', 2)
    const inside = start + 0.01
    expect(isWithinEveningOfferWindow(7, 'home:npc:guard', 2, inside)).toBe(true)
    expect(isWithinEveningOfferWindow(7, 'home:npc:guard', 2, start - 0.01)).toBe(false)
  })
})
