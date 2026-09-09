import type { ItemKind } from '../items/items'
import type { HouseholdResourceKind } from './household'
import { hasItemKindCategory } from '../items/items'
import type { Vector3 } from 'three'
import type { SettlementLandmarks } from './props'

/**
 * Shared storage-destination resolution (plan settlements-npcs-009) — the
 * single "WHERE does a carried resource/item physically go" answer for both
 * household and settlement delivery. Built on the wood/food physical points
 * that already exist rather than a new storage-place system:
 *
 * - household `wood` resolves to that household's own yard wood pile
 *   (`landmarks.householdWoodStorages`, index-aligned with `homes`);
 * - settlement `wood` resolves to the settlement stockpile (`landmarks.stockpile`);
 * - `food` resolves to a household's own home (its pantry — where eating,
 *   hunting/fishing/farming delivery and food exchange already land) or, at
 *   settlement scope, the settlement's storage crate
 *   (`landmarks.settlementStorage`).
 *
 * @domain settlements-npcs
 * @system storage-destinations
 * @role Resolves the physical destination for a wood/food delivery, given the household or settlement it belongs to.
 */

/** Classifies a carried item into the storage category it belongs to, reusing
 *  the existing `ItemCategory` classification (plan settlements-npcs-008) —
 *  no parallel food-kind list. `null` for items with no storage-destination
 *  category (equipment, hides, ore, etc.); callers keep using their existing
 *  destination rule for those. */
export function classifyItemStorageKind(kind: ItemKind): HouseholdResourceKind | null {
  return hasItemKindCategory(kind, 'food') ? 'food' : null
}

/** Household-scope destination for `kind` — explicit food and wood points
 *  so callers cannot accidentally route household wood to settlement stock. */
export function householdStorageDestination(
  kind: HouseholdResourceKind,
  foodDestination: Vector3,
  woodDestination: Vector3,
): Vector3 {
  return kind === 'food' ? foodDestination : woodDestination
}

/** Index-aligned household wood pile for `home` — same ordering as
 *  `landmarks.homes` / `householdWoodStorages`. */
export function resolveHouseholdWoodStorage(
  home: Vector3,
  landmarks: Pick<SettlementLandmarks, 'homes' | 'householdWoodStorages'>,
): Vector3 {
  const homes = landmarks.homes ?? []
  const woodStorages = landmarks.householdWoodStorages ?? []
  for (let i = 0; i < homes.length; i++) {
    const houseHome = homes[i]!
    if (Math.hypot(houseHome.x - home.x, houseHome.z - home.z) < 0.01) {
      return woodStorages[i] ?? houseHome
    }
  }
  return home
}

/** Settlement-scope destination for `kind` — the settlement's storage crate
 *  for food, the settlement stockpile for wood. */
export function settlementStorageDestination(kind: HouseholdResourceKind, stockpile: Vector3, settlementStorage: Vector3): Vector3 {
  return kind === 'food' ? settlementStorage : stockpile
}
