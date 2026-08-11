import { describe, expect, it } from 'vitest'
import { getStaminaRatio, isExhausted } from '../shared/StaminaState'
import {
  ANIMAL_STAMINA_MAX,
  createAnimalLifeState,
  NEED_ELEVATED_THRESHOLD,
  relieveElevatedNeeds,
  tickAnimalLife,
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

  it('relieveElevatedNeeds only reduces needs above the elevated threshold', () => {
    const life = createAnimalLifeState(0)
    life.hunger = NEED_ELEVATED_THRESHOLD + 0.1
    life.thirst = NEED_ELEVATED_THRESHOLD - 0.1
    relieveElevatedNeeds(life)
    expect(life.hunger).toBeLessThan(NEED_ELEVATED_THRESHOLD + 0.1)
    expect(life.thirst).toBe(NEED_ELEVATED_THRESHOLD - 0.1)
  })

  it('relieveElevatedNeeds never drops below 0', () => {
    const life = createAnimalLifeState(0)
    life.hunger = NEED_ELEVATED_THRESHOLD + 0.01
    life.thirst = 0
    relieveElevatedNeeds(life)
    expect(life.hunger).toBeGreaterThanOrEqual(0)
  })
})
