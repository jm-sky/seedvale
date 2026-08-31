import { describe, expect, it } from 'vitest'
import type { LodgingOption } from './lodging'
import {
  advanceLodgingProgress,
  hayLodgingId,
  initialLodgingProgress,
  LODGING_STUCK_TIMEOUT_SEC,
  lodgingChoiceLabel,
  lodgingPlaceLabel,
  lodgingRequiresPayment,
  lodgingRestQuality,
} from './lodging'

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

describe('advanceLodgingProgress', () => {
  it('starts with no best distance and zero elapsed stuck time', () => {
    expect(initialLodgingProgress()).toEqual({ bestDistance: null, stuckSeconds: 0 })
  })

  it('a meaningful distance reduction records progress and never reports stuck', () => {
    const step1 = advanceLodgingProgress(initialLodgingProgress(), 10, 5)
    expect(step1.stuck).toBe(false)
    expect(step1.state).toEqual({ bestDistance: 10, stuckSeconds: 0 })

    const step2 = advanceLodgingProgress(step1.state, 8, 5)
    expect(step2.stuck).toBe(false)
    expect(step2.state).toEqual({ bestDistance: 8, stuckSeconds: 0 })
  })

  it('a long walk with continuous small reductions never accumulates stuck time', () => {
    let progress = initialLodgingProgress()
    let distance = 100
    for (let i = 0; i < 50; i++) {
      distance -= 0.5
      const advanced = advanceLodgingProgress(progress, distance, 1)
      expect(advanced.stuck).toBe(false)
      progress = advanced.state
    }
    expect(progress.stuckSeconds).toBe(0)
  })

  it('a tiny change below the progress epsilon does not reset the watchdog', () => {
    const armed = advanceLodgingProgress(initialLodgingProgress(), 10, 0).state
    const advanced = advanceLodgingProgress(armed, 9.98, 3)
    expect(advanced.stuck).toBe(false)
    expect(advanced.state.bestDistance).toBe(10)
    expect(advanced.state.stuckSeconds).toBe(3)
  })

  it('reports stuck only once the no-progress timeout is reached', () => {
    const armed = advanceLodgingProgress(initialLodgingProgress(), 10, 0).state
    const beforeTimeout = advanceLodgingProgress(armed, 10, LODGING_STUCK_TIMEOUT_SEC - 0.1)
    expect(beforeTimeout.stuck).toBe(false)

    const atTimeout = advanceLodgingProgress(armed, 10, LODGING_STUCK_TIMEOUT_SEC)
    expect(atTimeout.stuck).toBe(true)
  })

  it('resumed progress after a stall resets the stuck timer', () => {
    const armed = advanceLodgingProgress(initialLodgingProgress(), 10, 0).state
    const stalled = advanceLodgingProgress(armed, 10, LODGING_STUCK_TIMEOUT_SEC - 1)
    expect(stalled.stuck).toBe(false)

    const resumed = advanceLodgingProgress(stalled.state, 9, 1)
    expect(resumed.stuck).toBe(false)
    expect(resumed.state).toEqual({ bestDistance: 9, stuckSeconds: 0 })
  })
})
