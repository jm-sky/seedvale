import type { NameCulture } from '../ai/nameCultures'
import type { SettlementTerrain } from '../shared/SettlementName'
import { type CharacterDef, characterForSeed, type NpcGender, RESERVED_CHARACTERS } from '../ai/characters'
import { generateNpcName } from '../ai/nameCultures'
import { createSeededRandom } from '../world/parseSeed'

export type VillageSize = 'SM' | 'MD' | 'LG'

/** `single` isn't in the original draft's husband/wife/child trio, but a
 *  family of 1 (explicitly allowed — "1–3 osób") needs *some* relation, and
 *  reusing `husband`/`wife` for a lone resident would misrepresent a
 *  nonexistent spouse. */
export type FamilyRelation = 'husband' | 'wife' | 'child' | 'single'

export type FamilyMember = {
  name: string
  relation: FamilyRelation
  character: CharacterDef
  /** Model scale — 1 for adults. Children get a smaller stand-in scale (see
   *  `CHILD_SCALE_RANGE`) since there's no dedicated child model yet. */
  scale: number
}

export type FamilyDef = {
  id: string
  members: readonly FamilyMember[]
}

const FAMILY_COUNT_RANGE: Record<VillageSize, readonly [number, number]> = {
  SM: [1, 3],
  MD: [2, 4],
  LG: [3, 5],
}

/** Wstępne wagi rozmiaru per teren — do kalibracji w edytorze, jak reszta
 *  configu w projekcie. `forest` to dzisiejszy fallback/domyślna kategoria w
 *  `classifySettlementTerrain` — najbliżej odpowiada „przyjaznym równinom" z
 *  draftu, którym nie ma osobnej kategorii terenu w kodzie. */
const SIZE_WEIGHTS: Record<SettlementTerrain, Record<VillageSize, number>> = {
  forest: { SM: 0.2, MD: 0.4, LG: 0.4 },
  ocean: { SM: 0.3, MD: 0.45, LG: 0.25 },
  mountain: { SM: 0.65, MD: 0.3, LG: 0.05 },
  desert: { SM: 0.65, MD: 0.3, LG: 0.05 },
  swamp: { SM: 0.6, MD: 0.3, LG: 0.1 },
}

/** Chance a family is a lone adult vs. a couple (`SOLO_CHANCE`), and — given
 *  a couple — the additional chance they also have a child
 *  (`COUPLE_WITH_CHILD_CHANCE` on top of `SOLO_CHANCE`). Wstępne, jak reszta. */
const SOLO_CHANCE = 0.25
const COUPLE_WITH_CHILD_CHANCE = 0.35

/** No standalone child model yet — approximate one with a smaller scale on
 *  the regular adult model instead of a fixed value: real children range
 *  from toddler-small to nearly-adult-sized teens.
 *  TODO: swap for a real child model/rig once one exists in the asset pool. */
const CHILD_SCALE_RANGE: readonly [number, number] = [0.5, 0.8]

/** Deterministic weighted roll: `terrain` biases which `VillageSize` a
 *  settlement's family count is drawn from (see `SIZE_WEIGHTS`). */
export function rollVillageSize(terrain: SettlementTerrain, seed: number): VillageSize {
  const random = createSeededRandom(seed ^ 0x5127e1)
  const weights = SIZE_WEIGHTS[terrain]
  const roll = random()
  let cumulative = 0
  for (const size of ['SM', 'MD', 'LG'] as const) {
    cumulative += weights[size]
    if (roll < cumulative) return size
  }
  return 'LG'
}

function familyCountForSize(size: VillageSize, seed: number): number {
  const [min, max] = FAMILY_COUNT_RANGE[size]
  const random = createSeededRandom(seed ^ 0x7a11ee)
  return min + Math.floor(random() * (max - min + 1))
}

/** Composable per-family seed, same xor-magic-number idiom as
 *  `generateNpcName`/`settlementGenerator.ts`'s `cellSeed`. */
