import { describe, expect, it } from 'vitest'
import type { Role } from '../ai/characters'
import type { PlayerSocialState } from '../ai/reactionChance'
import type { RelationLevel } from '../quests/quests'
import type { LodgingOption } from './lodging'
import { NEUTRAL_REPUTATION } from '../reputation/ReputationManager'
import { GUARD_PAID_LODGING_PRICE, hayLodgingId, lodgingChoiceLabel } from './lodging'
import {
  collectLodgingCandidates,
  collectOwnedHouseLodgingOptions,
  type LodgingSettlementInput,
  resolveBestLodging,
  selectLodgingFromCandidates,
} from './lodgingResolver'

/** Lodging only ever reads `relationLevel` (plan quests-progression-001 —
 *  "lodging nadal zależy wyłącznie od relation") — `standing`/`reputation`/
 *  `renown` are filled with neutral placeholders these tests never assert on. */
function socialState(relationLevel: RelationLevel): PlayerSocialState {
  return { relationLevel, standing: 0, reputation: NEUTRAL_REPUTATION, renown: 0 }
}

function option(overrides: Partial<LodgingOption> & Pick<LodgingOption, 'id' | 'type' | 'quality'>): LodgingOption {
  return {
    settlementId: 's',
    position: { x: 0, z: 0 },
    approachPoint: { x: 0, z: 0 },
    facing: null,
    ...overrides,
  }
}

const BED = { position: { x: 5.2, z: 7.1 }, approach: { x: 5.5, z: 7.4 }, facing: 1.2 }

