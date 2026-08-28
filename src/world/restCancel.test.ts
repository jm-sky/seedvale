import { describe, expect, it } from 'vitest'
import {
  canCancelRestNow,
  canCancelRestProgress,
  REST_CANCEL_PROGRESS_THRESHOLD,
  REST_CANCEL_VIGOR_THRESHOLD,
  restCancelAllowedByStartVigor,
} from '../items/items'

describe('canCancelRestProgress', () => {
  it('blocks at exactly 85%', () => {
    expect(canCancelRestProgress(REST_CANCEL_PROGRESS_THRESHOLD)).toBe(false)
  })

  it('allows just above 85%', () => {
    expect(canCancelRestProgress(REST_CANCEL_PROGRESS_THRESHOLD + 0.001)).toBe(true)
  })

  it('blocks null and zero progress', () => {
    expect(canCancelRestProgress(null)).toBe(false)
    expect(canCancelRestProgress(0)).toBe(false)
  })
})

describe('restCancelAllowedByStartVigor', () => {
  it('grants immediate cancel when starting vigor is above 50%', () => {
    expect(restCancelAllowedByStartVigor(REST_CANCEL_VIGOR_THRESHOLD + 0.001)).toBe(true)
    expect(restCancelAllowedByStartVigor(1)).toBe(true)
  })

  it('does not grant immediate cancel at exactly 50% (strictly-greater rule)', () => {
    expect(restCancelAllowedByStartVigor(REST_CANCEL_VIGOR_THRESHOLD)).toBe(false)
  })

  it('does not grant immediate cancel below 50%', () => {
    expect(restCancelAllowedByStartVigor(0.2)).toBe(false)
    expect(restCancelAllowedByStartVigor(0)).toBe(false)
  })
})

describe('canCancelRestNow — vigor + progress combined gate', () => {
  it('vigor > 50% at rest start → cancellable from the very first frame (progress 0)', () => {
    const vigorAllowed = restCancelAllowedByStartVigor(0.75)
    expect(canCancelRestNow(0, vigorAllowed)).toBe(true)
  })

  it('vigor == 50% at rest start → no immediate cancel; early progress stays blocked', () => {
    const vigorAllowed = restCancelAllowedByStartVigor(0.5)
    expect(canCancelRestNow(0.1, vigorAllowed)).toBe(false)
  })

  it('vigor < 50% at rest start → existing progress-gated rule is preserved', () => {
    const vigorAllowed = restCancelAllowedByStartVigor(0.3)
    expect(canCancelRestNow(0.1, vigorAllowed)).toBe(false)
    expect(canCancelRestNow(REST_CANCEL_PROGRESS_THRESHOLD + 0.001, vigorAllowed)).toBe(true)
  })

  it('low starting vigor still unlocks once progress crosses the existing threshold', () => {
    const vigorAllowed = restCancelAllowedByStartVigor(0.1)
    expect(canCancelRestNow(REST_CANCEL_PROGRESS_THRESHOLD, vigorAllowed)).toBe(false)
    expect(canCancelRestNow(REST_CANCEL_PROGRESS_THRESHOLD + 0.001, vigorAllowed)).toBe(true)
  })
})
