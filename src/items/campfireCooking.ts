import type { VillageFire } from '../settlement/VillageFire'
import type { Inventory } from './Inventory'
import type { ItemKind } from './items'

/** Plan 106 §6 — first (and deliberately only) processing recipe: `input
 *  item(s) → processing station → output item`. Intentionally a flat lookup
 *  table, not a crafting system — a future recipe is just another row here,
 *  no new mechanism. */
export type CookingRecipe = {
  input: ItemKind
  output: ItemKind
  count: number
}

export const COOKING_RECIPES: readonly CookingRecipe[] = [
  { input: 'raw_meat', output: 'roasted_meat', count: 1 },
  // Plan 134 — every species meat cooks down to the same roasted_meat output;
  // no separate roasted variant per species.
  { input: 'deer_meat', output: 'roasted_meat', count: 1 },
  { input: 'wolf_meat', output: 'roasted_meat', count: 1 },
  { input: 'boar_meat', output: 'roasted_meat', count: 1 },
  { input: 'rabbit_meat', output: 'roasted_meat', count: 1 },
  { input: 'beef', output: 'roasted_meat', count: 1 },
  // Plan items-player-012 — fish is a distinct food identity from terrestrial
  // meat, so it gets its own recipe row/output rather than folding into
  // roasted_meat.
  { input: 'fish', output: 'roasted_fish', count: 1 },
]

/** Busy-channel duration for cooking one item — real-time (not a time-skip),
 *  with the vision blur+desaturate overlay. Same order of magnitude as
 *  harvest/ignite, not minutes of a frozen overlay. */
export const COOK_DURATION_SEC = 5

/** First recipe the player currently holds the input for, or null. */
export function findCookingRecipe(inventory: Inventory): CookingRecipe | null {
  return COOKING_RECIPES.find((recipe) => inventory.has(recipe.input, 1)) ?? null
}

/** Plan 175 — how many meat items a station can process in one cooking
 *  action: 1 for a bare fire, 2 with a carried `pan` (an inventory
 *  capability, not a cooking station of its own), 4 once *this specific*
 *  fire has a grate built on it (`settlement/VillageFire.ts`'s `hasGrate`).
 *  The grate wins outright rather than stacking with the pan (plan §6) —
 *  reading `fire.hasGrate()` directly, never a `PlacedFireKind`/`firepit`
 *  check, is what lets any fire that can carry a grate benefit here without
 *  touching this resolver. */
export function resolveCookingCapacity(fire: VillageFire, inventory: Inventory): 1 | 2 | 4 {
  if (fire.hasGrate()) return 4
  if (inventory.has('pan', 1)) return 2
  return 1
}

/** One resolved cooking recipe scaled to what the station/inventory actually
 *  allow right now — `batch` is `capacity` clamped to how many `recipe.input`
 *  the player is carrying, so a batch is never proposed larger than the
 *  inventory can pay for. Still a single flat recipe row underneath (plan
 *  §5): this only decides *how many* of it run at once, never which recipe. */
export function findCookingBatch(
  inventory: Inventory,
  capacity: number,
): { recipe: CookingRecipe, batch: number } | null {
  const recipe = findCookingRecipe(inventory)
  if (!recipe) return null
  const batch = Math.min(capacity, inventory.count(recipe.input))
  return batch > 0 ? { recipe, batch } : null
}
