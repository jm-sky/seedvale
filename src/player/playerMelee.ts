import type { MeleeConfig } from '../items/itemCatalog'
import { drainStamina, type StaminaState } from '../shared/StaminaState'

/** Universal melee attack lifecycle (plan 123) — one small state machine
 *  shared by every melee tool, driven entirely by the equipped tool's
 *  `ITEM_CATALOG[kind].melee` config. Deliberately not `CombatManager`/
 *  `WeaponSystem`: this owns only timing + the single hit-resolution edge;
 *  `app/gameLoop.ts` owns candidate gathering, damage application and
 *  quest/audio/toast side effects. */
export type MeleeState = 'idle' | 'windUp' | 'hitWindow' | 'recovery'

export type MeleeTickResult = {
  /** True on the exact frame the hit window opens — the single point at
   *  which a caller should resolve damage for this attack. */
  hitReady: boolean
  /** Set only alongside `hitReady` — the config to resolve the hit with. */
  config: MeleeConfig | null
}

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
   *  callers decide what feedback (if any) an ignored request deserves. */
  requestAttack: (
    config: MeleeConfig,
    stamina: StaminaState,
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

function phaseDuration(state: MeleeState, config: MeleeConfig): number {
  switch (state) {
    case 'hitWindow': return config.hitWindow
    case 'recovery': return config.recovery
    case 'windUp': return config.windUp
    default: return 0
  }
}

export function createPlayerMelee(): PlayerMelee {
  let state: MeleeState = 'idle'
  let timer = 0
  let config: MeleeConfig | null = null
  let recentTargets: string[] = []

  return {
    state: () => state,
    isAttacking: () => state !== 'idle',
    phaseProgress: () => {
      if (!config) return 0
      const duration = phaseDuration(state, config)
      return duration > 0 ? Math.min(1, timer / duration) : 1
    },
    requestAttack(cfg, stamina, playerX, playerZ, targetX, targetZ) {
      if (state !== 'idle') return { started: false, moveX: 0, moveZ: 0 }
      if (stamina.current < cfg.staminaCost) return { started: false, moveX: 0, moveZ: 0 }
      drainStamina(stamina, cfg.staminaCost)

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

      config = cfg
      state = 'windUp'
      timer = 0
      return { started: true, moveX, moveZ }
    },
    update(dt) {
      if (state === 'idle' || !config) return { hitReady: false, config: null }
      timer += dt
      let hitReady = false
      let hitConfig: MeleeConfig | null = null
      // Loop (not a chain of `if`s) so a single large `dt` can legitimately
      // cascade through every remaining phase in one call.
      for (let guard = 0; guard < 4; guard++) {
        if (state === 'windUp' && timer >= config.windUp) {
          timer -= config.windUp
          state = 'hitWindow'
          hitReady = true
          hitConfig = config
          continue
        }
        if (state === 'hitWindow' && timer >= config.hitWindow) {
          timer -= config.hitWindow
          state = 'recovery'
          continue
        }
        if (state === 'recovery' && timer >= config.recovery) {
          timer = 0
          state = 'idle'
          config = null
          break
        }
        break
      }
      return { hitReady, config: hitReady ? hitConfig : null }
    },
    reset() {
      state = 'idle'
      timer = 0
      config = null
    },
    recentTargetIds: () => recentTargets,
    rememberHit(id) {
      recentTargets = [id, ...recentTargets.filter((existing) => existing !== id)].slice(0, COMBAT_TARGET_MEMORY)
    },
  }
}

export type MeleeHitCandidate = {
  id: string
  x: number
  z: number
  alive: boolean
}

/** Deterministic melee hit test — XZ range + facing-arc dot product, no
 *  raycasting (plan 123 §3). Returns every candidate id inside range and
 *  arc; the caller applies damage once per id since this is only ever
 *  called at the single `hitReady` edge of one attack. */
export function resolveMeleeHits(
  playerX: number,
  playerZ: number,
  playerYaw: number,
  config: MeleeConfig,
  candidates: readonly MeleeHitCandidate[],
): string[] {
  const forwardX = -Math.sin(playerYaw)
  const forwardZ = -Math.cos(playerYaw)
  const hits: string[] = []
  for (const candidate of candidates) {
    if (!candidate.alive) continue
    const dx = candidate.x - playerX
    const dz = candidate.z - playerZ
    const dist = Math.hypot(dx, dz)
    if (dist < 1e-4 || dist > config.range) continue
    const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ
    if (dot < config.arcDot) continue
    hits.push(candidate.id)
  }
  return hits
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

/** Camera/aim yaw (plan 142 §2) that points from `(playerX, playerZ)` straight
 *  at `(targetX, targetZ)`, in the same convention `resolveMeleeHits` and
 *  `pickCombatTarget` use for the forward vector (`-sin(yaw)`, `-cos(yaw)`).
 *  Returns `null` when the two points coincide, so callers keep their current
 *  yaw instead of snapping to an arbitrary direction. */
export function yawToward(
  playerX: number,
  playerZ: number,
  targetX: number,
  targetZ: number,
): number | null {
  const dx = targetX - playerX
  const dz = targetZ - playerZ
  if (Math.hypot(dx, dz) < 1e-4) return null
  return Math.atan2(-dx, -dz)
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
