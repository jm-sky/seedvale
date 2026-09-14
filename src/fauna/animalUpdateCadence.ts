/**
 * Shared importance/cadence policy for the one `AnimalAgent.update()` that
 * both wild fauna (`createFauna.ts`) and household livestock
 * (`settlement/livestock.ts`) run (plan fauna-028).
 *
 * Pure, Three.js-free, allocation-free and **stateless**: it holds no agent
 * registry, owns no update loop and schedules nothing. `AnimalAgent` keeps
 * its own two accumulators and asks this module how often each of its
 * sections may run. There is deliberately exactly one policy — wild fauna
 * and livestock share it rather than getting their own tuning tables.
 *
 * @domain fauna
 */

/** How much of this tick an animal is entitled to.
 *  - `immediate` — everything at full rate, byte-for-byte today's behaviour.
 *  - `active` — ordinary active animal: reduced movement/presentation cadence.
 *  - `routine` — far, idle or routine: lowest cadence. */
export type AnimalUpdateImportance = 'immediate' | 'active' | 'routine'

/** Everything the policy reads. Every field is state `AnimalAgent` already
 *  has *before* the behaviour section runs — sensing/targeting/decision stay
 *  full-rate precisely so `highPriorityBranch` is this tick's real answer and
 *  a throttled animal can never react a tick late to entering combat. */
export type AnimalCadenceSignals = {
  /** `isFaunaHighPriorityBranch()` over this tick's decided branch — combat,
   *  threat, flee, scare, dog-guard, fire-avoid, rabid. */
  highPriorityBranch: boolean
  /** Committed predator↔prey engagement, an animal currently threatening a
   *  human, or a frenzied predator on its village beeline. */
  engaged: boolean
  /** Physically coupled to the player: led on a rope (cart hitch included) or
   *  player-owned under Follow/Stay. Mounted animals never reach this module
   *  — `driveMounted()` runs every section unconditionally. */
  playerCoupled: boolean
  /** Committed traversal that needs accurate movement: an `AnimalTrip`
   *  (water trip / stray return / cave route) or a cave-habitat resident. */
  committedTraversal: boolean
  /** Actually swimming right now — drowning-relevant water traversal. */
  swimming: boolean
  /** A hurt/attack one-shot clip is still playing. */
  oneShotAnimActive: boolean
  /** Horizontal distance to the observer (player). One signal among many,
   *  never the only one, and never a gate on whether simulation happens. */
  observerDistance: number
}

/** Inside this radius an animal is treated as directly interactable
 *  (hand-feeding, mounting, inspecting), so nothing about it is throttled. */
export const IMMEDIATE_OBSERVER_RADIUS_M = 12
/** Matches `FAUNA_SHADOW_DISTANCE` — past it an animal casts no shadow and
 *  its label has fully faded, so it is the natural `active`/`routine` edge. */
export const ACTIVE_OBSERVER_RADIUS_M = 36
/** Matches `labelDistance.ts`'s `LABEL_FADE_NEAR` — inside it the label is
 *  fully readable, so presentation stays full-rate. */
export const PRESENTATION_FULL_RATE_RADIUS_M = 20

/** Hard guardrail: no animal's movement step may grow past this because its
 *  behaviour ran on accumulated time. Well under the tightest geometric
 *  tolerance on that path (`steerToward()`'s 0.4 m arrival early-out;
 *  `wander()`'s 1.2 m, `TRIP_ARRIVAL_RADIUS` 2 m, `CONTACT_RANGE` 0.8 m and
 *  the food/water interaction ranges are all looser still). */
export const MAX_THROTTLED_STEP_M = 0.25

const BEHAVIOUR_INTERVAL_SEC: Record<AnimalUpdateImportance, number> = {
  immediate: 0,
  active: 1 / 30,
  routine: 1 / 12,
}

const PRESENTATION_MID_INTERVAL_SEC = 1 / 20
const PRESENTATION_FAR_INTERVAL_SEC = 1 / 10

