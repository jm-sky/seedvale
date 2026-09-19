import { describe, expect, it } from 'vitest'
import {
  advanceMerchantJourneyToVisiting,
  cloneMerchantJourney,
  isNpcAwayOnMerchantJourney,
  type MerchantJourneyHost,
  resolveMerchantReturnArrival,
  TRAVELLING_MERCHANT_VISIT_DAYS,
  tryBeginMerchantReturn,
} from './merchantJourney'

function makeHost(overrides: Partial<MerchantJourneyHost> = {}): MerchantJourneyHost {
  return {
    merchantJourney: null,
    travel: null,
    accompanyCommitment: null,
    health: { dead: false },
    ...overrides,
  }
}

describe('isNpcAwayOnMerchantJourney', () => {
  it('is false with no journey and true with any active journey', () => {
    expect(isNpcAwayOnMerchantJourney({ merchantJourney: null })).toBe(false)
    expect(isNpcAwayOnMerchantJourney({
      merchantJourney: { homeSettlementId: 'a', destinationSettlementId: 'b', phase: 'outbound' },
    })).toBe(true)
  })
})

describe('cloneMerchantJourney', () => {
  it('returns null for null/undefined and a distinct shallow copy otherwise', () => {
    expect(cloneMerchantJourney(null)).toBeNull()
    expect(cloneMerchantJourney(undefined)).toBeNull()
    const journey = { homeSettlementId: 'a', destinationSettlementId: 'b', phase: 'outbound' as const }
    const clone = cloneMerchantJourney(journey)
    expect(clone).toEqual(journey)
    expect(clone).not.toBe(journey)
  })
})

describe('advanceMerchantJourneyToVisiting', () => {
  it('transitions a matching outbound journey to visiting with an absolute visit window', () => {
    const host = makeHost({
      merchantJourney: {
        homeSettlementId: 'a', destinationSettlementId: 'b', phase: 'outbound', transportOrderId: 'order:1',
      },
    })
    advanceMerchantJourneyToVisiting(host, 'order:1', 10)
    expect(host.merchantJourney).toEqual({
      homeSettlementId: 'a',
      destinationSettlementId: 'b',
      phase: 'visiting',
      visitStartedAtDays: 10,
      visitEndsAtDays: 10 + TRAVELLING_MERCHANT_VISIT_DAYS,
    })
  })

  it('does nothing without an active journey', () => {
    const host = makeHost()
    advanceMerchantJourneyToVisiting(host, 'order:1', 10)
    expect(host.merchantJourney).toBeNull()
  })

  it('preserves an assigned packAnimalId across the transition', () => {
    const host = makeHost({
      merchantJourney: {
        homeSettlementId: 'a', destinationSettlementId: 'b', phase: 'outbound', transportOrderId: 'order:1', packAnimalId: 'horse-house0-0',
      },
    })
    advanceMerchantJourneyToVisiting(host, 'order:1', 10)
    expect(host.merchantJourney?.packAnimalId).toBe('horse-house0-0')
  })

  it('ignores an order id that does not match the journey', () => {
    const host = makeHost({
      merchantJourney: {
        homeSettlementId: 'a', destinationSettlementId: 'b', phase: 'outbound', transportOrderId: 'order:1',
      },
    })
    advanceMerchantJourneyToVisiting(host, 'order:other', 10)
    expect(host.merchantJourney?.phase).toBe('outbound')
  })

  it('is idempotent — a second delivery-completion pass does not restart the visit timer', () => {
    const host = makeHost({
      merchantJourney: {
        homeSettlementId: 'a', destinationSettlementId: 'b', phase: 'outbound', transportOrderId: 'order:1',
      },
    })
    advanceMerchantJourneyToVisiting(host, 'order:1', 10)
    advanceMerchantJourneyToVisiting(host, 'order:1', 999)
    expect(host.merchantJourney?.visitStartedAtDays).toBe(10)
  })
})

