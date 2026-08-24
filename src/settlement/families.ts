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
 *  needs to handle it. `XL` (plan 047) is a normal weighted size above `LG`. */
export type VillageSize = 'SM' | 'MD' | 'LG' | 'XL' | 'OUTPOST'

/** Normal (non-outpost) sizes `rollVillageSize` may return. */
export type RolledVillageSize = Exclude<VillageSize, 'OUTPOST'>

/** Shared size table for planner / props / livestock / footprint scoring
 *  (plan 047 §5) — one source of truth; do not duplicate these numbers. */
export type VillageSizeConfig = {
  /** Inclusive `[min, max]` family count for `generateFamilies` (OUTPOST path
   *  bypasses this and always yields exactly one family). */
  familyCount: readonly [number, number]
  /** World-unit village footprint radius (boundary / site scoring). */
  footprintRadius: number
  /** Preferred minimum spacing between house plot centers. */
  houseSpacing: number
  /** Outer house-ring distance used by footprint-aware site scoring — mirrors
   *  today's `layoutClearings` ringMax ≈ coreRadius + houseRadius×4.8 with
   *  default clearing params (9 + 4.5×4.8 ≈ 30.6) scaled per size. */
  houseRingMax: number
  /** Soft budgets for zone generation (0 = zone may be omitted). */
  zoneBudget: {
    residential: number
    public: number
    production: number
    food: number
    livestock: number
    utility: number
  }
  /** Counts of core infrastructure landmarks (`props.ts` / planner).
   *  `gardens` is legacy/cap only — plan 077 derives garden clusters from
   *  `ceil(nHouses / 3)` via `gardenScale.ts` (not this field). */
  infrastructure: {
    wells: number
    stockpiles: number
    /** @deprecated Prefer `packGardenScales(gardenUnitsFromHouses(n))`. */
    gardens: number
    markets: number
    campfires: number
  }
  /** Relative local-path density in `[0, 1]` — denser for larger villages. */
  pathDensity: number
  /** Per-house livestock ownership chance (OUTPOST uses its own chicken roll). */
  livestockOwnershipChance: number
}

/**
 * Centralized per-size knobs (plan 047). Footprint/ring values are calibrated
 * so XL is materially larger than LG while OUTPOST stays a tight cabin site.
 */
export const VILLAGE_SIZE_CONFIG: Record<VillageSize, VillageSizeConfig> = {
  OUTPOST: {
    familyCount: [1, 1],
    footprintRadius: 22,
    houseSpacing: 10,
    houseRingMax: 18,
    zoneBudget: { residential: 1, public: 1, production: 0, food: 0, livestock: 0, utility: 1 },
    infrastructure: { wells: 1, stockpiles: 1, gardens: 1, markets: 0, campfires: 0 },
    pathDensity: 0.25,
    livestockOwnershipChance: 0.3,
  },
  SM: {
    familyCount: [1, 3],
    footprintRadius: 40,
    houseSpacing: 12,
    houseRingMax: 28,
    zoneBudget: { residential: 1, public: 1, production: 0, food: 1, livestock: 0, utility: 1 },
    infrastructure: { wells: 1, stockpiles: 1, gardens: 1, markets: 0, campfires: 0 },
    pathDensity: 0.45,
    livestockOwnershipChance: 0.45,
  },
  MD: {
    familyCount: [3, 5],
    footprintRadius: 48,
    houseSpacing: 14,
    houseRingMax: 32,
    zoneBudget: { residential: 1, public: 1, production: 1, food: 1, livestock: 1, utility: 1 },
    infrastructure: { wells: 1, stockpiles: 1, gardens: 1, markets: 0, campfires: 1 },
    pathDensity: 0.6,
    livestockOwnershipChance: 0.5,
  },
  LG: {
    familyCount: [5, 7],
    footprintRadius: 56,
    houseSpacing: 16,
    houseRingMax: 36,
    zoneBudget: { residential: 1, public: 1, production: 1, food: 1, livestock: 1, utility: 1 },
    infrastructure: { wells: 1, stockpiles: 2, gardens: 1, markets: 1, campfires: 1 },
    pathDensity: 0.75,
    livestockOwnershipChance: 0.55,
  },
  XL: {
    familyCount: [7, 9],
    footprintRadius: 72,
    houseSpacing: 18,
    houseRingMax: 48,
    zoneBudget: { residential: 1, public: 1, production: 1, food: 1, livestock: 1, utility: 1 },
    infrastructure: { wells: 1, stockpiles: 2, gardens: 1, markets: 1, campfires: 1 },
    pathDensity: 0.9,
    livestockOwnershipChance: 0.6,
  },
}

export function villageSizeConfig(size: VillageSize): VillageSizeConfig {
  return VILLAGE_SIZE_CONFIG[size]
}

/** Plaza cobble plate count range per size (plan 140) — OUTPOST/SM stay bare
 *  (no campfire/plaza focal point yet); MD-XL get a modest, size-scaled
 *  handful near the well, not a paved road. */
const COBBLE_COUNT_RANGE: Record<VillageSize, readonly [number, number]> = {
  OUTPOST: [0, 0],
  SM: [0, 0],
  MD: [2, 4],
  LG: [4, 6],
  XL: [6, 8],
}

