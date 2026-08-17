import { describe, expect, it } from 'vitest'
import { scorchFalloffAt } from './buildChunkGeometry'

describe('scorchFalloffAt (plan 137)', () => {
  it('is 1 at the center and 0 at/beyond the radius', () => {
    const patches = [{ x: 0, z: 0, radius: 10 }]
    expect(scorchFalloffAt(0, 0, patches)).toBeCloseTo(1, 5)
    expect(scorchFalloffAt(10, 0, patches)).toBe(0)
    expect(scorchFalloffAt(20, 0, patches)).toBe(0)
  })

  it('falls off smoothly inside the radius', () => {
    const mid = scorchFalloffAt(5, 0, [{ x: 0, z: 0, radius: 10 }])
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('takes the max of overlapping patches', () => {
    const patches = [
      { x: 0, z: 0, radius: 4 },
      { x: 0, z: 0, radius: 10 },
    ]
    expect(scorchFalloffAt(0, 0, patches)).toBeCloseTo(1, 5)
  })
})
