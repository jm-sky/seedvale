import { describe, expect, it } from 'vitest'
import type { LodgingOption } from './lodging'
import { hayLodgingId } from './lodging'
import {
  collectLodgingCandidates,
  type LodgingSettlementInput,
  resolveBestLodging,
  selectLodgingFromCandidates,
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

function house(overrides: { x: number, z: number, bed?: LodgingSettlementInput['houses'][number]['bed'] }) {
  return { bed: null, ...overrides }
}

describe('collectLodgingCandidates — friend lodging', () => {
  it('produces a candidate for a friendly NPC with an available household home', () => {
    const s = settlement({
      npcs: [{ name: 'Anna', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' } }],
      houses: [house({ x: 5, z: 7 })],
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
      houses: [house({ x: 5, z: 7 })],
    })
    const candidates = collectLodgingCandidates([s], {
      getPlayerSocial: () => ({ relationLevel: 'stranger', standing: 0 }),
    })
    expect(candidates).toHaveLength(0)
  })

  it('produces no candidate for an NPC without a household', () => {
    const s = settlement({ npcs: [{ name: 'Anna', household: null }], houses: [house({ x: 5, z: 7 })] })
    const candidates = collectLodgingCandidates([s], {
      getPlayerSocial: () => ({ relationLevel: 'trusted', standing: 0 }),
    })
    expect(candidates).toHaveLength(0)
  })

  it('does not duplicate a candidate for two family members sharing one household', () => {
    const household = { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' }
    const s = settlement({
      npcs: [{ name: 'Anna', household }, { name: 'Piotr', household }],
      houses: [house({ x: 5, z: 7 })],
    })
    const candidates = collectLodgingCandidates([s], {
      getPlayerSocial: () => ({ relationLevel: 'trusted', standing: 0 }),
    })
    expect(candidates).toHaveLength(1)
  })
})

describe('collectLodgingCandidates — bed lodging (plan 169 provider)', () => {
  it('produces a high-quality bed candidate for a house with a bed', () => {
    const s = settlement({
      houses: [house({
        x: 5,
        z: 7,
        bed: { position: { x: 5.2, z: 7.1 }, approach: { x: 5.5, z: 7.4 }, facing: 1.2 },
      })],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => ({ relationLevel: 'stranger', standing: 0 }) })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      id: 'settlement-1:bed:0',
      type: 'bed',
      quality: 'high',
      position: { x: 5.2, z: 7.1 },
      approachPoint: { x: 5.5, z: 7.4 },
      facing: 1.2,
    })
  })

  it('produces no bed candidate for a house without one', () => {
    const s = settlement({ houses: [house({ x: 5, z: 7 })] })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => ({ relationLevel: 'stranger', standing: 0 }) })
    expect(candidates).toHaveLength(0)
  })

  it('a bed beats a friendly NPC in the same settlement (class priority)', () => {
    const household = { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' }
    const s = settlement({
      npcs: [{ name: 'Anna', household }],
      houses: [house({
        x: 5,
        z: 7,
        bed: { position: { x: 5, z: 7 }, approach: { x: 5, z: 7 }, facing: null },
      })],
    })
    const candidates = collectLodgingCandidates([s], {
      getPlayerSocial: () => ({ relationLevel: 'friendly', standing: 0 }),
    })
    const best = resolveBestLodging(candidates, { x: 0, z: 0 })
    expect(best?.type).toBe('bed')
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

  it('uses the same id `RestActions.sleepInHay` resolves against', () => {
    const s = settlement({ id: 'village-a', haySpot: { x: 3, z: 4 } })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => ({ relationLevel: 'stranger', standing: 0 }) })
    expect(candidates[0]?.id).toBe(hayLodgingId('village-a'))
  })
})

describe('collectLodgingCandidates — multiple sources for the choice panel', () => {
  it('returns every available option, not just the resolver\'s pick — bed, friend and hay all appear', () => {
    // Anna's household lives in house 1 (no bed) so bed/friend anchor on two
    // distinct physical places here — house 0's bed candidate is unrelated.
    const household = { id: 'settlement-1:household:0', homeId: 'settlement-1:home:1' }
    const s = settlement({
      npcs: [{ name: 'Anna', household }],
      houses: [
        house({ x: 5, z: 7, bed: { position: { x: 5, z: 7 }, approach: { x: 5, z: 7 }, facing: null } }),
        house({ x: 9, z: 9 }),
      ],
      haySpot: { x: 1, z: 1 },
    })
    const candidates = collectLodgingCandidates([s], {
      getPlayerSocial: () => ({ relationLevel: 'friendly', standing: 0 }),
    })
    expect(candidates.map((c) => c.type).sort()).toEqual(['bed', 'friend', 'hay'])
  })

  it('collapses a house that is both a bed and a friendly NPC\'s home into one panel entry', () => {
    // Anna's household lives in house 0, which also has a physical bed — the
    // same real place backs both the `bed` and `friend` internal candidates.
    const household = { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' }
    const s = settlement({
      npcs: [{ name: 'Anna', household }],
      houses: [
        house({ x: 5, z: 7, bed: { position: { x: 5, z: 7 }, approach: { x: 5, z: 7 }, facing: null } }),
      ],
    })
    const candidates = collectLodgingCandidates([s], {
      getPlayerSocial: () => ({ relationLevel: 'friendly', standing: 0 }),
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ type: 'bed' })
  })
})

describe('selectLodgingFromCandidates', () => {
  const bed = option({ id: 'bed', type: 'bed', quality: 'high' })
  const paid = option({ id: 'paid', type: 'paid', quality: 'normal', price: 5 })
  const freePaid = option({ id: 'free-paid', type: 'paid', quality: 'normal', price: 0 })

  it('classifies a free option as an immediate walk', () => {
    expect(selectLodgingFromCandidates([bed], 'bed')).toEqual({ kind: 'walk', option: bed })
  })

  it('classifies a priced paid option as needing confirmation', () => {
    expect(selectLodgingFromCandidates([paid], 'paid')).toEqual({ kind: 'confirm', option: paid })
  })

  it('classifies a zero-price paid option as an immediate walk', () => {
    expect(selectLodgingFromCandidates([freePaid], 'free-paid')).toEqual({ kind: 'walk', option: freePaid })
  })

  it('reports unavailable for an id no longer among fresh candidates (stale panel/prompt)', () => {
    expect(selectLodgingFromCandidates([bed], 'gone')).toEqual({ kind: 'unavailable' })
  })

  it('reports unavailable against an empty candidate list', () => {
    expect(selectLodgingFromCandidates([], 'bed')).toEqual({ kind: 'unavailable' })
  })
})
