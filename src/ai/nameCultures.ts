import type { NpcGender } from './characters'
import { createSeededRandom } from '../world/parseSeed'

/** A settlement's dominant "name character" — which cultural name pool most
 *  of its NPCs are drawn from. Purely a display/flavor trait: doesn't touch
 *  `characters.ts`'s role/personality/trait assignment. */
export type NameCulture = 'polish' | 'spanish' | 'english'

export const NAME_CULTURES: readonly NameCulture[] = ['polish', 'spanish', 'english']

type CultureNamePool = { male: readonly string[], female: readonly string[] }

const NAME_POOLS: Record<NameCulture, CultureNamePool> = {
  polish: {
    male: [
      'Piotr', 'Marek', 'Jan', 'Kuba', 'Jakub', 'Andrzej', 'Tomasz', 'Stanisław',
      'Paweł', 'Sławomir', 'Tomek', 'Jacek', 'Wojciech', 'Grzegorz',
    ],
    female: [
      'Anna', 'Kasia', 'Ola', 'Zofia', 'Maria', 'Krystyna', 'Barbara', 'Katarzyna',
      'Agnieszka', 'Grażyna', 'Helena', 'Danuta', 'Magdalena',
    ],
  },
  spanish: {
    male: [
      'Diego', 'Javier', 'Mateo', 'Alejandro', 'Carlos', 'Miguel', 'Rafael',
      'Emilio', 'Pablo', 'Santiago', 'Adrián', 'Hugo',
    ],
    female: [
      'Lucía', 'Sofía', 'Valentina', 'Isabel', 'Elena', 'Carmen', 'Paula',
      'Marta', 'Rosa', 'Alba', 'Camila', 'Inés',
    ],
  },
  english: {
    male: [
      'James', 'William', 'Henry', 'Thomas', 'Edward', 'George', 'Charles',
      'Arthur', 'Oliver', 'Samuel', 'Jack', 'Harry',
    ],
    female: [
      'Emma', 'Grace', 'Alice', 'Charlotte', 'Eleanor', 'Elizabeth', 'Margaret',
      'Rose', 'Florence', 'Amelia', 'Lucy', 'Hannah',
    ],
  },
}

/** Chance a given NPC's name is drawn from a culture other than its
 *  settlement's dominant one — a trader passing through, a family that moved
 *  in, etc. */
const OFF_CULTURE_CHANCE = 0.1

export function namesForCulture(culture: NameCulture, gender: NpcGender): readonly string[] {
  return NAME_POOLS[culture][gender]
}

/** Deterministic per-settlement roll for its dominant name culture. */
export function pickNameCulture(settlementSeed: number): NameCulture {
  const random = createSeededRandom(settlementSeed ^ 0x8a55c17)
  return NAME_CULTURES[Math.floor(random() * NAME_CULTURES.length)]!
}

/** Deterministic name for NPC `npcIndex` in a settlement — same seed/index/
 *  culture always produces the same name, so it needs no separate save slot
 *  (mirrors `SettlementName.ts`'s reasoning for settlement names). */
export function generateNpcName(
  settlementSeed: number,
  npcIndex: number,
  gender: NpcGender,
  dominantCulture: NameCulture,
): string {
  const random = createSeededRandom(settlementSeed ^ Math.imul(npcIndex + 1, 0x9e3779b1) ^ 0x4e414d45)
  const otherCultures = NAME_CULTURES.filter((c) => c !== dominantCulture)
  const culture =
    random() < OFF_CULTURE_CHANCE ? otherCultures[Math.floor(random() * otherCultures.length)]! : dominantCulture
  const pool = namesForCulture(culture, gender)
  return pool[Math.floor(random() * pool.length)]!
}
