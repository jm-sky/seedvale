/**
 * Shared natural-decay phase lookup (plan npc-010) — unit-agnostic so fauna
 * can keep calling it with seconds and NPC corpses with world-days. Not a
 * generic corpse manager: callers still own their own linger/remove rules,
 * harvest/burial flags, and presentation.
 */

export type CorpseDecayPhase = 'bones' | 'fresh' | 'rotting'

/** Pure phase-from-elapsed-time lookup. `elapsed`, `rotOnset` and
 *  `bonesOnset` must share a unit. */
export function decayPhaseFromElapsed(
  elapsed: number,
  rotOnset: number,
  bonesOnset: number,
): CorpseDecayPhase {
  if (elapsed >= bonesOnset) return 'bones'
  if (elapsed >= rotOnset) return 'rotting'
  return 'fresh'
}
