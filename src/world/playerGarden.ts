import type { ToolKind } from '../items/HeldTool'
import type { ItemCapability } from '../items/itemCatalog'
import type { GroundPlacementReason } from '../items/tentPlacement'
import { computeWeather, getSeason, WEATHER_CYCLE_DAYS } from './weather'

/**
 * Player-built garden plot (plan 174) — pure domain logic, same split as
 * `playerWell.ts` vs `createPlayerWells.ts`/`playerWellProp.ts`. A single
 * static player-built world object (no multi-stage construction like a well
 * — the plan's whole point is a small, cheap plot, not a second building
 * project). Once built it is only a placement/anchor: crop planting itself
 * stays owned by plan 126, growth by plan 172 (`world/cropLifecycle.ts`).
 *
 * `care`/`lastMaintainedAtDays` (plan 176) are this same record's maintenance
 * state — garden and field are one concept, not `GardenMaintenance` +
 * `FieldMaintenance`. Both fields are persisted (not just the anchor day)
 * because "restore ~50 points" is not equivalent to resetting the decay
 * clock to full — see `resolveCultivationCare`/`applyCultivationMaintenance`.
 *
 * `hydration`/`lastHydrationUpdateAtDays`/`droughtStressDays` (plan
 * settlements-npcs-001) are this same record's watering state — independent
 * of `care` (watering never restores `care`, maintenance never restores
 * `hydration`). `droughtStressDays` is the minimal persisted anchor needed to
 * reconstruct accumulated drought-yield penalty without a full hydration
 * history — see `resolveGardenHydration`.
 */
export type PlayerGardenRecord = {
  id: string
  x: number
  z: number
  yaw: number
  care: number
  lastMaintainedAtDays: number
  /** 0..100 — see `resolveGardenHydration`. */
  hydration: number
  lastHydrationUpdateAtDays: number
  /** Accumulated world-days spent below `HYDRATION_DROUGHT_THRESHOLD` since
   *  the last harvest from this plot, capped at `DROUGHT_STRESS_CAP_DAYS` —
   *  rewatering above the threshold stops further accumulation but does not
   *  erase what's already accrued (plan §6). */
  droughtStressDays: number
}

/** Cost to build a plot — charged once, atomically, when the placement
 *  channel completes. Deliberately cheap (plan §1: "minimalny koszt
 *  budowy") — a fraction of a well's `well`-stage cost. */
export type GardenMaterialCost = { stone: number, branch: number }
export const GARDEN_COST: GardenMaterialCost = { stone: 3, branch: 2 }

/** Capability required to build a plot — same "digging tool, not a specific
 *  item identity" contract as a well's `pit` stage. */
export const GARDEN_CAPABILITY: ItemCapability = 'soil_digging'

/** Footprint/clearance + minimum spacing — smaller than a well (plan §5:
 *  a garden bed, not a structure). */
export const GARDEN_FOOTPRINT_RADIUS = 1
export const GARDEN_SEPARATION = 2.5
/** How far ahead of the player a plot is placed — mirrors `WELL_PLACE_REACH`. */
export const GARDEN_PLACE_REACH = 1.6
/** Busy-channel length for the placement action itself. */
export const GARDEN_PLACE_DURATION_SEC = 3

/** How close a crop must be planted to a player garden plot to count as
 *  planted "in" it (`plantedCrops.ts`'s `isNearAnyGarden`) — much tighter
 *  than a settlement garden's `GARDEN_PLANT_RADIUS` since a plot is one small
 *  bed, not a whole clearing. */
export const PLAYER_GARDEN_PLANT_RADIUS = 2.5

export type GardenPlacementReason = GroundPlacementReason | 'garden'

export const GARDEN_PLACEMENT_MESSAGE: Record<Exclude<GardenPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na grządkę.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już coś stoi.',
  garden: 'Tu już jest grządka.',
}

