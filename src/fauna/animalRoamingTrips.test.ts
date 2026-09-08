import { describe, expect, it } from 'vitest'
import { ANIMAL_DEFS } from './animalDefs'
import { tripDayBucket } from './animalRoaming'

describe('AnimalDef.roaming (plan fauna-016 §3 — species-specific roaming range)', () => {
  it('gives small prey a tighter roaming band than large prey/predators', () => {
    const [rabbitMin, rabbitMax] = ANIMAL_DEFS.rabbit.roaming!
    const [deerMin, deerMax] = ANIMAL_DEFS.deer.roaming!
    const [, wolfMax] = ANIMAL_DEFS.wolf.roaming!
    expect(rabbitMax).toBeLessThan(deerMax)
    expect(rabbitMax).toBeLessThan(wolfMax)
    expect(rabbitMin).toBeLessThan(rabbitMax)
    expect(deerMin).toBeLessThan(deerMax)
  })

  it('gives deer and stag the same large-roaming tier', () => {
    expect(ANIMAL_DEFS.stag.roaming).toEqual(ANIMAL_DEFS.deer.roaming)
  })
})

describe('AnimalDef.trips.water (plan fauna-016 §5 — declarative per-species trigger)', () => {
  it('configures deer/stag for water trips', () => {
    expect(ANIMAL_DEFS.deer.trips?.water).toBeDefined()
    expect(ANIMAL_DEFS.stag.trips?.water).toBeDefined()
  })

  it('a water trip search radius exceeds the species own roaming band', () => {
    const config = ANIMAL_DEFS.deer.trips!.water!
    const [, roamMax] = ANIMAL_DEFS.deer.roaming!
    expect(config.searchRadius).toBeGreaterThan(roamMax)
  })

  it('leaves species with no water-trip policy configured (e.g. wolf) without one', () => {
    expect(ANIMAL_DEFS.wolf.trips?.water).toBeUndefined()
  })
})

describe('tripDayBucket (plan fauna-016 §5/§10 — deterministic trip opportunity)', () => {
  it('is deterministic for the same inputs', () => {
    expect(tripDayBucket('deer-3', 10.2, 2)).toBe(tripDayBucket('deer-3', 10.2, 2))
  })

  it('advances roughly once per cooldown period', () => {
    const early = tripDayBucket('deer-3', 0, 2)
    const late = tripDayBucket('deer-3', 6, 2)
    expect(late).toBeGreaterThan(early)
  })

  it('phase-offsets different animals so they are not all due on the same day', () => {
    const buckets = new Set<number>()
    for (let i = 0; i < 8; i++) buckets.add(tripDayBucket(`deer-${i}`, 3, 2))
    expect(buckets.size).toBeGreaterThan(1)
  })

  it('never advances for a non-positive cooldown', () => {
    expect(tripDayBucket('deer-3', 100, 0)).toBe(0)
  })
})
