import type { FoodBatch, Inventory, ItemAmount } from './Inventory'
import { hasItemKindCategory, ITEM_DEFS, type ItemKind } from './items'

/**
 * Shared concrete-food domain helpers (plan settlements-npcs-008) — the
 * single place `Household`/`SettlementEconomy` derive a food unit count or
 * select/remove a food item from their own `Inventory`, instead of each
 * keeping a second abstract `food` scalar. Reuses the existing
 * `ItemCategory = 'food'` classification (`items/items.ts`) rather than a
 * parallel food-kind list.
 */

/** Deterministic food-kind order — catalog declaration order, same idiom as
 *  `npcAssistance.ts`'s `findCarriedConsumableKind`, so repeated eat/gather/
 *  claim decisions against the same inventory state pick the same concrete
 *  item every time (no `Math.random()`, no `Object.keys()` used as an
 *  implicit-but-unintentional rule). */
export const FOOD_ITEM_KINDS: readonly ItemKind[] = (Object.keys(ITEM_DEFS) as ItemKind[]).filter((kind) =>
  hasItemKindCategory(kind, 'food'),
)

/** Total concrete food-item units a carrier holds — one unit == one held
 *  item, preserving the pre-migration one-item/one-food-unit semantics. */
export function foodItemCount(items: Inventory): number {
  let total = 0
  for (const kind of FOOD_ITEM_KINDS) total += items.count(kind)
  return total
}

/** Removes exactly one concrete food item (first `FOOD_ITEM_KINDS` match with
 *  a positive count) — the atomic "eat one unit" primitive. Returns the
 *  removed kind, or null when no food is held. */
export function takeOneFoodItem(items: Inventory): ItemKind | null {
  for (const kind of FOOD_ITEM_KINDS) {
    if (items.remove(kind, 1)) return kind
  }
  return null
}

/** A `claimFoodItems()` result for one kind — `ItemAmount` plus the exact
 *  freshness batches consumed (oldest first; empty for a non-perishable
 *  kind), so a transfer can restore `acquiredAtDays` on deposit instead of
 *  losing it to `Inventory.add()`'s day-0 default (plan settlements-npcs-014
 *  implementation notes §11). */
export type FoodItemClaim = ItemAmount & { batches: readonly FoodBatch[] }

/** Claims up to `amount` food units from `items`, deterministic kind order,
 *  spanning multiple kinds when one alone doesn't cover `amount`. Atomic per
 *  kind (each `removeWithFreshness()` either fully succeeds or is skipped);
 *  returns the kinds/amounts actually removed, which may sum to less than
 *  `amount` when less food is held. */
export function claimFoodItems(items: Inventory, amount: number): FoodItemClaim[] {
  if (amount <= 0) return []
  const claimed: FoodItemClaim[] = []
  let remaining = amount
  for (const kind of FOOD_ITEM_KINDS) {
    if (remaining <= 0) break
    const available = items.count(kind)
    if (available <= 0) continue
    const take = Math.min(available, remaining)
    const batches = items.removeWithFreshness(kind, take)
    if (batches) {
      claimed.push({ kind, amount: take, batches })
      remaining -= take
    }
  }
  return claimed
}

/** Deposits a previously-`claimFoodItems`-claimed set into `items` — the
 *  receiving half of a food transfer between two carriers/owners, freshness
 *  intact (`Inventory.addWithFreshness`). */
export function depositFoodItems(items: Inventory, claimed: readonly FoodItemClaim[]): void {
  for (const { kind, amount, batches } of claimed) items.addWithFreshness(kind, amount, batches)
}

/** Physical-carry counterpart of `claimFoodItems`/`depositFoodItems` (plan
 *  settlements-npcs-014) — moves an already-claimed set into `carrier` (an
 *  NPC's `carried` cargo `Inventory`) instead of depositing it straight into
 *  the final destination, so a two-leg pickup→delivery trip has an explicit
 *  owner for the goods between claim and deposit: `source + carrier +
 *  destination` stays constant even if the trip is interrupted afterwards
 *  (implementation notes §3 — before this, a claim lived only in a local
 *  closure variable, an implicit and losable "in transit" state). Capacity
 *  is rare to actually exceed (carry weight limit vs a few food units) but a
 *  claim that doesn't fit is refunded straight back to `refundTo` — the
 *  inventory it was just claimed from — rather than silently lost. Returns
 *  only the portion that actually made it into `carrier`, ready for
 *  `deliverCarriedFoodClaim()` to walk on the next leg. */
export function carryFoodClaim(carrier: Inventory, claimed: readonly FoodItemClaim[], refundTo: Inventory): FoodItemClaim[] {
  const carried: FoodItemClaim[] = []
  for (const claim of claimed) {
    if (carrier.addWithFreshness(claim.kind, claim.amount, claim.batches)) carried.push(claim)
    else refundTo.addWithFreshness(claim.kind, claim.amount, claim.batches)
  }
  return carried
}

/** Delivers a `carryFoodClaim()`-loaded set out of `carrier` into
 *  `destination`, freshness intact — the completing leg of the claim→carry→
 *  deposit chain. */
export function deliverCarriedFoodClaim(carrier: Inventory, claimed: readonly FoodItemClaim[], destination: Inventory): void {
  for (const { kind, amount, batches } of claimed) {
    carrier.remove(kind, amount)
    destination.addWithFreshness(kind, amount, batches)
  }
}
