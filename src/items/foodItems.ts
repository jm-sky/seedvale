import type { Inventory, ItemAmount } from './Inventory'
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

/** Claims up to `amount` food units from `items`, deterministic kind order,
 *  spanning multiple kinds when one alone doesn't cover `amount`. Atomic per
 *  kind (each `remove()` either fully succeeds or is skipped); returns the
 *  kinds/amounts actually removed, which may sum to less than `amount` when
 *  less food is held. */
export function claimFoodItems(items: Inventory, amount: number): ItemAmount[] {
  if (amount <= 0) return []
  const claimed: ItemAmount[] = []
  let remaining = amount
  for (const kind of FOOD_ITEM_KINDS) {
    if (remaining <= 0) break
    const available = items.count(kind)
    if (available <= 0) continue
    const take = Math.min(available, remaining)
    if (items.remove(kind, take)) {
      claimed.push({ kind, amount: take })
      remaining -= take
    }
  }
  return claimed
}

/** Deposits a previously-`claimFoodItems`-claimed set into `items` — the
 *  receiving half of a food transfer between two carriers/owners. */
export function depositFoodItems(items: Inventory, claimed: readonly ItemAmount[]): void {
  for (const { kind, amount } of claimed) items.add(kind, amount)
}
