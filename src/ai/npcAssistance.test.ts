import { describe, expect, it } from 'vitest'
import type { BigFivePersonality } from './dialogue'
import { Inventory } from '../items/Inventory'
import {
  type AssistanceSocialInput,
  computeAssistanceWillingness,
  findCarriedConsumableKind,
  resolveNpcAssistance,
  violatesOwnNeedsGuard,
} from './npcAssistance'

const NEUTRAL: BigFivePersonality = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 }

const social = (relationLevel: AssistanceSocialInput['relationLevel'], standing = 0): AssistanceSocialInput => ({
  personality: NEUTRAL,
  relationLevel,
  standing,
})

const alwaysWilling = () => 0
const neverWilling = () => 1

describe('findCarriedConsumableKind', () => {
  it('finds a carried hunger item', () => {
    const carried = new Inventory({ bread: 1 })
    expect(findCarriedConsumableKind(carried, 'hunger')).toBe('bread')
  })

  it('finds a carried waterskin for thirst (by mere possession — plan items-player-001\'s known gap: this doesn\'t check whether it actually holds water)', () => {
    const carried = new Inventory({ waterskin_small: 1 })
    expect(findCarriedConsumableKind(carried, 'thirst')).toBe('waterskin_small')
  })

  it('returns null when nothing carried matches the need', () => {
    const carried = new Inventory({ branch: 3 })
    expect(findCarriedConsumableKind(carried, 'hunger')).toBeNull()
    expect(findCarriedConsumableKind(new Inventory(), 'thirst')).toBeNull()
  })
})

describe('computeAssistanceWillingness', () => {
  it('increases monotonically with relation level, all else equal', () => {
    const stranger = computeAssistanceWillingness(social('stranger'))
    const acquainted = computeAssistanceWillingness(social('acquainted'))
    const friendly = computeAssistanceWillingness(social('friendly'))
    const trusted = computeAssistanceWillingness(social('trusted'))
    expect(stranger).toBeLessThan(acquainted)
    expect(acquainted).toBeLessThan(friendly)
    expect(friendly).toBeLessThan(trusted)
  })

  it('gives personal relation more weight than general standing', () => {
    const trustedStranger = computeAssistanceWillingness(social('trusted', 0))
    const famousStranger = computeAssistanceWillingness(social('stranger', 1))
    expect(trustedStranger).toBeGreaterThan(famousStranger)
  })

  it('stays within [0, 1]', () => {
    expect(computeAssistanceWillingness(social('trusted', 1))).toBeLessThanOrEqual(1)
    expect(computeAssistanceWillingness(social('stranger', 0))).toBeGreaterThanOrEqual(0)
  })
})

describe('violatesOwnNeedsGuard', () => {
  it('blocks giving away the last unit when the own need is critical', () => {
    expect(violatesOwnNeedsGuard(0, 0.9)).toBe(true)
  })

  it('allows giving away the last unit when the own need is not critical', () => {
    expect(violatesOwnNeedsGuard(0, 0.2)).toBe(false)
  })

  it('allows giving one away when more of the same kind remains', () => {
    expect(violatesOwnNeedsGuard(2, 0.9)).toBe(false)
  })
})

describe('resolveNpcAssistance', () => {
  it('gives the carried food when willing', () => {
    const carried = new Inventory({ bread: 1 })
    const result = resolveNpcAssistance('food', carried, 0.1, social('friendly'), alwaysWilling)
    expect(result).toEqual({ outcome: 'given', itemKind: 'bread' })
    // Decision only — the resolver itself never mutates `carried`.
    expect(carried.count('bread')).toBe(1)
  })

  it('returns no_item without any carried food', () => {
    const carried = new Inventory()
    const result = resolveNpcAssistance('food', carried, 0.1, social('trusted'), alwaysWilling)
    expect(result).toEqual({ outcome: 'no_item', itemKind: null })
  })

  it('returns no_item without any carried water', () => {
    const carried = new Inventory()
    const result = resolveNpcAssistance('water', carried, 0.1, social('trusted'), alwaysWilling)
    expect(result).toEqual({ outcome: 'no_item', itemKind: null })
  })

  it('refuses when the willingness roll fails', () => {
    const carried = new Inventory({ bread: 1 })
    const result = resolveNpcAssistance('food', carried, 0.1, social('stranger'), neverWilling)
    expect(result).toEqual({ outcome: 'unwilling', itemKind: null })
    expect(carried.count('bread')).toBe(1)
  })

  it('refuses the last carried unit when the NPC is itself critically in need', () => {
    const carried = new Inventory({ bread: 1 })
    const result = resolveNpcAssistance('food', carried, 0.9, social('trusted'), alwaysWilling)
    expect(result).toEqual({ outcome: 'unwilling', itemKind: null })
    expect(carried.count('bread')).toBe(1)
  })

  it('still gives one away when more than one is carried, even if own need is critical', () => {
    const carried = new Inventory({ bread: 2 })
    const result = resolveNpcAssistance('food', carried, 0.9, social('trusted'), alwaysWilling)
    expect(result).toEqual({ outcome: 'given', itemKind: 'bread' })
  })

  it('does not offer the same item again once the caller has taken it', () => {
    const carried = new Inventory({ bread: 1 })
    const first = resolveNpcAssistance('food', carried, 0.1, social('trusted'), alwaysWilling)
    expect(first.outcome).toBe('given')
    carried.remove('bread', 1)
    const second = resolveNpcAssistance('food', carried, 0.1, social('trusted'), alwaysWilling)
    expect(second).toEqual({ outcome: 'no_item', itemKind: null })
  })
})
