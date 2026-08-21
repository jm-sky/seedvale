import type { MeleeConfig } from '../items/itemCatalog'

/**
 * Neutral melee-attack primitives (plan 177) — the timing state machine and
 * hit test shared by every melee attacker (player, NPC), pulled out of
 * `player/playerMelee.ts` (plan 123). Deliberately owns only:
 *
 *   - the `idle → windUp → hitWindow → recovery` timer, and
 *   - the pure XZ range/arc hit test.
 *
 * Stamina gating, gap-close/lunge, target acquisition and swing visuals stay
 * attacker-specific (`player/playerMelee.ts`'s `createPlayerMelee` wraps this
 * lifecycle with those; `ai/npcCombat.ts` does the same for NPCs) — this file
 * has no opinion on who is attacking or how a target was chosen.
 */
export type MeleeState = 'idle' | 'windUp' | 'hitWindow' | 'recovery'

export type MeleeAttackTickResult = {
  /** True on the exact frame the hit window opens — the single point at
   *  which a caller should resolve damage for this attack. */
  hitReady: boolean
  /** Set only alongside `hitReady` — the config to resolve the hit with. */
  config: MeleeConfig | null
}

export type MeleeAttackLifecycle = {
  state: () => MeleeState
  isAttacking: () => boolean
  /** Progress (0..1) within the current phase — for swing/visual sync. */
  phaseProgress: () => number
  /** Starts `windUp` if currently idle. Callers gate stamina/range/etc.
   *  before calling — this only enforces "not already mid-swing". */
  start: (config: MeleeConfig) => boolean
  /** Advances the lifecycle by `dt`. Call once per update tick regardless of
   *  whether an attack is in flight. */
  update: (dt: number) => MeleeAttackTickResult
  /** Cancels any in-flight attack — interrupt/death/rebuild safety. */
  reset: () => void
}

function phaseDuration(state: MeleeState, config: MeleeConfig): number {
  switch (state) {
    case 'hitWindow': return config.hitWindow
    case 'recovery': return config.recovery
    case 'windUp': return config.windUp
    default: return 0
  }
}

export function createMeleeAttackLifecycle(): MeleeAttackLifecycle {
  let state: MeleeState = 'idle'
  let timer = 0
  let config: MeleeConfig | null = null

  return {
    state: () => state,
    isAttacking: () => state !== 'idle',
    phaseProgress: () => {
      if (!config) return 0
      const duration = phaseDuration(state, config)
      return duration > 0 ? Math.min(1, timer / duration) : 1
    },
    start(cfg) {
      if (state !== 'idle') return false
      config = cfg
      state = 'windUp'
      timer = 0
      return true
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
  attackerX: number,
  attackerZ: number,
  attackerYaw: number,
  config: MeleeConfig,
  candidates: readonly MeleeHitCandidate[],
): string[] {
  const forwardX = -Math.sin(attackerYaw)
  const forwardZ = -Math.cos(attackerYaw)
  const hits: string[] = []
  for (const candidate of candidates) {
    if (!candidate.alive) continue
    const dx = candidate.x - attackerX
    const dz = candidate.z - attackerZ
    const dist = Math.hypot(dx, dz)
    if (dist < 1e-4 || dist > config.range) continue
    const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ
    if (dot < config.arcDot) continue
    hits.push(candidate.id)
  }
  return hits
}

/** Yaw (radians) that points straight from `(fromX, fromZ)` at `(toX, toZ)`,
 *  in the same forward convention `resolveMeleeHits` uses (`-sin(yaw)`,
 *  `-cos(yaw)`). Returns `null` when the two points coincide, so callers
 *  keep their current yaw instead of snapping to an arbitrary direction. */
export function yawToward(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): number | null {
  const dx = toX - fromX
  const dz = toZ - fromZ
  if (Math.hypot(dx, dz) < 1e-4) return null
  return Math.atan2(-dx, -dz)
}
