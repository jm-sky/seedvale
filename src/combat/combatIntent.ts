import type { SimulationEntityRef } from '../simulation'

/**
 * Small, data-only combat target seam (plan 177 §3/§5) — deliberately not a
 * `Combatant` hierarchy. `ref` carries identity (compatible with
 * `SimulationEntityRef`); the three functions let the combat executor
 * re-validate the target at attack-resolution time (exists, alive, in range)
 * without a global target registry or per-frame world scan — the caller that
 * builds a `CombatTargetHandle` already holds the concrete entity (an
 * `AnimalAgent`, another `NpcAgent`, the player), so this only exposes the
 * narrow read/damage surface combat needs, never the entity itself.
 */
export type CombatTargetHandle = {
  ref: SimulationEntityRef
  /** Current XZ position, or `null` once the target is no longer resolvable
   *  (removed from the world) — distinct from `isAlive()` being false. */
  getPosition: () => { x: number, z: number } | null
  isAlive: () => boolean
  /** Applies already-resolved damage — the target owner decides its own
   *  defense/HealthState/death consequences; combat never mutates a target
   *  directly. */
  applyDamage: (amount: number) => void
}

/**
 * Combat execution intent (plan 177 §2/§3/§7) — supplied by a caller (future
 * Hunter/animal-defense/bandit decision systems), never produced by combat
 * itself. `NpcAgent.beginCombat()` only executes it. `mode` is explicit —
 * the caller decides melee vs. ranged; combat never silently falls back from
 * one weapon type to the other when the requested one isn't carried.
 */
export type CombatIntent = {
  target: CombatTargetHandle
  mode: 'melee' | 'ranged'
  /** Runs once, after `target` is confirmed dead and combat's own bookkeeping
   *  has finished (`NpcAgent.endCombat('complete')`) — the generic seam a
   *  caller uses to react to a kill (e.g. Hunter's post-kill harvest) without
   *  combat itself knowing anything about loot/harvest. Never invoked for a
   *  `cancelled`/`failed` outcome. */
  onKill?: () => void
}
