import { pickActionKind } from '../simulation'

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
    thirst: 0.25 + offset * 0.2,
    woodDuty: 0.2 + (1 - offset) * 0.2,
    waterDuty: 0.2 + (offset * 0.3),
    hunger: 0.15 + ((offset + 0.3) % 1) * 0.25,
  }
}

/** Tick needs upward over time (0–1). */
export function tickNeeds(needs: NeedState, dt: number): void {
  needs.thirst = Math.min(1, needs.thirst + dt * 0.04)
  needs.woodDuty = Math.min(1, needs.woodDuty + dt * 0.028)
  needs.waterDuty = Math.min(1, needs.waterDuty + dt * 0.028)
  needs.hunger = Math.min(1, needs.hunger + dt * 0.035)
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

export function pickNeed(needs: NeedState, options: PickNeedOptions = {}): NeedId {
  const waterThreshold = options.critical ? CRITICAL_WATER_THRESHOLD : 0.35
  const waterScore = needs.thirst > waterThreshold ? needs.thirst * 1.35 : 0
  const woodThreshold = options.critical ? CRITICAL_WOOD_THRESHOLD : options.woodShortage ? 0.22 : 0.3
  const woodMult = options.critical ? 1.1 : options.woodShortage ? 1.35 : 1.1
  const woodScore = options.skipWood ? 0 : (needs.woodDuty > woodThreshold ? needs.woodDuty * woodMult : 0)
  const waterDutyThreshold = options.critical ? CRITICAL_WATER_DUTY_THRESHOLD : options.waterShortage ? 0.22 : 0.3
  const waterDutyMult = options.critical ? 1.1 : options.waterShortage ? 1.35 : 1.1
  const waterDutyScore = needs.waterDuty > waterDutyThreshold ? needs.waterDuty * waterDutyMult : 0
  const foodThreshold = options.critical ? CRITICAL_FOOD_THRESHOLD : options.foodShortage ? 0.24 : 0.32
  const foodMult = options.critical ? 1.2 : options.foodShortage ? 1.4 : 1.2
  const foodScore = needs.hunger > foodThreshold ? needs.hunger * foodMult : 0
  const idleScore = 0.12

  // Order matters for tie-breaking: `pickHighestScore` only replaces its
  // running best on a strict improvement, so the first-listed of any tied
  // candidates wins — same precedence the old if-chain (water/wood/food,
  // idle only as the implicit fallback) encoded explicitly.
  return pickActionKind<NeedId>([
    { kind: 'water', score: waterScore },
    { kind: 'wood', score: woodScore },
    { kind: 'waterDuty', score: waterDutyScore },
    { kind: 'food', score: foodScore },
    { kind: 'idle', score: idleScore },
  ], 'idle')
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