/** Nearest `{ x, z }`-carrying record to `(x, z)` within `radius`, or `null` —
 *  the one small "which garden owns this position" query shared by the
 *  player harvest path, the NPC food-source hooks, and the interaction
 *  prompt builder. Deliberately generic (no `PlayerGardenRecord` import
 *  needed by callers that only have a `PlayerGardenEntry`). */
export function findNearestGarden<T extends { x: number, z: number }>(
  gardens: readonly T[],
  x: number,
  z: number,
  radius = PLAYER_GARDEN_PLANT_RADIUS,
): T | null {
  let best: T | null = null
  let bestDistSq = radius * radius
  for (const g of gardens) {
    const dx = g.x - x
    const dz = g.z - z
    const distSq = dx * dx + dz * dz
    if (distSq > bestDistSq) continue
    best = g
    bestDistSq = distSq
  }
  return best
}

/**
 * Cultivation maintenance (plan 176) — shared by player and NPC maintenance
 * actions and by the crop-productivity modifier. Deliberately lives next to
 * `PlayerGardenRecord` rather than a separate module: garden and field are
 * one concept (plan §7), and this is the same object plan 174 already owns.
 *
 * Degradation and maintenance are both pure/lazy: no per-frame ticking, no
 * `GardenManager`. Callers resolve on demand (interaction prompt, harvest,
 * NPC decision, persistence snapshot, world-object load).
 */

/** Care lost per world-day since `lastMaintainedAtDays` — a fully maintained
 *  plot (100) reaches the removal threshold (0) after 12.5 world-days of
 *  total neglect. Tunable (plan §1: "dokładne tempo degradacji... należy
 *  dobrać podczas implementacji"). */
export const CARE_DEGRADATION_PER_DAY = 8

export const CARE_MAINTAINED_THRESHOLD = 50
export const CARE_NEGLECTED_THRESHOLD = 25
/** care <= this → the plot is removed as a world object (plan §6) — the one
 *  unambiguous removal threshold every caller must use (plan notes §5: two
 *  callers must never disagree on where "removed" starts). */
export const CARE_REMOVAL_THRESHOLD = 0

export type CultivationStatus = 'maintained' | 'neglected' | 'heavily-neglected' | 'removed'

export function getCultivationStatus(care: number): CultivationStatus {
  if (care <= CARE_REMOVAL_THRESHOLD) return 'removed'
  if (care >= CARE_MAINTAINED_THRESHOLD) return 'maintained'
  if (care >= CARE_NEGLECTED_THRESHOLD) return 'neglected'
  return 'heavily-neglected'
}

/** Pure, lazy care resolver — no simulation history, just `(lastMaintainedAt,
 *  care-at-that-time, now)`. The decay rate is scaled by `record.hydration`'s
 *  last-known snapshot (plan settlements-npcs-001 §8: wetter ground grows
 *  weeds faster) — a v1 approximation using the stored value rather than the
 *  continuously-varying resolved hydration across the whole elapsed span, to
 *  keep this a single closed-form formula instead of a second weather walk. */
export function resolveCultivationCare(
  record: Pick<PlayerGardenRecord, 'care' | 'lastMaintainedAtDays' | 'hydration'>,
  worldDays: number,
): number {
  const elapsedDays = Math.max(0, worldDays - record.lastMaintainedAtDays)
  const rate = CARE_DEGRADATION_PER_DAY * weedGrowthMultiplier(record.hydration)
  return Math.max(0, Math.min(100, record.care - elapsedDays * rate))
}

/** Points restored by one "Zrób porządek" action, capped at 100 (plan §4). */
export const MAINTENANCE_CARE_GAIN = 50

/** Resolves current care, adds the gain, and re-anchors the decay clock to
 *  `worldDays` — the single authoritative maintenance mutation. Never
 *  mutates `record`; callers persist the returned pair. */
