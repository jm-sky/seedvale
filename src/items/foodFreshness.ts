import type { ItemKind } from './items'
import { ITEM_CATALOG } from './itemCatalog'

/** Plan 159 — shared Fresh → Medium → Spoiled resolver. Freshness is always
 *  *derived* from catalog durations + a batch's effective age, never a
 *  separately mutated timer. A kind with no `food.freshness` entry (e.g.
 *  `honey`) never spoils. */
export type FreshnessStage = 'fresh' | 'medium' | 'spoiled'

/** Meat-producing species that processed meat can remember as provenance
 *  (`roasted_meat` / `dried_meat`). Kept in the items domain so food
 *  bookkeeping does not import `AnimalAgent` (plan items-player-002). */
export type FoodSourceSpecies = 'deer' | 'wolf' | 'boar' | 'rabbit' | 'cow'

export const FOOD_SOURCE_SPECIES: readonly FoodSourceSpecies[] = ['deer', 'wolf', 'boar', 'rabbit', 'cow']

const FOOD_SOURCE_SPECIES_SET: ReadonlySet<string> = new Set(FOOD_SOURCE_SPECIES)

export function isFoodSourceSpecies(value: unknown): value is FoodSourceSpecies {
  return typeof value === 'string' && FOOD_SOURCE_SPECIES_SET.has(value)
}

export const SOURCE_SPECIES_BY_MEAT_KIND: Partial<Record<ItemKind, FoodSourceSpecies>> = {
  deer_meat: 'deer',
  wolf_meat: 'wolf',
  boar_meat: 'boar',
  rabbit_meat: 'rabbit',
  beef: 'cow',
}

export const MEAT_KIND_BY_SOURCE_SPECIES: Record<FoodSourceSpecies, ItemKind> = {
  deer: 'deer_meat',
  wolf: 'wolf_meat',
  boar: 'boar_meat',
  rabbit: 'rabbit_meat',
  cow: 'beef',
}

export const FOOD_SOURCE_SPECIES_LABEL: Record<FoodSourceSpecies, string> = {
  deer: 'sarna',
  wolf: 'wilk',
  boar: 'dzik',
  rabbit: 'królik',
  cow: 'krowa',
}

export const FRESHNESS_STAGE_LABEL: Record<FreshnessStage, string> = {
  fresh: 'Świeże',
  medium: 'Średnio świeże',
  spoiled: 'Zepsute',
}

/** Player / NPC carried inventory, drying-rack input, dropped world food. */
export const CARRIED_FOOD_DECAY = 1

/** Chest (placed or carried), household `items`, settlement economy food. */
export const STORED_FOOD_DECAY = 0.5

/**
 * One perishable stack-level batch (plan items-player-002). `acquiredAtDays`
 * is provenance for the current product form and never changes on transfer.
 * Effective age is lazy: `accumulatedEffectiveAge` at `lastCheckpointDays`,
 * then `(nowDays - lastCheckpointDays) * decayModifier` while stationary.
 *
 * @domain items-player
 */
export type FoodBatch = {
  count: number
  acquiredAtDays: number
  sourceSpecies?: FoodSourceSpecies
  accumulatedEffectiveAge: number
  lastCheckpointDays: number
  decayModifier: number
}

export function foodFreshnessDef(kind: ItemKind): { freshDurationDays: number, mediumDurationDays: number } | null {
  return ITEM_CATALOG[kind].food?.freshness ?? null
}

/** Total effective-age days from Fresh through the end of Medium. */
export function foodTotalShelfLifeDays(kind: ItemKind): number | null {
  const def = foodFreshnessDef(kind)
  if (!def) return null
  return def.freshDurationDays + def.mediumDurationDays
}

export function isFoodPerishable(kind: ItemKind): boolean {
  return foodFreshnessDef(kind) != null
}

export function sourceSpeciesForMeatKind(kind: ItemKind): FoodSourceSpecies | undefined {
  return SOURCE_SPECIES_BY_MEAT_KIND[kind]
}

/**
 * Clone a batch, filling missing checkpoint fields the way a pre-provenance
 * save must restore: age from `acquiredAtDays` at 1.0×, never from "now".
 *
 * @domain items-player
 */
