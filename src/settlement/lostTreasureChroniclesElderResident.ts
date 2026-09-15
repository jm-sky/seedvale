import type { NameCulture } from '../ai/nameCultures'
import type { FamilyDef, VillageSize } from './families'
import type { SettlementCell } from './settlementGenerator'
import { characterForSeed } from '../ai/characters'
import { surnameForGender } from '../ai/nameCultures'

/** Story household id for the Lost Treasure Chronicles elder. Distinct from
 *  `family-reserved-*`, which excludes home-roster adults from staffing and
 *  expeditions. */
export const LOST_TREASURE_ELDER_FAMILY_ID = 'family-story-lost-treasure-elder'

export const LOST_TREASURE_ELDER_GIVEN_NAME = 'Kazimierz'
export const LOST_TREASURE_ELDER_LAST_NAME = 'Nowak'
export const LOST_TREASURE_ELDER_AGE = 74

/** Chebyshev grid radius around home used to pick the elder's settlement. */
export const LOST_TREASURE_ELDER_SETTLEMENT_SEARCH_RADIUS = 1

const PREFERRED_ELDER_SETTLEMENT_SIZES: ReadonlySet<VillageSize> = new Set(['MD', 'SM'])

/**
 * Nearby settlement row used to pick the one guaranteed elder host.
 * Size must be the actual generated size (OUTPOST vs rolled), not a pre-site guess.
 *
 * @domain settlements-npcs
 */
export type LostTreasureElderSettlementCandidate = {
  cell: SettlementCell
  id: string
  size: VillageSize
  x: number
  z: number
  isHome: boolean
}

/**
 * Whether this family is the Lost Treasure Chronicles elder household.
 * Not the legacy `family-reserved-*` home-roster predicate.
 *
 * @domain settlements-npcs
 */
export function isLostTreasureElderFamily(family: Pick<FamilyDef, 'id'>): boolean {
  return family.id === LOST_TREASURE_ELDER_FAMILY_ID
}

/**
 * Append one authored resident family after generated families so existing
 * flattened `NpcId`s stay stable. No-op when the family id is already present.
 *
 * @domain settlements-npcs
 */
export function appendAuthoredResidentFamily(
  families: readonly FamilyDef[],
  resident: FamilyDef,
): FamilyDef[] {
  if (families.some((family) => family.id === resident.id)) return [...families]
  return [...families, resident]
}

/**
 * Authored elder household: ordinary single adult, farmer baseline, age 74.
 * Profession staffing may still reassign the role. Deterministic for the cell seed.
 *
 * @domain settlements-npcs
 */
export function createLostTreasureElderFamily(
  seedForCell: number,
  nameCulture: NameCulture,
): FamilyDef {
  const lastName = surnameForGender(LOST_TREASURE_ELDER_LAST_NAME, nameCulture, 'male')
  const character = characterForSeed(seedForCell ^ 0x31de4, 'male')
  return {
    id: LOST_TREASURE_ELDER_FAMILY_ID,
    members: [{
      name: LOST_TREASURE_ELDER_GIVEN_NAME,
      lastName,
      relation: 'single',
      character: {
        ...character,
        name: LOST_TREASURE_ELDER_GIVEN_NAME,
        lastName,
        gender: 'male',
        role: 'farmer',
      },
      scale: 1,
      age: LOST_TREASURE_ELDER_AGE,
    }],
  }
}

/**
 * Pick the nearest eligible non-home, non-outpost settlement, preferring SM/MD.
 * Tie-break is world-origin distance then stable settlement id — not stream order.
 *
 * @domain settlements-npcs
 */
export function selectLostTreasureChroniclesElderSettlement(
  candidates: readonly LostTreasureElderSettlementCandidate[],
): LostTreasureElderSettlementCandidate | null {
  const eligible = candidates.filter((candidate) => !candidate.isHome && candidate.size !== 'OUTPOST')
  const preferred = eligible.filter((candidate) => PREFERRED_ELDER_SETTLEMENT_SIZES.has(candidate.size))
  const pool = preferred.length > 0 ? preferred : eligible
  if (pool.length === 0) return null
  const sorted = [...pool].sort((a, b) => {
    const da = a.x * a.x + a.z * a.z
    const db = b.x * b.x + b.z * b.z
    return da - db || a.id.localeCompare(b.id)
  })
  return sorted[0] ?? null
}
