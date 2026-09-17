import { describe, expect, it } from 'vitest'
import {
  distanceBetweenSegments2D,
  segmentHitsCorridor,
} from './segment'

describe('distanceBetweenSegments2D', () => {
  it('returns 0 for crossing segments', () => {
    expect(distanceBetweenSegments2D(0, 0, 4, 0, 2, -2, 2, 2)).toBe(0)
  })

  it('returns perpendicular gap for parallel segments', () => {
    expect(distanceBetweenSegments2D(0, 0, 4, 0, 0, 3, 4, 3)).toBeCloseTo(3)
  })

  it('uses nearest endpoints when segments do not overlap in projection', () => {
    expect(distanceBetweenSegments2D(0, 0, 1, 0, 3, 0, 4, 0)).toBeCloseTo(2)
  })

  it('handles a T-junction as distance 0', () => {
    expect(distanceBetweenSegments2D(0, 0, 4, 0, 2, 0, 2, 3)).toBe(0)
  })

  it('handles a degenerate point segment', () => {
    expect(distanceBetweenSegments2D(1, 1, 1, 1, 0, 0, 4, 0)).toBeCloseTo(1)
  })
})

describe('segmentHitsCorridor', () => {
  const road = [{ ax: 0, az: 0, bx: 20, bz: 0, halfWidth: 2 }]

  it('rejects a fence that crosses the corridor centerline', () => {
    expect(segmentHitsCorridor(10, -5, 10, 5, road, 0.3)).toBe(true)
  })

  it('rejects a fence whose closest approach is inside halfWidth + clearance', () => {
    // Parallel fence 2.2 units away: halfWidth 2 + clearance 0.3 = 2.3 → hit
    expect(segmentHitsCorridor(0, 2.2, 20, 2.2, road, 0.3)).toBe(true)
  })

  it('allows a parallel fence outside halfWidth + clearance', () => {
    expect(segmentHitsCorridor(0, 3, 20, 3, road, 0.3)).toBe(false)
  })

  it('allows a long fence whose midpoint is clear but would only miss if ends clear', () => {
    // Fence far from the road entirely
    expect(segmentHitsCorridor(0, 10, 5, 12, road, 0.3)).toBe(false)
  })

  it('returns false for an empty corridor list', () => {
    expect(segmentHitsCorridor(0, 0, 1, 1, [], 0.3)).toBe(false)
  })
})
