import { describe, expect, it } from 'vitest'
import {
  HUMAN_CARRY_NEUTRAL_KG,
  HUMAN_CARRY_STRENGTH_NEUTRAL,
  humanBodyCarryCapacityKg,
} from './humanCarryCapacity'
import { PLAYER_STARTING_ATTRIBUTES } from './PlayerController'

describe('humanBodyCarryCapacityKg', () => {
  it('maps the documented boundary/neutral/starting points exactly (plan npc-020 §8/§9)', () => {
    expect(humanBodyCarryCapacityKg(0)).toBe(14)
    expect(humanBodyCarryCapacityKg(0.25)).toBe(17)
    expect(humanBodyCarryCapacityKg(0.5)).toBe(20)
    expect(humanBodyCarryCapacityKg(0.75)).toBe(23)
    expect(humanBodyCarryCapacityKg(1)).toBe(26)
    expect(humanBodyCarryCapacityKg(PLAYER_STARTING_ATTRIBUTES.strength)).toBe(21.2)
  })

  it('is the existing 20 kg human baseline at HUMAN_CARRY_STRENGTH_NEUTRAL', () => {
    expect(humanBodyCarryCapacityKg(HUMAN_CARRY_STRENGTH_NEUTRAL)).toBe(HUMAN_CARRY_NEUTRAL_KG)
  })

  it('does not round the starting Player capacity for simulation', () => {
    const capacity = humanBodyCarryCapacityKg(0.6)
    expect(capacity).toBe(21.2)
    expect(Number.isInteger(capacity)).toBe(false)
  })
})
