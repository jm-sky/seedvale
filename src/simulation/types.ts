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
export function copyVec3(source: { x: number; y: number; z: number }): Vec3 {
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
 * A single arbitration pressure (plan ai-001) — domain-agnostic shape so
 * `src/simulation` stays free of NPC-specific types. `source` and `target`
 * are open strings; domain code (e.g. `src/ai/Needs.ts`'s `NpcPressure`)
 * assigns their concrete meaning. `value` is normalized to the same 0–1-ish
 * scoring domain the consuming arbitration step uses.
 */
export type DecisionPressure = {
  source: string
  target: string
  value: number
}

/**
 * Snapshot of inputs available to a decision policy.
 * Fields are optional and composable — do not force NPC and fauna into one schema.
 *
 * FUTURE AI:
 * This is the natural decision boundary for NPCs. Keep world-state inputs here,
 * while the policy evolves from direct need→action selection toward:
 * needs/problems/opportunities → pressures → strategy → plan.
 * Big Five personality, role, traits, relationships, abilities and risk should
 * eventually influence strategy scoring here rather than individual actions.
 */
export type DecisionContext = {
  /** Need pressures keyed by domain id (typically 0–1). */
  needs?: Readonly<Record<string, number>>
  /** Pressures that fed the current/last arbitration (plan ai-001) — a
   *  snapshot for diagnostics and future strategy scoring, not a second
   *  copy of ownership over the underlying need/shortage state. */
  pressures?: readonly DecisionPressure[]
  /** Current schedule activity label when the agent has a schedule. */
  scheduleActivity?: string
  nearbyHumanCount?: number
  nearbyFireCount?: number
}

/**
 * A single planned step: optionally walk somewhere, optionally wait, then
 * hand off to domain code. Chain with `next` (e.g. chop → deposit).
 *
 * World effects stay in consumer callbacks (`onComplete` on NPC adapters) —
 * this type does not own inventory, health, or harvest APIs.
 *
 * FUTURE AI:
 * `next` is currently a short action chain. A persistent NPC plan may
 * eventually own longer sequences and retain unfinished work across
 * interruption, partial completion and re-evaluation. Do not move world
 * mutations into the plan layer; actions should remain executable steps.
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
