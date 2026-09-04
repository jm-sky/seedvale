import { pickActionKind } from '../simulation'
import { realSecondsToGameHours } from '../world/timeConversion'

export type NeedId = 'food' | 'idle' | 'water' | 'waterDuty' | 'wood'

export type NeedState = {
  thirst: number
  woodDuty: number
  /** Household water-fetching chore (plan 122) — mirrors `woodDuty`: a
   *  duty to keep the household `WaterBarrel`/`AnimalTrough` stocked,
   *  distinct from this NPC's own `thirst`. */
  waterDuty: number
  hunger: number
}

export function createNeedState(offset = 0): NeedState {
  return {
    thirst: 0.05 + offset * 0.1,
    woodDuty: 0.1 + (1 - offset) * 0.1,
    waterDuty: 0.1 + (offset * 0.2),
    hunger: 0.05 + ((offset + 0.3) % 1) * 0.15,
  }
}

/** Hunger/thirst decay multiplier while an agent is asleep (NPC `sleep` phase;
 *  fauna uses the same rate at night when not sprinting). */
export const SLEEP_HUNGER_THIRST_RATE = 0.5

const NEED_FULL_HOURS = {
  thirst: 8,
  hunger: 10,
  woodDuty: 12,
  waterDuty: 12,
}

export type TickNeedsOptions = {
  /** Multiplier on hunger/thirst rise only — wood/water duties are unchanged. */
  hungerThirstRate?: number
}

/** Tick needs upward over time (0–1). */
export function tickNeeds(needs: NeedState, dt: number, dayLengthSec: number, options: TickNeedsOptions = {}): void {
  const hungerThirstRate = options.hungerThirstRate ?? 1
  const hoursElapsed = realSecondsToGameHours(dt, dayLengthSec)

  needs.thirst = Math.min(1, needs.thirst + hoursElapsed / NEED_FULL_HOURS.thirst * hungerThirstRate)
  needs.woodDuty = Math.min(1, needs.woodDuty + hoursElapsed / NEED_FULL_HOURS.woodDuty)
  needs.waterDuty = Math.min(1, needs.waterDuty + hoursElapsed / NEED_FULL_HOURS.waterDuty)
  needs.hunger = Math.min(1, needs.hunger + hoursElapsed / NEED_FULL_HOURS.hunger * hungerThirstRate)
}

export type PickNeedOptions = {
  /** Traders keep the woodDuty meter but never act on it — they stay at the
   *  stall instead of walking off to chop. */
  skipWood?: boolean
  /** Settlement wood shortage — a light score bump, not an economic planner. */
  woodShortage?: boolean
  /** Settlement food shortage — same light bias as `woodShortage`. */
  foodShortage?: boolean
  /** Household water reserve below target — same light bias as `woodShortage`. */
  waterShortage?: boolean
  /** An active helper resource-delivery assignment (plan 167) wants this NPC
   *  to consider the `food` need even before real hunger — same light bias
   *  as `foodShortage` (same threshold/multiplier), so an assigned NPC's
   *  hunger doesn't have to reach the normal bar just to get a chance at
   *  delivering surplus. `NpcAgent.computeFoodStrategyCandidates` still
   *  gates the actual `playerStorageDelivery` candidate on real hunger via
   *  `FOOD_THRESHOLD_NORMAL` — this only affects whether `food` is picked as
   *  the active need at all. */
  helperDeliveryAvailable?: boolean
  /** Use the stricter `CRITICAL_*_THRESHOLD`s instead of the normal ones —
   *  "genuinely urgent enough to interrupt an in-flight action", not just
   *  "worth doing next" (plan 114, `NpcAgent.tickCriticalInterrupt`).
   *  `woodShortage`/`foodShortage` are ignored in this mode — urgency stays
   *  a fixed, predictable bar regardless of settlement economy state. */
  critical?: boolean
}

/** Thresholds for `pickNeed({ critical: true })` — used only by
 *  `NpcAgent`'s in-flight interrupt check (plan 114), never by the normal
 *  `choose()` pick. Meaningfully above the thresholds below so an interrupt
 *  fires only for a genuinely urgent need ("bardzo spragniony"), not merely
 *  "worth doing next". Same score multipliers as the normal non-shortage
 *  case — only the threshold moves. */
const CRITICAL_WATER_THRESHOLD = 0.75
const CRITICAL_WOOD_THRESHOLD = 0.85
const CRITICAL_WATER_DUTY_THRESHOLD = 0.85
const CRITICAL_FOOD_THRESHOLD = 0.7

/** The non-shortage/non-critical `food` threshold below — exported so
 *  `NpcAgent.computeFoodStrategyCandidates` (plan 167) can tell "genuinely
 *  hungry" apart from "only picked `food` because a helper assignment lowered
 *  the bar" without duplicating the number. Own real hunger above this must
 *  still win over delivering surplus to a player `Container` (plan §9). */
export const FOOD_THRESHOLD_NORMAL = 0.32

/** A single need-driven arbitration pressure (plan ai-001) — the explicit
 *  form of the scores `pickNeed()` used to compute inline. `source` names
 *  the originating need/duty meter; `target` is the `NeedId` it competes
 *  for; `value` is the same normalized score `pickActionKind` arbitrates
 *  over. Plain/immutable data — safe to copy into diagnostics or a trace
 *  event without exposing live NPC state. */
export type NpcPressure = {
  source: string
  target: NeedId
  value: number
}

