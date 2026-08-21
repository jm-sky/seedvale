import { describe, expect, it } from 'vitest'
import {
  applySlopeMovementConstraint,
  sampleSlope,
  SLOPE_FALLOFF_START_DEG,
  SLOPE_MAX_WALKABLE_DEG,
} from './slopeConstraint'

/** Height field sloping downhill in +x (uphill direction is -x). */
function slopedHeight(angleDeg: number) {
  const angle = (angleDeg * Math.PI) / 180
  return (x: number, _z: number) => -x * Math.tan(angle)
}

describe('slopeConstraint', () => {
  it('flat terrain leaves movement at full speed in any direction', () => {
    const flat = () => 0
    const wish = applySlopeMovementConstraint(3, -2, 0, 0, flat)
    expect(wish.x).toBeCloseTo(3)
    expect(wish.z).toBeCloseTo(-2)
  })

  it('scales down uphill movement between the falloff start and max walkable angle', () => {
    const midAngle = (SLOPE_FALLOFF_START_DEG + SLOPE_MAX_WALKABLE_DEG) / 2
    const sampleHeight = slopedHeight(midAngle)
    // (-4, 0) points uphill (toward -x).
    const wish = applySlopeMovementConstraint(-4, 0, 0, 0, sampleHeight)
    expect(wish.x).toBeLessThan(0)
    expect(wish.x).toBeGreaterThan(-4)
    expect(wish.z).toBeCloseTo(0)
  })

  it('does not affect movement across the slope', () => {
    const sampleHeight = slopedHeight(SLOPE_MAX_WALKABLE_DEG + 5)
    // (0, 4) is perpendicular to the uphill direction (-x, 0).
    const wish = applySlopeMovementConstraint(0, 4, 0, 0, sampleHeight)
    expect(wish.x).toBeCloseTo(0)
    expect(wish.z).toBeCloseTo(4)
  })

  it('does not affect downhill movement, even past the max walkable angle', () => {
    const sampleHeight = slopedHeight(SLOPE_MAX_WALKABLE_DEG + 5)
    // (4, 0) points downhill (toward +x).
    const wish = applySlopeMovementConstraint(4, 0, 0, 0, sampleHeight)
    expect(wish.x).toBeCloseTo(4)
    expect(wish.z).toBeCloseTo(0)
  })

  it('fully blocks uphill movement beyond the max walkable angle', () => {
    const sampleHeight = slopedHeight(SLOPE_MAX_WALKABLE_DEG + 5)
    const wish = applySlopeMovementConstraint(-4, 0, 0, 0, sampleHeight)
    expect(wish.x).toBeCloseTo(0)
    expect(wish.z).toBeCloseTo(0)
  })

  it('slides sideways along a too-steep slope instead of stopping the whole vector', () => {
    const sampleHeight = slopedHeight(SLOPE_MAX_WALKABLE_DEG + 5)
    // Diagonal: uphill component blocked, across-slope component preserved.
    const wish = applySlopeMovementConstraint(-3, 2, 0, 0, sampleHeight)
    expect(wish.x).toBeCloseTo(0)
    expect(wish.z).toBeCloseTo(2)
  })

  it('sampleSlope reports zero angle and no direction on flat ground', () => {
    const slope = sampleSlope(0, 0, () => 5)
    expect(slope.angleRad).toBe(0)
    expect(slope.upX).toBe(0)
    expect(slope.upZ).toBe(0)
  })
})
