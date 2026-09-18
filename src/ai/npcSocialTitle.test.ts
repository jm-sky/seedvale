import { describe, expect, it } from 'vitest'
import type { Trait } from './characters'
import type { BigFivePersonality } from './dialogue'
import {
  ELDER_FAMILIAR_AGREEABLENESS,
  ELDER_ROUGH_AGREEABLENESS,
  elderSocialDisplayName,
  type NpcSocialTitleInput,
} from './npcSocialTitle'

const NEUTRAL: BigFivePersonality = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
}

function input(partial: Partial<NpcSocialTitleInput> & Pick<NpcSocialTitleInput, 'name' | 'displayName' | 'age'>): NpcSocialTitleInput {
  return {
    gender: 'male',
    personality: NEUTRAL,
    traits: [],
    relationLevel: 'stranger',
    ...partial,
  }
}

describe('elderSocialDisplayName (plan npc-052)', () => {
  it('keeps canonical displayName for non-elders (age 64 = mature)', () => {
    expect(elderSocialDisplayName(input({
      name: 'Jan',
      displayName: 'Jan Kowalski',
      age: 64,
      relationLevel: 'trusted',
      personality: { ...NEUTRAL, agreeableness: 0.9 },
      traits: ['sociable'],
    }))).toBe('Jan Kowalski')
  })

  it('uses formal Pan/Pani + full displayName for elder strangers', () => {
    expect(elderSocialDisplayName(input({
      name: 'Jan',
      displayName: 'Jan Kowalski',
      age: 65,
      gender: 'male',
      relationLevel: 'stranger',
    }))).toBe('Pan Jan Kowalski')

    expect(elderSocialDisplayName(input({
      name: 'Anna',
      displayName: 'Anna Nowak',
      age: 70,
      gender: 'female',
      relationLevel: 'acquainted',
    }))).toBe('Pani Anna Nowak')
  })

  it('uses familiar Dziadek/Babcia + first name for close agreeable elders', () => {
    expect(elderSocialDisplayName(input({
      name: 'Antoni',
      displayName: 'Antoni Wiśniewski',
      age: 72,
      gender: 'male',
      relationLevel: 'friendly',
      personality: { ...NEUTRAL, agreeableness: ELDER_FAMILIAR_AGREEABLENESS },
    }))).toBe('Dziadek Antoni')

    expect(elderSocialDisplayName(input({
      name: 'Helena',
      displayName: 'Helena Wiśniewska',
      age: 85,
      gender: 'female',
      relationLevel: 'trusted',
      personality: { ...NEUTRAL, agreeableness: 0.4 },
      traits: ['sociable'] as readonly Trait[],
    }))).toBe('Babcia Helena')
  })

  it('uses rough Stary/Stara + first name for close low-agreeableness elders', () => {
    expect(elderSocialDisplayName(input({
      name: 'Jan',
      displayName: 'Jan Kowalski',
      age: 68,
      gender: 'male',
      relationLevel: 'friendly',
      personality: { ...NEUTRAL, agreeableness: ELDER_ROUGH_AGREEABLENESS },
    }))).toBe('Stary Jan')

    expect(elderSocialDisplayName(input({
      name: 'Maria',
      displayName: 'Maria Kowalska',
      age: 90,
      gender: 'female',
      relationLevel: 'trusted',
      personality: { ...NEUTRAL, agreeableness: 0.2 },
    }))).toBe('Stara Maria')
  })

  it('falls back to formal Pan/Pani for close mid-agreeableness elders', () => {
    expect(elderSocialDisplayName(input({
      name: 'Piotr',
      displayName: 'Piotr Zieliński',
      age: 75,
      gender: 'male',
      relationLevel: 'friendly',
      personality: { ...NEUTRAL, agreeableness: 0.5 },
    }))).toBe('Pan Piotr Zieliński')
  })

  it('is deterministic and does not mutate inputs', () => {
    const traits: Trait[] = ['curious']
    const personality = { ...NEUTRAL, agreeableness: 0.8 }
    const fixture = input({
      name: 'Kazimierz',
      displayName: 'Kazimierz Nowak',
      age: 74,
      gender: 'male',
      relationLevel: 'trusted',
      personality,
      traits,
    })
    const first = elderSocialDisplayName(fixture)
    const second = elderSocialDisplayName(fixture)
    expect(first).toBe('Dziadek Kazimierz')
    expect(second).toBe(first)
    expect(fixture.displayName).toBe('Kazimierz Nowak')
    expect(fixture.name).toBe('Kazimierz')
    expect(traits).toEqual(['curious'])
    expect(personality.agreeableness).toBe(0.8)
  })

  it('treats Kazimierz-like elders via the generic resolver (no special-case)', () => {
    expect(elderSocialDisplayName(input({
      name: 'Kazimierz',
      displayName: 'Kazimierz Nowak',
      age: 74,
      gender: 'male',
      relationLevel: 'stranger',
    }))).toBe('Pan Kazimierz Nowak')
  })
})
