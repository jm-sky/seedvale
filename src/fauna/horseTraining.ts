/**
 * Per-horse training progress, derived tiers and mount modifiers
 * (plan settlements-013). Training belongs to the individual `AnimalAgent`,
 * never to the owner, vendor or a parallel `HorseAgent`.
 *
 * @domain settlements
 * @domain fauna
 */

import type { FencedAreaBound } from './animalAreaBound'

export type HorseTrainingState = {
  progress: number
}

/** Origin/paddock association that survives purchase until the horse
 *  actually leaves the footprint (plan settlements-013). Not merchant NPC
 *  data — the horse owns this relationship. */
export type HorsePaddockStay = {
  settlementId: string
  slotIndex: number
  x: number
  z: number
  radius: number
  entranceX: number
  entranceZ: number
  entranceWidth: number
  hayX: number
  hayZ: number
}

export function paddockStayToBound(stay: HorsePaddockStay): FencedAreaBound {
  return {
    x: stay.x,
    z: stay.z,
    radius: stay.radius,
    entranceX: stay.entranceX,
    entranceZ: stay.entranceZ,
    entranceWidth: stay.entranceWidth,
  }
}

export type HorseTrainingTier = 'ordinary' | 'trained' | 'warhorse'

export type HorseTrainingModifiers = {
  /** Multiplier on `AnimalDef.mount` walk/sprint speed. Ordinary is 1. */
  speed: number
  /** Multiplier on mounted stamina drain. Lower is better. Ordinary is 1. */
  staminaDrain: number
  /** Multiplier on the individual's stamina capacity. Ordinary is 1. */
  staminaCapacity: number
  /** Multiplier on riding fall risk. Lower is better. Ordinary is 1. */
  fallRisk: number
  /** Multiplier on species max HP. Ordinary is 1. */
  maxHp: number
  /** Multiplier on scare `fearBaseline`. Lower is calmer. Ordinary is 1. */
  fear: number
}

export const HORSE_TRAINING_MIN = 0
export const HORSE_TRAINING_MAX = 1
/** Progress at which the derived label becomes `trained`. */
export const HORSE_TRAINED_PROGRESS = 0.4
/** Progress at which the derived label becomes `warhorse`. */
export const HORSE_WARHORSE_PROGRESS = 0.8

const ORDINARY_MODIFIERS: HorseTrainingModifiers = {
  speed: 1,
  staminaDrain: 1,
  staminaCapacity: 1,
  fallRisk: 1,
  maxHp: 1,
  fear: 1,
}

const TRAINED_AT_THRESHOLD: HorseTrainingModifiers = {
  speed: 1.02,
  staminaDrain: 0.88,
  staminaCapacity: 1.12,
  fallRisk: 0.75,
  maxHp: 1.06,
  fear: 0.82,
}

