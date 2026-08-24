import type { Role } from './characters'
import type { BigFivePersonality } from './dialogue'
import type { NeedId, NpcPressure } from './Needs'

/**
 * Personality/role preference layer over `Needs.ts`'s already-generated
 * pressures (plan ai-002). `NpcAgent.choose()` still owns arbitration and
 * action execution; this only re-scores the same candidate list with small,
 * inspectable biases — never a second need/pressure generator.
 *
 * A bias is only ever applied to a pressure that is already active
 * (`base > 0`, i.e. `generateNeedPressures` already crossed its own
 * threshold). Personality/role can re-rank valid candidates; it must never
 * turn a need `generateNeedPressures` judged not-yet-due into a candidate.
 */
export type DecisionModifier = {
  source: string
  value: number
}

export type ScoredNeedCandidate = {
  target: NeedId
  base: number
  modifiers: readonly DecisionModifier[]
  final: number
}

export type NeedModifierInput = {
  personality: BigFivePersonality
  role: Role
}

/** How strongly conscientiousness biases an already-active duty pressure
 *  (`wood`/`waterDuty`) — centered on 0.5 so an average NPC gets no bias.
 *  Bounded well under the smallest just-crossed physiological pressure
 *  (thirst/hunger, ~0.38-0.47 at their own thresholds — see `Needs.ts`) so a
 *  genuinely urgent need still wins on its own merits; personality only
 *  tips a close call between duties, or between a duty and idle. */
const CONSCIENTIOUSNESS_DUTY_WEIGHT = 0.2

/** `woodcutter` already works wood professionally (`characters.ts`) — a
 *  modest fixed bump toward staying on top of the household's own wood
 *  duty, distinct from (and additive with) the scheduled `work` block
 *  `beginIdle` already sends this role to. */
const WOODCUTTER_DUTY_ROLE_BONUS = 0.12

/** Duty-shaped candidates conscientiousness biases — `water`/`food` stay
 *  untouched: they are personal physiological needs, not a preference over
 *  duties/preparation/persistence (plan ai-002 scope). `idle` is the
 *  baseline fallback and is never biased. */
function isDutyTarget(target: NeedId): boolean {
  return target === 'wood' || target === 'waterDuty'
}

/**
 * Openness/extraversion/agreeableness have no meaningful candidate at this
 * seam today: `generateNeedPressures` offers no exploratory, social or
 * cooperative alternative to bias between (see the ai-002 implementation
 * notes). Leaving them unused here is deliberate — inventing one just to
 * exercise a Big Five dimension is explicitly out of scope.
 */
export function scoreNeedCandidates(
  pressures: readonly NpcPressure[],
  input: NeedModifierInput,
): ScoredNeedCandidate[] {
  return pressures.map((pressure): ScoredNeedCandidate => {
    const modifiers: DecisionModifier[] = []
    if (pressure.value > 0 && isDutyTarget(pressure.target)) {
      modifiers.push({
        source: 'conscientiousness',
        value: (input.personality.conscientiousness - 0.5) * CONSCIENTIOUSNESS_DUTY_WEIGHT,
      })
      if (pressure.target === 'wood' && input.role === 'woodcutter') {
        modifiers.push({ source: 'role.woodcutter', value: WOODCUTTER_DUTY_ROLE_BONUS })
      }
    }
    const final = pressure.value + modifiers.reduce((sum, m) => sum + m.value, 0)
    return { target: pressure.target, base: pressure.value, modifiers, final }
  })
}
