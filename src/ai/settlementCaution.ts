import type { SettlementCharacter } from '../settlement/villagePlan'

/**
 * Closed-settlement caution is a contextual social bias, never a personality
 * or trait mutation (plan settlements-010). Magnitudes stay weaker than
 * trusted/friendly relationship bonuses so established trust can overcome it.
 *
 * @domain npc
 */
export const CLOSED_CAUTION_SCORE = 5
export const CLOSED_CAUTION_CHANCE = 0.02
export const CLOSED_CAUTION_WILLINGNESS = 0.08

export function closedCautionScore(character: SettlementCharacter | undefined): number {
  return character === 'closed' ? CLOSED_CAUTION_SCORE : 0
}

export function closedCautionChance(character: SettlementCharacter | undefined): number {
  return character === 'closed' ? CLOSED_CAUTION_CHANCE : 0
}

export function closedCautionWillingness(character: SettlementCharacter | undefined): number {
  return character === 'closed' ? CLOSED_CAUTION_WILLINGNESS : 0
}
