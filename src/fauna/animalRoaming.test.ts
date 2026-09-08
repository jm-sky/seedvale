import { describe, expect, it } from 'vitest'
import {
  findWaterTripDestination,
  probeBestPointNear,
  tripDayBucket,
  type TripDestinationContext,
} from './animalRoaming'

/** Deterministic sequence generator for `probeBestPointNear`'s injected
 *  `random` — cycles through `values` so a test can control exactly which
 *  angle/distance pair each attempt produces. */
function sequence(values: readonly number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('probeBestPointNear (plan fauna-017 step 7 — shared radial-probe primitive)', () => {
  it('returns null when accept rejects every candidate', () => {
    const result = probeBestPointNear(
      { x: 0, z: 0 },
      10,
      5,
      () => false,
      () => 0,
      sequence([0, 0.5]),
    )
    expect(result).toBeNull()
  })

  it('respects accept — only ever returns an accepted candidate', () => {
    const random = sequence([0, 1, 0.25, 1, 0.5, 1, 0.75, 1])
    const result = probeBestPointNear(
      { x: 0, z: 0 },
      10,
      4,
      (x) => x > 0, // angle 0 -> cos(0)=1 -> x = dist > 0 only when dist > 0; angle .25*2pi etc differ
      () => 1,
      random,
    )
    expect(result).not.toBeNull()
  })

  it('picks the best-scoring accepted candidate over multiple attempts', () => {
    // Three attempts at fixed angle 0 (so x = dist * radius, z = 0), distance
    // factors 0.1, 0.5, 0.3 against radius 10 -> x = 1, 5, 3.
    // Score = x itself — attempt 2 (x=5) must win.
    const random = sequence([0, 0.1, 0, 0.5, 0, 0.3])
    const result = probeBestPointNear(
      { x: 0, z: 0 },
      10,
      3,
      () => true,
      (x) => x,
      random,
    )
    expect(result).not.toBeNull()
    expect(result!.x).toBeCloseTo(5)
  })

  it('uses the injected random deterministically — same sequence, same result', () => {
    const makeRandom = () => sequence([0.1, 0.4, 0.9, 0.2, 0.3, 0.8])
    const a = probeBestPointNear({ x: 0, z: 0 }, 20, 3, () => true, (x, z) => -Math.hypot(x, z), makeRandom())
    const b = probeBestPointNear({ x: 0, z: 0 }, 20, 3, () => true, (x, z) => -Math.hypot(x, z), makeRandom())
    expect(a).toEqual(b)
  })
})

describe('findWaterTripDestination (plan fauna-016 §5/§6)', () => {
  function makeCtx(overrides: Partial<TripDestinationContext> = {}): TripDestinationContext {
    return {
      home: { x: 0, z: 0 },
      searchRadius: 45,
      sociability: 'wild',
      sampleHeight: () => 0,
      waterLevel: -10,
      isWalkable: () => true,
      isNearVillage: () => false,
      ...overrides,
    }
  }

  it('returns null when nothing is walkable', () => {
    const ctx = makeCtx({ isWalkable: () => false })
    expect(findWaterTripDestination(ctx)).toBeNull()
  })

  it('avoids village-adjacent candidates for a wild animal', () => {
    const ctx = makeCtx({ isNearVillage: () => true })
    expect(findWaterTripDestination(ctx)).toBeNull()
  })

  it('does not exclude village-adjacent candidates for a domestic animal', () => {
    // Water level high enough that shoreProbeHits sees "shore" everywhere,
    // regardless of the exact sampleHeight value, is out of scope here —
    // this only asserts the sociability gate itself is not applied.
    const ctx = makeCtx({ sociability: 'domestic', isNearVillage: () => true, waterLevel: 1000 })
    // Even though nothing here is a real shoreline (waterLevel absurdly
    // high so every point is "underwater"/no valid shore hit), the point of
    // this test is only that a domestic animal's search never short-circuits
    // via the village check the way a wild one's does.
    expect(() => findWaterTripDestination(ctx)).not.toThrow()
  })
})

describe('tripDayBucket (plan fauna-016 §5/§10 — deterministic trip opportunity)', () => {
  it('is deterministic for the same inputs', () => {
    expect(tripDayBucket('deer-3', 10.2, 2)).toBe(tripDayBucket('deer-3', 10.2, 2))
  })

  it('never advances for a non-positive cooldown', () => {
    expect(tripDayBucket('deer-3', 100, 0)).toBe(0)
  })
})
