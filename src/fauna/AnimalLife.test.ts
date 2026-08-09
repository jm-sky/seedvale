import { describe, expect, it } from 'vitest'
import {
  createAnimalLifeState,
  NEED_ELEVATED_THRESHOLD,
  relieveElevatedNeeds,
  tickAnimalLife,
} from './AnimalLife'

describe('AnimalLife', () => {
  it('offsets hunger/thirst per instance so animals do not tick in unison', () => {
    const a = createAnimalLifeState(0)
    const b = createAnimalLifeState(0.7)
    expect(a).not.toEqual(b)
    expect(a.energy).toBe(1)
    expect(b.energy).toBe(1)
  })

  it('hunger/thirst rise over time, capped at 1', () => {
    const life = createAnimalLifeState(0)
    tickAnimalLife(life, 1000, false)
    expect(life.hunger).toBe(1)
    expect(life.thirst).toBe(1)
  })

  it('energy drains while sprinting and regenerates while not', () => {
    const life = createAnimalLifeState(0)
    tickAnimalLife(life, 1, true)
    expect(life.energy).toBeLessThan(1)
    const drained = life.energy
    tickAnimalLife(life, 1, false)
    expect(life.energy).toBeGreaterThan(drained)
  })

  it('relieveElevatedNeeds only reduces needs above the elevated threshold', () => {
    const life = { hunger: NEED_ELEVATED_THRESHOLD + 0.1, thirst: NEED_ELEVATED_THRESHOLD - 0.1, energy: 1 }
    relieveElevatedNeeds(life)
    expect(life.hunger).toBeLessThan(NEED_ELEVATED_THRESHOLD + 0.1)
    expect(life.thirst).toBe(NEED_ELEVATED_THRESHOLD - 0.1)
  })

  it('relieveElevatedNeeds never drops below 0', () => {
    const life = { hunger: NEED_ELEVATED_THRESHOLD + 0.01, thirst: 0, energy: 1 }
    relieveElevatedNeeds(life)
    expect(life.hunger).toBeGreaterThanOrEqual(0)
  })
})
