import { describe, expect, it } from 'vitest'
import {
  CLOSED_CAUTION_CHANCE,
  CLOSED_CAUTION_SCORE,
  CLOSED_CAUTION_WILLINGNESS,
  closedCautionChance,
  closedCautionScore,
  closedCautionWillingness,
} from './settlementCaution'

describe('closed settlement caution (plan settlements-010)', () => {
  it('is inert for default / omitted character', () => {
    expect(closedCautionScore(undefined)).toBe(0)
    expect(closedCautionScore('default')).toBe(0)
    expect(closedCautionChance('default')).toBe(0)
    expect(closedCautionWillingness('default')).toBe(0)
  })

  it('applies a moderate closed bias', () => {
    expect(closedCautionScore('closed')).toBe(CLOSED_CAUTION_SCORE)
    expect(closedCautionChance('closed')).toBe(CLOSED_CAUTION_CHANCE)
    expect(closedCautionWillingness('closed')).toBe(CLOSED_CAUTION_WILLINGNESS)
    expect(CLOSED_CAUTION_SCORE).toBeLessThan(16)
    expect(CLOSED_CAUTION_CHANCE).toBeLessThan(0.15)
    expect(CLOSED_CAUTION_WILLINGNESS).toBeLessThan(0.25)
  })
})
