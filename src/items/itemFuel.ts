import type { Inventory } from './Inventory'
import type { ItemKind } from './items'
import { ITEM_CATALOG } from './itemCatalog'

/**
 * @domain items-player
 * @system item-fuel
 * @role Catalog-driven campfire fuel resolution (plan items-player-023) — the
 *  fuel counterpart of `hasItemCapability`/`findWithCapability`. `VillageFire`
 *  receives a resolved branch-equivalent contribution and never has to know
 *  which item kind produced it.
 */

/** Deterministic auto-fuel-selection order — cheapest/most-disposable first,
 *  so an automatic top-up never reaches for a beam while kindling or a
 *  branch is still available. Kept in one place; ignition and refuel call-
 *  sites both read this instead of re-deriving their own order. */
export const FUEL_ITEM_PRIORITY: readonly ItemKind[] = ['cone', 'branch', 'beam']

/** Relative branch-equivalent fuel value for `kind`, or `null` when it isn't
 *  fuel at all. `branch` is `1` — the base unit `VillageFire`'s
 *  `fuelPerBranch` already burns for one branch. */
export function fuelValue(kind: ItemKind): number | null {
  return ITEM_CATALOG[kind].utility?.fuel?.value ?? null
}

export function isFuel(kind: ItemKind): boolean {
  return fuelValue(kind) != null
}

/** First fuel kind the inventory holds at least one of, in
 *  `FUEL_ITEM_PRIORITY` order — the single selection policy every fuel
 *  call-site (ignite, refuel) shares instead of iterating the catalog or
 *  re-deriving its own order. */
export function selectFuelKind(inventory: Inventory): ItemKind | null {
  return FUEL_ITEM_PRIORITY.find((kind) => inventory.has(kind, 1)) ?? null
}