export function cobbleCountForSize(size: VillageSize, seed: number): number {
  const [min, max] = COBBLE_COUNT_RANGE[size]
  if (max <= min) return min
  const random = createSeededRandom(seed ^ 0xc0bb1e)
  return min + Math.floor(random() * (max - min + 1))
}

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
  /** Integer age in `[0, 100]` (plan npc-001) — real first-class demographic
   *  data, not derived from `relation`/`scale`. Generated from a dedicated
   *  age seed (`familyAgeSeed`), isolated from this family's own role/trait/
   *  name RNG stream so adding ages doesn't reshuffle existing rolls. */
  age: number
}

export type FamilyDef = {
  id: string
  members: readonly FamilyMember[]
}

/** A family member as seen from another member's dialogue — just enough to
 *  say "I have a wife Anna" (name/relation), no live reference to the other
 *  member's own `NpcAgent`/state (`NpcAgent.familyMembers`, see
 *  `docs/plans/archive/2026-08-09--048--npc-dialogues-v2.md`). */
export type FamilyMemberRef = {
  name: string
  lastName: string
  relation: FamilyRelation
}

/** Wstępne wagi rozmiaru per teren — do kalibracji w edytorze, jak reszta
 *  configu w projekcie. `forest` to dzisiejszy fallback/domyślna kategoria w
 *  `classifySettlementTerrain` — najbliżej odpowiada „przyjaznym równinom" z
 *  draftu, którym nie ma osobnej kategorii terenu w kodzie. `OUTPOST: 0`
 *  everywhere — `rollVillageSize` only ever iterates normal sizes (see
 *  below), outposts are decided separately by `settlementGenerator.ts`.
 *  Weights for SM+MD+LG+XL sum to 1.0 per terrain. */
const SIZE_WEIGHTS: Record<SettlementTerrain, Record<VillageSize, number>> = {
  forest: { SM: 0.18, MD: 0.35, LG: 0.32, XL: 0.15, OUTPOST: 0 },
  ocean: { SM: 0.28, MD: 0.4, LG: 0.25, XL: 0.07, OUTPOST: 0 },
  mountain: { SM: 0.6, MD: 0.28, LG: 0.1, XL: 0.02, OUTPOST: 0 },
  desert: { SM: 0.6, MD: 0.28, LG: 0.1, XL: 0.02, OUTPOST: 0 },
  swamp: { SM: 0.55, MD: 0.28, LG: 0.12, XL: 0.05, OUTPOST: 0 },
}

const ROLLED_SIZES: readonly RolledVillageSize[] = ['SM', 'MD', 'LG', 'XL']

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
export function rollVillageSize(terrain: SettlementTerrain, seed: number): RolledVillageSize {
  const random = createSeededRandom(seed ^ 0x5127e1)
  const weights = SIZE_WEIGHTS[terrain]
  const roll = random()
  let cumulative = 0
  for (const size of ROLLED_SIZES) {
    cumulative += weights[size]
    if (roll < cumulative) return size
  }
  return 'LG'
}

function familyCountForSize(size: VillageSize, seed: number): number {
  const [min, max] = villageSizeConfig(size).familyCount
  const random = createSeededRandom(seed ^ 0x7a11ee)
  return min + Math.floor(random() * (max - min + 1))
}

/** Composable per-family seed, same xor-magic-number idiom as
 *  `generateNpcName`/`settlementGenerator.ts`'s `cellSeed`. */
function familySeed(seed: number, familyIndex: number): number {
  return (seed ^ Math.imul(familyIndex + 1, 0x9e3779b1) ^ 0x46414d) >>> 0
}

/** Dedicated per-family age seed (plan npc-001 §7) — deliberately a separate
 *  stream from `familySeed`'s `random`/`characterForSeed` rolls so adding
 *  ages never reshuffles existing roles/traits/names/personalities across
 *  the world. Same xor-magic-number idiom, different magic number. */
function familyAgeSeed(seed: number, familyIndex: number): number {
  return (seed ^ Math.imul(familyIndex + 1, 0x27d4eb2f) ^ 0x41474553) >>> 0
}

/** Adult ages roll uniformly in this window (plan npc-001 §7) — wide enough
 *  to span young adults through elderly parents/singles, and its floor
 *  doubles as `MIN_PARENT_AGE_AT_CHILD` below so a child's age always has
 *  room to resolve to a valid non-negative value. */
const ADULT_AGE_RANGE: readonly [number, number] = [18, 70]

/** Spouses roll within this many years of each other so couples don't come
 *  out wildly mismatched, while still allowing real variation. */
const MAX_SPOUSE_AGE_GAP = 15

/** A child's age leaves at least this many years between them and their
 *  younger parent — the minimum plausible parent age at that child's birth.
 *  Equal to `ADULT_AGE_RANGE`'s floor so the worst case (both parents at the
 *  minimum adult age) still resolves to a valid child age of 0, never
 *  negative. */
const MIN_PARENT_AGE_AT_CHILD = 18

const CHILD_AGE_MAX = 17

