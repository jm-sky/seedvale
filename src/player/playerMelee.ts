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

export type PlayerMelee = {
  state: () => MeleeState
  isAttacking: () => boolean
  /** Progress (0..1) within the current phase — for swing/visual sync. */
  phaseProgress: () => number
  /** Starts an attack if idle and stamina allows it (draining it on success).
   *  Returns false without side effects otherwise — callers decide what
   *  feedback (if any) an ignored request deserves. */
  requestAttack: (config: MeleeConfig, stamina: StaminaState) => boolean
  /** Advances the lifecycle by `dt`. Call once per frame regardless of input. */
  update: (dt: number) => MeleeTickResult
  /** Cancels any in-flight attack — pause/modal/rebuild safety. */
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

export function createPlayerMelee(): PlayerMelee {
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
    requestAttack(cfg, stamina) {
      if (state !== 'idle') return false
      if (stamina.current < cfg.staminaCost) return false
      drainStamina(stamina, cfg.staminaCost)
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
