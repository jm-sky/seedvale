import { STAMINA_REST_THRESHOLD } from './AnimalLife'

/**
 * @domain fauna
 * @role Pure day/night activity-cycle bias for routine wild-fauna rest (plan
 *  fauna-034 §1/§2) — answers "how strongly does this species want to rest
 *  right now", never who/where it rests (that stays `AnimalAgent`'s own
 *  home-return/idle execution in `pursueRoutineRest()`) and never a
 *  schedule/FSM: identical inputs always produce the identical answer.
 *  Hunger/thirst/threat/flee/trip branches all run before this is ever
 *  consulted (`AnimalAgent.updatePredator`/`updatePrey`), so this only ever
 *  expresses a *bias*, never a fixed clock-driven behaviour.
 */

export type AnimalActivityProfile = 'diurnal' | 'nocturnal' | 'crepuscular'

export type ActivityRestInput = {
  profile: AnimalActivityProfile
  /** 0..1 species strength of the time-of-day rest bias
   *  (`AnimalDef.activity.restBias`). */
  restBias: number
  /** Raw world clock, 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk — same
   *  convention as `audio/animalSounds.ts`'s wolf-howl/rooster-crow
   *  time-of-day weighting. Needed because `dayFactor` alone can't tell
   *  dawn from dusk (both clamp toward the same value). */
  timeOfDay: number
  /** 0 = full night, 1 = full day (`world/dayNight.ts` convention). */
  dayFactor: number
}

/** Dawn/dusk anchors — kept local rather than imported, same reasoning as
 *  `audio/animalSounds.ts`'s own local `DAWN_TIME`/`DUSK_TIME`: this module
 *  stays independent of both `world/dayNight.ts` and that audio module. */
const DAWN_TIME = 0.25
const DUSK_TIME = 0.75
/** How far (in `timeOfDay` units) from the nearest dawn/dusk anchor a
 *  crepuscular animal's rest pressure reaches its maximum — noon and
 *  midnight both sit exactly this far from their nearer anchor. */
const CREPUSCULAR_REST_SPAN = 0.25

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/** Circular distance between two `timeOfDay` values in `[0, 0.5]` — same
 *  idiom as `audio/animalSounds.ts`'s local helper, duplicated rather than
 *  imported since both are intentionally independent single-purpose
 *  modules (that module's own doc explains the same choice). */
function circularTimeDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 1
  return Math.min(d, 1 - d)
}

/** 0..1 time-of-day rest pressure for `profile` alone, before `restBias`
 *  and stamina are applied — 1 means this is a strongly restful time for
 *  this profile, 0 means fully active. */
export function timeOfDayRestPressure(
  input: Pick<ActivityRestInput, 'profile' | 'timeOfDay' | 'dayFactor'>,
): number {
  switch (input.profile) {
    case 'crepuscular': {
      const distFromActive = Math.min(
        circularTimeDistance(input.timeOfDay, DAWN_TIME),
        circularTimeDistance(input.timeOfDay, DUSK_TIME),
      )
      return clamp01(distFromActive / CREPUSCULAR_REST_SPAN)
    }
    case 'diurnal':
      return 1 - input.dayFactor
    case 'nocturnal':
      return input.dayFactor
  }
}

/** How much extra rest pressure low stamina contributes once below
 *  `staminaThreshold` — additive, not a hard override: a nocturnal animal
 *  at full stamina during the day should still often want to rest, and a
 *  diurnal animal merely tired at midday shouldn't be forced into sleep
 *  metabolism just because it's tired (rest stays a bias, never a
 *  schedule — plan fauna-034 architectural decision 5). */
const STAMINA_PRESSURE_WEIGHT = 0.5
/** Combined pressure at/above this resolves to "routine rest desired". */
const REST_PRESSURE_THRESHOLD = 0.55
/** +/- spread applied by the per-animal phase stagger, so a population
 *  doesn't cross the threshold in lockstep (architectural decision 7 —
 *  deterministic, never `Math.random()`). */
const STAGGER_SPREAD = 0.1

/** Same FNV-1a hash idiom already duplicated per-module across this domain
 *  (`animalRoaming.ts`, `animalStray.ts`, `animalNames.ts`,
 *  `playerAwareness.ts`) rather than a shared export. */
function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic per-animal phase offset in `[0, 1)` — identical `animalId`
 *  always yields the identical offset, so a whole population never crosses
 *  the rest threshold in the same frame purely because of true randomness. */
export function restPhaseOffset(animalId: string): number {
  return (hashString(animalId) % 1000) / 1000
}

export type RoutineRestInput = ActivityRestInput & {
  /** 0..1 current `StaminaState` ratio (`getStaminaRatio`). */
  staminaRatio: number
  /** Overrides the shared `STAMINA_REST_THRESHOLD` default when the species
   *  needs to differ (`AnimalDef.activity.staminaThreshold`). */
  staminaThreshold?: number
  animalId: string
}

/** 0..1 combined rest desirability — time-of-day pressure (scaled by
 *  `restBias`) plus a low-stamina contribution. Exported mainly for tests;
 *  `shouldRoutineRest` is the seam callers actually use. */
export function activityRestPressure(input: RoutineRestInput): number {
  const timePressure = timeOfDayRestPressure(input) * clamp01(input.restBias)
  const threshold = input.staminaThreshold ?? STAMINA_REST_THRESHOLD
  const staminaPressure = input.staminaRatio < threshold
    ? (threshold - input.staminaRatio) / threshold
    : 0
  return clamp01(timePressure + staminaPressure * STAMINA_PRESSURE_WEIGHT)
}

/**
 * Whether routine time-of-day/stamina rest is desirable right now for one
 * activity-configured animal — a bias check, not a timetable. Callers must
 * resolve hunger, thirst, threats, combat, flee, trips and other urgent
 * behaviour *before* consulting this (plan fauna-034 §2/§6). Deterministic:
 * identical inputs (including `animalId`) always return the same answer.
 */
export function shouldRoutineRest(input: RoutineRestInput): boolean {
  const pressure = activityRestPressure(input)
  const stagger = (restPhaseOffset(input.animalId) - 0.5) * STAGGER_SPREAD
  return pressure + stagger >= REST_PRESSURE_THRESHOLD
}
