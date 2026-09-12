import { describe, expect, it } from 'vitest'
import { gameDaysToRealSeconds } from '../world/timeConversion'
import { createAnimalLifeState, DEFAULT_ANIMAL_METABOLISM, NEED_ELEVATED_THRESHOLD, tickAnimalLife } from './AnimalLife'

describe('DEFAULT_ANIMAL_METABOLISM thirst pacing', () => {
  it('reaches elevated threshold slower than the legacy ~16s half-bar rate', () => {
    const life = createAnimalLifeState(0, DEFAULT_ANIMAL_METABOLISM)
    life.thirst = 0.35
    const legacyRate = 0.032
    const legacySecondsToElevated = (NEED_ELEVATED_THRESHOLD - life.thirst) / legacyRate

    let t = 0
    while (life.thirst < NEED_ELEVATED_THRESHOLD && t < 60 * 30) {
      tickAnimalLife(life, 1, false, {}, DEFAULT_ANIMAL_METABOLISM)
      t += 1
    }
    expect(t).toBeGreaterThan(legacySecondsToElevated * 2)
  })

  it('empties thirst on roughly the same game-day scale as player needs', () => {
    const life = createAnimalLifeState(0, DEFAULT_ANIMAL_METABOLISM)
    life.thirst = 0
    const dayLengthSec = 480
    const seconds = gameDaysToRealSeconds(2.5, dayLengthSec)
    tickAnimalLife(life, seconds, false, {}, DEFAULT_ANIMAL_METABOLISM)
    expect(life.thirst).toBeGreaterThan(0.95)
  })
})
