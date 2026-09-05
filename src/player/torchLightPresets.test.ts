import { describe, expect, it } from 'vitest'
import {
  resolveTorchLight,
  TORCH_CAVE_DISTANCE_MULTIPLIER,
  TORCH_CAVE_INTENSITY_MULTIPLIER,
  TORCH_LIGHT_BRANCH,
  TORCH_LIGHT_WOODEN,
} from './torchLightPresets'

describe('resolveTorchLight', () => {
  it('matches the plain preset outside a cave, scaled only by fuel ratio', () => {
    const result = resolveTorchLight(TORCH_LIGHT_BRANCH, 0.5, false)
    expect(result.intensity).toBeCloseTo(TORCH_LIGHT_BRANCH.intensity * 0.5)
    expect(result.distance).toBeCloseTo(TORCH_LIGHT_BRANCH.distance)
  })

  it('applies the cave multipliers on top of fuel ratio while inside a cave', () => {
    const result = resolveTorchLight(TORCH_LIGHT_BRANCH, 1, true)
    expect(result.intensity).toBeCloseTo(TORCH_LIGHT_BRANCH.intensity * TORCH_CAVE_INTENSITY_MULTIPLIER)
    expect(result.distance).toBeCloseTo(TORCH_LIGHT_BRANCH.distance * TORCH_CAVE_DISTANCE_MULTIPLIER)
  })

  it('does not touch distance/intensity multipliers for the wooden torch outside a cave', () => {
    const result = resolveTorchLight(TORCH_LIGHT_WOODEN, 1, false)
    expect(result.intensity).toBeCloseTo(TORCH_LIGHT_WOODEN.intensity)
    expect(result.distance).toBeCloseTo(TORCH_LIGHT_WOODEN.distance)
  })

  it('scales the wooden torch cave distance to roughly the point-start reference (~24 m)', () => {
    const result = resolveTorchLight(TORCH_LIGHT_WOODEN, 1, true)
    expect(result.distance).toBeCloseTo(24.2, 1)
  })
})