export function normalizeFoodBatch(batch: FoodBatch, fallbackDecay = CARRIED_FOOD_DECAY): FoodBatch {
  const acquiredAtDays = Number.isFinite(batch.acquiredAtDays) ? batch.acquiredAtDays : 0
  const lastCheckpointDays = Number.isFinite(batch.lastCheckpointDays) ? batch.lastCheckpointDays : acquiredAtDays
  const accumulatedEffectiveAge = Number.isFinite(batch.accumulatedEffectiveAge) ? Math.max(0, batch.accumulatedEffectiveAge) : 0
  const decayModifier = Number.isFinite(batch.decayModifier) && batch.decayModifier > 0 ? batch.decayModifier : fallbackDecay
  const normalized: FoodBatch = {
    count: batch.count,
    acquiredAtDays,
    accumulatedEffectiveAge,
    lastCheckpointDays,
    decayModifier,
  }
  if (batch.sourceSpecies && isFoodSourceSpecies(batch.sourceSpecies)) normalized.sourceSpecies = batch.sourceSpecies
  return normalized
}

export function cloneFoodBatch(batch: FoodBatch): FoodBatch {
  return normalizeFoodBatch(batch, batch.decayModifier)
}

/** New harvest / production batch sitting in `decayModifier` storage from `nowDays`. */
export function createFoodBatch(
  count: number,
  acquiredAtDays: number,
  decayModifier: number,
  sourceSpecies?: FoodSourceSpecies,
): FoodBatch {
  const batch: FoodBatch = {
    count,
    acquiredAtDays,
    accumulatedEffectiveAge: 0,
    lastCheckpointDays: acquiredAtDays,
    decayModifier,
  }
  if (sourceSpecies) batch.sourceSpecies = sourceSpecies
  return batch
}

/**
 * Effective age at `nowDays` under the batch's current storage modifier.
 *
 * @domain items-player
 */
export function foodBatchEffectiveAge(batch: FoodBatch, nowDays: number): number {
  const elapsed = Math.max(0, nowDays - batch.lastCheckpointDays)
  return Math.max(0, batch.accumulatedEffectiveAge + elapsed * batch.decayModifier)
}

export function foodBatchUsedFraction(kind: ItemKind, batch: FoodBatch, nowDays: number): number {
  const total = foodTotalShelfLifeDays(kind)
  if (total == null || total <= 0) return 0
  return foodBatchEffectiveAge(batch, nowDays) / total
}

export function getFreshnessStageFromAge(kind: ItemKind, effectiveAge: number): FreshnessStage {
  const def = foodFreshnessDef(kind)
  if (!def) return 'fresh'
  if (effectiveAge < def.freshDurationDays) return 'fresh'
  if (effectiveAge < def.freshDurationDays + def.mediumDurationDays) return 'medium'
  return 'spoiled'
}

export function getFoodBatchFreshnessStage(kind: ItemKind, batch: FoodBatch, nowDays: number): FreshnessStage {
  return getFreshnessStageFromAge(kind, foodBatchEffectiveAge(batch, nowDays))
}

/** 1.0× calendar age from `acquiredAtDays` — the pre-storage-modifier formula. */
export function getFreshnessStage(kind: ItemKind, acquiredAtDays: number, nowDays: number): FreshnessStage {
  return getFreshnessStageFromAge(kind, Math.max(0, nowDays - acquiredAtDays))
}

export function isSpoiled(kind: ItemKind, acquiredAtDays: number, nowDays: number): boolean {
  return getFreshnessStage(kind, acquiredAtDays, nowDays) === 'spoiled'
}

export function isFoodBatchSpoiled(kind: ItemKind, batch: FoodBatch, nowDays: number): boolean {
  return getFoodBatchFreshnessStage(kind, batch, nowDays) === 'spoiled'
}

/**
 * Materialize effective age at `nowDays` and switch the batch onto
 * `nextDecayModifier`. Identity-preserving: `acquiredAtDays` / `sourceSpecies`
 * stay put.
 *
 * @domain items-player
 */
export function checkpointFoodBatch(batch: FoodBatch, nowDays: number, nextDecayModifier: number): FoodBatch {
  const age = foodBatchEffectiveAge(batch, nowDays)
  const next: FoodBatch = {
    count: batch.count,
    acquiredAtDays: batch.acquiredAtDays,
    accumulatedEffectiveAge: age,
    lastCheckpointDays: nowDays,
    decayModifier: nextDecayModifier,
  }
  if (batch.sourceSpecies) next.sourceSpecies = batch.sourceSpecies
  return next
}

