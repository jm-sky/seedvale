import type { NameCulture } from '../ai/nameCultures'
import type { FamilyDef, RolledVillageSize, VillageSize } from './families'
import type { NpcId } from './npcState'
import type { SettlementCell } from './settlementGenerator'
import { characterForSeed } from '../ai/characters'
import { surnameForGender } from '../ai/nameCultures'
import { rolledVillageSizeRank } from './families'
import { settlementNpcId } from './npcIdentity'

/** Story household id for the Lost Treasure Chronicles archaeologist. Distinct
 *  from `family-reserved-*`, which excludes home-roster adults from staffing. */
export const LOST_TREASURE_ARCHAEOLOGIST_FAMILY_ID = 'family-story-lost-treasure-archaeologist'

export const LOST_TREASURE_ARCHAEOLOGIST_GIVEN_NAME = 'Konstanty'
export const LOST_TREASURE_ARCHAEOLOGIST_LAST_NAME = 'Wiśniewski'
export const LOST_TREASURE_ARCHAEOLOGIST_AGE = 54

/** Chebyshev grid radius around home used to pick the archaeologist's settlement.
 *  Wider than the elder's radius-1 neighbourhood so a larger town can exist. */
export const LOST_TREASURE_ARCHAEOLOGIST_SETTLEMENT_SEARCH_RADIUS = 5

const PREFERRED_ARCHAEOLOGIST_SETTLEMENT_SIZES: ReadonlySet<VillageSize> = new Set(['LG', 'MD', 'XL'])

/**
 * Nearby settlement row used to pick the guaranteed archaeologist host.
 * Size must be the actual generated size (OUTPOST vs rolled), not a pre-site guess.
 *
 * @domain settlements-npcs
 */
export type LostTreasureArchaeologistSettlementCandidate = {
  cell: SettlementCell
  id: string
  size: VillageSize
  x: number
  z: number
  isHome: boolean
}

/**
 * Whether this family is the Lost Treasure Chronicles archaeologist household.
 *
 * @domain settlements-npcs
 */
export function isLostTreasureArchaeologistFamily(family: Pick<FamilyDef, 'id'>): boolean {
  return family.id === LOST_TREASURE_ARCHAEOLOGIST_FAMILY_ID
}

/**
 * Authored archaeologist household: ordinary single adult, trader baseline, age 54.
 * Profession staffing may still reassign the role. Deterministic for the cell seed.
 *
 * @domain settlements-npcs
 */
export function createLostTreasureArchaeologistFamily(
  seedForCell: number,
  nameCulture: NameCulture,
): FamilyDef {
  const lastName = surnameForGender(LOST_TREASURE_ARCHAEOLOGIST_LAST_NAME, nameCulture, 'male')
  const character = characterForSeed(seedForCell ^ 0x41ae7, 'male')
  return {
    id: LOST_TREASURE_ARCHAEOLOGIST_FAMILY_ID,
    members: [{
      name: LOST_TREASURE_ARCHAEOLOGIST_GIVEN_NAME,
      lastName,
      relation: 'single',
      character: {
        ...character,
        name: LOST_TREASURE_ARCHAEOLOGIST_GIVEN_NAME,
        lastName,
        gender: 'male',
        role: 'trader',
      },
      scale: 1,
      age: LOST_TREASURE_ARCHAEOLOGIST_AGE,
    }],
  }
}

function isRolledSize(size: VillageSize): size is RolledVillageSize {
  return size !== 'OUTPOST'
}

/**
 * Pick a non-home, non-outpost, non-elder settlement, preferring MD/LG/XL that
 * are larger than the elder host when possible. Tie-break is world-origin
 * distance then stable settlement id — not stream order.
 *
 * @domain settlements-npcs
 */
export function selectLostTreasureChroniclesArchaeologistSettlement(
  candidates: readonly LostTreasureArchaeologistSettlementCandidate[],
  elderSettlementId: string | null,
): LostTreasureArchaeologistSettlementCandidate | null {
  const eligible = candidates.filter((candidate) => (
    !candidate.isHome
    && candidate.size !== 'OUTPOST'
    && candidate.id !== elderSettlementId
  ))
  const townPool = eligible.filter((candidate) => (
    PREFERRED_ARCHAEOLOGIST_SETTLEMENT_SIZES.has(candidate.size)
  ))
  const elder = elderSettlementId
    ? candidates.find((candidate) => candidate.id === elderSettlementId)
    : undefined
  const elderSize = elder?.size
  const larger = elderSize && isRolledSize(elderSize)
    ? townPool.filter((candidate) => (
      isRolledSize(candidate.size)
      && rolledVillageSizeRank(candidate.size) > rolledVillageSizeRank(elderSize)
    ))
    : townPool
  const pool = (larger.length > 0 ? larger : townPool.length > 0 ? townPool : eligible)
  if (pool.length === 0) return null
  const sorted = [...pool].sort((a, b) => {
    const da = a.x * a.x + a.z * a.z
    const db = b.x * b.x + b.z * b.z
    return da - db || a.id.localeCompare(b.id)
  })
  return sorted[0] ?? null
}

/**
 * Flattened archaeologist identity from a generated settlement — never display name.
 *
 * @domain settlements-npcs
 */
export function findLostTreasureArchaeologistResident(
  def: { id: string, families: readonly FamilyDef[] },
): { npcId: NpcId, householdId: string, name: string, lastName: string } | null {
  const familyIndex = def.families.findIndex(isLostTreasureArchaeologistFamily)
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
 * Find the settlement definition that actually hosts the authored archaeologist.
 *
 * @domain settlements-npcs
 */
export function findLostTreasureChroniclesArchaeologistSettlement<
  T extends { families: readonly FamilyDef[] },
>(defs: readonly T[]): T | undefined {
  return defs.find((def) => def.families.some(isLostTreasureArchaeologistFamily))
}
