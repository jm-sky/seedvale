/**
 * Per-settlement NPC crowd pass (issue 010, plan 153) — the proximity count
 * feeding `NpcAgent`'s group reaction-chance dampening, plus the physical
 * separation impulse that keeps a crowd converging on one point (the well)
 * from stacking. Extracted out of `settlement/createSettlement.ts`'s
 * `update()` (createSettlement refactor review) since nothing about the O(n²)
 * pair scan is settlement-specific — it only needs each agent's position and
 * dead flag.
 *
 * @domain ai
 * @system npc-crowd
 * @role Owns the settlement-wide NPC proximity/separation pass and its reusable output buffers.
 */

/** How close (world units) another NPC must be to count toward
 *  `nearbyNpcCount` for `NpcAgent`'s group reaction-chance dampening (issue
 *  010). */
export const GROUP_REACTION_RADIUS = 6
/** Below this center-to-center distance, two NPCs push apart (plan 153) —
 *  roughly two adult body widths, small enough to never fight a real
 *  destination (well serving stand, queue slot) but large enough that a
 *  crowd converging on one point visibly spreads out instead of stacking. */
export const NPC_SEPARATION_RADIUS = 0.5
/** Push speed (m/s per meter of overlap) applied by `applySeparation`. */
export const NPC_SEPARATION_SPEED = 1.5

/** Structural, so tests need no real `NpcAgent`. */
export type NpcCrowdAgent = {
  mesh: { position: { x: number, z: number } }
  health: { dead: boolean }
}

export type NpcCrowdResult = {
  /** Index-aligned with the input list; valid until the next `run()`. */
  nearbyCounts: readonly number[]
  pushX: readonly number[]
  pushZ: readonly number[]
}

/**
 * Owns reusable buffers — allocation-free after the first call for a given
 * agent count (grows, never shrinks; the used prefix is zero-filled each run).
 */
export function createNpcCrowdPass(): {
  run: (agents: readonly NpcCrowdAgent[], dt: number) => NpcCrowdResult
} {
  // Sized to the largest agent count seen so far; a run for a smaller count
  // reuses the same three array objects (same identity across calls at that
  // count), only the used `[0, agents.length)` prefix is meaningful.
  let nearbyCounts: number[] = []
  let pushX: number[] = []
  let pushZ: number[] = []

  return {
    run(agents, dt) {
      if (nearbyCounts.length < agents.length) {
        nearbyCounts = new Array<number>(agents.length).fill(0)
        pushX = new Array<number>(agents.length).fill(0)
        pushZ = new Array<number>(agents.length).fill(0)
      } else {
        for (let i = 0; i < agents.length; i++) {
          nearbyCounts[i] = 0
          pushX[i] = 0
          pushZ[i] = 0
        }
      }
      for (let i = 0; i < agents.length; i++) {
        const ai = agents[i]!
        for (let j = i + 1; j < agents.length; j++) {
          const aj = agents[j]!
          const dx = ai.mesh.position.x - aj.mesh.position.x
          const dz = ai.mesh.position.z - aj.mesh.position.z
          const dist = Math.hypot(dx, dz)
          if (dist <= GROUP_REACTION_RADIUS) {
            nearbyCounts[i]!++
            nearbyCounts[j]!++
          }
          // A dead NPC stays in `agents` for the settlement's whole lifetime
          // (plan 197 — death is authoritative), so it must be excluded from
          // the physical push: a corpse shouldn't shove living NPCs around
          // or get shoved itself.
          if (dist < NPC_SEPARATION_RADIUS && !ai.health.dead && !aj.health.dead) {
            const overlap = NPC_SEPARATION_RADIUS - dist
            const nx = dist > 1e-4 ? dx / dist : 1
            const nz = dist > 1e-4 ? dz / dist : 0
            const push = overlap * NPC_SEPARATION_SPEED * dt
            pushX[i]! += nx * push
            pushZ[i]! += nz * push
            pushX[j]! -= nx * push
            pushZ[j]! -= nz * push
          }
        }
      }
      return { nearbyCounts, pushX, pushZ }
    },
  }
}