/** Lossless merge: every provenance / decay field except `count` must match. */
export function foodBatchesMergeEqual(a: FoodBatch, b: FoodBatch): boolean {
  return (
    a.acquiredAtDays === b.acquiredAtDays &&
    a.sourceSpecies === b.sourceSpecies &&
    a.accumulatedEffectiveAge === b.accumulatedEffectiveAge &&
    a.lastCheckpointDays === b.lastCheckpointDays &&
    a.decayModifier === b.decayModifier
  )
}

/** @deprecated plan items-player-002 — exact metadata match replaced tolerance averaging. */
export const FOOD_BATCH_MERGE_TOLERANCE_DAYS = 0.2

export function canMergeFoodBatches(acquiredAtDaysA: number, acquiredAtDaysB: number): boolean {
  return acquiredAtDaysA === acquiredAtDaysB
}

/**
 * FIFO: least remaining effective shelf-life first (highest used-fraction),
 * then earlier `acquiredAtDays`. Caller supplies a stable index tie-break.
 *
 * @domain items-player
 */
export function compareFoodBatchesFifo(kind: ItemKind, nowDays: number, a: FoodBatch, b: FoodBatch): number {
  const usedA = foodBatchUsedFraction(kind, a, nowDays)
  const usedB = foodBatchUsedFraction(kind, b, nowDays)
  if (usedA !== usedB) return usedB - usedA
  if (a.acquiredAtDays !== b.acquiredAtDays) return a.acquiredAtDays - b.acquiredAtDays
  return 0
}

/**
 * Processing output starts its own shelf-life at the same used-fraction as
 * the input at `completedAtDays`. Returns null when the input is already
 * Spoiled (cannot be rescued).
 *
 * @domain items-player
 */
export function inheritProcessedFoodBatch(
  input: FoodBatch,
  inputKind: ItemKind,
  outputKind: ItemKind,
  completedAtDays: number,
  outputDecayModifier: number,
): FoodBatch | null {
  const inputTotal = foodTotalShelfLifeDays(inputKind)
  const outputTotal = foodTotalShelfLifeDays(outputKind)
  if (inputTotal == null || outputTotal == null) return null
  if (isFoodBatchSpoiled(inputKind, input, completedAtDays)) return null
  const usedFraction = Math.min(1, Math.max(0, foodBatchEffectiveAge(input, completedAtDays) / inputTotal))
  const output: FoodBatch = {
    count: input.count,
    acquiredAtDays: completedAtDays,
    accumulatedEffectiveAge: usedFraction * outputTotal,
    lastCheckpointDays: completedAtDays,
    decayModifier: outputDecayModifier,
  }
  if (input.sourceSpecies) output.sourceSpecies = input.sourceSpecies
  return output
}

/**
 * Hunger relief for a food unit. Processed meat (`roasted_meat` /
 * `dried_meat`) scales the processed catalog relief by the source species'
 * raw-meat / generic-`raw_meat` ratio so species differences survive cooking
 * without extra ItemKinds.
 *
 * @domain items-player
 */
export function foodHungerRelief(kind: ItemKind, sourceSpecies?: FoodSourceSpecies): number {
  const base = ITEM_CATALOG[kind].consumable?.relief ?? 0
  if (!sourceSpecies || (kind !== 'roasted_meat' && kind !== 'dried_meat')) return base
  const speciesKind = MEAT_KIND_BY_SOURCE_SPECIES[sourceSpecies]
  const speciesRelief = ITEM_CATALOG[speciesKind].consumable?.relief
  const genericRaw = ITEM_CATALOG.raw_meat.consumable?.relief
  if (!speciesRelief || !genericRaw) return base
  return base * (speciesRelief / genericRaw)
}

export function bait(kind: ItemKind): 'meat' | 'plant' | null {
  return ITEM_CATALOG[kind].food?.bait ?? null
}

export function isBaitCapable(kind: ItemKind): boolean {
  return bait(kind) != null
}

/** Cheap plant food first, meat last — trap auto-bait and fishing bait. */
export const BAIT_ITEM_PRIORITY: readonly ItemKind[] = [
  'mushroom', 'berries', 'carrot', 'nuts', 'apple', 'fish',
  'raw_meat', 'deer_meat', 'wolf_meat', 'boar_meat', 'rabbit_meat', 'beef',
]
