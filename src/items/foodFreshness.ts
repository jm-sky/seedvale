import type { ItemKind } from './items'
import { ITEM_CATALOG } from './itemCatalog'

/** Plan 159 — shared Fresh → Medium → Spoiled resolver. Freshness is always
 *  *derived* from `ItemCatalogEntry.food.freshness` + a stack's authoritative
 *  `acquiredAtDays` + the current world day — never a separately mutated
 *  timer, and never persisted itself (only `acquiredAtDays` is). A kind with
 *  no `food.freshness` entry (e.g. `honey`, or any non-food item) never
 *  spoils. */
export type FreshnessStage = 'fresh' | 'medium' | 'spoiled'

export function foodFreshnessDef(kind: ItemKind): { freshDurationDays: number, mediumDurationDays: number } | null {
  return ITEM_CATALOG[kind].food?.freshness ?? null
}

/** Whether `kind` needs stack-level `acquiredAtDays` bookkeeping in
 *  `Inventory` at all — non-perishable kinds (tools, resources, `honey`,
 *  ...) skip the batch machinery entirely. */
export function isFoodPerishable(kind: ItemKind): boolean {
  return foodFreshnessDef(kind) != null
}

export function getFreshnessStage(kind: ItemKind, acquiredAtDays: number, nowDays: number): FreshnessStage {
  const def = foodFreshnessDef(kind)
  if (!def) return 'fresh'
  const age = Math.max(0, nowDays - acquiredAtDays)
  if (age < def.freshDurationDays) return 'fresh'
  if (age < def.freshDurationDays + def.mediumDurationDays) return 'medium'
  return 'spoiled'
}

export function isSpoiled(kind: ItemKind, acquiredAtDays: number, nowDays: number): boolean {
  return getFreshnessStage(kind, acquiredAtDays, nowDays) === 'spoiled'
}

/** In-game days of acquisition-time slack within which two batches of the
 *  same `kind` are considered "compatible age" and may merge into one stack
 *  (plan 159 §3). A fixed small tolerance rather than a fraction of
 *  `freshDurationDays` — keeps merge behavior simple and predictable across
 *  every perishable kind. */
export const FOOD_BATCH_MERGE_TOLERANCE_DAYS = 0.2

export function canMergeFoodBatches(acquiredAtDaysA: number, acquiredAtDaysB: number): boolean {
  return Math.abs(acquiredAtDaysA - acquiredAtDaysB) <= FOOD_BATCH_MERGE_TOLERANCE_DAYS
}

export function bait(kind: ItemKind): 'meat' | 'plant' | null {
  return ITEM_CATALOG[kind].food?.bait ?? null
}

export function isBaitCapable(kind: ItemKind): boolean {
  return bait(kind) != null
}

/** Cheap plant food first, meat last — used both for trap auto-bait
 *  (`app/createApp.ts`'s `armTrap`) and fishing bait so a player doesn't get
 *  their meat supply silently spent when a berry would do. */
export const BAIT_ITEM_PRIORITY: readonly ItemKind[] = [
  'mushroom', 'berries', 'carrot', 'nuts', 'apple', 'fish',
  'raw_meat', 'deer_meat', 'wolf_meat', 'boar_meat', 'rabbit_meat', 'beef',
]