function familySeed(seed: number, familyIndex: number): number {
  return (seed ^ Math.imul(familyIndex + 1, 0x9e3779b1) ^ 0x46414d) >>> 0
}

/** The 2 reserved families reproducing today's home-settlement roster 1:1 —
 *  Anna+Piotr and Kasia+Marek as married couples, same role/traits/
 *  personality as `RESERVED_CHARACTERS`. Always present in the home
 *  settlement's family list (see `generateFamilies`'s `isHome` floor) so the
 *  hardcoded quest names in `quests/quests.ts` keep working regardless of
 *  what `VillageSize` the home settlement rolls. */
function reservedHomeFamilies(): FamilyDef[] {
  const [anna, piotr, kasia, marek] = RESERVED_CHARACTERS
  return [
    {
      id: 'family-reserved-0',
      members: [
        { name: piotr!.name, relation: 'husband', character: piotr!, scale: 1 },
        { name: anna!.name, relation: 'wife', character: anna!, scale: 1 },
      ],
    },
    {
      id: 'family-reserved-1',
      members: [
        { name: marek!.name, relation: 'husband', character: marek!, scale: 1 },
        { name: kasia!.name, relation: 'wife', character: kasia!, scale: 1 },
      ],
    },
  ]
}

function childScale(random: () => number): number {
  const [min, max] = CHILD_SCALE_RANGE
  return min + random() * (max - min)
}

/** Builds one procedurally generated family. `npcIndex` is a running index
 *  across the whole settlement's members (not just this family), threaded
 *  through so `generateNpcName`'s per-slot uniqueness hash keeps working the
 *  same way it already does for the rest of the settlement's NPCs. */
function generateFamily(
  seed: number,
  familyIndex: number,
  npcIndex: number,
  nameCulture: NameCulture,
): { family: FamilyDef, nextIndex: number } {
  const fseed = familySeed(seed, familyIndex)
  const random = createSeededRandom(fseed ^ 0x1f3c5a)
  const members: FamilyMember[] = []
  let idx = npcIndex

  const addMember = (gender: NpcGender, relation: FamilyRelation, scale: number) => {
    const name = generateNpcName(seed, idx, gender, nameCulture)
    const character = characterForSeed(fseed ^ Math.imul(idx + 1, 0x2545f491), gender)
    members.push({ name, relation, character: { ...character, name }, scale })
    idx++
  }

  if (random() < SOLO_CHANCE) {
    addMember(random() < 0.5 ? 'male' : 'female', 'single', 1)
  } else {
    addMember('male', 'husband', 1)
    addMember('female', 'wife', 1)
    if (random() < COUPLE_WITH_CHILD_CHANCE) {
      addMember(random() < 0.5 ? 'male' : 'female', 'child', childScale(random))
    }
  }

  return { family: { id: `family-${familyIndex}`, members }, nextIndex: idx }
}

/**
 * Generates a settlement's families — the members, their relations, and
 * (for procedurally generated ones) their names/roles/traits/personality.
 * `isHome` guarantees the 2 reserved families (`reservedHomeFamilies`) are
 * always present, on top of which — if the rolled `VillageSize` calls for
 * more — additional procedural families are generated, same as any other
 * settlement. Deterministic: same `seed`/`size`/`isHome`/`nameCulture` always
 * produces the same families.
 */
export function generateFamilies(
  seed: number,
  size: VillageSize,
  isHome: boolean,
  nameCulture: NameCulture,
): FamilyDef[] {
  const families: FamilyDef[] = isHome ? reservedHomeFamilies() : []
  const targetCount = Math.max(familyCountForSize(size, seed), families.length)

  let npcIndex = families.reduce((n, f) => n + f.members.length, 0)
  while (families.length < targetCount) {
    const familyIndex = families.length
    const { family, nextIndex } = generateFamily(seed, familyIndex, npcIndex, nameCulture)
    families.push(family)
    npcIndex = nextIndex
  }

  return families
}
