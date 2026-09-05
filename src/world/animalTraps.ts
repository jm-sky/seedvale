import type { AnimalKind } from '../fauna/AnimalAgent'
import type { ItemKind } from '../items/items'
import { computeWeather, getSeason, type WeatherState, type WeatherType } from './weather'

/**
 * Animal traps — pure domain logic (plan 141). Deliberately free of
 * `THREE`/DOM/`PlayerController` so every rule below is unit-testable and so a
 * placed trap stays a plain world object: it never holds a reference to the
 * player, only a *snapshot* of the Traps skill taken when it was armed
 * (implementation notes §2 — the trap keeps working when the player walks
 * away or the world bundle is rebuilt).
 *
 * Runtime/scene side lives in `world/createPlacedTraps.ts`, the visual in
 * `world/trapProp.ts` — same split as `items/tentPlacement.ts` vs
 * `items/createPlacedTents.ts`/`items/tentProp.ts`.
 */
export type TrapKind = 'simple' | 'good'

/** `placed` = physically set down but **not** armed (the plan's `used`), and
 *  re-armable as long as durability remains. `broken` is terminal: it can
 *  never be armed again, only cleared away. */
export type TrapState = 'placed' | 'active' | 'broken'

export type TrapDef = {
  kind: TrapKind
  /** The `Inventory` item this trap is placed from / collected back into. */
  itemKind: ItemKind
  label: string
  /** Uses left when brand new. A capture always spends exactly 1; heavy
   *  weather spends fractions (see `trapWeatherWear`). */
  maxDurability: number
  /** Probability an animal with a Traps skill of 0 spots this trap. */
  baseDetectionChance: number
  /** Scales weather wear — the single knob behind "simple rots in the rain,
   *  good barely notices" (implementation notes §14). */
  weatherWearMultiplier: number
  /** XZ radius (m) an animal must enter before a detection roll happens. */
  triggerRadius: number
  /** XZ radius (m, plan fauna-014 §4) within which an active+baited trap
   *  becomes a lure candidate for a compatible, diet-matching animal —
   *  deliberately bigger than `triggerRadius`: attraction only *draws the
   *  animal closer*, the smaller `triggerRadius` above still gates the
   *  actual detection/capture roll (`createPlacedTraps.ts`'s `update()`). */
  lureRadius: number
  /** Runtime GLB when one exists; `null` keeps the procedural prop
   *  (`trapProp.ts`) — same loader/fallback convention as other props. */
  modelUrl: string | null
}

export const TRAP_DEFS: Record<TrapKind, TrapDef> = {
  simple: {
    kind: 'simple',
    itemKind: 'trap_simple',
    label: 'prosta pułapka',
    maxDurability: 2,
    baseDetectionChance: 0.5,
    weatherWearMultiplier: 1,
    triggerRadius: 1.2,
    lureRadius: 6,
    modelUrl: null,
  },
  good: {
    kind: 'good',
    itemKind: 'trap_good',
    label: 'dobra pułapka',
    maxDurability: 5,
    baseDetectionChance: 0.3,
    weatherWearMultiplier: 0.25,
    triggerRadius: 1.4,
    lureRadius: 8,
    modelUrl: null,
  },
}

export const TRAP_KIND_BY_ITEM: Readonly<Partial<Record<ItemKind, TrapKind>>> = {
  trap_simple: 'simple',
  trap_good: 'good',
}

export function trapKindForItem(kind: ItemKind): TrapKind | null {
  return TRAP_KIND_BY_ITEM[kind] ?? null
}

/** Explicit trap-kind × species compatibility (plan fauna-014 §1) — not a
 *  `kind !== 'wolf'` runtime special case. `simple` stays the original V1
 *  small/medium-prey set (plan 141 §5); `good` additionally reaches `stag`
 *  (too large for `simple`) and `wolf` (a strong predator, needs the sturdier
 *  trap). `bear` and every domestic/livestock kind are deliberately absent
 *  from both — out of scope for the player trap system entirely. Names are
 *  real `AnimalDef.kind` values (`deer` is the sarna, `stag` the jeleń). */
const TRAP_SPECIES_COMPAT: Record<TrapKind, ReadonlySet<AnimalKind>> = {
  simple: new Set<AnimalKind>(['boar', 'deer', 'fox', 'rabbit']),
  good: new Set<AnimalKind>(['boar', 'deer', 'fox', 'rabbit', 'stag', 'wolf']),
}

export function isSpeciesTrappable(trapKind: TrapKind, kind: AnimalKind): boolean {
  return TRAP_SPECIES_COMPAT[trapKind].has(kind)
}

/** Detection can never be certain in either direction — a master trapper's
 *  trap is still spottable, and even a crude one is not a guaranteed alarm
 *  (implementation notes §15). */
