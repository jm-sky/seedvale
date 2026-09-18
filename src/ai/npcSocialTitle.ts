import type { RelationLevel } from '../quests/quests'
import type { NpcGender, Trait } from './characters'
import type { BigFivePersonality } from './dialogue'
import { lifeStageForAge } from '../settlement/npcPhysicalProfile'

/**
 * Presentation-only elder social titles for dialogue headings (plan npc-052).
 * Canonical `name` / `displayName` stay unchanged — this never mutates identity.
 *
 * @domain npc
 */

/** Agreeableness at or above this (or trait `sociable`) → familiar title when close. */
export const ELDER_FAMILIAR_AGREEABLENESS = 0.65
/** Agreeableness at or below this → rough/informal title when close. */
export const ELDER_ROUGH_AGREEABLENESS = 0.35

export type NpcSocialTitleInput = {
  name: string
  displayName: string
  age: number
  gender: NpcGender
  personality: BigFivePersonality
  traits: readonly Trait[]
  relationLevel: RelationLevel
}

function isElderLifeStage(age: number): boolean {
  const stage = lifeStageForAge(age)
  return stage === 'elderly' || stage === 'veryElderly'
}

function formalTitle(gender: NpcGender, displayName: string): string {
  return gender === 'female' ? `Pani ${displayName}` : `Pan ${displayName}`
}

function familiarTitle(gender: NpcGender, name: string): string {
  return gender === 'female' ? `Babcia ${name}` : `Dziadek ${name}`
}

function roughTitle(gender: NpcGender, name: string): string {
  return gender === 'female' ? `Stara ${name}` : `Stary ${name}`
}

function isCloseRelation(level: RelationLevel): boolean {
  return level === 'friendly' || level === 'trusted'
}

/**
 * Derive a contextual dialogue heading for an NPC. Non-elders keep the
 * canonical `displayName`. Elders get a Polish social title from age, gender,
 * personality/traits, and player↔NPC relation — deterministic, no RNG.
 *
 * @domain npc
 */
export function elderSocialDisplayName(input: NpcSocialTitleInput): string {
  if (!isElderLifeStage(input.age)) return input.displayName

  if (!isCloseRelation(input.relationLevel)) {
    return formalTitle(input.gender, input.displayName)
  }

  const agreeableness = input.personality.agreeableness
  if (agreeableness >= ELDER_FAMILIAR_AGREEABLENESS || input.traits.includes('sociable')) {
    return familiarTitle(input.gender, input.name)
  }
  if (agreeableness <= ELDER_ROUGH_AGREEABLENESS) {
    return roughTitle(input.gender, input.name)
  }
  return formalTitle(input.gender, input.displayName)
}
