import type { BigFivePersonality } from './dialogue'
import { createSeededRandom } from '../world/parseSeed'
import { personalityForIndex } from './dialogue'

export type NpcGender = 'male' | 'female'

/** Function within the settlement — data only in v1, no schedule/workplace
 *  behavior yet (see npc-2-daily-routine-and-place.md). `miner`/`fisher`
 *  added for plan 032 (natural-resources-economy) — a dedicated family near a
 *  significant iron/gold/fish deposit gets one forced into its role
 *  (`terrain/naturalResources.ts`'s `RESOURCE_ROLE`), but either can also
 *  come up on any regular family via the normal random roll below. */
export type Role = 'woodcutter' | 'farmer' | 'guard' | 'trader' | 'miner' | 'fisher'

/** Closed pool of lightweight, deterministic modifiers — see NpcAgent for
 *  where each one actually changes a number (wait times, HP, PAUSE_PARAMS). */
export type Trait = 'energetic' | 'fast_worker' | 'night_owl' | 'sociable'

export type CharacterDef = {
  name: string
  /** Family surname (shared by all members of the same family, gender-agreed
   *  per member) — see `settlement/families.ts`/`ai/nameCultures.ts`.
   *  Optional: kept out of `RESERVED_SEEDS`' matching-by-`name` use in quests
   *  (`quests/quests.ts` matches `giverName` against `name` alone). */
  lastName?: string
  gender: NpcGender
  role: Role
  personality: BigFivePersonality
  traits: readonly Trait[]
}

const ROLES: readonly Role[] = ['woodcutter', 'farmer', 'guard', 'trader', 'miner', 'fisher']
const TRAITS: readonly Trait[] = ['energetic', 'fast_worker', 'night_owl', 'sociable']

type ReservedSeed = Omit<CharacterDef, 'personality'>

/** The 4 NPCs `quests/quests.ts` hardcodes by name as giver/target — must
 *  always exist in the home settlement with this exact gender/role/traits
 *  (village-generation's reserved-family floor guarantees that, see
 *  `settlement/families.ts`). Randomizing these would silently break the
 *  only quests the game has. */
const RESERVED_SEEDS: readonly ReservedSeed[] = [
  { name: 'Anna', lastName: 'Kowalska', gender: 'female', role: 'farmer', traits: ['fast_worker'] },
  { name: 'Piotr', lastName: 'Kowalski', gender: 'male', role: 'woodcutter', traits: ['energetic'] },
  { name: 'Kasia', lastName: 'Wiśniewska', gender: 'female', role: 'trader', traits: ['night_owl'] },
  { name: 'Marek', lastName: 'Wiśniewski', gender: 'male', role: 'guard', traits: ['sociable'] },
]

export const RESERVED_CHARACTERS: readonly CharacterDef[] = RESERVED_SEEDS.map((seed, i) => ({
  ...seed,
  personality: personalityForIndex(i),
}))

/** Gender for one of the 4 reserved quest-critical names, or null otherwise —
 *  procedurally generated family members (everyone else) have no fixed
 *  gender to look up here; callers already fall back when this returns null
 *  (e.g. `QuestManager.ts`). */
export function genderForName(name: string): NpcGender | null {
  return RESERVED_CHARACTERS.find((c) => c.name === name)?.gender ?? null
}

/** Deterministic role/traits/personality for a procedurally generated family
 *  member — replaces the old `characterForIndex(treeIndex % 8)` fixed-roster
 *  lookup. `name` isn't produced here: callers already have one (from
 *  `nameCultures.ts`'s `generateNpcName` or a reserved character) before
 *  they get here — see `settlement/families.ts`. */
export function characterForSeed(seed: number, gender: NpcGender): Omit<CharacterDef, 'name'> {
  const random = createSeededRandom(seed ^ 0x63a4e1)
  const role = ROLES[Math.floor(random() * ROLES.length)]!
  const traitCount = random() < 0.5 ? 1 : 2
  const pool = [...TRAITS]
  const traits: Trait[] = []
  for (let i = 0; i < traitCount && pool.length > 0; i++) {
    traits.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!)
  }
  return {
    gender,
    role,
    traits,
    // `personalityForIndex` indexes a small fixed array by `% length` —
    // needs an unsigned value, unlike the xor/imul-composed seeds callers
    // pass in here, which are signed 32-bit and can be negative.
    personality: personalityForIndex(seed >>> 0),
  }
}