function generateAdultAge(random: () => number): number {
  const [min, max] = ADULT_AGE_RANGE
  return min + Math.floor(random() * (max - min + 1))
}

/** Second spouse's age, within `MAX_SPOUSE_AGE_GAP` years of the first and
 *  still inside `ADULT_AGE_RANGE`. */
function generateSpouseAge(random: () => number, firstAge: number): number {
  const [rangeMin, rangeMax] = ADULT_AGE_RANGE
  const min = Math.max(rangeMin, firstAge - MAX_SPOUSE_AGE_GAP)
  const max = Math.min(rangeMax, firstAge + MAX_SPOUSE_AGE_GAP)
  return min + Math.floor(random() * (max - min + 1))
}

/** Child's age, constrained by both parents' ages via `MIN_PARENT_AGE_AT_CHILD`
 *  (plan npc-001 §7 — "actual ages", younger than parents by a real margin). */
function generateChildAge(random: () => number, parentAgeA: number, parentAgeB: number): number {
  const youngestParentAge = Math.min(parentAgeA, parentAgeB)
  const maxChildAge = Math.max(0, Math.min(CHILD_AGE_MAX, youngestParentAge - MIN_PARENT_AGE_AT_CHILD))
  return Math.floor(random() * (maxChildAge + 1))
}

/** The 2 reserved families reproducing today's home-settlement roster 1:1 —
 *  Anna+Piotr and Kasia+Marek as married couples, same role/traits/
 *  personality as `RESERVED_CHARACTERS`. Always present in the home
 *  settlement's family list (see `generateFamilies`'s `isHome` floor) so the
 *  hardcoded quest names in `quests/quests.ts` keep working regardless of
 *  what `VillageSize` the home settlement rolls. */
function reservedHomeFamilies(seed: number): FamilyDef[] {
  const [anna, piotr, kasia, marek] = RESERVED_CHARACTERS

  // Ages generated the same deterministic way as procedural families (own
  // dedicated `familyAgeSeed` stream, familyIndex 0/1 — these two families
  // are always families 0/1 of the home settlement, see `generateFamilies`).
  // Not a hardcoded default like `25`: these are family demographic state,
  // not part of `RESERVED_CHARACTERS`'s identity/role definitions.
  const ageRandom0 = createSeededRandom(familyAgeSeed(seed, 0))
  const piotrAge = generateAdultAge(ageRandom0)
  const annaAge = generateSpouseAge(ageRandom0, piotrAge)
  const ageRandom1 = createSeededRandom(familyAgeSeed(seed, 1))
  const marekAge = generateAdultAge(ageRandom1)
  const kasiaAge = generateSpouseAge(ageRandom1, marekAge)

  return [
    {
      id: 'family-reserved-0',
      members: [
        { name: piotr!.name, lastName: piotr!.lastName!, relation: 'husband', character: piotr!, scale: 1, age: piotrAge },
        { name: anna!.name, lastName: anna!.lastName!, relation: 'wife', character: anna!, scale: 1, age: annaAge },
      ],
    },
    {
      id: 'family-reserved-1',
      members: [
        { name: marek!.name, lastName: marek!.lastName!, relation: 'husband', character: marek!, scale: 1, age: marekAge },
        { name: kasia!.name, lastName: kasia!.lastName!, relation: 'wife', character: kasia!, scale: 1, age: kasiaAge },
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
  // Own isolated stream — see `familyAgeSeed`'s doc comment. Must not draw
  // from `random` above, or ages would reshuffle every existing role/trait/
  // name roll across the whole world.
  const ageRandom = createSeededRandom(familyAgeSeed(seed, familyIndex))
  const baseSurname = generateFamilySurname(fseed, nameCulture)
  const members: FamilyMember[] = []
  let idx = npcIndex
  let roleForced = false

  const addMember = (gender: NpcGender, relation: FamilyRelation, scale: number, age: number) => {
    const name = generateNpcName(seed, idx, gender, nameCulture)
    const lastName = surnameForGender(baseSurname, nameCulture, gender)
    let character = characterForSeed(fseed ^ Math.imul(idx + 1, 0x2545f491), gender)
    if (forcedRole && !roleForced) {
      character = { ...character, role: forcedRole }
      roleForced = true
    }
    members.push({ name, lastName, relation, character: { ...character, name, lastName }, scale, age })
    idx++
  }

  if (forceSingle || random() < SOLO_CHANCE) {
    addMember(random() < 0.5 ? 'male' : 'female', 'single', 1, generateAdultAge(ageRandom))
  } else {
    const husbandAge = generateAdultAge(ageRandom)
    const wifeAge = generateSpouseAge(ageRandom, husbandAge)
    addMember('male', 'husband', 1, husbandAge)
    addMember('female', 'wife', 1, wifeAge)
    if (random() < COUPLE_WITH_CHILD_CHANCE) {
      const childAge = generateChildAge(ageRandom, husbandAge, wifeAge)
      addMember(random() < 0.5 ? 'male' : 'female', 'child', childScale(random), childAge)
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

  const families: FamilyDef[] = isHome ? reservedHomeFamilies(seed) : []
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
