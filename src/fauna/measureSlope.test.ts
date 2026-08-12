import { describe, expect, it } from 'vitest'
import { measureSlope } from './createFauna'

describe('measureSlope (plan 083 — cave slope-aware siting)', () => {
  it('reports zero drop on flat ground', () => {
    const flat = () => 10
    const result = measureSlope(0, 0, 3, flat)
    expect(result.drop).toBe(0)
  })

  it('finds the steepest-descent direction on a simple slope (downhill = +X)', () => {
    // Height decreases as x increases — steepest descent is toward +X.
    const slope = (x: number) => 10 - x * 0.5
    const result = measureSlope(0, 0, 3, slope)
    expect(result.drop).toBeGreaterThan(0)
    // atan2(dx, dz) convention: +X direction (dz≈0) -> yaw ≈ π/2.
    expect(result.yaw).toBeCloseTo(Math.PI / 2, 1)
  })

  it('finds downhill toward +Z when height decreases with z', () => {
    const slope = (_x: number, z: number) => 10 - z * 0.5
    const result = measureSlope(0, 0, 3, slope)
    expect(result.drop).toBeGreaterThan(0)
    // +Z direction (dx≈0) -> yaw ≈ 0.
    expect(result.yaw).toBeCloseTo(0, 1)
  })
})
