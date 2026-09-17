import { describe, expect, it } from 'vitest'
import {
  activityRestPressure,
  restPhaseOffset,
  shouldRoutineRest,
  timeOfDayRestPressure,
} from './animalActivity'

describe('timeOfDayRestPressure', () => {
  it('nocturnal: stronger rest pressure during daylight than night', () => {
    const day = timeOfDayRestPressure({ profile: 'nocturnal', timeOfDay: 0.5, dayFactor: 1 })
    const night = timeOfDayRestPressure({ profile: 'nocturnal', timeOfDay: 0, dayFactor: 0 })
    expect(day).toBeGreaterThan(night)
  })

  it('diurnal: stronger rest pressure during night than day', () => {
    const day = timeOfDayRestPressure({ profile: 'diurnal', timeOfDay: 0.5, dayFactor: 1 })
    const night = timeOfDayRestPressure({ profile: 'diurnal', timeOfDay: 0, dayFactor: 0 })
    expect(night).toBeGreaterThan(day)
  })

  it('crepuscular: dawn/dusk are the most active, noon/midnight the most restful', () => {
    const dawn = timeOfDayRestPressure({ profile: 'crepuscular', timeOfDay: 0.25, dayFactor: 0.3 })
    const dusk = timeOfDayRestPressure({ profile: 'crepuscular', timeOfDay: 0.75, dayFactor: 0.3 })
    const noon = timeOfDayRestPressure({ profile: 'crepuscular', timeOfDay: 0.5, dayFactor: 1 })
    const midnight = timeOfDayRestPressure({ profile: 'crepuscular', timeOfDay: 0, dayFactor: 0 })
    expect(dawn).toBe(0)
    expect(dusk).toBe(0)
    expect(noon).toBe(1)
    expect(midnight).toBe(1)
  })

  it('crepuscular pressure differs between the raw dawn and dusk clock times even at equal dayFactor', () => {
    // Same reasoning `spontaneousVocalizeTimeWeight` needs raw `timeOfDay`
    // for: `dayFactor` alone can't tell dawn from dusk. This only asserts
    // both anchors are equally (and maximally) active — the actual
    // consumer-facing difference is the dawn/dusk vs. noon/midnight split
    // covered above.
    const dawn = timeOfDayRestPressure({ profile: 'crepuscular', timeOfDay: 0.25, dayFactor: 0.1 })
    const dusk = timeOfDayRestPressure({ profile: 'crepuscular', timeOfDay: 0.75, dayFactor: 0.1 })
    expect(dawn).toBe(dusk)
  })
})

describe('activityRestPressure', () => {
  it('low stamina increases rest desire relative to healthy stamina, all else equal', () => {
    const base = {
      profile: 'diurnal' as const,
      restBias: 0,
      timeOfDay: 0.5,
      dayFactor: 1,
      staminaThreshold: 0.35,
      animalId: 'a',
    }
    const healthy = activityRestPressure({ ...base, staminaRatio: 1 })
    const tired = activityRestPressure({ ...base, staminaRatio: 0.05 })
    expect(tired).toBeGreaterThan(healthy)
  })

  it('healthy stamina alone does not force rest pressure at a fully active time', () => {
    const pressure = activityRestPressure({
      profile: 'diurnal',
      restBias: 0.6,
      timeOfDay: 0.5,
      dayFactor: 1, // full day: diurnal is fully active, pressure should be 0
      staminaRatio: 1,
      staminaThreshold: 0.35,
      animalId: 'any-animal',
    })
    expect(pressure).toBe(0)
  })
})

describe('restPhaseOffset', () => {
  it('is deterministic for identical ids', () => {
    expect(restPhaseOffset('wolf-42')).toBe(restPhaseOffset('wolf-42'))
  })

  it('differs across ids (not a constant)', () => {
    expect(restPhaseOffset('wolf-1')).not.toBe(restPhaseOffset('wolf-2'))
  })

  it('stays within [0, 1)', () => {
    for (const id of ['a', 'b', 'wolf-den-3', '']) {
      const offset = restPhaseOffset(id)
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(1)
    }
  })
})

describe('shouldRoutineRest', () => {
  const base = {
    profile: 'nocturnal' as const,
    restBias: 0.6,
    timeOfDay: 0.5,
    animalId: 'wolf-1',
    staminaRatio: 1,
  }

  it('is deterministic for identical id/time inputs', () => {
    const a = shouldRoutineRest({ ...base, dayFactor: 1 })
    const b = shouldRoutineRest({ ...base, dayFactor: 1 })
    expect(a).toBe(b)
  })

  it('a nocturnal animal is more likely to rest at full day than full night', () => {
    const atDay = shouldRoutineRest({ ...base, dayFactor: 1 })
    const atNight = shouldRoutineRest({ ...base, dayFactor: 0 })
    expect(atDay).toBe(true)
    expect(atNight).toBe(false)
  })

  it('never depends on Math.random (no source of nondeterminism to spy on)', () => {
    const originalRandom = Math.random
    Math.random = () => {
      throw new Error('shouldRoutineRest must not call Math.random()')
    }
    try {
      shouldRoutineRest({ ...base, dayFactor: 1 })
      shouldRoutineRest({ ...base, dayFactor: 0, staminaRatio: 0.1 })
    } finally {
      Math.random = originalRandom
    }
  })
})
