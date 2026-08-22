import { describe, expect, it } from 'vitest'
import { getStaminaRatio, isExhausted } from '../shared/StaminaState'
import {
  ANIMAL_STAMINA_MAX,
  consumeFood,
  createAnimalLifeState,
  drinkWater,
  FOOD_RELIEF,
  NEED_ELEVATED_THRESHOLD,
  SLEEP_HUNGER_THIRST_RATE,
  tickAnimalLife,
  WATER_RELIEF,
} from './AnimalLife'

describe('AnimalLife', () => {
  it('offsets hunger/thirst per instance so animals do not tick in unison', () => {
    const a = createAnimalLifeState(0)
    const b = createAnimalLifeState(0.7)
    expect(a.hunger).not.toBe(b.hunger)
    expect(a.thirst).not.toBe(b.thirst)
    expect(a.stamina).toEqual({ max: ANIMAL_STAMINA_MAX, current: ANIMAL_STAMINA_MAX })
    expect(b.stamina.current).toBe(ANIMAL_STAMINA_MAX)
  })

  it('hunger/thirst rise over time, capped at 1', () => {
    const life = createAnimalLifeState(0)
    tickAnimalLife(life, 1000, false)
    expect(life.hunger).toBe(1)
    expect(life.thirst).toBe(1)
  })

  it('slows hunger/thirst rise when hungerThirstRate is reduced (e.g. sleep)', () => {
    const awake = createAnimalLifeState(0)
    const asleep = createAnimalLifeState(0)
    awake.hunger = 0
    awake.thirst = 0
    asleep.hunger = 0
    asleep.thirst = 0
    tickAnimalLife(awake, 10, false)
    tickAnimalLife(asleep, 10, false, { hungerThirstRate: SLEEP_HUNGER_THIRST_RATE })
    expect(asleep.hunger).toBeCloseTo(10 * 0.03 * SLEEP_HUNGER_THIRST_RATE)
    expect(asleep.thirst).toBeCloseTo(10 * 0.032 * SLEEP_HUNGER_THIRST_RATE)
    expect(asleep.hunger).toBeLessThan(awake.hunger)
    expect(asleep.thirst).toBeLessThan(awake.thirst)
  })

  it('stamina drains while sprinting and regenerates while not', () => {
    const life = createAnimalLifeState(0)
    tickAnimalLife(life, 1, true)
    expect(life.stamina.current).toBeLessThan(ANIMAL_STAMINA_MAX)
    const drained = life.stamina.current
    tickAnimalLife(life, 1, false)
    expect(life.stamina.current).toBeGreaterThan(drained)
  })

  it('stamina clamps to [0, max]', () => {
    const life = createAnimalLifeState(0)
    tickAnimalLife(life, 100, true)
    expect(life.stamina.current).toBe(0)
    expect(isExhausted(life.stamina)).toBe(true)
    tickAnimalLife(life, 100, false)
    expect(life.stamina.current).toBe(ANIMAL_STAMINA_MAX)
    expect(getStaminaRatio(life.stamina)).toBe(1)
  })

  it('consumeFood reduces hunger by FOOD_RELIEF and does not touch thirst', () => {
    const life = createAnimalLifeState(0)
    life.hunger = 0.8
    life.thirst = 0.8
    consumeFood(life)
    expect(life.hunger).toBeCloseTo(0.8 - FOOD_RELIEF)
    expect(life.thirst).toBe(0.8)
  })

  it('drinkWater reduces thirst by WATER_RELIEF and does not touch hunger', () => {
    const life = createAnimalLifeState(0)
    life.hunger = 0.8
    life.thirst = 0.8
    drinkWater(life)
    expect(life.thirst).toBeCloseTo(0.8 - WATER_RELIEF)
    expect(life.hunger).toBe(0.8)
  })

  it('consumeFood/drinkWater clamp at 0', () => {
    const life = createAnimalLifeState(0)
    life.hunger = 0.1
    life.thirst = 0.1
    consumeFood(life)
    drinkWater(life)
    expect(life.hunger).toBe(0)
    expect(life.thirst).toBe(0)
  })

  it('a single one-shot call over a long span (time-skip catch-up) matches many small steps summing to the same total — plan 196\'s regression invariant', () => {
    const skipped = createAnimalLifeState(0)
    const stepped = createAnimalLifeState(0)
    const totalSeconds = 8 * 60 * 60
    tickAnimalLife(skipped, totalSeconds, false)
    for (let i = 0; i < totalSeconds; i += 1) tickAnimalLife(stepped, 1, false)
    expect(skipped.hunger).toBeCloseTo(stepped.hunger, 6)
    expect(skipped.thirst).toBeCloseTo(stepped.thirst, 6)
    expect(skipped.stamina.current).toBeCloseTo(stepped.stamina.current, 6)
  })

  it('consumeFood/drinkWater apply below the elevated threshold too — relief is only valid after a real completed action, not gated on need level', () => {
    const life = createAnimalLifeState(0)
    life.hunger = NEED_ELEVATED_THRESHOLD - 0.1
    life.thirst = NEED_ELEVATED_THRESHOLD - 0.1
    consumeFood(life)
    drinkWater(life)
    expect(life.hunger).toBeLessThan(NEED_ELEVATED_THRESHOLD - 0.1)
    expect(life.thirst).toBeLessThan(NEED_ELEVATED_THRESHOLD - 0.1)
  })
})
