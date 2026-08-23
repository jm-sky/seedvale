import { describe, expect, it } from 'vitest'
import type { LodgingOption } from './lodging'
import {
  collectLodgingCandidates,
  type LodgingSettlementInput,
  resolveBestLodging,
} from './lodgingResolver'

function option(overrides: Partial<LodgingOption> & Pick<LodgingOption, 'id' | 'type' | 'quality'>): LodgingOption {
  return {
    settlementId: 's',
    position: { x: 0, z: 0 },
    approachPoint: { x: 0, z: 0 },
    facing: null,
    ...overrides,
  }
}

describe('resolveBestLodging', () => {
  it('returns null with no candidates', () => {
    expect(resolveBestLodging([], { x: 0, z: 0 })).toBeNull()
  })

  it('prefers bed over any other class regardless of quality/distance', () => {
    const bed = option({ id: 'bed', type: 'bed', quality: 'high', approachPoint: { x: 100, z: 100 } })
    const friend = option({ id: 'friend', type: 'friend', quality: 'normal', approachPoint: { x: 0, z: 0 } })
    expect(resolveBestLodging([friend, bed], { x: 0, z: 0 })).toBe(bed)
  })

  it('prefers friend over paid', () => {
    const friend = option({ id: 'friend', type: 'friend', quality: 'normal', approachPoint: { x: 50, z: 0 } })
    const paid = option({ id: 'paid', type: 'paid', quality: 'normal', approachPoint: { x: 0, z: 0 }, price: 5 })
    expect(resolveBestLodging([paid, friend], { x: 0, z: 0 })).toBe(friend)
  })

  it('prefers paid over hay', () => {
    const paid = option({ id: 'paid', type: 'paid', quality: 'normal', price: 5 })
    const hay = option({ id: 'hay', type: 'hay', quality: 'low' })
    expect(resolveBestLodging([hay, paid], { x: 0, z: 0 })).toBe(paid)
  })

  it('does not let distance override the priority class', () => {
    const nearHay = option({ id: 'hay', type: 'hay', quality: 'low', approachPoint: { x: 1, z: 0 } })
    const farFriend = option({ id: 'friend', type: 'friend', quality: 'normal', approachPoint: { x: 1000, z: 0 } })
    expect(resolveBestLodging([nearHay, farFriend], { x: 0, z: 0 })).toBe(farFriend)
  })

  it('breaks ties within a class by quality desc, then distance asc', () => {
    const near = option({ id: 'friend-b', type: 'friend', quality: 'normal', approachPoint: { x: 1, z: 0 } })
    const far = option({ id: 'friend-a', type: 'friend', quality: 'normal', approachPoint: { x: 10, z: 0 } })
    expect(resolveBestLodging([far, near], { x: 0, z: 0 })).toBe(near)
  })

  it('breaks a full tie deterministically by id, not randomly', () => {
    const a = option({ id: 'a', type: 'hay', quality: 'low', approachPoint: { x: 1, z: 0 } })
    const b = option({ id: 'b', type: 'hay', quality: 'low', approachPoint: { x: 1, z: 0 } })
    expect(resolveBestLodging([b, a], { x: 0, z: 0 })).toBe(a)
    expect(resolveBestLodging([a, b], { x: 0, z: 0 })).toBe(a)
  })
})

function settlement(overrides: Partial<LodgingSettlementInput>): LodgingSettlementInput {
  return {
    id: 'settlement-1',
    npcs: [],
    houses: [],
    haySpot: null,
    ...overrides,
  }
}

describe('collectLodgingCandidates — friend lodging', () => {
  it('produces a candidate for a friendly NPC with an available household home', () => {
    const s = settlement({
      npcs: [{ name: 'Anna', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' } }],
      houses: [{ x: 5, z: 7 }],
    })
    const candidates = collectLodgingCandidates([s], {
      getPlayerSocial: () => ({ relationLevel: 'friendly', standing: 0 }),
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ type: 'friend', ownerName: 'Anna', approachPoint: { x: 5, z: 7 } })
  })

  it('produces no candidate for a stranger', () => {
    const s = settlement({
      npcs: [{ name: 'Anna', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' } }],
      houses: [{ x: 5, z: 7 }],
    })
    const candidates = collectLodgingCandidates([s], {
      getPlayerSocial: () => ({ relationLevel: 'stranger', standing: 0 }),
    })
    expect(candidates).toHaveLength(0)
  })

  it('produces no candidate for an NPC without a household', () => {
    const s = settlement({ npcs: [{ name: 'Anna', household: null }], houses: [{ x: 5, z: 7 }] })
    const candidates = collectLodgingCandidates([s], {
      getPlayerSocial: () => ({ relationLevel: 'trusted', standing: 0 }),
    })
    expect(candidates).toHaveLength(0)
  })

  it('does not duplicate a candidate for two family members sharing one household', () => {
    const household = { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' }
    const s = settlement({
      npcs: [{ name: 'Anna', household }, { name: 'Piotr', household }],
      houses: [{ x: 5, z: 7 }],
    })
    const candidates = collectLodgingCandidates([s], {
      getPlayerSocial: () => ({ relationLevel: 'trusted', standing: 0 }),
    })
    expect(candidates).toHaveLength(1)
  })
})

describe('collectLodgingCandidates — hay fallback', () => {
  it('always offers hay when the settlement has a hay spot', () => {
    const s = settlement({ haySpot: { x: 3, z: 4 } })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => ({ relationLevel: 'stranger', standing: 0 }) })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ type: 'hay', quality: 'low', approachPoint: { x: 3, z: 4 } })
  })

  it('offers nothing when the settlement has no hay spot and no other source', () => {
    const s = settlement({})
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => ({ relationLevel: 'trusted', standing: 0 }) })
    expect(candidates).toHaveLength(0)
  })
})
