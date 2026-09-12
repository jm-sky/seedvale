/**
 * Generic bounded scare stimulus — thunder is the first source, but the
 * contract is source-agnostic so later fears do not grow a `ThunderFleeAI`.
 *
 * @domain fauna
 */

export type AnimalScareSource = 'thunder'

export type AnimalScareStimulus = {
  source: AnimalScareSource
  eventId: string
  strength: number
  /** Acoustic/simulated distance (m) of a non-positional world event. */
  simulatedDistanceM: number
}

export type AnimalScareContext = {
  animalId: string
  x: number
  z: number
  home: { x: number, z: number }
  /** Species 0..1 fear of sudden world stimuli. */
  fearBaseline: number
  ownerNearby: boolean
  herdmatesNearby: number
}

export const DEFAULT_FEAR_BASELINE = 0.45
const HOME_SAFE_RADIUS_M = 16
const OWNER_SCARE_MUL = 0.55
const HERD_SCARE_MUL_PER = 0.07
const HERD_SCARE_MUL_CAP = 4
const ACOUSTIC_NEAR_M = 90
const ACOUSTIC_FAR_M = 1500
const FLEE_ORIGIN_OFFSET_M = 20

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** FNV-1a over a short id string — stable across ticks/FPS. */
function hashId(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/**
 * Deterministic 0..1 roll for `(eventId, animalId)`. Same pair always
 * agrees, independent of tick count or frame rate.
 *
 * @domain fauna
 */
export function scareRoll(eventId: string, animalId: string): number {
  return hashId(`${eventId}\0${animalId}`)
}

function acousticDistanceFactor(simulatedDistanceM: number): number {
  return 1 - clamp01((simulatedDistanceM - ACOUSTIC_NEAR_M) / (ACOUSTIC_FAR_M - ACOUSTIC_NEAR_M))
}

/**
 * Probability that this animal flees from the stimulus. Strength and
 * closer simulated distance raise it; home/owner/herd proximity lower it.
 *
 * @domain fauna
 */
export function scareProbability(
  stimulus: AnimalScareStimulus,
  ctx: AnimalScareContext,
): number {
  const distanceFactor = acousticDistanceFactor(stimulus.simulatedDistanceM)
  const homeDist = Math.hypot(ctx.x - ctx.home.x, ctx.z - ctx.home.z)
  const homeSafety = clamp01(1 - homeDist / HOME_SAFE_RADIUS_M)
  const homeMul = 1 - 0.42 * homeSafety
  const ownerMul = ctx.ownerNearby ? OWNER_SCARE_MUL : 1
  const herdMul = 1 - HERD_SCARE_MUL_PER * Math.min(HERD_SCARE_MUL_CAP, Math.max(0, ctx.herdmatesNearby))
  const baseline = clamp01(ctx.fearBaseline) * (0.32 + stimulus.strength * 0.68)
  return clamp01(baseline * distanceFactor * homeMul * ownerMul * herdMul)
}

/**
 * True when the stable roll is below this animal's scare probability.
 *
 * @domain fauna
 */
export function shouldScare(
  stimulus: AnimalScareStimulus,
  ctx: AnimalScareContext,
): boolean {
  return scareRoll(stimulus.eventId, ctx.animalId) < scareProbability(stimulus, ctx)
}

export function scareFleeDurationSec(strength: number): number {
  return 3.2 + clamp01(strength) * 3.4
}

/**
 * Virtual source the animal flees away from when the event has no world
 * strike coordinate. Bearing is a hash of `(eventId, animalId)` — not
 * `Math.random()`, not player/camera position.
 *
 * @domain fauna
 */
export function scareFleeOrigin(
  eventId: string,
  animalId: string,
  animalX: number,
  animalZ: number,
): { x: number, z: number } {
  const bearing = hashId(`${eventId}\0${animalId}\0dir`) * Math.PI * 2
  return {
    x: animalX - Math.cos(bearing) * FLEE_ORIGIN_OFFSET_M,
    z: animalZ - Math.sin(bearing) * FLEE_ORIGIN_OFFSET_M,
  }
}
