import type { PathResult } from './navigation'

/**
 * Lightweight navigation instrumentation (plan npc-006 §Performance) — a
 * single mutable counters bag, not a full perf-monitor category, since path
 * search is request-driven rather than a per-frame cost the existing
 * `perf/monitor.ts` category timers already attribute to `NPC`/`FAUNA`.
 * Reset once per session/benchmark run via `resetNavigationStats()`.
 *
 * @domain npc
 */
export type NavigationStats = {
  pathRequests: number
  pathSuccesses: number
  pathFailures: number
  totalSearchMs: number
  totalVisitedNodes: number
  totalWaypoints: number
  repaths: number
  /** Agents currently following a `findPath()` route — incremented by
   *  `beginActivePath()` when one is assigned, decremented by
   *  `endActivePath()` once it's exhausted, replaced or abandoned. */
  activePaths: number
}

function emptyStats(): NavigationStats {
  return {
    pathRequests: 0,
    pathSuccesses: 0,
    pathFailures: 0,
    totalSearchMs: 0,
    totalVisitedNodes: 0,
    totalWaypoints: 0,
    repaths: 0,
    activePaths: 0,
  }
}

let stats: NavigationStats = emptyStats()

/** Call once per `findPath()` call, success or failure, with the wall-clock
 *  time (ms) that call took. */
export function recordPathRequest(result: PathResult | null, searchMs: number): void {
  stats.pathRequests++
  stats.totalSearchMs += searchMs
  if (result) {
    stats.pathSuccesses++
    stats.totalVisitedNodes += result.visitedNodes
    stats.totalWaypoints += result.waypoints.length
  } else {
    stats.pathFailures++
  }
}

/** Call whenever a `findPath()` request is specifically a watchdog-triggered
 *  repath (as opposed to any other caller of `findPath`), so repath volume
 *  can be distinguished from total path-request volume. */
export function recordRepath(): void {
  stats.repaths++
}

export function beginActivePath(): void {
  stats.activePaths++
}

export function endActivePath(): void {
  stats.activePaths = Math.max(0, stats.activePaths - 1)
}

export function getNavigationStats(): Readonly<NavigationStats> {
  return { ...stats }
}

export function resetNavigationStats(): void {
  stats = emptyStats()
}
