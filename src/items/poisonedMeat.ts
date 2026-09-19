import type { Inventory } from './Inventory'
import { BAIT_ITEM_PRIORITY, bait, type FoodBatch } from './foodFreshness'
import type { ItemKind } from './items'

/**
 * @domain items-player
 * @role Player-side poisoned-meat transform (plan items-player-049) — one
 * `poisonous_herb` plus one eligible raw meat → one `poisoned_meat`, preserving
 * the source `FoodBatch` via freshness-aware inventory APIs.
 */

export type PoisonMeatFailure = 'missing_herb' | 'missing_meat' | 'no_capacity'

export type PoisonMeatResult =
  | { ok: true, meatKind: ItemKind }
  | { ok: false, reason: PoisonMeatFailure }

/** Raw meat kinds that can be poisoned — catalog `food.bait === 'meat'`, excluding output. */
export function isPoisonMeatInputKind(kind: ItemKind): boolean {
  return kind !== 'poisoned_meat' && bait(kind) === 'meat'
}

/** Deterministic eligible input: first carried kind in shared bait priority order. */
export function selectPoisonMeatInputKind(inventory: Inventory): ItemKind | null {
  for (const kind of BAIT_ITEM_PRIORITY) {
    if (!isPoisonMeatInputKind(kind)) continue
    if (inventory.count(kind) > 0) return kind
  }
  return null
}

export function canPoisonMeat(inventory: Inventory): boolean {
  if (!inventory.has('poisonous_herb', 1)) return false
  const meatKind = selectPoisonMeatInputKind(inventory)
  if (!meatKind) return false
  return inventory.canAdd('poisoned_meat', 1)
}

/**
 * All-or-nothing transform. Mutates `inventory` only on full success.
 *
 * @domain items-player
 */
export function poisonMeat(inventory: Inventory, nowDays: number): PoisonMeatResult {
  if (!inventory.has('poisonous_herb', 1)) return { ok: false, reason: 'missing_herb' }
  const meatKind = selectPoisonMeatInputKind(inventory)
  if (!meatKind) return { ok: false, reason: 'missing_meat' }
  if (!inventory.canAdd('poisoned_meat', 1)) return { ok: false, reason: 'no_capacity' }

  const batches: readonly FoodBatch[] | null = inventory.removeWithFreshness(meatKind, 1, nowDays)
  if (!batches) return { ok: false, reason: 'missing_meat' }
  if (!inventory.remove('poisonous_herb', 1)) {
    inventory.addWithFreshness(meatKind, 1, batches, nowDays)
    return { ok: false, reason: 'missing_herb' }
  }
  if (!inventory.addWithFreshness('poisoned_meat', 1, batches, nowDays)) {
    inventory.addWithFreshness(meatKind, 1, batches, nowDays)
    inventory.add('poisonous_herb', 1)
    return { ok: false, reason: 'no_capacity' }
  }
  return { ok: true, meatKind }
}