/** How far a per-agent phase may shorten an interval. Only ever shortens, so
 *  every guardrail below still holds at the stated bound. Spreading the
 *  flush frames across the population is what keeps a lower average from
 *  turning into a new periodic spike. */
const CADENCE_PHASE_SPREAD = 0.3

function withPhase(intervalSec: number, phase01: number): number {
  if (intervalSec <= 0) return 0
  const clamped = phase01 > 0 ? (phase01 < 1 ? phase01 : 1) : 0
  return intervalSec * (1 - CADENCE_PHASE_SPREAD * clamped)
}

/**
 * Classifies one animal for this tick. `immediate` wins on any single
 * qualifying signal — the policy is deliberately generous about staying at
 * full rate, because the measured win comes from the long tail of ordinary
 * wandering animals, not from shaving the few that are actually doing
 * something.
 *
 * @domain fauna
 */
export function resolveAnimalUpdateImportance(signals: AnimalCadenceSignals): AnimalUpdateImportance {
  if (
    signals.highPriorityBranch
    || signals.engaged
    || signals.playerCoupled
    || signals.committedTraversal
    || signals.swimming
    || signals.oneShotAnimActive
    || signals.observerDistance <= IMMEDIATE_OBSERVER_RADIUS_M
  ) {
    return 'immediate'
  }
  return signals.observerDistance <= ACTIVE_OBSERVER_RADIUS_M ? 'active' : 'routine'
}

/**
 * Minimum seconds between two runs of the behaviour (movement) section.
 * `0` means "every tick", i.e. exactly today's behaviour.
 *
 * Because the cadence is expressed in seconds, the extra movement quantum a
 * throttled animal can accumulate is bounded by the interval and not by the
 * frame rate: once `dt >= interval` (a slow frame) the gate passes every
 * tick and the agent is back at full rate. `walkSpeed` additionally clamps
 * the interval so a fast species never exceeds `MAX_THROTTLED_STEP_M`.
 *
 * @domain fauna
 */
export function animalBehaviourIntervalSec(
  importance: AnimalUpdateImportance,
  walkSpeed: number,
  phase01 = 0,
): number {
  const base = BEHAVIOUR_INTERVAL_SEC[importance]
  if (base <= 0) return 0
  const capped = walkSpeed > 0 ? Math.min(base, MAX_THROTTLED_STEP_M / walkSpeed) : base
  return withPhase(capped, phase01)
}

/**
 * Minimum seconds between two runs of the presentation-only section
 * (locomotion clip choice, status label sync, `AnimationMixer`). Distance
 * tiers mirror the label/shadow thresholds this presentation already uses,
 * so an animal is only slowed down once its label has faded and it no longer
 * casts a shadow. Never consults camera visibility.
 *
 * @domain fauna
 */
export function animalPresentationIntervalSec(
  importance: AnimalUpdateImportance,
  observerDistance: number,
  phase01 = 0,
): number {
  if (importance === 'immediate') return 0
  if (observerDistance <= PRESENTATION_FULL_RATE_RADIUS_M) return 0
  const base = observerDistance <= ACTIVE_OBSERVER_RADIUS_M
    ? PRESENTATION_MID_INTERVAL_SEC
    : PRESENTATION_FAR_INTERVAL_SEC
  return withPhase(base, phase01)
}

/** Whether an accumulated-time gate is due. `intervalSec <= 0` is always due. */
export function isCadenceDue(accumulatedSec: number, intervalSec: number): boolean {
  return intervalSec <= 0 || accumulatedSec >= intervalSec
}

/** Deterministic `[0,1)` phase from a stable `animalId` (FNV-1a, the same
 *  hashing idiom the rest of the repo uses for seeded rolls). Seeds the two
 *  cadence intervals so a population does not flush on the same frame —
 *  throttling must lower the average without introducing a new periodic
 *  spike. Deterministic, never `Math.random()`. */
export function animalCadencePhase01(animalId: string): number {
  let h = 2166136261
  for (let i = 0; i < animalId.length; i++) {
    h ^= animalId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}
