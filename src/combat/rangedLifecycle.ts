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
 *
 * `draw → release` normally auto-fires once `config.drawTime` elapses (NPCs,
 * and the default for `start()`). The player instead opts into
 * `manualRelease` (`player/playerRanged.ts`) for real press-to-draw/
 * release-to-fire input: `drawTime` becomes the *minimum* hold before
 * `release()` counts as a fire instead of a cancel.
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
   *  calling — this only enforces "not already mid-draw". `manualRelease`
   *  (default false) opts into `release()`-gated firing instead of the
   *  default auto-fire-on-timer below — NPC callers never pass it, so their
   *  behavior is unchanged. */
  start: (config: RangedConfig, opts?: { manualRelease?: boolean }) => boolean
  /** Advances the lifecycle by `dt`. Call once per update tick regardless of
   *  whether a draw is in flight. For a `manualRelease` draw this only ticks
   *  timers — it never produces the `fireReady` edge, which needs `release()`. */
  update: (dt: number) => RangedAttackTickResult
  /** Resolves a `manualRelease` draw's release input: fires (`fireReady:
   *  true`, transitions to `release`) if held for at least `config.drawTime`;
   *  otherwise cancels back to `idle` with no shot. No-op if not currently in
   *  `draw`. Irrelevant for non-manual-release draws (NPCs). */
  release: () => RangedAttackTickResult
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
  let manualRelease = false

  return {
    state: () => state,
    isDrawing: () => state !== 'idle',
    phaseProgress: () => {
      if (!config) return 0
      const duration = phaseDuration(state, config)
      return duration > 0 ? Math.min(1, timer / duration) : 1
    },
    start(cfg, opts) {
      if (state !== 'idle') return false
      config = cfg
      state = 'draw'
      timer = 0
      manualRelease = opts?.manualRelease ?? false
      return true
    },
    update(dt) {
      if (state === 'idle' || !config) return { fireReady: false, config: null }
      timer += dt
      let fireReady = false
      let fireConfig: RangedConfig | null = null
      for (let guard = 0; guard < 4; guard++) {
        if (state === 'draw' && manualRelease) {
          // Waiting on release() — hold the timer at drawTime so
          // phaseProgress() doesn't run past 1 while fully drawn.
          timer = Math.min(timer, config.drawTime)
          break
        }
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
    release() {
      if (state !== 'draw' || !config) return { fireReady: false, config: null }
      if (timer >= config.drawTime) {
        const firedConfig = config
        state = 'release'
        timer = 0
        manualRelease = false
        return { fireReady: true, config: firedConfig }
      }
      state = 'idle'
      timer = 0
      config = null
      manualRelease = false
      return { fireReady: false, config: null }
    },
    reset() {
      state = 'idle'
      timer = 0
      config = null
      manualRelease = false
    },
  }
}
