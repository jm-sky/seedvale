import type { MaterialRequirement } from '../items/constructionMaterials'
import type { GroundPlacementReason } from '../items/tentPlacement'
import { computeRainExposureDays, computeWeather, getSeason, WEATHER_CYCLE_DAYS } from './weather'

/**
 * Player-built sleeping utilities — pure domain logic (plan items-player-013).
 * Deliberately free of `THREE`/DOM, same split as `world/standingTorch.ts` vs
 * `world/createStandingTorches.ts`/`world/standingTorchProp.ts`. Two
 * independent world-object kinds live here (a bedroll and a raised sleeping
 * platform) rather than two separate files, since they share the same
 * placement/degradation shape and the plan requires them to stay independent
 * records anyway (packing a tent must not touch either).
 *
 * Sleep quality itself is never computed here — `app/campRest.ts` remains the
 * sole owner of `CampRestContext`/`campRestQuality()`; this module only
 * resolves *condition* (a lazy, weather-driven 0..100 value) and exposes the
 * placement/material data every other player-built object already uses.
 *
 * @domain items-player
 */

export type SleepingUtilityVariant = 'leather'

export type BedrollRecord = {
  id: string
  x: number
  z: number
  yaw: number
  variant: SleepingUtilityVariant
  /** 0..100 — see `resolveSleepingUtilityCondition`. Never mutated after
   *  placement in v1 (no repair action exists yet) — kept as a real field
   *  rather than derived solely from `lastConditionUpdateAtDays` so a future
   *  repair/maintenance action can extend this record without a redesign
   *  (plan §"Representation should keep material/variant explicit"). */
  condition: number
  lastConditionUpdateAtDays: number
}

export type PlatformRecord = {
  id: string
  x: number
  z: number
  yaw: number
  condition: number
  lastConditionUpdateAtDays: number
}

/** Clearance/spacing + reach — a bedroll is a small ground object, similar
 *  order of magnitude to a garden plot; a platform is somewhat larger since a
 *  bedroll must fit on top of it. */
export const BEDROLL_FOOTPRINT_RADIUS = 0.6
export const BEDROLL_SEPARATION = 1.4
export const BEDROLL_PLACE_REACH = 1.4
export const BEDROLL_PLACE_DURATION_SEC = 3

export const PLATFORM_FOOTPRINT_RADIUS = 1.1
export const PLATFORM_SEPARATION = 2.6
export const PLATFORM_PLACE_REACH = 1.6
export const PLATFORM_PLACE_DURATION_SEC = 4

/** Initial variant (plan §"Initial variant") — `hide` is the closest existing
 *  `ItemKind` to the plan's "leather" (no separate `leather` item exists; the
 *  implementation notes explicitly forbid adding one for this plan alone). */
export const BEDROLL_MATERIAL_REQUIREMENTS: readonly MaterialRequirement[] = [{ kind: 'hide', count: 3 }]
/** Initial material (plan §"Initial material") — `branch`, per plan. */
export const PLATFORM_MATERIAL_REQUIREMENTS: readonly MaterialRequirement[] = [{ kind: 'branch', count: 6 }]

export type BedrollPlacementReason = GroundPlacementReason | 'bedroll'
export type PlatformPlacementReason = GroundPlacementReason | 'platform'

export const BEDROLL_PLACEMENT_MESSAGE: Record<Exclude<BedrollPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na posłanie.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już coś stoi.',
  bedroll: 'Tu już leży posłanie.',
}

export const PLATFORM_PLACEMENT_MESSAGE: Record<Exclude<PlatformPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na podest.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już coś stoi.',
  platform: 'Tu już stoi podest do spania.',
}

/** How close a bedroll must be to the player for camp rest to treat it as
 *  the sleeping surface in use (`app/actions/restActions.ts`'s
 *  `resolveCampContext`) — same order of magnitude as `TENT_SHELTER_RADIUS`. */
export const BEDROLL_REST_RADIUS = 2.5

/** How close a platform's centre must be to a bedroll's centre to count as
 *  "the bedroll sits on this platform" (plan §"Relacja bedroll ↔ platform")
 *  — a small fixed radius, resolved spatially on demand rather than a
 *  persisted `platformId`, so the two stay fully independent world objects. */
export const BEDROLL_ON_PLATFORM_RADIUS = 1.6

/** Nearest `{ x, z }`-carrying record to `(x, z)` within `radius`, or `null`
 *  — deterministic id tie-break for equal distances. Small and local rather
 *  than reusing `world/playerGarden.ts`'s `findNearestGarden` (same shape,
 *  different domain — this module stays self-contained). */
