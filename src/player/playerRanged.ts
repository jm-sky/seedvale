import type { RangedConfig } from '../items/itemCatalog'
import {
  createRangedAttackLifecycle,
  type RangedAttackTickResult,
  type RangedState,
} from '../combat/rangedLifecycle'
import { drainStamina, type StaminaState } from '../shared/StaminaState'
import { drainVigor, type VigorState } from '../shared/VigorState'
import { physicalEffortVigorCostPerSec } from './PlayerNeeds'

/** Universal ranged attack lifecycle (plan 162) — the ranged counterpart of
 *  `playerMelee.ts`'s `createPlayerMelee`, same ownership split (plan 177):
 *  the draw/release/recovery timer is the neutral `combat/rangedLifecycle.ts`
 *  seam; this module only layers player-only stamina gating on top.
 *  `app/gameLoop.ts` owns ammo lookup/consumption, projectile spawning and
 *  world-side consequences. */
export type { RangedState } from '../combat/rangedLifecycle'

export type RangedTickResult = RangedAttackTickResult

export type PlayerRanged = {
  state: () => RangedState
  isDrawing: () => boolean
  /** Progress (0..1) within the current phase — for draw-pose visuals. */
  phaseProgress: () => number
  /** Starts a draw if idle and stamina allows it (draining it on success).
   *  Returns false without side effects otherwise. Also applies the shared
   *  physical-effort Vigor cost once, for the draw's own `drawTime+recovery`
   *  duration at `moderate` intensity (plan items-player-003 §10). */
  requestDraw: (config: RangedConfig, stamina: StaminaState, vigor: VigorState, dayLengthSec: number) => boolean
  /** Advances the lifecycle by `dt`. Call once per frame regardless of input.
   *  Never produces `fireReady` on its own — firing is release-gated,
   *  see `releaseDraw()`. */
  update: (dt: number) => RangedTickResult
  /** Resolves the release edge of a real press-to-draw/release-to-fire input
   *  (`E`/LMB/mobile-E keyup): fires if held for at least the bow's
   *  `drawTime`, otherwise cancels the shot (no ammo consumed, stamina
   *  already spent is not refunded — same forfeit as `reset()`). */
  releaseDraw: () => RangedTickResult
  /** Cancels any in-flight draw — pause/modal/rebuild/tool-switch safety. */
  reset: () => void
}

export function createPlayerRanged(): PlayerRanged {
  const lifecycle = createRangedAttackLifecycle()

  return {
    state: lifecycle.state,
    isDrawing: lifecycle.isDrawing,
    phaseProgress: lifecycle.phaseProgress,
    requestDraw(cfg, stamina, vigor, dayLengthSec) {
      if (lifecycle.state() !== 'idle') return false
      if (stamina.current < cfg.staminaCost) return false
      drainStamina(stamina, cfg.staminaCost)
      drainVigor(vigor, physicalEffortVigorCostPerSec('moderate', dayLengthSec) * (cfg.drawTime + cfg.recovery))
      return lifecycle.start(cfg, { manualRelease: true })
    },
    update: lifecycle.update,
    releaseDraw: lifecycle.release,
    reset: lifecycle.reset,
  }
}