describe('tryBeginMerchantReturn', () => {
  const visiting = () => ({
    homeSettlementId: 'a', destinationSettlementId: 'b', phase: 'visiting' as const,
    visitStartedAtDays: 5, visitEndsAtDays: 7,
  })

  it('does nothing before the visit window elapses', () => {
    const host = makeHost({ merchantJourney: visiting() })
    tryBeginMerchantReturn(host, 6, 480, () => ({ origin: { x: 0, z: 0 }, homeTarget: { x: 1, z: 1 }, live: false }))
    expect(host.merchantJourney?.phase).toBe('visiting')
    expect(host.travel).toBeNull()
  })

  it('starts off-screen return travel once expired and the destination is not live', () => {
    const host = makeHost({ merchantJourney: visiting() })
    tryBeginMerchantReturn(host, 7, 480, () => ({ origin: { x: 0, z: 0 }, homeTarget: { x: 100, z: 0 }, live: false }))
    expect(host.merchantJourney).toMatchObject({ phase: 'returning' })
    expect(host.travel?.purpose).toEqual({ kind: 'merchant-return', homeSettlementId: 'a' })
    expect(host.travel?.execution).toBeDefined()
  })

  it('preserves an assigned packAnimalId into the returning phase', () => {
    const host = makeHost({ merchantJourney: { ...visiting(), packAnimalId: 'horse-house0-0' } })
    tryBeginMerchantReturn(host, 7, 480, () => ({ origin: { x: 0, z: 0 }, homeTarget: { x: 100, z: 0 }, live: false }))
    expect(host.merchantJourney?.packAnimalId).toBe('horse-house0-0')
  })

  it('sets a live (no-execution) return commitment when a live agent still exists at the destination', () => {
    const host = makeHost({ merchantJourney: visiting() })
    tryBeginMerchantReturn(host, 7, 480, () => ({ origin: { x: 0, z: 0 }, homeTarget: { x: 100, z: 0 }, live: true }))
    expect(host.merchantJourney).toMatchObject({ phase: 'returning' })
    expect(host.travel?.execution).toBeUndefined()
    expect(host.travel?.purpose).toEqual({ kind: 'merchant-return', homeSettlementId: 'a' })
  })

  it('leaves the journey visiting when positions cannot yet be resolved', () => {
    const host = makeHost({ merchantJourney: visiting() })
    tryBeginMerchantReturn(host, 7, 480, () => null)
    expect(host.merchantJourney?.phase).toBe('visiting')
    expect(host.travel).toBeNull()
  })

  it('never starts a return for a dead merchant', () => {
    const host = makeHost({ merchantJourney: visiting(), health: { dead: true } })
    tryBeginMerchantReturn(host, 7, 480, () => ({ origin: { x: 0, z: 0 }, homeTarget: { x: 100, z: 0 }, live: false }))
    expect(host.merchantJourney?.phase).toBe('visiting')
  })

  it('does nothing outside the visiting phase', () => {
    const host = makeHost({
      merchantJourney: { homeSettlementId: 'a', destinationSettlementId: 'b', phase: 'outbound' },
    })
    tryBeginMerchantReturn(host, 100, 480, () => ({ origin: { x: 0, z: 0 }, homeTarget: { x: 1, z: 1 }, live: false }))
    expect(host.merchantJourney?.phase).toBe('outbound')
  })
})

describe('resolveMerchantReturnArrival', () => {
  it('clears the journey and travel on a genuine merchant-return arrival', () => {
    const host = makeHost({
      merchantJourney: { homeSettlementId: 'a', destinationSettlementId: 'b', phase: 'returning' },
      travel: {
        destination: { x: 1, z: 1 },
        lastPosition: { x: 1, z: 1 },
        purpose: { kind: 'merchant-return', homeSettlementId: 'a' },
        arrival: 'reached',
      },
    })
    expect(resolveMerchantReturnArrival(host)).toBe(true)
    expect(host.merchantJourney).toBeNull()
    expect(host.travel).toBeNull()
  })

  it('is false when the travel has not reached yet', () => {
    const host = makeHost({
      merchantJourney: { homeSettlementId: 'a', destinationSettlementId: 'b', phase: 'returning' },
      travel: {
        destination: { x: 1, z: 1 },
        lastPosition: { x: 0, z: 0 },
        purpose: { kind: 'merchant-return', homeSettlementId: 'a' },
      },
    })
    expect(resolveMerchantReturnArrival(host)).toBe(false)
    expect(host.merchantJourney?.phase).toBe('returning')
  })

  it('is false for a blocked (dead/stalled) return', () => {
    const host = makeHost({
      merchantJourney: { homeSettlementId: 'a', destinationSettlementId: 'b', phase: 'returning' },
      travel: {
        destination: { x: 1, z: 1 },
        lastPosition: { x: 0, z: 0 },
        purpose: { kind: 'merchant-return', homeSettlementId: 'a' },
        arrival: 'reached',
        blocked: true,
      },
    })
    expect(resolveMerchantReturnArrival(host)).toBe(false)
    expect(host.merchantJourney).not.toBeNull()
  })

  it('is false for an unrelated travel purpose or phase', () => {
    const host = makeHost({
      merchantJourney: { homeSettlementId: 'a', destinationSettlementId: 'b', phase: 'outbound' },
      travel: {
        destination: { x: 1, z: 1 },
        lastPosition: { x: 1, z: 1 },
        purpose: { kind: 'transport', orderId: 'order:1' },
        arrival: 'reached',
      },
    })
    expect(resolveMerchantReturnArrival(host)).toBe(false)
  })
})
