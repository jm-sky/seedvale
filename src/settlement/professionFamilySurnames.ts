import type { Role } from '../ai/characters'
import type { FamilyDef, FamilyMember } from './families'
import { formatPolishSurnameForGender } from '../ai/nameCultures'
import { createSeededRandom } from '../world/parseSeed'
import { isAdultAge } from './professionStaffing'

/** Isolated from family composition, names, ages, traits and staffing streams. */
const PROFESSION_SURNAME_SALT = 0x5052534e

const WORLDGEN_FAMILY_ID = /^family-(?:reserved-)?(\d+)$/

/**
 * Closed profession → family-surname rank. Lower is more identifying.
 * Specialist livelihoods outrank generic food/guard work so a mixed household
 * takes the more characteristic name.
 */
const FAMILY_SURNAME_ROLE_RANK: Record<Role, number> = {
  blacksmith: 0,
  hunter: 1,
  fisher: 2,
  miner: 3,
  woodcutter: 4,
  herbalist: 5,
  shepherd: 6,
  textile_worker: 7,
  trader: 8,
  guard: 9,
  farmer: 10,
}

const ROLE_SURNAME_POOLS: Record<Role, readonly string[]> = {
  guard: ['Hornblower', 'Ward', 'Shields', 'Guard', 'Sentinel', 'Watchman'],
  woodcutter: ['Leśniewski', 'Woodward', 'Forester', 'Sawyer', 'Greenwood', 'Timber'],
  blacksmith: ['Kowalski', 'Smith', 'Schmidt', 'Ferrarius', 'Steel', 'Forge'],
  farmer: ['Rolnik', 'Farmer', 'Fields', 'Meadows', 'Granger', 'Agricola'],
  hunter: ['Łowicki', 'Hunter', 'Fletcher', 'Archer', 'Venator', 'Lupus'],
  fisher: ['Rybak', 'Fisher', 'Fischer', 'Rivers', 'Waters', 'Angler'],
  miner: ['Górski', 'Miner', 'Stone', 'Rockwell', 'Bergmann', 'Montanus'],
  trader: ['Kupiec', 'Merchant', 'Mercer', 'Chandler', 'Booker', 'Trader'],
  shepherd: ['Owczarek', 'Shepherd', 'Shepard', 'Schäfer', 'Flock', 'Pastor'],
  textile_worker: ['Tkacz', 'Weaver', 'Taylor', 'Webber', 'Mercer', 'Textor'],
  herbalist: ['Zieliński', 'Green', 'Sage', 'Herbal', 'Sylvan', 'Herbarus'],
}

/** Worldgen household ids produced by `generateFamilies` / `reservedHomeFamilies`.
 *  Authored resident families (`family-story-*` and similar) are not included. */
export function isWorldgenFamilyId(id: string): boolean {
  return WORLDGEN_FAMILY_ID.test(id)
}

function familyIndexFromId(id: string): number | null {
  const match = WORLDGEN_FAMILY_ID.exec(id)
  if (!match) return null
  return Number(match[1])
}

function representativeProfession(family: FamilyDef): Role | null {
  let best: Role | null = null
  let bestRank = Infinity
  for (const member of family.members) {
    if (!isAdultAge(member.age)) continue
    const rank = FAMILY_SURNAME_ROLE_RANK[member.character.role]
    if (rank < bestRank) {
      bestRank = rank
      best = member.character.role
    }
  }
  return best
}

function pickBaseSurname(settlementSeed: number, familyId: string, role: Role): string {
  const pool = ROLE_SURNAME_POOLS[role]
  const familyIndex = familyIndexFromId(familyId) ?? 0
  const random = createSeededRandom(
    settlementSeed
      ^ PROFESSION_SURNAME_SALT
      ^ Math.imul(familyIndex + 1, 0x9e3779b1)
      ^ Math.imul(FAMILY_SURNAME_ROLE_RANK[role] + 1, 0x85ebca6b),
  )
  return pool[Math.floor(random() * pool.length)]!
}

function withFamilySurname(member: FamilyMember, baseSurname: string): FamilyMember {
  const lastName = formatPolishSurnameForGender(baseSurname, member.character.gender)
  return {
    ...member,
    lastName,
    character: { ...member.character, lastName },
  }
}

function applyOneFamily(family: FamilyDef, settlementSeed: number): FamilyDef {
  if (!isWorldgenFamilyId(family.id)) return family
  // Reserved home identities already carry the profession-linked surnames from
  // `RESERVED_CHARACTERS` (Leśniewski / Hornblower). Re-rolling the pool would
  // make those quest-critical names seed-dependent. They remain worldgen-owned
  // (`isWorldgenFamilyId`) so authored `family-story-*` filtering stays separate.
  if (family.id.startsWith('family-reserved-')) return family
  const role = representativeProfession(family)
  if (role == null) return family
  const baseSurname = pickBaseSurname(settlementSeed, family.id, role)
  return {
    ...family,
    members: family.members.map((member) => withFamilySurname(member, baseSurname)),
  }
}

/**
 * Assigns one profession-inspired surname to each worldgen household after
 * `resolveInitialProfessionStaffing()`. Surname stays family-owned: every
 * member shares the same base form, gender-agreed via
 * `formatPolishSurnameForGender`. Authored/specialist resident families keep
 * the names their own system already set. Reserved home families are
 * worldgen-owned but keep the surnames from `RESERVED_CHARACTERS` so Piotr /
 * Anna stay Leśniewski and Marek / Kasia stay Hornblower.
 *
 * Uses a dedicated RNG salt so pool/code changes cannot reshuffle names,
 * roles, ages or layout.
 *
 * @domain settlements-npcs
 */
export function applyProfessionFamilySurnames(
  families: readonly FamilyDef[],
  settlementSeed: number,
): FamilyDef[] {
  let changed = false
  const next = families.map((family) => {
    const applied = applyOneFamily(family, settlementSeed)
    if (applied !== family) changed = true
    return applied
  })
  return changed ? next : families as FamilyDef[]
}
