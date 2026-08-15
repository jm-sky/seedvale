import { describe, expect, it } from 'vitest'
import { createNeedState, pickNeed, tickNeeds } from './Needs'

describe('pickNeed', () => {
  it('defaults to idle when nothing crosses its threshold', () => {
    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 })).toBe('idle')
  })

  it('picks the single need that crosses its threshold', () => {
    expect(pickNeed({ thirst: 0.9, woodDuty: 0, waterDuty: 0, hunger: 0 })).toBe('water')
    expect(pickNeed({ thirst: 0, woodDuty: 0.9, waterDuty: 0, hunger: 0 })).toBe('wood')
    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0.9, hunger: 0 })).toBe('waterDuty')
    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0.9 })).toBe('food')
  })

  it('picks whichever crossed need scores highest, not just the first to cross', () => {
    expect(pickNeed({ thirst: 0.5, woodDuty: 0.5, waterDuty: 0.5, hunger: 0.5 })).toBe('water')
    expect(pickNeed({ thirst: 0, woodDuty: 0.9, waterDuty: 0, hunger: 0.35 })).toBe('wood')
  })

  it('ignores woodDuty when skipWood is set (trader stays at the stall)', () => {
    expect(pickNeed({ thirst: 0, woodDuty: 0.9, waterDuty: 0, hunger: 0 }, { skipWood: true })).toBe('idle')
    expect(pickNeed({ thirst: 0, woodDuty: 0.9, waterDuty: 0, hunger: 0.9 }, { skipWood: true })).toBe('food')
    expect(pickNeed({ thirst: 0.9, woodDuty: 0.9, waterDuty: 0, hunger: 0 }, { skipWood: true })).toBe('water')
  })

  it('shortage bias can promote wood/food without becoming a planner', () => {
    expect(pickNeed({ thirst: 0, woodDuty: 0.25, waterDuty: 0, hunger: 0 })).toBe('idle')
    expect(pickNeed({ thirst: 0, woodDuty: 0.25, waterDuty: 0, hunger: 0 }, { woodShortage: true })).toBe('wood')
    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0.28 })).toBe('idle')
    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0.28 }, { foodShortage: true })).toBe('food')
    expect(pickNeed(
      { thirst: 0, woodDuty: 0.9, waterDuty: 0, hunger: 0 },
      { skipWood: true, woodShortage: true },
    )).toBe('idle')
  })

  it('household water shortage promotes waterDuty the same way woodShortage promotes wood', () => {
    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0.25, hunger: 0 })).toBe('idle')
    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0.25, hunger: 0 }, { waterShortage: true })).toBe('waterDuty')
  })
})

describe('pickNeed critical mode', () => {
  it('requires much higher thresholds than the normal pick', () => {
    expect(pickNeed({ thirst: 0.5, woodDuty: 0.5, waterDuty: 0.5, hunger: 0.5 })).toBe('water')
    expect(pickNeed({ thirst: 0.5, woodDuty: 0.5, waterDuty: 0.5, hunger: 0.5 }, { critical: true })).toBe('idle')
  })

  it('fires once a need crosses its critical threshold', () => {
    expect(pickNeed({ thirst: 0.9, woodDuty: 0, waterDuty: 0, hunger: 0 }, { critical: true })).toBe('water')
    expect(pickNeed({ thirst: 0, woodDuty: 0.9, waterDuty: 0, hunger: 0 }, { critical: true })).toBe('wood')
    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0.9, hunger: 0 }, { critical: true })).toBe('waterDuty')
    expect(pickNeed({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0.9 }, { critical: true })).toBe('food')
  })

  it('keeps water > wood > waterDuty > food precedence on ties', () => {
    expect(pickNeed(
      { thirst: 0.9, woodDuty: 0.9, waterDuty: 0.9, hunger: 0.9 },
      { critical: true },
    )).toBe('water')
    // woodDuty 0.9 * 1.1 mult == hunger 0.825 * 1.2 mult == 0.99: a genuine score tie.
    expect(pickNeed({ thirst: 0, woodDuty: 0.9, waterDuty: 0, hunger: 0.825 }, { critical: true })).toBe('wood')
  })

  it('still respects skipWood for traders', () => {
    expect(pickNeed(
      { thirst: 0, woodDuty: 0.95, waterDuty: 0, hunger: 0 },
      { critical: true, skipWood: true },
    )).toBe('idle')
  })

  it('ignores shortage bias in critical mode — urgency stays a fixed bar', () => {
    expect(pickNeed(
      { thirst: 0, woodDuty: 0.5, waterDuty: 0, hunger: 0 },
      { critical: true, woodShortage: true },
    )).toBe('idle')
    expect(pickNeed(
      { thirst: 0, woodDuty: 0, waterDuty: 0.5, hunger: 0 },
      { critical: true, waterShortage: true },
    )).toBe('idle')
    expect(pickNeed(
      { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0.5 },
      { critical: true, foodShortage: true },
    )).toBe('idle')
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
    expect(needs.waterDuty).toBe(1)
    expect(needs.hunger).toBe(1)
  })
})
