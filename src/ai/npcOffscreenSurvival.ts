import type { Inventory } from '../items/Inventory'
import type { HealthState } from '../shared/HealthState'
import type { InjuryRecoveryState } from '../shared/injuryRecovery'
import { resolveInjuryRecovery } from '../shared/injuryRecovery'
import { gameDaysToGameHours, gameHoursToGameDays, gameHoursToRealSeconds } from '../world/timeConversion'
import {
  FOOD_THRESHOLD_NORMAL,
  NEED_FULL_HOURS,
  type NeedState,
  relieveNeed,
  tickNeeds,
} from './Needs'
import {
  consumeOnePersonalDrink,
  consumeOnePersonalFood,
} from './npcPersonalProvisions'

/**
 * Generic bounded off-screen survival for travelling NPCs (plan
 * settlements-npcs-028). Elapsed world time + the same `NpcAuthoritativeState`
 * / `personalInventory` a live agent uses → hunger/thirst + provision
 * consumption, without an off-screen `NpcAgent.choose()` loop.
 *
 * Event-based (threshold crossings) so one skip equals the same split skips.
 *
 * @domain npc
 */

/** Same non-critical thirst bar `generateNeedPressures` uses. */
const WATER_THRESHOLD_NORMAL = 0.35

export type NpcOffscreenSurvivalHost = InjuryRecoveryState & {
  health: HealthState
  needs: NeedState
  personalInventory: Inventory
}

export type NpcOffscreenSurvivalResult = {
  kind: 'continue' | 'cannot-progress'
  settledAtDays: number
}

function hoursToReach(current: number, target: number, fullHours: number): number {
  if (current >= target) return 0
  return (target - current) * fullHours
}

function advanceNeedMeters(needs: NeedState, hours: number, dayLengthSec: number): void {
  if (!(hours > 0) || !(dayLengthSec > 0)) return
  tickNeeds(needs, gameHoursToRealSeconds(hours, dayLengthSec), dayLengthSec)
}

/**
 * Apply one elapsed off-screen interval. Idempotent when `fromDays >= toDays`.
 * Injury recovery uses the existing lazy owner (once, at `toDays`). Vigor is
 * not touched. Exhausted hunger/thirst after provisions are spent is
 * `cannot-progress`.
 *
 * @domain npc
 */
export function resolveNpcOffscreenTravelInterval(
  host: NpcOffscreenSurvivalHost,
  fromDays: number,
  toDays: number,
  dayLengthSec: number,
): NpcOffscreenSurvivalResult {
  if (host.health.dead) {
    resolveInjuryRecovery(host, toDays)
    return { kind: 'cannot-progress', settledAtDays: fromDays }
  }
  resolveInjuryRecovery(host, toDays)
  if (!(toDays > fromDays) || !(dayLengthSec > 0)) {
    return { kind: 'continue', settledAtDays: fromDays }
  }

  let remainingHours = gameDaysToGameHours(toDays - fromDays)
  let elapsedHours = 0
  while (remainingHours > 0) {
    const stepNowDays = fromDays + gameHoursToGameDays(elapsedHours)
    if (host.needs.hunger > FOOD_THRESHOLD_NORMAL && consumeOnePersonalFood(host.personalInventory, stepNowDays)) {
      relieveNeed(host.needs, 'food')
      continue
    }
    if (host.needs.thirst > WATER_THRESHOLD_NORMAL && consumeOnePersonalDrink(host.personalInventory)) {
      relieveNeed(host.needs, 'water')
      continue
    }
    if (host.needs.hunger >= 1 || host.needs.thirst >= 1) {
      return { kind: 'cannot-progress', settledAtDays: stepNowDays }
    }

    let step = remainingHours
    if (host.needs.hunger <= FOOD_THRESHOLD_NORMAL) {
      const toBar = hoursToReach(host.needs.hunger, FOOD_THRESHOLD_NORMAL, NEED_FULL_HOURS.hunger)
      step = Math.min(step, toBar > 0 ? toBar : 1e-6)
    } else if (host.needs.hunger < 1) {
      step = Math.min(step, hoursToReach(host.needs.hunger, 1, NEED_FULL_HOURS.hunger))
    }
    if (host.needs.thirst <= WATER_THRESHOLD_NORMAL) {
      const toBar = hoursToReach(host.needs.thirst, WATER_THRESHOLD_NORMAL, NEED_FULL_HOURS.thirst)
      step = Math.min(step, toBar > 0 ? toBar : 1e-6)
    } else if (host.needs.thirst < 1) {
      step = Math.min(step, hoursToReach(host.needs.thirst, 1, NEED_FULL_HOURS.thirst))
    }
    if (!(step > 0)) {
      return { kind: 'cannot-progress', settledAtDays: stepNowDays }
    }
    advanceNeedMeters(host.needs, step, dayLengthSec)
    elapsedHours += step
    remainingHours -= step
  }
  return { kind: 'continue', settledAtDays: toDays }
}