export function applyCultivationMaintenance(
  record: Pick<PlayerGardenRecord, 'care' | 'lastMaintainedAtDays' | 'hydration'>,
  worldDays: number,
): { care: number, lastMaintainedAtDays: number } {
  const current = resolveCultivationCare(record, worldDays)
  return { care: Math.min(100, current + MAINTENANCE_CARE_GAIN), lastMaintainedAtDays: worldDays }
}

/** Busy-channel length for "Zrób porządek" (plan §4/§10) — short real-time
 *  cost like every other busy action (`busyChannelDurations.test.ts` caps
 *  every such constant at 8s so a longer action never reads as a freeze);
 *  the plan's "~1-2 world hours" is flavor for how substantial the action
 *  should feel, not a literal `dayNight` conversion (well construction is
 *  the one action that tracks literal work-hours, and does so across many
 *  repeated bouts, not a single channel). */
export const MAINTENANCE_BASE_DURATION_SEC = 6
/** Shortened duration while a digging tool is held (plan §5) — `shovel`/
 *  `pitchfork` are the only current `ToolKind`s with a defensible
 *  maintenance relationship; the plan explicitly forbids inventing a `rake`
 *  merely because it's mentioned as a future example. Never changes
 *  `MAINTENANCE_CARE_GAIN`. */
export const MAINTENANCE_TOOL_DURATION_SEC = 4
const MAINTENANCE_TOOL_KINDS: ReadonlySet<ToolKind> = new Set<ToolKind>(['pitchfork', 'shovel'])

export function maintenanceDurationSec(heldTool: ToolKind | null): number {
  return heldTool !== null && MAINTENANCE_TOOL_KINDS.has(heldTool)
    ? MAINTENANCE_TOOL_DURATION_SEC
    : MAINTENANCE_BASE_DURATION_SEC
}

/**
 * Hydration/watering (plan settlements-npcs-001) — shared by player and NPC
 * watering actions and by the crop-productivity modifier, same "lives next
 * to `PlayerGardenRecord`, no parallel registry" shape as the care section
 * above. Deliberately lazy: no per-frame tick, no `WateringManager`.
 */

/** Natural drying — clamped at 0, never negative. */
export const HYDRATION_DRY_RATE_PER_DAY = 20
/** One watering action's hydration gain (plan §1/§12). */
export const WATERING_HYDRATION_GAIN = 40
/** One watering action's water cost — a fraction of any container's
 *  capacity, not a whole 10 l bucket (implementation notes §8/§4). */
export const WATERING_LITRES = 1
/** Busy-channel length for "Podlej" (plan §12) — mirrors
 *  `MAINTENANCE_BASE_DURATION_SEC`'s "short real-time cost" reasoning. */
export const WATERING_DURATION_SEC = 4
/** Rain's hydration gain per world-day at `WeatherState.intensity === 1`
 *  (plan §4) — scaled down by the actual intensity/duration of each weather
 *  cycle inside `resolveGardenHydration`. */
export const HYDRATION_RAIN_GAIN_PER_DAY = 30
/** Below this, growth pauses and drought stress accumulates; at/above it,
 *  growth is normal and stress no longer accrues (plan §5/§6). */
export const HYDRATION_DROUGHT_THRESHOLD = 30

function clampHydration(hydration: number): number {
  return Math.max(0, Math.min(100, hydration))
}

/** Bounded lookback for the rain-aware hydration resolver — long enough that
 *  anything before this window has already been fully overwritten by natural
 *  drying alone (`100 / HYDRATION_DRY_RATE_PER_DAY`), so a stale anchor never
 *  costs more than a fixed number of simulated weather cycles regardless of
 *  how long the actual gap is (mirrors `world/weather.ts`'s
 *  `computeSurfaceWeather` fixed-window technique — implementation notes
 *  §3/§13). */
export const HYDRATION_SIM_WINDOW_DAYS = 100 / HYDRATION_DRY_RATE_PER_DAY

export const DROUGHT_STRESS_STEP_DAYS = 6 / 24
export const DROUGHT_STRESS_PERCENT_PER_STEP = 10
export const DROUGHT_STRESS_MAX_STEPS = 5
/** `30h` — the point beyond which further sub-threshold time no longer adds
 *  penalty (plan §6). */
