import type { RangedConfig } from '../items/itemCatalog'
import { drainStamina, type StaminaState } from '../shared/StaminaState'

/** Universal ranged attack lifecycle (plan 162) — the ranged counterpart of
 *  `playerMelee.ts`'s `createPlayerMelee`, same ownership split: this owns
 *  only draw/release/recovery timing and the single `fireReady` edge;
 *  `app/gameLoop.ts` owns ammo lookup/consumption, projectile spawning and
 *  world-side consequences. */
export type RangedState = 'idle' | 'draw' | 'release' | 'recovery'

export type RangedTickResult = {
  /** True on the exact frame draw completes — the single point at which a
   *  caller should spawn a projectile for this shot. */
  fireReady: boolean
  config: RangedConfig | null
}

export type PlayerRanged = {
  state: () => RangedState
  isDrawing: () => boolean
  /** Progress (0..1) within the current phase — for draw-pose visuals. */
  phaseProgress: () => number
  /** Starts a draw if idle and stamina allows it (draining it on success).
   *  Returns false without side effects otherwise. */
  requestDraw: (config: RangedConfig, stamina: StaminaState) => boolean
  /** Advances the lifecycle by `dt`. Call once per frame regardless of input. */
  update: (dt: number) => RangedTickResult
  /** Cancels any in-flight draw — pause/modal/rebuild/tool-switch safety. */
  reset: () => void
}

const RELEASE_PHASE_DURATION = 0.06

function phaseDuration(state: RangedState, config: RangedConfig): number {
  switch (state) {
    case 'draw': return config.drawTime
    case 'recovery': return config.recovery
    case 'release': return RELEASE_PHASE_DURATION
    default: return 0
  }
}

export function createPlayerRanged(): PlayerRanged {
  let state: RangedState = 'idle'
  let timer = 0
  let config: RangedConfig | null = null

  return {
    state: () => state,
    isDrawing: () => state !== 'idle',
    phaseProgress: () => {
      if (!config) return 0
      const duration = phaseDuration(state, config)
      return duration > 0 ? Math.min(1, timer / duration) : 1
    },
    requestDraw(cfg, stamina) {
      if (state !== 'idle') return false
      if (stamina.current < cfg.staminaCost) return false
      drainStamina(stamina, cfg.staminaCost)
      config = cfg
      state = 'draw'
      timer = 0
      return true
    },
    update(dt) {
      if (state === 'idle' || !config) return { fireReady: false, config: null }
      timer += dt
      let fireReady = false
      let fireConfig: RangedConfig | null = null
      for (let guard = 0; guard < 4; guard++) {
        if (state === 'draw' && timer >= config.drawTime) {
          timer -= config.drawTime
          state = 'release'
          fireReady = true
          fireConfig = config
          continue
        }
        if (state === 'release' && timer >= RELEASE_PHASE_DURATION) {
          timer -= RELEASE_PHASE_DURATION
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
      return { fireReady, config: fireReady ? fireConfig : null }
    },
    reset() {
      state = 'idle'
      timer = 0
      config = null
    },
  }
}
