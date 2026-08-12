import { describe, expect, it } from 'vitest'
import { isCoastalPlacement } from './coastPlacement'

describe('isCoastalPlacement', () => {
  it('flags low shore relative to water', () => {
    expect(isCoastalPlacement(0, 0, {
      sampleHeight: () => 1.0,
      waterLevel: 0,
    })).toBe(true)
  })

  it('allows inland height without continentalness', () => {
    expect(isCoastalPlacement(0, 0, {
      sampleHeight: () => 5,
      waterLevel: 0,
    })).toBe(false)
  })

  it('flags continentalness below coast band', () => {
    expect(isCoastalPlacement(0, 0, {
      sampleHeight: () => 8,
      waterLevel: 0,
      sampleContinentalness: () => 0.4,
      coastThreshold: 0.45,
    })).toBe(true)
  })

  it('allows inland continentalness', () => {
    expect(isCoastalPlacement(0, 0, {
      sampleHeight: () => 8,
      waterLevel: 0,
      sampleContinentalness: () => 0.7,
      coastThreshold: 0.45,
    })).toBe(false)
  })
})