export function findNearestSleepingUtility<T extends { id: string, x: number, z: number }>(
  records: readonly T[],
  x: number,
  z: number,
  radius: number,
): T | null {
  let best: T | null = null
  let bestDistSq = radius * radius
  for (const r of records) {
    const dx = r.x - x
    const dz = r.z - z
    const distSq = dx * dx + dz * dz
    if (distSq > bestDistSq) continue
    if (distSq === bestDistSq && best && r.id >= best.id) continue
    best = r
    bestDistSq = distSq
  }
  return best
}

export const SLEEPING_UTILITY_CONDITION_MAX = 100

function clampCondition(condition: number): number {
  return Math.max(0, Math.min(SLEEPING_UTILITY_CONDITION_MAX, condition))
}

/** Points of condition lost per full rain/snow "exposure day" (plan
 *  §"Environmental degradation") — tuned so continuous heavy weather zeroes
 *  a fresh utility out within roughly a handful of world-days, matching the
 *  order of magnitude of `playerGarden.ts`'s `CARE_DEGRADATION_PER_DAY`. */
export const SLEEPING_UTILITY_RAIN_DECAY_PER_DAY = 22
export const SLEEPING_UTILITY_SNOW_DECAY_PER_DAY = 18
/** Bounded lookback for the degradation resolver (same "any moment re-derives
 *  directly, cost bounded regardless of the actual gap" technique as
 *  `playerGarden.ts`'s `HYDRATION_SIM_WINDOW_DAYS`) — comfortably longer than
 *  the worst-case "zero out" time at either decay rate above. */
export const SLEEPING_UTILITY_SIM_WINDOW_DAYS = 10

/** Cumulative snow "intensity-days" between two `elapsedDays` timestamps —
 *  the snow counterpart to `world/weather.ts`'s `computeRainExposureDays`,
 *  which only covers rain. No general weather-exposure helper exists yet
 *  (implementation notes §8); kept local rather than promoted into
 *  `weather.ts` for a single caller. */
function computeSnowExposureDays(seed: number, fromDays: number, toDays: number): number {
  if (toDays <= fromDays) return 0
  const startCycle = Math.floor(fromDays / WEATHER_CYCLE_DAYS)
  const endCycle = Math.floor(toDays / WEATHER_CYCLE_DAYS)
  let exposure = 0
  for (let cycle = startCycle; cycle <= endCycle; cycle++) {
    const cycleStart = cycle * WEATHER_CYCLE_DAYS
    const cycleEnd = cycleStart + WEATHER_CYCLE_DAYS
    const overlapDays = Math.min(cycleEnd, toDays) - Math.max(cycleStart, fromDays)
    if (overlapDays <= 0) continue
    const w = computeWeather(seed, cycleStart, getSeason(cycleStart))
    if (w.type === 'snow') exposure += overlapDays * w.intensity
  }
  return exposure
}

/**
 * Pure, lazy, bounded-cost condition resolver — same "resolve on demand, no
 * per-frame ticking" shape as `playerGarden.ts`'s `resolveCultivationCare`/
 * `resolveGardenHydration`. `sheltered` is the caller's *current* shelter
 * read (`app/campRest.ts`'s `hasTentNear` against this record's own
 * position) applied uniformly across the whole elapsed span since
 * `record.lastConditionUpdateAtDays` — the same accepted simplification
 * `resolveGardenHydration` makes for hydration (no historical tent-placement
 * log is kept, only "is it sheltered right now").
 *
 * Condition only ever decreases (no repair action in v1) — a persisted
 * anchor never needs to advance, so this can always resolve directly from
 * the object's original placement anchor, however large the gap.
 */
export function resolveSleepingUtilityCondition(
  record: Pick<BedrollRecord | PlatformRecord, 'condition' | 'lastConditionUpdateAtDays'>,
  seed: number,
  nowDays: number,
  sheltered: boolean,
): number {
  const elapsed = Math.max(0, nowDays - record.lastConditionUpdateAtDays)
  if (elapsed <= 0) return clampCondition(record.condition)
  // A sheltered utility (under/near a pitched tent) gets no direct weather
  // exposure (plan §"Exposure") — no decay to resolve.
  if (sheltered) return clampCondition(record.condition)
  const windowDays = Math.min(elapsed, SLEEPING_UTILITY_SIM_WINDOW_DAYS)
  const fromDays = nowDays - windowDays
  const rainExposure = computeRainExposureDays(seed, fromDays, nowDays)
  const snowExposure = computeSnowExposureDays(seed, fromDays, nowDays)
  const decay = rainExposure * SLEEPING_UTILITY_RAIN_DECAY_PER_DAY + snowExposure * SLEEPING_UTILITY_SNOW_DECAY_PER_DAY
  return clampCondition(record.condition - decay)
}