/** Pure pressure generator (plan ai-001) — the single source of truth for
 *  need-arbitration scores. Reproduces `pickNeed()`'s previous inline
 *  threshold/multiplier semantics exactly; `pickNeed()` and diagnostics
 *  both consume this rather than recomputing scores independently.
 *
 * FUTURE AI:
 * These scores currently combine need intensity with a few coarse world
 * shortage modifiers. This is the natural pressure-arbitration seam for a
 * future model where Needs, Problems and Opportunities become explicit
 * pressures and Big Five/role/traits modify strategy choice. Keep critical
 * physiological needs able to dominate personality preferences. */
export function generateNeedPressures(needs: NeedState, options: PickNeedOptions = {}): NpcPressure[] {
  const waterThreshold = options.critical ? CRITICAL_WATER_THRESHOLD : 0.35
  const waterScore = needs.thirst > waterThreshold ? needs.thirst * 1.35 : 0
  const woodThreshold = options.critical ? CRITICAL_WOOD_THRESHOLD : options.woodShortage ? 0.22 : 0.3
  const woodMult = options.critical ? 1.1 : options.woodShortage ? 1.35 : 1.1
  const woodScore = options.skipWood ? 0 : (needs.woodDuty > woodThreshold ? needs.woodDuty * woodMult : 0)
  const waterDutyThreshold = options.critical ? CRITICAL_WATER_DUTY_THRESHOLD : options.waterShortage ? 0.22 : 0.3
  const waterDutyMult = options.critical ? 1.1 : options.waterShortage ? 1.35 : 1.1
  const waterDutyScore = needs.waterDuty > waterDutyThreshold ? needs.waterDuty * waterDutyMult : 0
  const foodBiased = options.foodShortage || options.helperDeliveryAvailable
  const foodThreshold = options.critical ? CRITICAL_FOOD_THRESHOLD : foodBiased ? 0.24 : FOOD_THRESHOLD_NORMAL
  const foodMult = options.critical ? 1.2 : foodBiased ? 1.4 : 1.2
  const foodScore = needs.hunger > foodThreshold ? needs.hunger * foodMult : 0
  const idleScore = 0.12

  // Order matters for tie-breaking: `pickHighestScore` only replaces its
  // running best on a strict improvement, so the first-listed of any tied
  // candidates wins — same precedence the old if-chain (water/wood/food,
  // idle only as the implicit fallback) encoded explicitly.
  return [
    { source: 'need.thirst', target: 'water', value: waterScore },
    { source: 'need.woodDuty', target: 'wood', value: woodScore },
    { source: 'need.waterDuty', target: 'waterDuty', value: waterDutyScore },
    { source: 'need.hunger', target: 'food', value: foodScore },
    { source: 'need.idle', target: 'idle', value: idleScore },
  ]
}

/** Thin arbitration step (plan ai-001) over already-generated pressures —
 *  reuses `pickActionKind`'s deterministic strict-`>` tie behaviour. */
export function pickFromPressures(pressures: readonly NpcPressure[], fallback: NeedId = 'idle'): NeedId {
  return pickActionKind<NeedId>(
    pressures.map((pressure) => ({ kind: pressure.target, score: pressure.value })),
    fallback,
  )
}

export function pickNeed(needs: NeedState, options: PickNeedOptions = {}): NeedId {
  return pickFromPressures(generateNeedPressures(needs, options))
}

/** Amount a completed need-driven action relieves its meter by (plan ai-003
 *  onward moved these out of `NpcAgent`, review 2026-09-03 §5 E5) — the
 *  counterpart to `tickNeeds`'s upward drift. `idle` has no meter of its own
 *  and is intentionally absent; `relieveNeed`/`needValue` no-op for it. */
export const NEED_SATISFY_AMOUNT: Record<Exclude<NeedId, 'idle'>, number> = {
  water: 0.65,
  food: 0.6,
  wood: 0.55,
  waterDuty: 0.55,
}

/** Relieves `need`'s meter by `amount` (default `NEED_SATISFY_AMOUNT[need]`),
 *  clamped at 0. No-op for `idle`, which has no backing meter. */
export function relieveNeed(needs: NeedState, need: NeedId, amount?: number): void {
  if (need === 'idle') return
  const delta = amount ?? NEED_SATISFY_AMOUNT[need]
  switch (need) {
    case 'food':
      needs.hunger = Math.max(0, needs.hunger - delta)
      return
    case 'water':
      needs.thirst = Math.max(0, needs.thirst - delta)
      return
    case 'waterDuty':
      needs.waterDuty = Math.max(0, needs.waterDuty - delta)
      return
    case 'wood':
      needs.woodDuty = Math.max(0, needs.woodDuty - delta)
      return
  }
}

/** Reads `need`'s current meter value. `null` for `idle`, which has no
 *  backing meter (mirrors `relieveNeed`'s no-op). */
export function needValue(needs: NeedState, need: NeedId): number | null {
  switch (need) {
    case 'food': return needs.hunger
    case 'water': return needs.thirst
    case 'waterDuty': return needs.waterDuty
    case 'wood': return needs.woodDuty
    default: return null
  }
}

export function needColor(need: NeedId): number {
  switch (need) {
    case 'food':
      return 0x5faa3a
    case 'water':
      return 0x3a9ad9
    case 'waterDuty':
      return 0x2f7fb0
    case 'wood':
      return 0xb56b2a
    default:
      return 0xc45c26
  }
}

export function needLabel(need: NeedId): string {
  switch (need) {
    case 'food':
      return 'jedzenie'
    case 'water':
      return 'woda'
    case 'waterDuty':
      return 'zaopatrzenie w wodę'
    case 'wood':
      return 'drewno'
    default:
      return '…'
  }
}
