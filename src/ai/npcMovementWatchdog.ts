/**
 * Stuck-movement detection and rescue-stage escalation for `NpcAgent`
 * (plan `2026-08-14--npc-movement-stamina-rescue`).
 *
 * Pure, Three.js-free state + functions — mirrors `npcVigor.ts`'s shape.
 * This module only decides *when* an NPC has stopped making progress and
 * *which* rescue stage to try next; it never touches `Phase`/`pendingAction`
 * itself — `NpcAgent` reads the returned stage and acts on it.
 */

export type RescueStage = 'none' | 'repath' | 'escape' | 'abandon'

export type MovementWatchdog = {
  /** Position at the last progress check; `null` until the first check runs
   *  after a reset, so that check never falsely reports "no progress". */
  checkX: number | null
  checkZ: number | null
  /** Seconds remaining until the next progress check. */
  checkTimer: number
  /** Consecutive checks with < STUCK_MIN_PROGRESS_DIST of movement. */
  lowProgressStrikes: number
  rescueStage: RescueStage
  /** Number of `abandon` escalations within the last `RECENT_RESCUE_WINDOW_SEC`. */
  recentRescueCount: number
  /** Seconds remaining before `recentRescueCount` decays back to 0. */
  recentRescueTimer: number
}

/** How often (seconds) to sample position for stuck detection. */
export const STUCK_CHECK_INTERVAL_SEC = 1.5
/** Minimum distance (world units) between checks to count as "progress". */
export const STUCK_MIN_PROGRESS_DIST = 0.15
/** Consecutive no-progress checks before escalating past `none`. One check
 *  is `STUCK_STRIKES_FOR_REPATH * STUCK_CHECK_INTERVAL_SEC` seconds. */
export const STUCK_STRIKES_FOR_REPATH = 2
export const STUCK_STRIKES_FOR_ESCAPE = STUCK_STRIKES_FOR_REPATH + 1
export const STUCK_STRIKES_FOR_ABANDON = STUCK_STRIKES_FOR_ESCAPE + 1

/** Rolling window (seconds) `recentRescueCount` is tracked over. */
export const RECENT_RESCUE_WINDOW_SEC = 90
/** `recentRescueCount` reaching this within the window escalates the next
 *  `abandon` straight to an emergency teleport instead of just `choose`. */
export const EMERGENCY_TELEPORT_AFTER_ABANDONS = 2

export function createMovementWatchdog(): MovementWatchdog {
  return {
    checkX: null,
    checkZ: null,
    checkTimer: STUCK_CHECK_INTERVAL_SEC,
    lowProgressStrikes: 0,
    rescueStage: 'none',
    recentRescueCount: 0,
    recentRescueTimer: 0,
  }
}

/** Call whenever the NPC starts pursuing a genuinely new destination
 *  (new `pendingAction`, a fresh `wanderNear` target, entering `goSleep`,
 *  advancing a `followPath` waypoint) — clears strikes/stage so a stale
 *  stall from the previous leg is never blamed on the new one. Does not
 *  touch `recentRescueCount`/`recentRescueTimer` (that decay is
 *  independent of any single leg). */
export function resetMovementWatchdog(watchdog: MovementWatchdog): void {
  watchdog.checkX = null
  watchdog.checkZ = null
  watchdog.checkTimer = STUCK_CHECK_INTERVAL_SEC
  watchdog.lowProgressStrikes = 0
  watchdog.rescueStage = 'none'
}

/**
 * Advance the watchdog by `dt` seconds at position `(x, z)`. Returns the
 * rescue stage the caller should act on this frame — `'none'` most frames.
 * `'abandon'` is expected to be paired with the caller calling
 * `resetMovementWatchdog` once it acts (abandoning returns the NPC to
 * `choose`, and its next real action/wander target resets the watchdog
 * anyway) — if a caller ignores an `'abandon'` return, subsequent checks
 * keep reporting `'abandon'` rather than silently dropping back to `'none'`.
 */
export function tickMovementWatchdog(watchdog: MovementWatchdog, dt: number, x: number, z: number): RescueStage {
  if (watchdog.recentRescueTimer > 0) {
    watchdog.recentRescueTimer -= dt
    if (watchdog.recentRescueTimer <= 0) watchdog.recentRescueCount = 0
  }

  watchdog.checkTimer -= dt
  if (watchdog.checkTimer > 0) return 'none'
  watchdog.checkTimer += STUCK_CHECK_INTERVAL_SEC

  if (watchdog.checkX === null || watchdog.checkZ === null) {
    watchdog.checkX = x
    watchdog.checkZ = z
    return 'none'
  }

  const dist = Math.hypot(x - watchdog.checkX, z - watchdog.checkZ)
  watchdog.checkX = x
  watchdog.checkZ = z

  if (dist >= STUCK_MIN_PROGRESS_DIST) {
    watchdog.lowProgressStrikes = 0
    watchdog.rescueStage = 'none'
    return 'none'
  }

  watchdog.lowProgressStrikes++
  if (watchdog.lowProgressStrikes >= STUCK_STRIKES_FOR_ABANDON) {
    watchdog.rescueStage = 'abandon'
    return 'abandon'
  }
  if (watchdog.lowProgressStrikes >= STUCK_STRIKES_FOR_ESCAPE) {
    watchdog.rescueStage = 'escape'
    return 'escape'
  }
  if (watchdog.lowProgressStrikes >= STUCK_STRIKES_FOR_REPATH) {
    watchdog.rescueStage = 'repath'
    return 'repath'
  }
  return 'none'
}

/** Record that an `abandon` just happened — call right after acting on an
 *  `'abandon'` return from `tickMovementWatchdog`. Returns `true` once
 *  `recentRescueCount` (after incrementing) reaches
 *  `EMERGENCY_TELEPORT_AFTER_ABANDONS`, signalling the caller should
 *  emergency-teleport instead of the normal abandon-and-retry recovery. */
export function registerAbandon(watchdog: MovementWatchdog): boolean {
  watchdog.recentRescueCount++
  watchdog.recentRescueTimer = RECENT_RESCUE_WINDOW_SEC
  return watchdog.recentRescueCount >= EMERGENCY_TELEPORT_AFTER_ABANDONS
}