export const DROUGHT_STRESS_CAP_DAYS = DROUGHT_STRESS_STEP_DAYS * DROUGHT_STRESS_MAX_STEPS

/** Weed growth pressure by hydration tier (plan §8) — `50-79%` is "normal",
 *  i.e. `resolveCultivationCare`'s unscaled `CARE_DEGRADATION_PER_DAY`. */
export function weedGrowthMultiplier(hydration: number): number {
  if (hydration < 20) return 0.25
  if (hydration < 50) return 0.6
  if (hydration < 80) return 1
  return 1.5
}

/** Harvest-yield multiplier from accumulated drought stress (plan §6):
 *  `0%` at `<6h`, `-10%` per further full `6h` step, capped at `-50%`. */
export function droughtYieldMultiplier(droughtStressDays: number): number {
  const steps = Math.min(DROUGHT_STRESS_MAX_STEPS, Math.floor(droughtStressDays / DROUGHT_STRESS_STEP_DAYS))
  return 1 - (steps * DROUGHT_STRESS_PERCENT_PER_STEP) / 100
}

export type GardenHydrationState = {
  hydration: number
  lastHydrationUpdateAtDays: number
  droughtStressDays: number
}

/**
 * Pure, lazy, bounded-cost resolver combining natural drying and rain since
 * `record.lastHydrationUpdateAtDays` — same "resolve on demand" shape as
 * `resolveCultivationCare`, extended with a bounded weather-cycle walk since
 * rain (unlike linear care decay) isn't a closed-form formula. Along the same
 * walk it also tracks how much additional time the site spent below
 * `HYDRATION_DROUGHT_THRESHOLD` (capped at `DROUGHT_STRESS_CAP_DAYS`), so
 * drought stress stays deterministic without a full hydration history
 * (implementation notes §5/§7).
 *
 * A gap larger than `HYDRATION_SIM_WINDOW_DAYS` means the stored value is
 * already fully dominated by drying alone by the time the bounded window
 * starts — the replay then starts from `0` hydration / capped stress instead
 * of paying for the full unbounded gap (implementation notes §3).
 */
export function resolveGardenHydration(
  record: Pick<PlayerGardenRecord, 'hydration' | 'lastHydrationUpdateAtDays' | 'droughtStressDays'>,
  seed: number,
  worldDays: number,
): GardenHydrationState {
  const elapsed = Math.max(0, worldDays - record.lastHydrationUpdateAtDays)
  if (elapsed <= 0) {
    return {
      hydration: clampHydration(record.hydration),
      lastHydrationUpdateAtDays: record.lastHydrationUpdateAtDays,
      droughtStressDays: record.droughtStressDays,
    }
  }

  const stale = elapsed > HYDRATION_SIM_WINDOW_DAYS
  let hydration = stale ? 0 : record.hydration
  let stressDays = stale ? DROUGHT_STRESS_CAP_DAYS : record.droughtStressDays
  const windowDays = Math.min(elapsed, HYDRATION_SIM_WINDOW_DAYS)
  const startDays = worldDays - windowDays

  const startCycle = Math.floor(startDays / WEATHER_CYCLE_DAYS)
  const endCycle = Math.floor(worldDays / WEATHER_CYCLE_DAYS)
  for (let cycle = startCycle; cycle <= endCycle; cycle++) {
    const cycleStart = cycle * WEATHER_CYCLE_DAYS
    const stepStart = Math.max(cycleStart, startDays)
    const stepEnd = Math.min(cycleStart + WEATHER_CYCLE_DAYS, worldDays)
    const stepDays = stepEnd - stepStart
    if (stepDays <= 0) continue
    const weather = computeWeather(seed, cycleStart, getSeason(cycleStart))
    hydration -= HYDRATION_DRY_RATE_PER_DAY * stepDays
    if (weather.type === 'rain') hydration += HYDRATION_RAIN_GAIN_PER_DAY * weather.intensity * stepDays
    hydration = clampHydration(hydration)
    if (hydration < HYDRATION_DROUGHT_THRESHOLD) stressDays = Math.min(DROUGHT_STRESS_CAP_DAYS, stressDays + stepDays)
  }

  return { hydration, lastHydrationUpdateAtDays: worldDays, droughtStressDays: stressDays }
}

