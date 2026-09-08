import type { VillageFire } from '../settlement/VillageFire'
import type { FoodBatch, Inventory } from './Inventory'
import type { ItemKind } from './items'
import { inheritProcessedFoodBatch, isFoodBatchSpoiled } from './foodFreshness'

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

/** First recipe the player currently holds a non-spoiled input for, or null. */
export function findCookingRecipe(inventory: Inventory, nowDays?: number): CookingRecipe | null {
  return COOKING_RECIPES.find((recipe) => {
    if (!inventory.has(recipe.input, 1)) return false
    if (nowDays == null) return true
    const fifo = inventory.fifoFoodBatch(recipe.input, nowDays)
    return fifo != null && !isFoodBatchSpoiled(recipe.input, fifo, nowDays)
  }) ?? null
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
  nowDays?: number,
): { recipe: CookingRecipe, batch: number } | null {
  const recipe = findCookingRecipe(inventory, nowDays)
  if (!recipe) return null
  const batch = Math.min(capacity, inventory.count(recipe.input))
  return batch > 0 ? { recipe, batch } : null
}

/**
 * Turns consumed raw FIFO batches into processed output batches, inheriting
 * used-fraction and sourceSpecies. Spoiled units are dropped (no edible output).
 *
 * @domain items-player
 */
export function processCookedBatches(
  inputKind: ItemKind,
  outputKind: ItemKind,
  consumed: readonly FoodBatch[],
  completedAtDays: number,
  outputDecayModifier: number,
): FoodBatch[] {
  const outputs: FoodBatch[] = []
  for (const input of consumed) {
    const out = inheritProcessedFoodBatch(input, inputKind, outputKind, completedAtDays, outputDecayModifier)
    if (out) outputs.push(out)
  }
  return outputs
}
