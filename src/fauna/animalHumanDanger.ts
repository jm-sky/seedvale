import type { HumanDangerConfig } from './animalDefs'

/**
 * @domain fauna
 * @role Fauna-owned pure resolver for one live animal's projected danger to
 *  a human bystander (plan npc-057 §1) — the single authority the
 *  destination-threat hook (`destinationThreatHooks.ts`) reads instead of
 *  duplicating species/behaviour knowledge in `ai/`.
 */

export type AnimalHumanDangerState = {
  /** This animal's species `humanDanger` config, or `undefined` for every
   *  harmless prey/livestock kind — always resolves to `0` regardless of
   *  `aggressive`/`dangerSignificance`. */
  humanDanger: HumanDangerConfig | undefined
  /** Frenzied, rabid, or currently committed to threatening a human
   *  (`AnimalAgent.isFrenzied()` / `isRabid()` / `isThreateningHuman()`). */
  aggressive: boolean
  /** Individual variant/dangerous-trait multiplier — `AnimalAgent.dangerSignificance`
   *  (plan fauna-022). Never a second species baseline. */
  dangerSignificance: number
}

/**
 * Final projected human danger for one live animal:
 * `baseHumanDanger × currentHumanDangerModifier × dangerSignificance`.
 *
 * The aggressive floor is applied *before* the `dangerSignificance` multiply
 * so an alpha/dangerous individual scales the same species baseline through
 * one multiplier rather than needing a second aggressive-state table. Absent
 * `humanDanger` (harmless prey/livestock, plan npc-057 §1 "harmless
 * prey/livestock do not block destinations") always resolves to `0`.
 */
export function resolveHumanDangerProjection(state: AnimalHumanDangerState): number {
  if (!state.humanDanger) return 0
  const modifier = state.aggressive
    ? Math.max(state.humanDanger.baseline, state.humanDanger.aggressiveFloor)
    : state.humanDanger.baseline
  return modifier * state.dangerSignificance
}
