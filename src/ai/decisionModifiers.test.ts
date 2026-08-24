import { describe, expect, it } from 'vitest'
import type { BigFivePersonality } from './dialogue'
import { scoreNeedCandidates } from './decisionModifiers'
import { generateNeedPressures } from './Needs'

const NEUTRAL: BigFivePersonality = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
}

function personality(overrides: Partial<BigFivePersonality>): BigFivePersonality {
  return { ...NEUTRAL, ...overrides }
}

describe('scoreNeedCandidates', () => {
  it('is deterministic for identical pressures and personality', () => {
    const pressures = generateNeedPressures({ thirst: 0.4, woodDuty: 0.5, waterDuty: 0.4, hunger: 0.3 })
    const input = { personality: personality({}), role: 'farmer' as const }
    expect(scoreNeedCandidates(pressures, input)).toEqual(scoreNeedCandidates(pressures, input))
  })

  it('applies no modifier and leaves final equal to base for a neutral personality', () => {
    const pressures = generateNeedPressures({ thirst: 0, woodDuty: 0.5, waterDuty: 0, hunger: 0 })
    const wood = scoreNeedCandidates(pressures, { personality: NEUTRAL, role: 'farmer' }).find((c) => c.target === 'wood')!
    expect(wood.final).toBeCloseTo(wood.base)
  })

  it('biases an already-active wood duty candidate toward higher conscientiousness', () => {
    const pressures = generateNeedPressures({ thirst: 0, woodDuty: 0.5, waterDuty: 0, hunger: 0 })
    const low = scoreNeedCandidates(pressures, { personality: personality({ conscientiousness: 0 }), role: 'farmer' })
    const high = scoreNeedCandidates(pressures, { personality: personality({ conscientiousness: 1 }), role: 'farmer' })
    const lowWood = low.find((c) => c.target === 'wood')!
    const highWood = high.find((c) => c.target === 'wood')!
    expect(highWood.final).toBeGreaterThan(lowWood.final)
  })

  it('gives the woodcutter role an extra bump on an already-active wood candidate only', () => {
    const pressures = generateNeedPressures({ thirst: 0, woodDuty: 0.5, waterDuty: 0.5, hunger: 0 })
    const farmer = scoreNeedCandidates(pressures, { personality: NEUTRAL, role: 'farmer' })
    const woodcutter = scoreNeedCandidates(pressures, { personality: NEUTRAL, role: 'woodcutter' })
    const farmerWood = farmer.find((c) => c.target === 'wood')!
    const woodcutterWood = woodcutter.find((c) => c.target === 'wood')!
    const farmerWaterDuty = farmer.find((c) => c.target === 'waterDuty')!
    const woodcutterWaterDuty = woodcutter.find((c) => c.target === 'waterDuty')!
    expect(woodcutterWood.final).toBeGreaterThan(farmerWood.final)
    expect(woodcutterWaterDuty.final).toBeCloseTo(farmerWaterDuty.final)
  })

  it('never turns an inactive (below-threshold) candidate into an active one', () => {
    const pressures = generateNeedPressures({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 })
    const candidates = scoreNeedCandidates(pressures, {
      personality: personality({ conscientiousness: 1 }),
      role: 'woodcutter',
    })
    const wood = candidates.find((c) => c.target === 'wood')!
    expect(wood.base).toBe(0)
    expect(wood.final).toBe(0)
    expect(wood.modifiers).toEqual([])
  })

  it('leaves personal physiological needs (water/food) and idle untouched by personality/role', () => {
    const pressures = generateNeedPressures({ thirst: 0.9, woodDuty: 0, waterDuty: 0, hunger: 0.9 })
    const candidates = scoreNeedCandidates(pressures, {
      personality: personality({ conscientiousness: 1, neuroticism: 1, openness: 1 }),
      role: 'woodcutter',
    })
    const water = candidates.find((c) => c.target === 'water')!
    const food = candidates.find((c) => c.target === 'food')!
    const idle = candidates.find((c) => c.target === 'idle')!
    expect(water.modifiers).toEqual([])
    expect(food.modifiers).toEqual([])
    expect(idle.modifiers).toEqual([])
    expect(water.final).toBe(water.base)
    expect(food.final).toBe(food.base)
    expect(idle.final).toBe(idle.base)
  })

  it('keeps duty modifiers small enough that an urgent physiological need still outranks them', () => {
    const pressures = generateNeedPressures({ thirst: 0.9, woodDuty: 0.35, waterDuty: 0, hunger: 0 })
    const candidates = scoreNeedCandidates(pressures, {
      personality: personality({ conscientiousness: 1 }),
      role: 'woodcutter',
    })
    const water = candidates.find((c) => c.target === 'water')!
    const wood = candidates.find((c) => c.target === 'wood')!
    expect(water.final).toBeGreaterThan(wood.final)
  })
})
