import type { DroppedItem } from '../items/createDroppedItems'
import type { ItemKind } from '../items/items'
import type { AnimalAttractionSource } from '../world/animalAttractionSource'
import type { AnimalDef } from './animalDefs'
import {
  bait,
  type FoodBatch,
  type FreshnessStage,
  getFoodBatchFreshnessStage,
} from '../items/foodFreshness'
import { isSpeciesTrappable, TRAP_DEFS, type TrapKind } from '../world/animalTraps'
import { type BloodTrace, bloodTraceRemainingFraction } from '../world/bloodTraces'
import { dietAcceptsItem } from './animalDefs'

/**
 * @domain fauna
 * @role Pure species compatibility + scoring for systemic animal attraction
 *  (plan fauna-023) — trap bait, dropped food and blood traces share one
 *  resolver. World producers only emit plain `AnimalAttractionSource`
 *  snapshots; this module never steers agents or owns world state.
 */

/** Sensing radius (m) for a single dropped food item. */
export const FOOD_ATTRACTION_RADIUS = 10
/** Sensing radius (m) for a blood trace — intentionally larger than food. */
export const BLOOD_ATTRACTION_RADIUS = 18

export const FOOD_STRENGTH_FRESH = 1
export const FOOD_STRENGTH_MEDIUM = 0.55
export const FOOD_STRENGTH_SPOILED_MEAT = 0.35
export const TRAP_BAIT_STRENGTH = 1

/** Seconds an animal ignores a blood source after investigating it. */
export const BLOOD_IGNORE_SEC = 12
/** Seconds spent lingering at a reached blood source. */
export const BLOOD_INVESTIGATE_SEC = 1.5
/** Hard cap on per-animal investigated-source memory entries. */
export const ATTRACTION_IGNORE_CAP = 16

/** V1 food-stage strength (plan fauna-023 §2) — `null` when the stage is not
 *  an attraction candidate for this species at all. */
export function foodAttractionStrength(
  def: AnimalDef,
  itemKind: ItemKind,
  stage: FreshnessStage,
): number | null {
  if (!dietAcceptsItem(def.diet, itemKind)) return null
  if (stage === 'fresh') return FOOD_STRENGTH_FRESH
  if (stage === 'medium') return FOOD_STRENGTH_MEDIUM
  // Spoiled plant food is never an attraction source in V1.
  if (bait(itemKind) !== 'meat') return null
  // Spoiled meat requires scavenging capability (wolf/bear; fox excluded).
  if (def.scavenging == null) return null
  return FOOD_STRENGTH_SPOILED_MEAT
}

/** Blood sensing is predator-role only (plan fauna-023 §3) — dog has a meat
 *  diet but is livestock, so it does not follow blood. */
export function canSenseBlood(def: AnimalDef): boolean {
  return def.role === 'predator'
}

/** Blood strength from live trace size × remaining fraction. */
export function bloodAttractionStrength(size: number, remainingFraction: number): number {
  if (remainingFraction <= 0) return 0
  return size * remainingFraction
}

/** Whether this species may treat `source` as a candidate (ignoring distance). */
export function isAttractionCompatible(def: AnimalDef, source: AnimalAttractionSource): boolean {
  if (source.strength <= 0) return false
  if (source.kind === 'blood') return canSenseBlood(def)
  if (source.itemKind == null) return false
  if (source.kind === 'trapBait') {
    if (source.trapKind == null) return false
    if (!isSpeciesTrappable(source.trapKind, def.kind)) return false
    return dietAcceptsItem(def.diet, source.itemKind)
  }
  const stage = source.freshnessStage ?? 'fresh'
  return foodAttractionStrength(def, source.itemKind, stage) != null
}

/** Transparent deterministic score: strength × remaining radius fraction. */
export function attractionScore(
  source: AnimalAttractionSource,
  x: number,
  z: number,
): number | null {
  const dx = source.x - x
  const dz = source.z - z
  const distSq = dx * dx + dz * dz
  const radius = source.radius
  if (radius <= 0 || distSq > radius * radius) return null
  const dist = Math.sqrt(distSq)
  // Species-specific food strength (spoiled meat scavenging) may differ from
  // the snapshot baseline — re-scale food scores at resolve time.
  return source.strength * (1 - dist / radius)
}

/**
 * Deterministic best-candidate attraction resolution (plan fauna-023 §4) —
 * filters by species compatibility and optional ignored-id set, then picks
 * the highest `attractionScore`. Equal scores break on stable `source.id`.
 * Pure and allocation-free.
 */
export function resolveAttractionTarget(
  sources: readonly AnimalAttractionSource[],
  def: AnimalDef,
  x: number,
  z: number,
  ignoredIds?: ReadonlySet<string> | null,
): AnimalAttractionSource | null {
  let best: AnimalAttractionSource | null = null
  let bestScore = -Infinity
  for (const source of sources) {
    if (ignoredIds?.has(source.id)) continue
    if (!isAttractionCompatible(def, source)) continue
    let score = attractionScore(source, x, z)
    if (score == null) continue
    if (source.kind === 'food' && source.itemKind != null) {
      const stage = source.freshnessStage ?? 'fresh'
      const speciesStrength = foodAttractionStrength(def, source.itemKind, stage)
      if (speciesStrength == null) continue
      const distFactor = score / source.strength
      score = speciesStrength * distFactor
    }
    if (
      score > bestScore
      || (score === bestScore && (!best || source.id < best.id))
    ) {
      best = source
      bestScore = score
    }
  }
  return best
}