const WARHORSE_AT_MAX: HorseTrainingModifiers = {
  speed: 1.06,
  staminaDrain: 0.7,
  staminaCapacity: 1.28,
  fallRisk: 0.48,
  maxHp: 1.22,
  fear: 0.55,
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return HORSE_TRAINING_MIN
  if (value < HORSE_TRAINING_MIN) return HORSE_TRAINING_MIN
  if (value > HORSE_TRAINING_MAX) return HORSE_TRAINING_MAX
  return value
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpModifiers(
  a: HorseTrainingModifiers,
  b: HorseTrainingModifiers,
  t: number,
): HorseTrainingModifiers {
  return {
    speed: lerp(a.speed, b.speed, t),
    staminaDrain: lerp(a.staminaDrain, b.staminaDrain, t),
    staminaCapacity: lerp(a.staminaCapacity, b.staminaCapacity, t),
    fallRisk: lerp(a.fallRisk, b.fallRisk, t),
    maxHp: lerp(a.maxHp, b.maxHp, t),
    fear: lerp(a.fear, b.fear, t),
  }
}

/** Clamp training progress into the persisted 0..1 range. */
export function clampHorseTrainingProgress(progress: number): number {
  return clamp01(progress)
}

/**
 * Normalize an optional saved training object. Absent / invalid values
 * become `undefined` (legacy saves and non-horses). Horses with an explicit
 * object get a clamped `progress`.
 */
export function normalizeHorseTrainingState(
  state: HorseTrainingState | undefined | null,
): HorseTrainingState | undefined {
  if (!state || typeof state !== 'object') return undefined
  if (typeof state.progress !== 'number' || !Number.isFinite(state.progress)) {
    return { progress: HORSE_TRAINING_MIN }
  }
  return { progress: clamp01(state.progress) }
}

/** Derived label — never persisted. */
export function horseTrainingTier(progress: number): HorseTrainingTier {
  const value = clamp01(progress)
  if (value >= HORSE_WARHORSE_PROGRESS) return 'warhorse'
  if (value >= HORSE_TRAINED_PROGRESS) return 'trained'
  return 'ordinary'
}

export function horseTrainingTierOf(state: HorseTrainingState | undefined): HorseTrainingTier {
  return horseTrainingTier(state?.progress ?? HORSE_TRAINING_MIN)
}

/**
 * Effective mount modifiers for a given progress. Ordinary (0) is exactly
 * the current species baseline. Does not mutate `AnimalDef`.
 */
export function horseTrainingModifiers(progress: number): HorseTrainingModifiers {
  const value = clamp01(progress)
  if (value <= 0) return ORDINARY_MODIFIERS
  if (value <= HORSE_TRAINED_PROGRESS) {
    return lerpModifiers(ORDINARY_MODIFIERS, TRAINED_AT_THRESHOLD, value / HORSE_TRAINED_PROGRESS)
  }
  if (value <= HORSE_WARHORSE_PROGRESS) {
    const t = (value - HORSE_TRAINED_PROGRESS) / (HORSE_WARHORSE_PROGRESS - HORSE_TRAINED_PROGRESS)
    return lerpModifiers(TRAINED_AT_THRESHOLD, {
      speed: 1.035,
      staminaDrain: 0.8,
      staminaCapacity: 1.18,
      fallRisk: 0.62,
      maxHp: 1.12,
      fear: 0.7,
    }, t)
  }
  const t = (value - HORSE_WARHORSE_PROGRESS) / (HORSE_TRAINING_MAX - HORSE_WARHORSE_PROGRESS)
  return lerpModifiers({
    speed: 1.035,
    staminaDrain: 0.8,
    staminaCapacity: 1.18,
    fallRisk: 0.62,
    maxHp: 1.12,
    fear: 0.7,
  }, WARHORSE_AT_MAX, t)
}

export function horseTrainingModifiersOf(
  state: HorseTrainingState | undefined,
): HorseTrainingModifiers {
  return horseTrainingModifiers(state?.progress ?? HORSE_TRAINING_MIN)
}

/**
 * Single mutation boundary for future training events (riding, travel,
 * trainer, quest reward). Callers must not write `progress` themselves.
 */
export function addHorseTrainingProgress(
  state: HorseTrainingState | undefined,
  amount: number,
): HorseTrainingState {
  const current = state?.progress ?? HORSE_TRAINING_MIN
  const delta = Number.isFinite(amount) ? amount : 0
  return { progress: clamp01(current + delta) }
}

const BASE_HORSE_PRICE = 220

/**
 * Base coin price for a live horse before social/grievance markup.
 * Ordinary < trained < warhorse. Wagon-horse `MERCHANT_HORSE_PRICE` stays
 * a separate authored premium.
 *
 * @domain settlements
 */
export function horseTrainingPrice(progress: number): number {
  const value = clamp01(progress)
  if (value < HORSE_TRAINED_PROGRESS) {
    return Math.round(BASE_HORSE_PRICE + value * 80)
  }
  if (value < HORSE_WARHORSE_PROGRESS) {
    return Math.round(280 + (value - HORSE_TRAINED_PROGRESS) * 250)
  }
  return Math.round(520 + (value - HORSE_WARHORSE_PROGRESS) * 400)
}

export const HORSE_TRAINING_TIER_LABEL: Record<HorseTrainingTier, string> = {
  ordinary: 'Koń zwykły',
  trained: 'Koń wyszkolony',
  warhorse: 'Rumak wojenny',
}

export type VillageSizeForTraining = 'OUTPOST' | 'SM' | 'MD' | 'LG' | 'XL'

/**
 * Initial vendor-horse progress from a dedicated RNG stream. Generates
 * progress, never a persisted tier. Size shifts the distribution; warhorse
 * stays rare even in XL.
 *
 * @domain settlements
 */
export function rollInitialHorseTrainingProgress(
  random: () => number,
  size: VillageSizeForTraining,
): number {
  const roll = random()
  const span = (lo: number, hi: number) => lerp(lo, hi, random())
  if (size === 'MD') {
    if (roll < 0.88) return span(0, 0.35)
    return span(HORSE_TRAINED_PROGRESS, 0.55)
  }
  if (size === 'LG') {
    if (roll < 0.48) return span(0, 0.38)
    if (roll < 0.92) return span(HORSE_TRAINED_PROGRESS, 0.72)
    return span(0.75, 0.9)
  }
  if (size === 'XL') {
    if (roll < 0.22) return span(0, 0.36)
    if (roll < 0.78) return span(HORSE_TRAINED_PROGRESS, 0.76)
    return span(0.78, 1)
  }
  return 0
}
