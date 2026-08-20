/** Plan 159 §11 — minimal persistent wild hive state. Honey production is a
 *  world-time rule owned by the hive record itself, not a per-frame bee
 *  simulation; bees (if ever rendered) would be presentation-only and never
 *  own production or damage (no `BeeCombatSystem`/hive manager). */
export type BeehiveRecord = {
  id: string
  x: number
  z: number
  yaw: number
  /** Game-day the hive was last harvested — production accrues from here. */
  lastCollectedAtDay: number
  /** Terminal: a burned hive can never be collected from again. */
  burned: boolean
  /** Guards the one-time burn reward against a repeat trigger after
   *  stream-out/reload (§11: "must not grant the reward more than once"). */
  burnRewardCollected: boolean
}

/** One honey per this many game-days since the last collection. */
export const HONEY_PRODUCTION_INTERVAL_DAYS = 1
/** Caps accrual so an ignored hive doesn't become an unbounded stockpile. */
export const HONEY_MAX_ACCUMULATION = 4

export function honeyAvailable(hive: Pick<BeehiveRecord, 'lastCollectedAtDay' | 'burned'>, nowDays: number): number {
  if (hive.burned) return 0
  const elapsed = Math.max(0, nowDays - hive.lastCollectedAtDay)
  return Math.min(HONEY_MAX_ACCUMULATION, Math.floor(elapsed / HONEY_PRODUCTION_INTERVAL_DAYS))
}

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Small deterministic sting chance on collection without any smoke/pacify
 *  mechanic (out of scope) — reuses the existing `damageHealth` path, no new
 *  damage system. One roll per (hive, calendar day) so repeated collection
 *  attempts within the same day don't re-roll. */
const STING_CHANCE = 0.25
export const HIVE_STING_DAMAGE = 5

export function rollHiveSting(hiveId: string, nowDays: number): boolean {
  const day = Math.floor(nowDays)
  const h = hashString(`${hiveId}|sting|${day}`)
  return (h >>> 0) / 4294967296 < STING_CHANCE
}

export type HiveCollectResult = { lastCollectedAtDay: number, amount: number }

/** Pure — resolves a collection attempt without mutating anything; the
 *  caller applies the result to its own record. */
export function collectHoney(
  hive: Pick<BeehiveRecord, 'lastCollectedAtDay' | 'burned'>,
  nowDays: number,
): HiveCollectResult {
  const amount = honeyAvailable(hive, nowDays)
  return { lastCollectedAtDay: amount > 0 ? nowDays : hive.lastCollectedAtDay, amount }
}

/** One-time reward for burning down an unburned hive. */
export const HIVE_BURN_REWARD_HONEY = 5

export type HiveBurnResult = { alreadyBurned: boolean, reward: number }

export function burnHive(hive: Pick<BeehiveRecord, 'burned' | 'burnRewardCollected'>): HiveBurnResult {
  if (hive.burned) return { alreadyBurned: true, reward: 0 }
  return { alreadyBurned: false, reward: hive.burnRewardCollected ? 0 : HIVE_BURN_REWARD_HONEY }
}
