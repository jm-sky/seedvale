import type { NameCulture } from '../ai/nameCultures'
import type { FamilyDef, VillageSize } from './families'
import type { NpcId } from './npcState'
import type { SettlementCell } from './settlementGenerator'
import { characterForSeed } from '../ai/characters'
import { surnameForGender } from '../ai/nameCultures'
import { settlementNpcId } from './npcIdentity'

/** Story household id for the Lost Treasure Chronicles deciphering specialist. */
export const LOST_TREASURE_SPECIALIST_FAMILY_ID = 'family-story-lost-treasure-specialist'

export const LOST_TREASURE_SPECIALIST_GIVEN_NAME = 'Stanisław'
export const LOST_TREASURE_SPECIALIST_LAST_NAME = 'Kwiatkowski'
export const LOST_TREASURE_SPECIALIST_AGE = 61

/** Same Chebyshev radius as the archaeologist host search — a third
 *  settlement is preferred when one exists, never required. */
export const LOST_TREASURE_SPECIALIST_SETTLEMENT_SEARCH_RADIUS = 5

const PREFERRED_SPECIALIST_SETTLEMENT_SIZES: ReadonlySet<VillageSize> = new Set(['LG', 'MD', 'XL'])

/**
 * Nearby settlement row used to pick the guaranteed specialist host.
 * Size must be the actual generated size (OUTPOST vs rolled), not a pre-site guess.
 *
 * @domain settlements-npcs
 */
export type LostTreasureSpecialistSettlementCandidate = {
  cell: SettlementCell
  id: string
  size: VillageSize
  x: number
  z: number
  isHome: boolean
}

/**
 * Whether this family is the Lost Treasure Chronicles specialist household.
 *
 * @domain settlements-npcs
 */
export function isLostTreasureSpecialistFamily(family: Pick<FamilyDef, 'id'>): boolean {
  return family.id === LOST_TREASURE_SPECIALIST_FAMILY_ID
}

/**
 * Authored specialist household: ordinary single adult, trader baseline, age 61.
 * Profession staffing may still reassign the role. Deterministic for the cell seed.
 *
 * @domain settlements-npcs
 */
export function createLostTreasureSpecialistFamily(
  seedForCell: number,
  nameCulture: NameCulture,
): FamilyDef {
  const lastName = surnameForGender(LOST_TREASURE_SPECIALIST_LAST_NAME, nameCulture, 'male')
  const character = characterForSeed(seedForCell ^ 0x51bf8, 'male')
  return {
    id: LOST_TREASURE_SPECIALIST_FAMILY_ID,
    members: [{
      name: LOST_TREASURE_SPECIALIST_GIVEN_NAME,
      lastName,
      relation: 'single',
      character: {
        ...character,
        name: LOST_TREASURE_SPECIALIST_GIVEN_NAME,
        lastName,
        gender: 'male',
        role: 'trader',
      },
      scale: 1,
      age: LOST_TREASURE_SPECIALIST_AGE,
    }],
  }
}

function sortCandidates(
  pool: readonly LostTreasureSpecialistSettlementCandidate[],
): LostTreasureSpecialistSettlementCandidate[] {
  return [...pool].sort((a, b) => {
    const da = a.x * a.x + a.z * a.z
    const db = b.x * b.x + b.z * b.z
    return da - db || a.id.localeCompare(b.id)
  })
}

/**
 * Pick a non-home, non-outpost, non-elder, non-archaeologist settlement when
 * one exists, preferring MD/LG/XL. If none remain, fall back to the
 * archaeologist host instead of forcing a third settlement.
 * Tie-break is world-origin distance then stable settlement id — not stream order.
 *
 * @domain settlements-npcs
 */
export function selectLostTreasureChroniclesSpecialistSettlement(
  candidates: readonly LostTreasureSpecialistSettlementCandidate[],
  elderSettlementId: string | null,
  archaeologistSettlementId: string | null,
): LostTreasureSpecialistSettlementCandidate | null {
  const excluded = new Set(
    [elderSettlementId, archaeologistSettlementId].filter((id): id is string => Boolean(id)),
  )
  const eligible = candidates.filter((candidate) => (
    !candidate.isHome
    && candidate.size !== 'OUTPOST'
    && !excluded.has(candidate.id)
  ))
  const preferred = eligible.filter((candidate) => PREFERRED_SPECIALIST_SETTLEMENT_SIZES.has(candidate.size))
  const pool = preferred.length > 0 ? preferred : eligible
  if (pool.length > 0) return sortCandidates(pool)[0] ?? null
  if (!archaeologistSettlementId) return null
  const fallback = candidates.find((candidate) => (
    candidate.id === archaeologistSettlementId
    && !candidate.isHome
    && candidate.size !== 'OUTPOST'
  ))
  return fallback ?? null
}

/**
 * Flattened specialist identity from a generated settlement — never display name.
 *
 * @domain settlements-npcs
 */
export function findLostTreasureSpecialistResident(
  def: { id: string, families: readonly FamilyDef[] },
): { npcId: NpcId, householdId: string, name: string, lastName: string } | null {
  const familyIndex = def.families.findIndex(isLostTreasureSpecialistFamily)
  if (familyIndex < 0) return null
  const family = def.families[familyIndex]!
  const member = family.members[0]
  if (!member) return null
  let memberIndex = 0
  for (let i = 0; i < familyIndex; i++) memberIndex += def.families[i]!.members.length
  return {
    npcId: settlementNpcId(def.id, memberIndex),
    householdId: family.id,
    name: member.name,
    lastName: member.lastName,
  }
}

/**
 * Find the settlement definition that actually hosts the authored specialist.
 *
 * @domain settlements-npcs
 */
export function findLostTreasureChroniclesSpecialistSettlement<
  T extends { families: readonly FamilyDef[] },
>(defs: readonly T[]): T | undefined {
  return defs.find((def) => def.families.some(isLostTreasureSpecialistFamily))
}
