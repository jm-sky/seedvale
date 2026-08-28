import { describe, expect, it } from 'vitest'
import type { LodgingOption } from './lodging'
import { hayLodgingId, lodgingChoiceLabel, lodgingPlaceLabel, lodgingRequiresPayment, lodgingRestQuality } from './lodging'

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

describe('lodgingRequiresPayment', () => {
  it('is true for a paid option with a positive price', () => {
    expect(lodgingRequiresPayment({
      id: 'x', type: 'paid', settlementId: 's', position: { x: 0, z: 0 }, approachPoint: { x: 0, z: 0 },
      facing: null, quality: 'normal', price: 5,
    })).toBe(true)
  })

  it('is false for hay/friend/bed, even with a stray price field', () => {
    expect(lodgingRequiresPayment({
      id: 'x', type: 'hay', settlementId: 's', position: { x: 0, z: 0 }, approachPoint: { x: 0, z: 0 },
      facing: null, quality: 'low',
    })).toBe(false)
  })

  it('is false for a paid option with no/zero price', () => {
    expect(lodgingRequiresPayment({
      id: 'x', type: 'paid', settlementId: 's', position: { x: 0, z: 0 }, approachPoint: { x: 0, z: 0 },
      facing: null, quality: 'normal', price: 0,
    })).toBe(false)
  })
})

describe('lodgingChoiceLabel', () => {
  it('shows the price for a paid option', () => {
    expect(lodgingChoiceLabel({
      id: 'x', type: 'paid', settlementId: 's', position: { x: 0, z: 0 }, approachPoint: { x: 0, z: 0 },
      facing: null, quality: 'normal', price: 5,
    })).toBe('Płatny nocleg — 5× moneta')
  })

  it('shows the quality label for a free option', () => {
    expect(lodgingChoiceLabel({
      id: 'x', type: 'hay', settlementId: 's', position: { x: 0, z: 0 }, approachPoint: { x: 0, z: 0 },
      facing: null, quality: 'low',
    })).toBe('Stóg siana — Niska jakość')
  })
})

describe('hayLodgingId', () => {
  it('is stable and settlement-scoped', () => {
    expect(hayLodgingId('settlement-1')).toBe('settlement-1:hay')
    expect(hayLodgingId('settlement-1')).not.toBe(hayLodgingId('settlement-2'))
  })
})
