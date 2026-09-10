/** Generic "what is the player looking at" picker — distance + facing-dot, with
 *  deterministic tie-breaks and optional gaze stability (plan ui-input-015).
 *  Extracted from `app/createApp.ts`'s original NPC-only picker so NPCs,
 *  animals, landmarks, spawners, and items share one ranking contract. */

/** Two candidates within this dot delta are treated as tied on centeredness. */
export const GAZE_CENTEREDNESS_TIE_EPSILON = 0.02

/** Previous gaze winner may stay selected until a challenger beats it by at least this margin. */
export const GAZE_HYSTERESIS_MARGIN = 0.03

export type GazeRanked<T> = {
  candidate: T
  dot: number
  dist: number
  actionable: boolean
  stableKey: string
}

export type PickInGazeOptions<T> = {
  /** When centeredness is tied, actionable candidates rank above flavor-only. */
  isActionable?: (candidate: T) => boolean
  /** Deterministic tie-break when dot, actionability and distance still match. */
  stableKey?: (candidate: T) => string
  /** Runtime-only previous winner for hysteresis (not persisted). */
  previous?: T | null
  sameCandidate?: (a: T, b: T) => boolean
}

function forwardVector(playerYaw: number): { x: number, z: number } {
  return { x: -Math.sin(playerYaw), z: -Math.cos(playerYaw) }
}

function gazeDot(
  candidate: { position: { x: number, z: number } },
  playerPos: { x: number, z: number },
  forward: { x: number, z: number },
): { dot: number, dist: number } | null {
  const dx = candidate.position.x - playerPos.x
  const dz = candidate.position.z - playerPos.z
  const dist = Math.hypot(dx, dz)
  if (dist < 1e-4) return null
  const dot = (dx / dist) * forward.x + (dz / dist) * forward.z
  return { dot, dist }
}

/** Eligible gaze candidates sorted best-first (plan ui-input-015 §4). */
export function rankInGaze<T extends { position: { x: number, z: number }, interactRange?: number }>(
  candidates: readonly T[],
  playerPos: { x: number, z: number },
  playerYaw: number,
  range: number,
  minDot: number,
  options: PickInGazeOptions<T> = {},
): GazeRanked<T>[] {
  const forward = forwardVector(playerYaw)
  const isActionable = options.isActionable ?? (() => true)
  const stableKey = options.stableKey ?? (() => '')
  const ranked: GazeRanked<T>[] = []
  for (const candidate of candidates) {
    const metrics = gazeDot(candidate, playerPos, forward)
    if (!metrics) continue
    if (metrics.dist > (candidate.interactRange ?? range)) continue
    if (metrics.dot < minDot) continue
    ranked.push({
      candidate,
      dot: metrics.dot,
      dist: metrics.dist,
      actionable: isActionable(candidate),
      stableKey: stableKey(candidate),
    })
  }
  ranked.sort(compareGazeRanked)
  return ranked
}

export function compareGazeRanked<T>(a: GazeRanked<T>, b: GazeRanked<T>): number {
  const dotDiff = b.dot - a.dot
  if (Math.abs(dotDiff) > GAZE_CENTEREDNESS_TIE_EPSILON) return dotDiff > 0 ? 1 : -1
  if (a.actionable !== b.actionable) return a.actionable ? -1 : 1
  const distDiff = a.dist - b.dist
  if (distDiff !== 0) return distDiff < 0 ? -1 : 1
  return a.stableKey.localeCompare(b.stableKey)
}

function applyGazeHysteresis<T>(
  ranked: readonly GazeRanked<T>[],
  options: PickInGazeOptions<T>,
): T | null {
  if (ranked.length === 0) return null
  const best = ranked[0]!
  const previous = options.previous
  if (!previous) return best.candidate
  const same = options.sameCandidate ?? ((a, b) => a === b)
  const prevEntry = ranked.find((entry) => same(entry.candidate, previous))
  if (!prevEntry) return best.candidate
  if (best.dot - prevEntry.dot < GAZE_HYSTERESIS_MARGIN) return prevEntry.candidate
  return best.candidate
}

export function pickInGaze<T extends { position: { x: number, z: number }, interactRange?: number }>(
  candidates: readonly T[],
  playerPos: { x: number, z: number },
  playerYaw: number,
  range: number,
  minDot: number,
  options: PickInGazeOptions<T> = {},
): T | null {
  const ranked = rankInGaze(candidates, playerPos, playerYaw, range, minDot, options)
  return applyGazeHysteresis(ranked, options)
}
