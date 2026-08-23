import { describe, expect, it } from 'vitest'
import type { LodgingOption } from './lodging'
import { lodgingPlaceLabel, lodgingRestQuality } from './lodging'

describe('lodgingRestQuality', () => {
  it('maps bed to the highest fraction', () => {
    expect(lodgingRestQuality('high')).toBe(1)
  })

  it('maps hay to a lower fraction than a paid/friend stay', () => {
    expect(lodgingRestQuality('low')).toBeLessThan(lodgingRestQuality('normal'))
    expect(lodgingRestQuality('normal')).toBeLessThan(lodgingRestQuality('high'))
  })
})

describe('lodgingPlaceLabel', () => {
  function option(overrides: Partial<LodgingOption>): LodgingOption {
    return {
      id: 'x',
      type: 'hay',
      settlementId: 's',
      position: { x: 0, z: 0 },
      approachPoint: { x: 0, z: 0 },
      facing: null,
      quality: 'low',
      ...overrides,
    }
  }

  it('includes the owner name for a friend stay', () => {
    expect(lodgingPlaceLabel(option({ type: 'friend', ownerName: 'Anna' }))).toContain('Anna')
  })

  it('falls back to a plain type label without an owner', () => {
    expect(lodgingPlaceLabel(option({ type: 'hay' }))).toBe('Stóg siana')
  })
})