export const TRAP_MIN_DETECTION = 0.1
export const TRAP_MAX_DETECTION = 0.9
/** Fraction of the base detection chance removed at Traps value 1. */
export const TRAP_SKILL_DETECTION_CUT = 0.6

/** Plan 159 §12 — extra detection cut while the trap carries bait, on top of
 *  the skill-driven cut above. Flat regardless of `'meat' | 'plant'` bait
 *  category or trapped species — bait's main job is *attraction* (plan
 *  fauna-014 §5, `resolveLureTarget`), so a species-vs-bait-type detection
 *  matrix would add complexity without a real gameplay distinction. */
export const TRAP_BAIT_DETECTION_CUT = 0.2

/**
 * Probability the animal **spots** the trap (and therefore escapes) — higher
 * Traps means lower detection, clamped so it never collapses to 0 or 1.
 */
export function trapDetectionChance(params: {
  baseChance: number
  /** `PlayerSkills['traps'].value` snapshot taken when the trap was armed. */
  skillValue: number
  /** Whether the trap currently carries bait (plan 159 §12). */
  hasBait?: boolean
}): number {
  const skill = Math.max(0, Math.min(1, params.skillValue))
  const baitCut = params.hasBait ? TRAP_BAIT_DETECTION_CUT : 0
  const chance = params.baseChance * (1 - TRAP_SKILL_DETECTION_CUT * skill - baitCut)
  if (!Number.isFinite(chance)) return TRAP_MAX_DETECTION
  return Math.max(TRAP_MIN_DETECTION, Math.min(TRAP_MAX_DETECTION, chance))
}

/** True when the animal detected the trap and slips past it. `roll` is a
 *  [0, 1) dice supplied by the caller — keeps this testable at the edges and
 *  free of `Math.random()`, same convention as `fauna/playerAwareness.ts`. */
