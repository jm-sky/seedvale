import { describe, expect, it } from 'vitest'
import { DISTANCE_MAX, DISTANCE_REF, distanceGain } from './createWorldAudio'

describe('distanceGain', () => {
  it('is full volume at and inside refDistance', () => {
    expect(distanceGain(0)).toBe(1)
    expect(distanceGain(DISTANCE_REF)).toBe(1)
    expect(distanceGain(DISTANCE_REF - 0.5)).toBe(1)
  })

  it('is silent at and beyond maxDistance', () => {
    expect(distanceGain(DISTANCE_MAX)).toBe(0)
    expect(distanceGain(DISTANCE_MAX + 10)).toBe(0)
  })

  it('falls linearly between ref and max', () => {
    const mid = (DISTANCE_REF + DISTANCE_MAX) / 2
    expect(distanceGain(mid)).toBeCloseTo(0.5, 5)
    expect(distanceGain(DISTANCE_REF + 1)).toBeGreaterThan(distanceGain(DISTANCE_REF + 2))
  })
})