/** Resolves current hydration, then applies one watering action's gain
 *  (plan §12) — rewatering never erases accumulated `droughtStressDays`
 *  (plan §6). */
export function applyGardenWatering(
  record: Pick<PlayerGardenRecord, 'hydration' | 'lastHydrationUpdateAtDays' | 'droughtStressDays'>,
  seed: number,
  worldDays: number,
): GardenHydrationState {
  const resolved = resolveGardenHydration(record, seed, worldDays)
  return { ...resolved, hydration: clampHydration(resolved.hydration + WATERING_HYDRATION_GAIN) }
}

/** Resolves current hydration and resets accumulated drought stress — call
 *  once per successful harvest from within this plot's radius (plan §6:
 *  "resetuje się po zakończeniu/zbiorze cropa"). */
export function resolveGardenHydrationAfterHarvest(
  record: Pick<PlayerGardenRecord, 'hydration' | 'lastHydrationUpdateAtDays' | 'droughtStressDays'>,
  seed: number,
  worldDays: number,
): GardenHydrationState {
  const resolved = resolveGardenHydration(record, seed, worldDays)
  return { ...resolved, droughtStressDays: 0 }
}

/** Yield multiplier by cultivation status (plan §3/§13) — applied only to a
 *  crop harvested from within a garden plot's radius, never to wild crops
 *  (callers gate that with `findNearestGarden`). `neglected` deliberately
 *  rounds a single-yield crop back up to 1 — a mild penalty only shows on
 *  multi-count yields; `heavily-neglected` can legitimately zero a
 *  single-yield crop out (plan notes §14: an intentional harsher outcome for
 *  that tier, not a rounding bug). */
const CULTIVATION_YIELD_MULTIPLIER: Record<CultivationStatus, number> = {
  maintained: 1,
  neglected: 0.7,
  'heavily-neglected': 0.3,
  removed: 0,
}

/** `hydrationDead` (plan §5/§7: "0% jest stanem śmiertelnym... rozstrzygany
 *  przed samą kalkulacją yield") always wins over both `care` and
 *  `droughtStressDays` — a crop at 0% hydration is dead, not a zero-yield
 *  mature crop. Care and drought-stress percentages combine into a single
 *  multiplier before the one rounding step (implementation notes §6). */
export function cultivationYieldCount(
  baseCount: number,
  care: number,
  droughtStressDays = 0,
  hydrationDead = false,
): number {
  if (hydrationDead) return 0
  const multiplier = CULTIVATION_YIELD_MULTIPLIER[getCultivationStatus(care)] * droughtYieldMultiplier(droughtStressDays)
  return Math.max(0, Math.round(baseCount * multiplier))
}

const CULTIVATION_STATUS_LABEL: Record<CultivationStatus, string> = {
  maintained: 'Zadbane',
  neglected: 'Zaniedbane',
  'heavily-neglected': 'Mocno zaniedbane',
  removed: 'Zniszczone',
}

/** `[E]`/`[R]` prompt for a garden plot's `gardenPlot` interactable — both
 *  actions stay offered regardless of `care`/`hydration` (plan §4/§12: never
 *  gate the prompt itself, only the action's own validation). */
export function gardenPlotPromptLabel(care: number, hydration: number): string {
  const status = getCultivationStatus(care)
  return `[E] Zrób porządek (${CULTIVATION_STATUS_LABEL[status]}, ${Math.round(care)}%) · [R] Podlej (Nawodnienie ${Math.round(hydration)}%)`
}
