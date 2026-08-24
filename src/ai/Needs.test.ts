import { describe, expect, it } from 'vitest'
import { createNeedState, generateNeedPressures, pickNeed, SLEEP_HUNGER_THIRST_RATE, tickNeeds } from './Needs'

const DAY_LENGTH_SEC = 480

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

describe('generateNeedPressures', () => {
  it('returns a zero-value pressure per need below threshold, plus the constant idle pressure', () => {
    const pressures = generateNeedPressures({ thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 })
    expect(pressures).toEqual([
      { source: 'need.thirst', target: 'water', value: 0 },
      { source: 'need.woodDuty', target: 'wood', value: 0 },
      { source: 'need.waterDuty', target: 'waterDuty', value: 0 },
      { source: 'need.hunger', target: 'food', value: 0 },
      { source: 'need.idle', target: 'idle', value: 0.12 },
    ])
  })

  it('scores a crossed need as value * multiplier, matching pickNeed thresholds', () => {
    const pressures = generateNeedPressures({ thirst: 0.9, woodDuty: 0, waterDuty: 0, hunger: 0 })
    const water = pressures.find((p) => p.target === 'water')
    expect(water?.value).toBeCloseTo(0.9 * 1.35)
  })

  it('applies the shortage multiplier to the affected pressure only', () => {
    const base = generateNeedPressures({ thirst: 0, woodDuty: 0.25, waterDuty: 0, hunger: 0 })
    const shortage = generateNeedPressures({ thirst: 0, woodDuty: 0.25, waterDuty: 0, hunger: 0 }, { woodShortage: true })
    expect(base.find((p) => p.target === 'wood')?.value).toBe(0)
    expect(shortage.find((p) => p.target === 'wood')?.value).toBeCloseTo(0.25 * 1.35)
    expect(shortage.find((p) => p.target === 'water')?.value).toBe(0)
  })

  it('zeroes the wood pressure when skipWood is set (trader)', () => {
    const pressures = generateNeedPressures({ thirst: 0, woodDuty: 0.9, waterDuty: 0, hunger: 0 }, { skipWood: true })
    expect(pressures.find((p) => p.target === 'wood')?.value).toBe(0)
  })

  it('is deterministic for identical input', () => {
    const needs = { thirst: 0.4, woodDuty: 0.3, waterDuty: 0.2, hunger: 0.1 }
    expect(generateNeedPressures(needs)).toEqual(generateNeedPressures(needs))
  })

  it('produces the same winner pickNeed would derive from these pressures', () => {
    const needs = { thirst: 0.5, woodDuty: 0.5, waterDuty: 0.5, hunger: 0.5 }
    const pressures = generateNeedPressures(needs)
    const best = pressures.reduce((a, b) => (b.value > a.value ? b : a))
    expect(best.target).toBe(pickNeed(needs))
  })
})

describe('tickNeeds', () => {
  it('increases every need over time and clamps at 1', () => {
    const needs = createNeedState(0)
    tickNeeds(needs, 5, DAY_LENGTH_SEC)
    expect(needs.thirst).toBeGreaterThan(0.05)

    tickNeeds(needs, 1000, DAY_LENGTH_SEC)
    expect(needs.thirst).toBe(1)
    expect(needs.woodDuty).toBe(1)
    expect(needs.waterDuty).toBe(1)
    expect(needs.hunger).toBe(1)
  })

  it('slows only hunger/thirst when hungerThirstRate is reduced (e.g. sleep)', () => {
    const awake = { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 }
    const asleep = { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 }
    tickNeeds(awake, 10, DAY_LENGTH_SEC)
    tickNeeds(asleep, 10, DAY_LENGTH_SEC, { hungerThirstRate: SLEEP_HUNGER_THIRST_RATE })
    const hoursPerRealSecond = 24 / DAY_LENGTH_SEC
    expect(asleep.thirst).toBeCloseTo(10 * hoursPerRealSecond / 8 * SLEEP_HUNGER_THIRST_RATE)
    expect(asleep.hunger).toBeCloseTo(10 * hoursPerRealSecond / 10 * SLEEP_HUNGER_THIRST_RATE)
    expect(asleep.woodDuty).toBeCloseTo(awake.woodDuty)
    expect(asleep.waterDuty).toBeCloseTo(awake.waterDuty)
    expect(asleep.thirst).toBeLessThan(awake.thirst)
    expect(asleep.hunger).toBeLessThan(awake.hunger)
  })

  it('needs take the same number of game-hours to fill regardless of dayLengthSec (plan 192)', () => {
    // thirst is tuned to fill (0->1) over 8 game hours: ticking for exactly
    // that many real/sim seconds (8h worth of dayLengthSec) should fully
    // fill it at any day length.
    for (const dayLengthSec of [480, 600, 240]) {
      const needs = createNeedState(0)
      needs.thirst = 0
      const eightGameHoursInRealSeconds = (8 / 24) * dayLengthSec
      tickNeeds(needs, eightGameHoursInRealSeconds, dayLengthSec)
      expect(needs.thirst).toBeCloseTo(1, 6)
    }
  })
})
