import { describe, expect, it } from 'vitest'
import type { BigFivePersonality } from './dialogue'
import { computeReactionChance, reactionTierForRelation } from './reactionChance'

const CLOSED: BigFivePersonality = { openness: 0, conscientiousness: 0.5, extraversion: 0, agreeableness: 0.5, neuroticism: 0.5 }
const OPEN: BigFivePersonality = { openness: 1, conscientiousness: 0.5, extraversion: 1, agreeableness: 0.5, neuroticism: 0.5 }

describe('computeReactionChance', () => {
  it('stays low for a plain stranger encounter', () => {
    const chance = computeReactionChance({ personality: CLOSED, traits: [], relationLevel: 'stranger' })
    expect(chance).toBeGreaterThan(0)
    expect(chance).toBeLessThan(0.1)
  })

  it('never returns a bare 0 or a guaranteed 1 for an ordinary stranger', () => {
    const chance = computeReactionChance({ personality: CLOSED, traits: [], relationLevel: 'stranger' })
    expect(chance).toBeGreaterThan(0)
    expect(chance).toBeLessThan(1)
  })

  it('reaches a high ceiling for a very open, curious, trusted, famous Hero', () => {
    const chance = computeReactionChance({
      personality: OPEN,
      traits: ['curious'],
      relationLevel: 'trusted',
      renown: 100,
    })
    expect(chance).toBeGreaterThanOrEqual(0.5)
    expect(chance).toBeLessThanOrEqual(0.6)
  })

  it('keeps a closed, distrustful NPC well under the open-NPC ceiling despite high relation/renown', () => {
    const closedButLiked = computeReactionChance({
      personality: CLOSED,
      traits: [],
      relationLevel: 'trusted',
      renown: 100,
    })
    const openAndLiked = computeReactionChance({
      personality: OPEN,
      traits: ['curious'],
      relationLevel: 'trusted',
      renown: 100,
    })
    expect(closedButLiked).toBeGreaterThanOrEqual(0.4)
    expect(closedButLiked).toBeLessThanOrEqual(0.6)
    expect(closedButLiked).toBeLessThan(openAndLiked)
  })

  it('increases monotonically with relation level, all else equal', () => {
    const base = { personality: CLOSED, traits: [] as const }
    const stranger = computeReactionChance({ ...base, relationLevel: 'stranger' })
    const acquainted = computeReactionChance({ ...base, relationLevel: 'acquainted' })
    const friendly = computeReactionChance({ ...base, relationLevel: 'friendly' })
    const trusted = computeReactionChance({ ...base, relationLevel: 'trusted' })
    expect(stranger).toBeLessThan(acquainted)
    expect(acquainted).toBeLessThan(friendly)
    expect(friendly).toBeLessThan(trusted)
  })

  it('adds a bonus for the curious trait', () => {
    const withoutTrait = computeReactionChance({ personality: CLOSED, traits: [], relationLevel: 'stranger' })
    const withTrait = computeReactionChance({ personality: CLOSED, traits: ['curious'], relationLevel: 'stranger' })
    expect(withTrait).toBeGreaterThan(withoutTrait)
  })

  it('clamps to 1 even if every bonus were somehow larger than expected', () => {
    const chance = computeReactionChance({
      personality: OPEN,
      traits: ['curious'],
      relationLevel: 'trusted',
      renown: 500,
    })
    expect(chance).toBeLessThanOrEqual(1)
  })

  it('defaults renown to 0 when omitted', () => {
    const omitted = computeReactionChance({ personality: CLOSED, traits: [], relationLevel: 'stranger' })
    const explicitZero = computeReactionChance({
      personality: CLOSED,
      traits: [],
      relationLevel: 'stranger',
      renown: 0,
    })
    expect(omitted).toBe(explicitZero)
  })

  it('renown = 0 keeps the base (no-reputation-system) reaction chance', () => {
    const base = { personality: CLOSED, traits: [] as const, relationLevel: 'stranger' as const }
    expect(computeReactionChance({ ...base, renown: 0 })).toBe(computeReactionChance(base))
  })

  it('renown = 100 adds at most about +0.10 over renown = 0, all else equal', () => {
    const base = { personality: CLOSED, traits: [] as const, relationLevel: 'acquainted' as const }
    const withoutRenown = computeReactionChance({ ...base, renown: 0 })
    const withFullRenown = computeReactionChance({ ...base, renown: 100 })
    expect(withFullRenown - withoutRenown).toBeCloseTo(0.10, 5)
  })

  it('relation still matters more than renown — a stranger with full renown stays under an acquainted-with-no-renown NPC\'s trusted ceiling', () => {
    const base = { personality: CLOSED, traits: [] as const }
    const strangerFamous = computeReactionChance({ ...base, relationLevel: 'stranger', renown: 100 })
    const trustedUnknown = computeReactionChance({ ...base, relationLevel: 'trusted', renown: 0 })
    expect(strangerFamous).toBeLessThan(trustedUnknown)
  })
})

describe('reactionTierForRelation', () => {
  it('maps stranger/acquainted to normal, friendly to warm, trusted to enthusiastic', () => {
    expect(reactionTierForRelation('stranger')).toBe('normal')
    expect(reactionTierForRelation('acquainted')).toBe('normal')
    expect(reactionTierForRelation('friendly')).toBe('warm')
    expect(reactionTierForRelation('trusted')).toBe('enthusiastic')
  })
})