describe('resolveBestLodging', () => {
  it('returns null with no candidates', () => {
    expect(resolveBestLodging([], { x: 0, z: 0 })).toBeNull()
  })

  it('prefers owned house over friend regardless of quality/distance', () => {
    const owned = option({ id: 'owned', type: 'owned_house', quality: 'high', approachPoint: { x: 100, z: 100 } })
    const friend = option({ id: 'friend', type: 'friend', quality: 'normal', approachPoint: { x: 0, z: 0 } })
    expect(resolveBestLodging([friend, owned], { x: 0, z: 0 })).toBe(owned)
  })

  it('prefers friend over paid', () => {
    const friend = option({ id: 'friend', type: 'friend', quality: 'normal', approachPoint: { x: 50, z: 0 } })
    const paid = option({ id: 'paid', type: 'paid', quality: 'normal', approachPoint: { x: 0, z: 0 }, price: 2 })
    expect(resolveBestLodging([paid, friend], { x: 0, z: 0 })).toBe(friend)
  })

  it('prefers paid over hay', () => {
    const paid = option({ id: 'paid', type: 'paid', quality: 'normal', price: 2 })
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

function npc(overrides: {
  id: string
  name: string
  role?: Role
  household: LodgingSettlementInput['npcs'][number]['household']
}): LodgingSettlementInput['npcs'][number] {
  return { role: 'farmer', ...overrides }
}

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

function relations(map: Record<string, RelationLevel>) {
  return ({ npcId }: { npcId: string }) => socialState(map[npcId] ?? 'stranger')
}

describe('collectLodgingCandidates — anonymous beds', () => {
  it('does not create a public option from a physical bed alone', () => {
    const s = settlement({
      houses: [house({ x: 5, z: 7, bed: BED })],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('stranger') })
    expect(candidates).toEqual([])
  })
})

describe('collectLodgingCandidates — friend lodging', () => {
  it('produces no free lodging for a stranger with a household bed', () => {
    const s = settlement({
      npcs: [npc({ id: 'anna', name: 'Anna', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' } })],
      houses: [house({ x: 5, z: 7, bed: BED })],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('stranger') })
    expect(candidates.filter((c) => c.type === 'friend')).toEqual([])
  })

  it('produces no free lodging for an acquainted NPC with a household bed', () => {
    const s = settlement({
      npcs: [npc({ id: 'anna', name: 'Anna', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' } })],
      houses: [house({ x: 5, z: 7, bed: BED })],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('acquainted') })
    expect(candidates.filter((c) => c.type === 'friend')).toEqual([])
  })

  it('produces one normal free offer for a friendly NPC with a household bed', () => {
    const s = settlement({
      npcs: [npc({ id: 'kasia', name: 'Kasia', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' } })],
      houses: [house({ x: 5, z: 7, bed: BED })],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('friendly') })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      type: 'friend',
      ownerName: 'Kasia',
      quality: 'normal',
      position: BED.position,
      approachPoint: BED.approach,
      facing: BED.facing,
      placeId: 'settlement-1:house:0',
    })
  })

  it('produces one high free offer for a trusted NPC with a household bed', () => {
    const s = settlement({
      npcs: [npc({ id: 'marek', name: 'Marek', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' } })],
      houses: [house({ x: 5, z: 7, bed: BED })],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('trusted') })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ type: 'friend', ownerName: 'Marek', quality: 'high' })
  })

  it('uses the physical bed position/approach/facing rather than the house center', () => {
    const s = settlement({
      npcs: [npc({ id: 'anna', name: 'Anna', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' } })],
      houses: [house({ x: 5, z: 7, bed: BED })],
    })
    const [friend] = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('friendly') })
    expect(friend?.position).toEqual(BED.position)
    expect(friend?.approachPoint).toEqual(BED.approach)
    expect(friend?.facing).toBe(BED.facing)
    expect(friend?.position).not.toEqual({ x: 5, z: 7 })
  })

  it('produces no candidate for a friendly NPC whose home has no physical bed', () => {
    const s = settlement({
      npcs: [npc({ id: 'anna', name: 'Anna', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' } })],
      houses: [house({ x: 5, z: 7 })],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('friendly') })
    expect(candidates).toHaveLength(0)
  })

  it('produces no candidate for an NPC without a household', () => {
    const s = settlement({
      npcs: [npc({ id: 'anna', name: 'Anna', household: null })],
      houses: [house({ x: 5, z: 7, bed: BED })],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('trusted') })
    expect(candidates).toHaveLength(0)
  })

  it('emits one row when two eligible NPCs share one home', () => {
    const household = { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' }
    const s = settlement({
      npcs: [
        npc({ id: 'anna', name: 'Anna', household }),
        npc({ id: 'piotr', name: 'Piotr', household }),
      ],
      houses: [house({ x: 5, z: 7, bed: BED })],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('trusted') })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.type).toBe('friend')
  })

  it('picks the household member with the highest relation as the representative', () => {
    const household = { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' }
    const s = settlement({
      npcs: [
        npc({ id: 'anna', name: 'Anna', household }),
        npc({ id: 'piotr', name: 'Piotr', household }),
      ],
      houses: [house({ x: 5, z: 7, bed: BED })],
    })
    const candidates = collectLodgingCandidates([s], {
      getPlayerSocial: relations({ anna: 'friendly', piotr: 'trusted' }),
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ ownerName: 'Piotr', quality: 'high' })
  })

  it('breaks equal relation by stable lowest npc.id independent of source array order', () => {
    const household = { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' }
    const houses = [house({ x: 5, z: 7, bed: BED })]
    const forward = settlement({
      npcs: [
        npc({ id: 'npc-b', name: 'Beata', household }),
        npc({ id: 'npc-a', name: 'Adam', household }),
      ],
      houses,
    })
    const reversed = settlement({
      npcs: [
        npc({ id: 'npc-a', name: 'Adam', household }),
        npc({ id: 'npc-b', name: 'Beata', household }),
      ],
      houses,
    })
    const ctx = { getPlayerSocial: () => socialState('friendly') }
    expect(collectLodgingCandidates([forward], ctx)[0]?.ownerName).toBe('Adam')
    expect(collectLodgingCandidates([reversed], ctx)[0]?.ownerName).toBe('Adam')
  })

  it('emits distinct free rows for different physical homes', () => {
    const s = settlement({
      npcs: [
        npc({ id: 'anna', name: 'Anna', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' } }),
        npc({ id: 'kasia', name: 'Kasia', household: { id: 'settlement-1:household:1', homeId: 'settlement-1:home:1' } }),
      ],
      houses: [
        house({ x: 5, z: 7, bed: { position: { x: 5, z: 7 }, approach: { x: 5.1, z: 7.1 }, facing: 0 } }),
        house({ x: 9, z: 9, bed: { position: { x: 9, z: 9 }, approach: { x: 9.1, z: 9.1 }, facing: 1 } }),
      ],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('friendly') })
    expect(candidates.map((c) => c.ownerName).sort()).toEqual(['Anna', 'Kasia'])
    expect(new Set(candidates.map((c) => c.placeId)).size).toBe(2)
  })
})

describe('collectLodgingCandidates — paid guard lodging', () => {
  it('offers one paid stay when a guard and any settlement bed exist', () => {
    const s = settlement({
      npcs: [npc({ id: 'tomek', name: 'Tomek', role: 'guard', household: null })],
      houses: [house({ x: 5, z: 7, bed: BED })],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('stranger') })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      type: 'paid',
      ownerName: 'Tomek',
      price: GUARD_PAID_LODGING_PRICE,
      quality: 'normal',
      placeId: 'settlement-1:house:0',
      position: BED.position,
      approachPoint: BED.approach,
      facing: BED.facing,
    })
  })

  it('does not require the guard to own the chosen bed', () => {
    const s = settlement({
      npcs: [
        npc({ id: 'anna', name: 'Anna', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' } }),
        npc({ id: 'tomek', name: 'Tomek', role: 'guard', household: null }),
      ],
      houses: [house({ x: 5, z: 7, bed: BED })],
    })
    const paid = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('stranger') })
      .find((c) => c.type === 'paid')
    expect(paid?.householdId).toBeUndefined()
    expect(paid?.placeId).toBe('settlement-1:house:0')
    expect(paid?.ownerName).toBe('Tomek')
  })

  it('selects one paid provider by lowest stable guard id independent of array order', () => {
    const houses = [house({ x: 5, z: 7, bed: BED })]
    const forward = settlement({
      npcs: [
        npc({ id: 'guard-b', name: 'Bartek', role: 'guard', household: null }),
        npc({ id: 'guard-a', name: 'Adam', role: 'guard', household: null }),
      ],
      houses,
    })
    const reversed = settlement({
      npcs: [
        npc({ id: 'guard-a', name: 'Adam', role: 'guard', household: null }),
        npc({ id: 'guard-b', name: 'Bartek', role: 'guard', household: null }),
      ],
      houses,
    })
    const ctx = { getPlayerSocial: () => socialState('stranger') }
    const a = collectLodgingCandidates([forward], ctx).filter((c) => c.type === 'paid')
    const b = collectLodgingCandidates([reversed], ctx).filter((c) => c.type === 'paid')
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
    expect(a[0]?.ownerName).toBe('Adam')
    expect(b[0]?.ownerName).toBe('Adam')
    expect(a[0]?.id).toBe(b[0]?.id)
  })

  it('selects the lowest-index physical bed for the paid offer', () => {
    const laterBed = { position: { x: 1, z: 1 }, approach: { x: 1.1, z: 1.1 }, facing: 0 }
    const earlierBed = { position: { x: 9, z: 9 }, approach: { x: 9.1, z: 9.1 }, facing: 2 }
    const s = settlement({
      npcs: [npc({ id: 'tomek', name: 'Tomek', role: 'guard', household: null })],
      houses: [
        house({ x: 0, z: 0 }),
        house({ x: 9, z: 9, bed: earlierBed }),
        house({ x: 1, z: 1, bed: laterBed }),
      ],
    })
    const paid = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('stranger') })[0]
    expect(paid).toMatchObject({ placeId: 'settlement-1:house:1', position: earlierBed.position })
  })

  it('does not fabricate a paid offer when the settlement has no physical bed', () => {
    const s = settlement({
      npcs: [npc({ id: 'tomek', name: 'Tomek', role: 'guard', household: null })],
      houses: [house({ x: 5, z: 7 })],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('stranger') })
    expect(candidates.filter((c) => c.type === 'paid')).toEqual([])
  })
})

describe('collectLodgingCandidates — hay fallback', () => {
  it('always offers hay when the settlement has a hay spot', () => {
    const s = settlement({ haySpot: { x: 3, z: 4 } })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('stranger') })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ type: 'hay', quality: 'low', approachPoint: { x: 3, z: 4 } })
  })

  it('offers nothing when the settlement has no hay spot and no other source', () => {
    const s = settlement({})
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('trusted') })
    expect(candidates).toHaveLength(0)
  })

  it('uses the same id `RestActions.sleepInHay` resolves against', () => {
    const s = settlement({ id: 'village-a', haySpot: { x: 3, z: 4 } })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('stranger') })
    expect(candidates[0]?.id).toBe(hayLodgingId('village-a'))
  })
})

describe('collectLodgingCandidates — colliding offers', () => {
  it('keeps only the free offer when friend and paid share a placeId', () => {
    const s = settlement({
      npcs: [
        npc({ id: 'anna', name: 'Anna', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:0' } }),
        npc({ id: 'tomek', name: 'Tomek', role: 'guard', household: null }),
      ],
      houses: [house({ x: 5, z: 7, bed: BED })],
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('friendly') })
    expect(candidates.map((c) => c.type)).toEqual(['friend'])
    expect(candidates[0]?.ownerName).toBe('Anna')
  })

  it('returns friend, paid and hay when they occupy distinct places', () => {
    const s = settlement({
      npcs: [
        npc({ id: 'anna', name: 'Anna', household: { id: 'settlement-1:household:0', homeId: 'settlement-1:home:1' } }),
        npc({ id: 'tomek', name: 'Tomek', role: 'guard', household: null }),
      ],
      houses: [
        house({ x: 5, z: 7, bed: { position: { x: 5, z: 7 }, approach: { x: 5, z: 7 }, facing: null } }),
        house({ x: 9, z: 9, bed: { position: { x: 9, z: 9 }, approach: { x: 9, z: 9 }, facing: null } }),
      ],
      haySpot: { x: 1, z: 1 },
    })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('friendly') })
    expect(candidates.map((c) => c.type).sort()).toEqual(['friend', 'hay', 'paid'])
  })
})

describe('selectLodgingFromCandidates', () => {
  const friend = option({ id: 'friend', type: 'friend', quality: 'normal' })
  const paid = option({ id: 'paid', type: 'paid', quality: 'normal', price: GUARD_PAID_LODGING_PRICE })
  const freePaid = option({ id: 'free-paid', type: 'paid', quality: 'normal', price: 0 })

  it('classifies a free option as an immediate walk', () => {
    expect(selectLodgingFromCandidates([friend], 'friend')).toEqual({ kind: 'walk', option: friend })
  })

  it('classifies a priced paid option as needing confirmation', () => {
    expect(selectLodgingFromCandidates([paid], 'paid')).toEqual({ kind: 'confirm', option: paid })
  })

  it('classifies a zero-price paid option as an immediate walk', () => {
    expect(selectLodgingFromCandidates([freePaid], 'free-paid')).toEqual({ kind: 'walk', option: freePaid })
  })

  it('reports unavailable for an id no longer among fresh candidates (stale panel/prompt)', () => {
    expect(selectLodgingFromCandidates([friend], 'gone')).toEqual({ kind: 'unavailable' })
  })

  it('reports unavailable against an empty candidate list', () => {
    expect(selectLodgingFromCandidates([], 'friend')).toEqual({ kind: 'unavailable' })
  })
})

describe('lodgingChoiceLabel — settlement lodging (plan settlements-npcs-039)', () => {
  it('labels friend/hay/owned-house quality as Komfortowo / Dość wygodnie / Niewygodnie', () => {
    expect(lodgingChoiceLabel(option({ id: 't', type: 'friend', quality: 'high', ownerName: 'Marek' })))
      .toBe('U Marek — Komfortowo')
    expect(lodgingChoiceLabel(option({ id: 'f', type: 'friend', quality: 'normal', ownerName: 'Kasia' })))
      .toBe('U Kasia — Dość wygodnie')
    expect(lodgingChoiceLabel(option({ id: 'h', type: 'hay', quality: 'low' })))
      .toBe('Stóg siana — Niewygodnie')
    expect(lodgingChoiceLabel(option({ id: 'o', type: 'owned_house', quality: 'high' })))
      .toBe('Własna chata — Komfortowo')
  })

  it('includes provider, price and comfort on the paid row', () => {
    expect(lodgingChoiceLabel(option({
      id: 'p',
      type: 'paid',
      quality: 'normal',
      ownerName: 'Tomek',
      price: GUARD_PAID_LODGING_PRICE,
    }))).toBe('Nocleg u strażnika: Tomek — 2 monety — Dość wygodnie')
  })
})

describe('collectLodgingCandidates — owned house (plan settlements-005)', () => {
  it('exposes high-quality lodging for a completed Player-owned house without a bed', () => {
    const owned: LodgingOption = {
      id: 'residential:h:owned_house',
      type: 'owned_house',
      settlementId: '',
      placeId: 'home:residential:h',
      position: { x: 8, z: 9 },
      approachPoint: { x: 8, z: 7 },
      facing: 0,
      quality: 'high',
    }
    const candidates = collectLodgingCandidates([], {
      getPlayerSocial: () => socialState('stranger'),
      ownedHouses: [owned],
    })
    expect(candidates).toEqual([owned])
    expect(resolveBestLodging(candidates, { x: 0, z: 0 })?.type).toBe('owned_house')
  })

  it('does not include owned houses unless they are passed in', () => {
    const s = settlement({ haySpot: { x: 1, z: 1 } })
    const candidates = collectLodgingCandidates([s], { getPlayerSocial: () => socialState('stranger') })
    expect(candidates.every((c) => c.type !== 'owned_house')).toBe(true)
  })

  it('omits unfinished houses from derived lodging', () => {
    const options = collectOwnedHouseLodgingOptions([
      {
        id: 'residential:unfinished',
        kind: 'small_house',
        x: 0,
        z: 0,
        yaw: 0,
        stage: 'foundation',
        stageWorkProgress: 0,
        materialsSupplied: false,
        owner: { kind: 'player' },
        settlementId: null,
        homePlaceId: null,
      },
    ])
    expect(options).toEqual([])
  })

  it('derives high-quality lodging for a completed Player-owned house', () => {
    const options = collectOwnedHouseLodgingOptions([
      {
        id: 'residential:done',
        kind: 'small_house',
        x: 8,
        z: 9,
        yaw: 0,
        stage: 'completed',
        stageWorkProgress: 0,
        materialsSupplied: true,
        owner: { kind: 'player' },
        settlementId: 'village-1',
        homePlaceId: 'home:residential:residential:done',
      },
    ])
    expect(options).toMatchObject([{
      type: 'owned_house',
      quality: 'high',
      settlementId: 'village-1',
      placeId: 'home:residential:residential:done',
    }])
  })
})
