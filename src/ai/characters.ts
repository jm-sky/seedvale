import type { BigFivePersonality } from './dialogue'
import { personalityForIndex } from './dialogue'

export type NpcGender = 'male' | 'female'

/** Function within the settlement — data only in v1, no schedule/workplace
 *  behavior yet (see npc-2-daily-routine-and-place.md). */
export type Role = 'woodcutter' | 'farmer' | 'guard' | 'trader'

/** Closed pool of lightweight, deterministic modifiers — see NpcAgent for
 *  where each one actually changes a number (wait times, HP, PAUSE_PARAMS). */
export type Trait = 'energetic' | 'fast_worker' | 'night_owl' | 'sociable'

export type CharacterDef = {
  name: string
  gender: NpcGender
  role: Role
  personality: BigFivePersonality
  traits: readonly Trait[]
}

type CharacterSeed = Omit<CharacterDef, 'personality'>

/** Deterministic pool — assigned by index (treeIndex % length), not
 *  randomized per session, so a given NPC slot is stable across reloads. */
const SEEDS: readonly CharacterSeed[] = [
  { name: 'Anna', gender: 'female', role: 'farmer', traits: ['fast_worker'] },
  { name: 'Piotr', gender: 'male', role: 'woodcutter', traits: ['energetic'] },
  { name: 'Kasia', gender: 'female', role: 'trader', traits: ['night_owl'] },
  { name: 'Marek', gender: 'male', role: 'guard', traits: ['sociable'] },
  { name: 'Ola', gender: 'female', role: 'guard', traits: ['fast_worker', 'sociable'] },
  { name: 'Tomek', gender: 'male', role: 'farmer', traits: ['energetic', 'night_owl'] },
  { name: 'Zofia', gender: 'female', role: 'woodcutter', traits: ['night_owl'] },
  { name: 'Jacek', gender: 'male', role: 'trader', traits: ['sociable', 'fast_worker'] },
]

export const CHARACTERS: readonly CharacterDef[] = SEEDS.map((seed, i) => ({
  ...seed,
  personality: personalityForIndex(i),
}))

export function characterForIndex(treeIndex: number): CharacterDef {
  return CHARACTERS[treeIndex % CHARACTERS.length]!
}

/** Gender for a placeholder NPC name, or null for names outside the pool
 *  (defensive — quest defs reference these names by hand). */
export function genderForName(name: string): NpcGender | null {
  return CHARACTERS.find((c) => c.name === name)?.gender ?? null
}
