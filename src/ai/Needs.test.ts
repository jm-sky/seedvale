import { describe, expect, it } from 'vitest'
import { createNeedState, pickNeed, tickNeeds } from './Needs'

describe('pickNeed', () => {
  it('defaults to idle when nothing crosses its threshold', () => {
    expect(pickNeed({ thirst: 0, woodDuty: 0, hunger: 0 })).toBe('idle')
  })

  it('picks the single need that crosses its threshold', () => {
    expect(pickNeed({ thirst: 0.9, woodDuty: 0, hunger: 0 })).toBe('water')
    expect(pickNeed({ thirst: 0, woodDuty: 0.9, hunger: 0 })).toBe('wood')
    expect(pickNeed({ thirst: 0, woodDuty: 0, hunger: 0.9 })).toBe('food')
  })

  it('picks whichever crossed need scores highest, not just the first to cross', () => {
    expect(pickNeed({ thirst: 0.5, woodDuty: 0.5, hunger: 0.5 })).toBe('water')
    expect(pickNeed({ thirst: 0, woodDuty: 0.9, hunger: 0.35 })).toBe('wood')
  })
})

describe('tickNeeds', () => {
  it('increases every need over time and clamps at 1', () => {
    const needs = createNeedState(0)
    tickNeeds(needs, 5)
    expect(needs.thirst).toBeGreaterThan(0.25)

    tickNeeds(needs, 1000)
    expect(needs.thirst).toBe(1)
    expect(needs.woodDuty).toBe(1)
    expect(needs.hunger).toBe(1)
  })
})