/** Build a trap-bait attraction source from live placed-trap fields. */
export function trapBaitAttractionSource(opts: {
  trapId: string
  trapKind: TrapKind
  x: number
  z: number
  baitKind: ItemKind
}): AnimalAttractionSource {
  return {
    id: `trap:${opts.trapId}`,
    kind: 'trapBait',
    x: opts.x,
    z: opts.z,
    strength: TRAP_BAIT_STRENGTH,
    radius: TRAP_DEFS[opts.trapKind].lureRadius,
    itemKind: opts.baitKind,
    trapKind: opts.trapKind,
  }
}

/** Stage baseline strength for snapshot emission — species gates apply later. */
function foodStageBaselineStrength(itemKind: ItemKind, stage: FreshnessStage): number | null {
  if (stage === 'fresh') return FOOD_STRENGTH_FRESH
  if (stage === 'medium') return FOOD_STRENGTH_MEDIUM
  if (bait(itemKind) === 'meat') return FOOD_STRENGTH_SPOILED_MEAT
  return null
}

/** Build a dropped-food attraction source, or `null` when ineligible for any species. */
export function droppedFoodAttractionSource(
  item: DroppedItem,
  nowDays: number,
): AnimalAttractionSource | null {
  const stage = item.foodBatch
    ? getFoodBatchFreshnessStage(item.kind, item.foodBatch, nowDays)
    : 'fresh'
  const strength = foodStageBaselineStrength(item.kind, stage)
  if (strength == null) return null
  return {
    id: `food:${item.id}`,
    kind: 'food',
    x: item.x,
    z: item.z,
    strength,
    radius: FOOD_ATTRACTION_RADIUS,
    itemKind: item.kind,
    freshnessStage: stage,
  }
}

/** Build a blood attraction source, or `null` when fully faded. */
export function bloodAttractionSource(
  trace: BloodTrace,
  seed: number,
  elapsedDays: number,
): AnimalAttractionSource | null {
  const remaining = bloodTraceRemainingFraction(trace, seed, elapsedDays)
  const strength = bloodAttractionStrength(trace.size, remaining)
  if (strength <= 0) return null
  return {
    id: `blood:${trace.id}`,
    kind: 'blood',
    x: trace.x,
    z: trace.z,
    strength,
    radius: BLOOD_ATTRACTION_RADIUS,
  }
}

/**
 * Assemble the once-per-fauna-pass attraction snapshot (plan fauna-023 §11).
 * Reuses `into` when provided to avoid allocating a new array every pass.
 */
export function buildAttractionSnapshot(
  opts: {
    trapSources: readonly AnimalAttractionSource[]
    droppedItems: readonly DroppedItem[]
    bloodTraces: readonly BloodTrace[]
    seed: number
    elapsedDays: number
    nowDays: number
  },
  into: AnimalAttractionSource[] = [],
): AnimalAttractionSource[] {
  into.length = 0
  for (const source of opts.trapSources) into.push(source)
  for (const item of opts.droppedItems) {
    const source = droppedFoodAttractionSource(item, opts.nowDays)
    if (source) into.push(source)
  }
  for (const trace of opts.bloodTraces) {
    const source = bloodAttractionSource(trace, opts.seed, opts.elapsedDays)
    if (source) into.push(source)
  }
  return into
}

/** Revalidate a food source at consume time against live item + diet/stage. */
export function isDroppedFoodStillAttractive(
  def: AnimalDef,
  itemKind: ItemKind,
  foodBatch: FoodBatch | undefined,
  nowDays: number,
): boolean {
  const stage = foodBatch ? getFoodBatchFreshnessStage(itemKind, foodBatch, nowDays) : 'fresh'
  return foodAttractionStrength(def, itemKind, stage) != null
}

/** Bounded ignore-memory helpers for blood investigation (plan fauna-023 §8). */
export function markAttractionIgnored(
  memory: Map<string, number>,
  id: string,
  untilSec: number,
  cap = ATTRACTION_IGNORE_CAP,
): void {
  memory.set(id, untilSec)
  if (memory.size <= cap) return
  let oldestId: string | null = null
  let oldestUntil = Infinity
  for (const [key, until] of memory) {
    if (until < oldestUntil) {
      oldestUntil = until
      oldestId = key
    }
  }
  if (oldestId != null) memory.delete(oldestId)
}

export function pruneAttractionIgnored(memory: Map<string, number>, nowSec: number): void {
  for (const [id, until] of memory) {
    if (until <= nowSec) memory.delete(id)
  }
}

export function activeIgnoredAttractionIds(
  memory: Map<string, number>,
  nowSec: number,
  into: Set<string>,
): ReadonlySet<string> {
  into.clear()
  for (const [id, until] of memory) {
    if (until > nowSec) into.add(id)
  }
  return into
}
