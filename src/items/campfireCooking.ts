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
]

/** Busy-channel duration for cooking one item — short, same order of
 *  magnitude as `AnimalAgent.ts`'s `BURY_DURATION_SEC`. */
export const COOK_DURATION_SEC = 2

/** First recipe the player currently holds the input for, or null. */
export function findCookingRecipe(inventory: Inventory): CookingRecipe | null {
  return COOKING_RECIPES.find((recipe) => inventory.has(recipe.input, 1)) ?? null
}
