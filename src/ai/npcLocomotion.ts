import { isExhausted, type StaminaState } from '../shared/StaminaState'

/**
 * @domain npc
 * @role Semantic emergency locomotion mode for NPC movement (plan npc-046).
 * `NpcAgent` owns the committed `walk`/`run` intent on its current movement
 * episode (destination/route ownership stays exactly as it was — this is
 * only how fast/which animation that already-committed movement executes
 * at); this module holds no simulation state and is pure/stateless, the
 * same split `npcAnimalThreat.ts` uses for the threat decision itself.
 */

export type NpcLocomotionMode = 'walk' | 'run'

/** Emergency run speed over ordinary NPC walk speed — this plan's own
 *  tuning, deliberately not reused from `PlayerController`'s
 *  `SPRINT_MULTIPLIER` (implementation notes: "NPC movement owns its own
 *  value"). */
export const RUN_SPEED_MULTIPLIER = 1.8

/** stamina/sec while an NPC executes `run` locomotion — a fixed V1 rate,
 *  distinct from `NpcAgent`'s existing `WALK_FATIGUE_RATE` so ordinary
 *  walking stays free of this drain. */
export const RUN_FATIGUE_RATE = 4

/** The locomotion mode that should actually drive speed/animation this
 *  frame: an exhausted NPC degrades a committed `run` intent down to `walk`
 *  rather than freezing — the intent itself (`mode`) is left untouched so a
 *  later stamina recovery resumes running without needing to be re-decided
 *  upstream. */
export function resolveNpcEffectiveLocomotionMode(
  mode: NpcLocomotionMode,
  stamina: StaminaState,
): NpcLocomotionMode {
  if (mode === 'run' && isExhausted(stamina)) return 'walk'
  return mode
}

/** Actual movement speed for an already-degraded `effectiveMode` (see
 *  `resolveNpcEffectiveLocomotionMode`). Pure — no stamina read here, so a
 *  caller can't accidentally apply the exhaustion check twice. */
export function resolveNpcLocomotionSpeed(effectiveMode: NpcLocomotionMode, walkSpeed: number): number {
  return effectiveMode === 'run' ? walkSpeed * RUN_SPEED_MULTIPLIER : walkSpeed
}
