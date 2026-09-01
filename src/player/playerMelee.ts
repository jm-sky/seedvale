import type { MeleeConfig } from '../items/itemCatalog'
import {
  createMeleeAttackLifecycle,
  type MeleeAttackTickResult,
  type MeleeHitCandidate,
  type MeleeState,
} from '../combat/meleeAttack'
import { drainStamina, type StaminaState } from '../shared/StaminaState'
import { drainVigor, type VigorState } from '../shared/VigorState'
import { physicalEffortVigorCostPerSec } from './PlayerNeeds'

/** Universal melee attack lifecycle (plan 123) — driven entirely by the
 *  equipped tool's `ITEM_CATALOG[kind].melee` config. The timer/hit-test
 *  primitives are the neutral `combat/meleeAttack.ts` seam (plan 177); this
 *  module layers player-only stamina gating, gap-close/lunge and target
 *  acquisition on top. Deliberately not `CombatManager`/`WeaponSystem`:
 *  `app/gameLoop.ts` still owns candidate gathering, damage application and
 *  quest/audio/toast side effects. */
export type { MeleeHitCandidate, MeleeState } from '../combat/meleeAttack'
export { resolveMeleeHits, yawToward } from '../combat/meleeAttack'

export type MeleeTickResult = MeleeAttackTickResult

/** How many of the most recently *hit* targets are remembered as an
 *  acquisition tie-break preference (plan 124 §1 — "cel trafiany w
 *  poprzednich N atakach"). Most-recent first, deduped. */
export const COMBAT_TARGET_MEMORY = 3
/** Max short lunge distance (world units) when gap-closing with sufficient
 *  stamina (plan 124 §3) — a "krótki lunge", not a chase: far targets still
 *  require the player to walk the rest of the way themselves. */
export const MAX_LUNGE_DISTANCE = 3
/** Stamina cost of the lunge itself, on top of the attack's own
 *  `MeleeConfig.staminaCost` (plan 124 §3). */
export const LUNGE_STAMINA_COST = 15
/** Automatic approach distance when stamina can't cover the lunge (plan 124
 *  §3) — "nigdy nie przekracza 1 m na pojedynczy atak". */
export const FALLBACK_APPROACH_DISTANCE = 1
/** Small buffer so gap-close brings the player comfortably inside weapon
 *  range instead of exactly on its boundary. */
const GAP_CLOSE_BUFFER = 0.1
/** Dot-product tolerance within which two acquisition candidates count as
 *  "equally centered" (plan 124 §1) — without this, the distance/memory
 *  tie-breaks could never apply since view-angle dot products are rarely
 *  bit-for-bit equal. */
const TARGET_DOT_TOLERANCE = 0.15
/** Same idea as `TARGET_DOT_TOLERANCE`, for the distance tie-break. */
const TARGET_DIST_TOLERANCE = 0.75

export type AttackRequestResult = {
  started: boolean
  /** Collision-unaware XZ displacement (already bounded, never a teleport)
   *  the caller should apply toward the target for gap-close (plan 124 §3).
   *  Zero on both axes when no gap-close was needed or performed. */
  moveX: number
  moveZ: number
}

export type PlayerMelee = {
  state: () => MeleeState
  isAttacking: () => boolean
  /** Progress (0..1) within the current phase — for swing/visual sync. */
  phaseProgress: () => number
  /** Starts an attack if idle and stamina allows it (draining it on
   *  success), computing a bounded gap-close move toward `(targetX, targetZ)`
   *  when it's outside `config.range` (plan 124 §3). Returns
   *  `started: false` without side effects when idle/stamina reject it —
   *  callers decide what feedback (if any) an ignored request deserves.
   *  Also applies the shared physical-effort Vigor cost once, for the
   *  attack's own `windUp+hitWindow+recovery` duration at `moderate`
   *  intensity (plan items-player-003 §10) — never for the lunge, which
   *  already spends its own Stamina only. */
  requestAttack: (
    config: MeleeConfig,
    stamina: StaminaState,
    vigor: VigorState,
    dayLengthSec: number,
    playerX: number,
    playerZ: number,
    targetX: number,
    targetZ: number,
  ) => AttackRequestResult
  /** Advances the lifecycle by `dt`. Call once per frame regardless of input. */
  update: (dt: number) => MeleeTickResult
  /** Cancels any in-flight attack — pause/modal/rebuild safety. */
  reset: () => void
  /** Target ids hit by the last `COMBAT_TARGET_MEMORY` attacks, most recent
   *  first — `buildCombatTarget`'s acquisition tie-break (plan 124 §1). */
  recentTargetIds: () => readonly string[]
  /** Records a hit target for the acquisition memory above — call once per
   *  id returned by `resolveMeleeHits`. */
  rememberHit: (id: string) => void
}