export function rollTrapDetection(chance: number, roll: number): boolean {
  return roll < chance
}

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function hash01(a: number, b: number, salt: number): number {
  let h = Math.imul(a ^ salt, 2654435761) ^ Math.imul(b + 0x9e3779b9, 1597334677)
  h ^= h >>> 15
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

const TRAP_ROLL_SALT = 0x7a1cb00b

/** Deterministic dice for one `(trap, animal, attempt)` check — the same
 *  state always produces the same outcome (mirrors `detectionRoll` in
 *  `fauna/playerAwareness.ts`). `attempt` advances per resolved encounter, so
 *  a repeat visit after the cooldown re-rolls rather than repeating. */
export function trapDetectionRoll(trapId: string, animalId: string, attempt: number): number {
  return hash01(hashString(`${trapId}|${animalId}`), attempt, TRAP_ROLL_SALT)
}

/** In-game days an animal ignores a specific trap after evading it — long
 *  enough that a herd grazing next to a trap doesn't re-roll continuously
 *  (plan 141 §4), short enough that the trap stays useful. */
export const TRAP_DETECTION_COOLDOWN_DAYS = 0.25

/** Per-trap evasion cooldowns: `animalId → in-game day it expires`. Kept as a
 *  plain map owned by each trap rather than a global cooldown manager (plan
 *  141 §4) — one animal evading one trap must not affect any other pair. */
export type TrapCooldowns = Map<string, number>

/** True while `animalId` should skip this trap entirely. Expired entries are
 *  dropped as they're read, so the map only ever holds live cooldowns. */
export function isTrapCooldownActive(
  cooldowns: TrapCooldowns,
  animalId: string,
  nowDays: number,
): boolean {
  const until = cooldowns.get(animalId)
  if (until == null) return false
  if (nowDays < until) return true
  cooldowns.delete(animalId)
  return false
}

export function startTrapCooldown(
  cooldowns: TrapCooldowns,
  animalId: string,
  nowDays: number,
): void {
  cooldowns.set(animalId, nowDays + TRAP_DETECTION_COOLDOWN_DAYS)
}

export type TrapUseResult = { durability: number, state: TrapState }

/** Spends `amount` of durability and derives the resulting state. Used by
 *  both the capture path (exactly 1) and weather wear (fractions) so
 *  "durability hit 0 → broken" lives in exactly one place. */
export function spendTrapDurability(durability: number, amount: number): TrapUseResult {
  const left = Math.max(0, durability - Math.max(0, amount))
  return { durability: left, state: left > 0 ? 'placed' : 'broken' }
}

/** How harshly each weather type treats an armed trap, before the trap's own
 *  `weatherWearMultiplier` and the cycle's intensity. */
export const TRAP_WEATHER_SEVERITY: Record<WeatherType, number> = {
  clear: 0,
  cloudy: 0,
  fog: 0.1,
  rain: 0.35,
  snow: 0.5,
}

/** Durability lost by one *completed* weather cycle. Pure in `(weather, def)`
 *  — no trap-local weather history, so it stays compatible with the
 *  deterministic `(worldSeed, elapsedDays)` climate model (plan 141 §7). */
export function trapWeatherWear(weather: WeatherState, def: TrapDef): number {
  const severity = TRAP_WEATHER_SEVERITY[weather.type]
  if (severity <= 0) return 0
  return severity * weather.intensity * def.weatherWearMultiplier
}

/** Upper bound on cycles folded in by one catch-up pass — a large time skip
 *  must not turn into an unbounded loop (the remaining backlog is simply
 *  skipped, exactly like `computeSurfaceWeather`'s bounded lookback). */
export const TRAP_WEATHER_MAX_CATCHUP_CYCLES = 16

export type TrapWeatherCatchup = { wear: number, checkedAtDay: number }

/**
 * Folds every weather cycle that *finished* between `fromDay` and `nowDay`
 * into a single durability cost, and reports the day the accounting reached.
 * Lazy and event-shaped: callers run it when they next look at the trap, not
 * on a per-frame weather ticker (implementation notes §13).
 */
export function accumulateTrapWeatherWear(
  seed: number,
  fromDay: number,
  nowDay: number,
  def: TrapDef,
): TrapWeatherCatchup {
  if (!(nowDay > fromDay)) return { wear: 0, checkedAtDay: fromDay }
  let day = fromDay
  let wear = 0
  for (let i = 0; i < TRAP_WEATHER_MAX_CATCHUP_CYCLES; i++) {
    const weather = computeWeather(seed, day, getSeason(day))
    if (weather.endsAt > nowDay) return { wear, checkedAtDay: day }
    wear += trapWeatherWear(weather, def)
    day = weather.endsAt
  }
  // Backlog longer than the catch-up window (big time skip): jump to now
  // instead of walking hundreds of cycles.
  return { wear, checkedAtDay: nowDay }
}

/** Persisted state of one trap in the world (plan 141 §10). Only what cannot
 *  be re-derived from `TRAP_DEFS`: no model, no base detection, no species
 *  list. The per-animal detection cooldown is deliberately absent — wild
 *  fauna itself isn't persisted, so its `animalId`s don't survive a reload. */
export type PlacedTrapRecord = {
  id: string
  kind: TrapKind
  x: number
  z: number
  yaw: number
  state: TrapState
  /** Remaining uses; fractional because weather wear is continuous. */
  durability: number
  /** `PlayerSkills['traps'].value` when this trap was last armed. */
  skillAtActivation: number
  /** `elapsedDays` up to which weather wear has already been charged. */
  weatherCheckedAtDay: number
  /** Plan 159 §12 — an existing bait-capable food item's kind, or null. Set
   *  atomically when the trap is armed (see `createPlacedTraps.ts`'s
   *  `attachBait`); returned to inventory on disarm/collect before a catch,
   *  consumed on a successful capture. */
  baitKind: ItemKind | null
}

/** Cheap read-only lure snapshot for one active+baited trap (plan fauna-014
 *  §3/§4) — everything `AnimalAgent`'s throttled lure search needs and
 *  nothing else; deliberately never the Three.js mesh or the trap's own
 *  `PlacedTrapEntry`. Built fresh from live trap state
 *  (`PlacedTraps.activeLures()`), never cached/persisted itself. */
export type TrapLureDescriptor = {
  trapId: string
  kind: TrapKind
  x: number
  z: number
  baitKind: ItemKind
}

export type TrapPlacementReason = 'ok' | 'water' | 'slope' | 'object' | 'trap'

export const TRAP_PLACEMENT_MESSAGE: Record<Exclude<TrapPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na pułapkę.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  trap: 'Tu już stoi pułapka.',
}

/** Footprint/clearance used when checking a placement site. */
export const TRAP_FOOTPRINT_RADIUS = 0.5
/** Minimum distance between two placed traps — wide enough that two traps
 *  can't both fire on the same animal in the same spot. */
export const TRAP_SEPARATION = 2.5
/** How far ahead of the player a trap is set down (`app/createApp.ts`). */
export const TRAP_PLACE_REACH = 1.6
/** Busy-channel length for setting a trap down — same order as ignite/cook.
 *  Not scaled by any skill: Traps only affects detection (plan 141 §1). */
export const TRAP_SETUP_DURATION_SEC = 3

/** Interval between trap proximity passes (`createPlacedTraps.update`) — the
 *  trap↔fauna check is event-shaped rather than per-frame (plan 141 §11). */
export const TRAP_CHECK_INTERVAL_SEC = 0.5

export function trapStateLabel(state: TrapState): string {
  switch (state) {
    case 'active':
      return 'uzbrojona'
    case 'broken':
      return 'zniszczona'
    case 'placed':
      return 'rozbrojona'
  }
}
