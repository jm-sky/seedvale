import { describe, expect, it } from 'vitest'
import { smax, smin } from './caveMath'

describe('caveMath smin/smax', () => {
  it('falls back to hard min/max when k <= 0', () => {
    expect(smin(2, 5, 0)).toBe(2)
    expect(smin(2, 5, -1)).toBe(2)
    expect(smax(2, 5, 0)).toBe(5)
  })

  it('smin(a, a, k) shrinks by k/4 — the fold-bias identity', () => {
    expect(smin(3, 3, 0.8)).toBeCloseTo(3 - 0.8 / 4, 10)
  })

  it('smax is the negation dual of smin', () => {
    expect(smax(1, 4, 0.5)).toBeCloseTo(-smin(-1, -4, 0.5), 10)
  })
})