export function createPlayerMelee(): PlayerMelee {
  const lifecycle = createMeleeAttackLifecycle()
  let recentTargets: string[] = []

  return {
    state: lifecycle.state,
    isAttacking: lifecycle.isAttacking,
    phaseProgress: lifecycle.phaseProgress,
    requestAttack(cfg, stamina, vigor, dayLengthSec, playerX, playerZ, targetX, targetZ) {
      if (lifecycle.state() !== 'idle') return { started: false, moveX: 0, moveZ: 0 }
      if (stamina.current < cfg.staminaCost) return { started: false, moveX: 0, moveZ: 0 }
      drainStamina(stamina, cfg.staminaCost)
      drainVigor(vigor, physicalEffortVigorCostPerSec('moderate', dayLengthSec) * (cfg.windUp + cfg.hitWindow + cfg.recovery))

      let moveX = 0
      let moveZ = 0
      const dx = targetX - playerX
      const dz = targetZ - playerZ
      const dist = Math.hypot(dx, dz)
      if (dist > cfg.range) {
        const dirX = dist > 1e-4 ? dx / dist : 0
        const dirZ = dist > 1e-4 ? dz / dist : 0
        const gapToClose = dist - cfg.range + GAP_CLOSE_BUFFER
        if (stamina.current >= LUNGE_STAMINA_COST) {
          drainStamina(stamina, LUNGE_STAMINA_COST)
          const lunge = Math.min(MAX_LUNGE_DISTANCE, gapToClose)
          moveX = dirX * lunge
          moveZ = dirZ * lunge
        } else {
          const approach = Math.min(FALLBACK_APPROACH_DISTANCE, gapToClose)
          moveX = dirX * approach
          moveZ = dirZ * approach
        }
      }

      lifecycle.start(cfg)
      return { started: true, moveX, moveZ }
    },
    update: lifecycle.update,
    reset: lifecycle.reset,
    recentTargetIds: () => recentTargets,
    rememberHit(id) {
      recentTargets = [id, ...recentTargets.filter((existing) => existing !== id)].slice(0, COMBAT_TARGET_MEMORY)
    },
  }
}

/** Deterministic combat-target acquisition (plan 124 §1) — deliberately not
 *  `pickInGaze()` (single highest-dot winner): among candidates inside
 *  `range`/`minDot`, picks by (1) most centered in view, (2) then closest,
 *  (3) then preference for a target hit within the last `recentTargetIds`
 *  entries. Each criterion only breaks ties within the previous one's
 *  tolerance, so a slightly-off-center but currently-engaged target stays
 *  selected instead of flickering to whatever is millimeters more centered. */
export function pickCombatTarget(
  candidates: readonly MeleeHitCandidate[],
  playerX: number,
  playerZ: number,
  playerYaw: number,
  range: number,
  minDot: number,
  recentTargetIds: readonly string[],
): string | null {
  const forwardX = -Math.sin(playerYaw)
  const forwardZ = -Math.cos(playerYaw)
  const scored: { id: string, dot: number, dist: number, memoryRank: number }[] = []
  for (const candidate of candidates) {
    if (!candidate.alive) continue
    const dx = candidate.x - playerX
    const dz = candidate.z - playerZ
    const dist = Math.hypot(dx, dz)
    if (dist < 1e-4 || dist > range) continue
    const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ
    if (dot < minDot) continue
    // `recentTargetIds.length` (never a valid `indexOf` result) is a finite
    // "not remembered" sentinel — using `Infinity` here would make two
    // unremembered candidates' `memoryRank - memoryRank` compare as
    // `Infinity - Infinity` (`NaN`), which is an undefined `sort` outcome.
    const memoryIdx = recentTargetIds.indexOf(candidate.id)
    scored.push({ id: candidate.id, dot, dist, memoryRank: memoryIdx === -1 ? recentTargetIds.length : memoryIdx })
  }
  if (scored.length === 0) return null
  scored.sort((a, b) => {
    if (Math.abs(a.dot - b.dot) > TARGET_DOT_TOLERANCE) return b.dot - a.dot
    if (Math.abs(a.dist - b.dist) > TARGET_DIST_TOLERANCE) return a.dist - b.dist
    return a.memoryRank - b.memoryRank
  })
  return scored[0].id
}

/** Same ranking as `pickCombatTarget`, but returns every in-cone candidate in
 *  priority order — used by `Tab` living-target cycling (plan 150 §2). */
export function rankCombatTargets(
  candidates: readonly MeleeHitCandidate[],
  playerX: number,
  playerZ: number,
  playerYaw: number,
  range: number,
  minDot: number,
  recentTargetIds: readonly string[],
): string[] {
  const forwardX = -Math.sin(playerYaw)
  const forwardZ = -Math.cos(playerYaw)
  const scored: { id: string, dot: number, dist: number, memoryRank: number }[] = []
  for (const candidate of candidates) {
    if (!candidate.alive) continue
    const dx = candidate.x - playerX
    const dz = candidate.z - playerZ
    const dist = Math.hypot(dx, dz)
    if (dist < 1e-4 || dist > range) continue
    const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ
    if (dot < minDot) continue
    const memoryIdx = recentTargetIds.indexOf(candidate.id)
    scored.push({ id: candidate.id, dot, dist, memoryRank: memoryIdx === -1 ? recentTargetIds.length : memoryIdx })
  }
  scored.sort((a, b) => {
    if (Math.abs(a.dot - b.dot) > TARGET_DOT_TOLERANCE) return b.dot - a.dot
    if (Math.abs(a.dist - b.dist) > TARGET_DIST_TOLERANCE) return a.dist - b.dist
    return a.memoryRank - b.memoryRank
  })
  return scored.map((s) => s.id)
}

/** Pull-back angle (radians) at the end of wind-up. */
const SWING_PULL_BACK = 0.5
/** Forward-swing angle (radians) reached by the end of the hit window. */
const SWING_FORWARD = 1.3

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Held-tool swing angle as a pure function of attack phase/progress (plan
 *  123 §4) — wind-up pulls the weapon back, the hit window sweeps it through
 *  (the hit itself resolves at the very start of this phase), recovery eases
 *  it back to the tool's normal held pose. */
export function meleeSwingAngle(state: MeleeState, phaseProgress: number): number {
  const t = Math.min(1, Math.max(0, phaseProgress))
  switch (state) {
    case 'hitWindow': return lerp(-SWING_PULL_BACK, SWING_FORWARD, t)
    case 'recovery': return lerp(SWING_FORWARD, 0, t)
    case 'windUp': return lerp(0, -SWING_PULL_BACK, t)
    default: return 0
  }
}
