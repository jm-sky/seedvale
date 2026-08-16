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
]

/** Busy-channel duration for cooking one item — real-time (not a time-skip),
 *  with the vision blur+desaturate overlay. Same order of magnitude as
 *  harvest/ignite, not minutes of a frozen overlay. */
export const COOK_DURATION_SEC = 5

/** First recipe the player currently holds the input for, or null. */
export function findCookingRecipe(inventory: Inventory): CookingRecipe | null {
  return COOKING_RECIPES.find((recipe) => inventory.has(recipe.input, 1)) ?? null
}
