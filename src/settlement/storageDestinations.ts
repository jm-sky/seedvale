import type { ItemKind } from '../items/items'
import type { HouseholdResourceKind } from './household'
import { hasItemKindCategory } from '../items/items'
import type { Vector3 } from 'three'

/**
 * Shared storage-destination resolution (plan settlements-npcs-009) — the
 * single "WHERE does a carried resource/item physically go" answer for both
 * household and settlement delivery. Built on the wood/food physical points
 * that already exist rather than a new storage-place system:
 *
 * - `wood` always resolves to the settlement's shared stockpile
 *   (`landmarks.stockpile`) — one village woodpile serves both a
 *   household's own `stock.wood` and the settlement's bulk `wood`, exactly
 *   how wood delivery already works (unchanged by this module).
 * - `food` resolves to a household's own home (its pantry — where eating,
 *   hunting/fishing/farming delivery and food exchange already land) or, at
 *   settlement scope, the settlement's storage crate
 *   (`landmarks.settlementStorage`) — previously a read-only presentation
 *   prop (plan 156), now also the settlement's real Food Storage
 *   destination.
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

/** Household-scope destination for `kind` — a household's own pantry
 *  (`home`) for food, the shared village stockpile for wood. */
export function householdStorageDestination(kind: HouseholdResourceKind, home: Vector3, stockpile: Vector3): Vector3 {
  return kind === 'food' ? home : stockpile
}

/** Settlement-scope destination for `kind` — the settlement's storage crate
 *  for food, the shared village stockpile for wood. */
export function settlementStorageDestination(kind: HouseholdResourceKind, stockpile: Vector3, settlementStorage: Vector3): Vector3 {
  return kind === 'food' ? settlementStorage : stockpile
}
