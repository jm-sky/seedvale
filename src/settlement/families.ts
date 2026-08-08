import type { NameCulture } from '../ai/nameCultures'
import type { SettlementTerrain } from '../shared/SettlementName'
import type { NaturalResource } from '../terrain/naturalResources'
import { type CharacterDef, characterForSeed, type NpcGender, RESERVED_CHARACTERS, type Role } from '../ai/characters'
import { generateFamilySurname, generateNpcName, surnameForGender } from '../ai/nameCultures'
import { RESOURCE_ROLE, SIGNIFICANT_RICHNESS } from '../terrain/naturalResources'
import { createSeededRandom } from '../world/parseSeed'

/** `OUTPOST` (plan 032 §7) is a single-house, single-NPC settlement, decided
 *  by `settlementGenerator.ts` before `rollVillageSize` even runs (a
 *  significant resource in harsh terrain, not a weighted roll — see
 *  `SIZE_WEIGHTS`'s `OUTPOST: 0` rows below) — never returned by
 *  `rollVillageSize` itself, but part of the type since `generateFamilies`
 *  needs to handle it. */
export type VillageSize = 'SM' | 'MD' | 'LG' | 'OUTPOST'

/** `single` isn't in the original draft's husband/wife/child trio, but a
 *  family of 1 (explicitly allowed — "1–3 osób") needs *some* relation, and
 *  reusing `husband`/`wife` for a lone resident would misrepresent a
 *  nonexistent spouse. */
export type FamilyRelation = 'husband' | 'wife' | 'child' | 'single'

