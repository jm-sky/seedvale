import type { RangedConfig } from '../items/itemCatalog'

/**
 * Neutral ranged-attack timing primitive (plan 177) — the draw→release→
 * recovery timer shared by every ranged attacker (player, NPC), pulled out
 * of `player/playerRanged.ts` (plan 162) the same way
 * `combat/meleeAttack.ts` pulled melee's timer out of `player/playerMelee.ts`.
 * Owns only timing and the single `fireReady` edge — stamina gating stays
 * attacker-specific (`player/playerRanged.ts` wraps this for the player;
 * `ai/NpcAgent.ts`'s `combat` phase does the same for NPCs). Ammo lookup/
 * consumption and projectile spawning stay with the caller, same as before.
 */
export type RangedState = 'idle' | 'draw' | 'release' | 'recovery'

export type RangedAttackTickResult = {
  /** True on the exact frame draw completes — the single point at which a
   *  caller should spawn a projectile for this shot. */
  fireReady: boolean
  config: RangedConfig | null
}

export type RangedAttackLifecycle = {
  state: () => RangedState
  isDrawing: () => boolean
  /** Progress (0..1) within the current phase — for draw-pose visuals. */
  phaseProgress: () => number
  /** Starts `draw` if currently idle. Callers gate stamina/ammo/etc. before
   *  calling — this only enforces "not already mid-draw". */
  start: (config: RangedConfig) => boolean
  /** Advances the lifecycle by `dt`. Call once per update tick regardless of
   *  whether a draw is in flight. */
  update: (dt: number) => RangedAttackTickResult
  /** Cancels any in-flight draw — interrupt/death/rebuild safety. */
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

export function createRangedAttackLifecycle(): RangedAttackLifecycle {
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
    start(cfg) {
      if (state !== 'idle') return false
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
