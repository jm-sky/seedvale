/**
 * Shared simulation contracts (plan 055 Phase 1).
 *
 * These types are domain-agnostic and Three.js-free. NPC and fauna keep their
 * own decision policies and world-effect callbacks; they share only the shapes
 * for planned actions, action lifecycle, and decision context snapshots.
 */

/** Plain world position — never a Three.js object. */
export type Vec3 = {
  x: number
  y: number
  z: number
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

/** Copy any `{x,y,z}` into a plain `Vec3` (e.g. from `THREE.Vector3`). */
export function copyVec3(source: { x: number, y: number, z: number }): Vec3 {
  return { x: source.x, y: source.y, z: source.z }
}

/**
 * Opaque identity for a simulated entity. Optional on most contracts —
 * agents own richer identity in their own modules.
 */
export type SimulationEntityRef = {
  id: string
  /** Domain label — `'npc' | 'animal' | 'player'` today; open string for later. */
  kind: string
}

/**
 * Snapshot of inputs available to a decision policy.
 * Fields are optional and composable — do not force NPC and fauna into one schema.
 */
export type DecisionContext = {
  entity?: SimulationEntityRef
  /** Need pressures keyed by domain id (typically 0–1). */
  needs?: Readonly<Record<string, number>>
  /** Current schedule activity label when the agent has a schedule. */
  scheduleActivity?: string
  nearbyHumanCount?: number
  nearbyFireCount?: number
  /** Escape hatch for domain-specific signals without a shared framework. */
  extras?: Readonly<Record<string, unknown>>
}

/**
 * A single planned step: optionally walk somewhere, optionally wait, then
 * hand off to domain code. Chain with `next` (e.g. chop → deposit).
 *
 * World effects stay in consumer callbacks (`onComplete` on NPC adapters) —
 * this type does not own inventory, health, or harvest APIs.
 */
export type PlannedAction<TKind extends string = string> = {
  kind: TKind
  destination?: Vec3
  /** Seconds to spend in the execute/wait stage once the destination is reached. */
  durationSec?: number
  next?: PlannedAction<TKind>
}

/** Status of the currently planned action (not the whole agent FSM). */
export type ActionLifecycleStatus =
  | 'idle'
  | 'active'
  | 'complete'
  | 'failed'
  | 'cancelled'

export type ActionLifecycle = {
  status: ActionLifecycleStatus
}