export type FamilyMember = {
  name: string
  /** Shared by every member of this family, gender-agreed (see
   *  `ai/nameCultures.ts::surnameForGender`). */
  lastName: string
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

/** `OUTPOST`'s `[1, 1]` is never read by `familyCountForSize` in practice
 *  (the outpost path in `generateFamilies` below skips it entirely) — present
 *  only so this `Record<VillageSize, ...>` type-checks. */
const FAMILY_COUNT_RANGE: Record<VillageSize, readonly [number, number]> = {
  SM: [1, 3],
  MD: [2, 4],
  LG: [3, 5],
  OUTPOST: [1, 1],
}

/** Wstępne wagi rozmiaru per teren — do kalibracji w edytorze, jak reszta
 *  configu w projekcie. `forest` to dzisiejszy fallback/domyślna kategoria w
 *  `classifySettlementTerrain` — najbliżej odpowiada „przyjaznym równinom" z
 *  draftu, którym nie ma osobnej kategorii terenu w kodzie. `OUTPOST: 0`
 *  everywhere — `rollVillageSize` only ever iterates `SM`/`MD`/`LG` (see
 *  below), outposts are decided separately by `settlementGenerator.ts`. */
const SIZE_WEIGHTS: Record<SettlementTerrain, Record<VillageSize, number>> = {
  forest: { SM: 0.2, MD: 0.4, LG: 0.4, OUTPOST: 0 },
  ocean: { SM: 0.3, MD: 0.45, LG: 0.25, OUTPOST: 0 },
  mountain: { SM: 0.65, MD: 0.3, LG: 0.05, OUTPOST: 0 },
  desert: { SM: 0.65, MD: 0.3, LG: 0.05, OUTPOST: 0 },
  swamp: { SM: 0.6, MD: 0.3, LG: 0.1, OUTPOST: 0 },
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
 *  settlement's family count is drawn from (see `SIZE_WEIGHTS`). Never
 *  `OUTPOST` — that's decided separately by `settlementGenerator.ts` (a
 *  resource+terrain condition, not part of this weighted roll). */
export function rollVillageSize(terrain: SettlementTerrain, seed: number): Exclude<VillageSize, 'OUTPOST'> {
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
        { name: piotr!.name, lastName: piotr!.lastName!, relation: 'husband', character: piotr!, scale: 1 },
        { name: anna!.name, lastName: anna!.lastName!, relation: 'wife', character: anna!, scale: 1 },
      ],
    },
    {
      id: 'family-reserved-1',
      members: [
        { name: marek!.name, lastName: marek!.lastName!, relation: 'husband', character: marek!, scale: 1 },
        { name: kasia!.name, lastName: kasia!.lastName!, relation: 'wife', character: kasia!, scale: 1 },
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
 *  same way it already does for the rest of the settlement's NPCs.
 *
 *  `forcedRole` (plan 032 §6/§7 — dedicated resource family / outpost) locks
 *  the *first* member added (whichever relation that turns out to be) to
 *  that role instead of `characterForSeed`'s random pick; any other members
 *  (spouse/child) still roll normally — only one person per family needs to
 *  visibly "be" the miner/fisher/farmer the resource justified.
 *  `forceSingle` (outposts only) skips the couple/child roll entirely. */
function generateFamily(
  seed: number,
  familyIndex: number,
  npcIndex: number,
  nameCulture: NameCulture,
  forcedRole?: Role,
  forceSingle = false,
): { family: FamilyDef, nextIndex: number } {
  const fseed = familySeed(seed, familyIndex)
  const random = createSeededRandom(fseed ^ 0x1f3c5a)
  const baseSurname = generateFamilySurname(fseed, nameCulture)
  const members: FamilyMember[] = []
  let idx = npcIndex
  let roleForced = false

  const addMember = (gender: NpcGender, relation: FamilyRelation, scale: number) => {
    const name = generateNpcName(seed, idx, gender, nameCulture)
    const lastName = surnameForGender(baseSurname, nameCulture, gender)
    let character = characterForSeed(fseed ^ Math.imul(idx + 1, 0x2545f491), gender)
    if (forcedRole && !roleForced) {
      character = { ...character, role: forcedRole }
      roleForced = true
    }
    members.push({ name, lastName, relation, character: { ...character, name, lastName }, scale })
    idx++
  }

  if (forceSingle || random() < SOLO_CHANCE) {
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
 * settlement. Deterministic: same `seed`/`size`/`isHome`/`nameCulture`/
 * `dominantResource` always produces the same families.
 *
 * `dominantResource` (plan 032 §5-7, from `terrain/naturalResources.ts`) —
 * when significant (`richness >= SIGNIFICANT_RICHNESS`) and its type has a
 * role mapping (`RESOURCE_ROLE`; clay/salt/resin/herbs don't, and stay
 * naming/food-source flavor only in v1) — adds one dedicated single-member
 * family with that forced role, on top of the normal roster. `size ===
 * 'OUTPOST'` bypasses the normal roster entirely: exactly one lone resident,
 * role forced from the resource that justified the outpost in the first
 * place (`settlementGenerator.ts` only ever rolls `OUTPOST` when there is one).
 */
export function generateFamilies(
  seed: number,
  size: VillageSize,
  isHome: boolean,
  nameCulture: NameCulture,
  dominantResource?: NaturalResource | null,
): FamilyDef[] {
  if (size === 'OUTPOST') {
    const forcedRole = dominantResource ? RESOURCE_ROLE[dominantResource.type] : undefined
    const { family } = generateFamily(seed, 0, 0, nameCulture, forcedRole, true)
    return [family]
  }

  const families: FamilyDef[] = isHome ? reservedHomeFamilies() : []
  const targetCount = Math.max(familyCountForSize(size, seed), families.length)

  let npcIndex = families.reduce((n, f) => n + f.members.length, 0)
  while (families.length < targetCount) {
    const familyIndex = families.length
    const { family, nextIndex } = generateFamily(seed, familyIndex, npcIndex, nameCulture)
    families.push(family)
    npcIndex = nextIndex
  }

  const dedicatedRole =
    dominantResource && dominantResource.richness >= SIGNIFICANT_RICHNESS
      ? RESOURCE_ROLE[dominantResource.type]
      : undefined
  if (dedicatedRole) {
    const { family } = generateFamily(seed, families.length, npcIndex, nameCulture, dedicatedRole)
    families.push(family)
  }

  return families
}
