import { describe, expect, it } from 'vitest'
import {
  DEEP_WELL_DEPTH_THRESHOLD,
  isDeepWellDepth,
  resolveWellWater,
  WELL_WATER_DEPTH_MAX,
  WELL_WATER_DEPTH_MIN,
} from './wellGroundwater'

describe('resolveWellWater (plan world-004 §1)', () => {
  it('is deterministic: same seed + same placement + same terrain → same result', () => {
    const a = resolveWellWater(42, 10, -5, 8, 0)
    const b = resolveWellWater(42, 10, -5, 8, 0)
    expect(a).toEqual(b)
  })

  it('a different seed can change the result at the same placement', () => {
    const results = new Set(
      Array.from({ length: 20 }, (_, seed) => JSON.stringify(resolveWellWater(seed, 10, -5, 8, 0))),
    )
    expect(results.size).toBeGreaterThan(1)
  })

  it('a different position can change the result for the same seed', () => {
    const results = new Set(
      Array.from({ length: 20 }, (_, i) => JSON.stringify(resolveWellWater(42, i * 3, -i, 8, 0))),
    )
    expect(results.size).toBeGreaterThan(1)
  })

  it('every result is bounded to [WELL_WATER_DEPTH_MIN, WELL_WATER_DEPTH_MAX]', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { depth } = resolveWellWater(seed, seed * 7, -seed * 3, seed * 2 - 10, 0)
      expect(depth).toBeGreaterThanOrEqual(WELL_WATER_DEPTH_MIN)
      expect(depth).toBeLessThanOrEqual(WELL_WATER_DEPTH_MAX)
    }
  })

  it('higher terrain (relative to water level) never resolves shallower for the ordinary groundwater case', () => {
    // Same seed/position so the anomaly roll is identical between the two
    // calls — only terrain height differs — isolating the monotonic base
    // formula from the sparse anomaly overlay.
    let previous = -Infinity
    for (const terrainHeight of [-5, 0, 5, 10, 20, 40, 100]) {
      const result = resolveWellWater(7, 1, 1, terrainHeight, 0)
      if (result.kind === 'groundwater') {
        expect(result.depth).toBeGreaterThanOrEqual(previous)
        previous = result.depth
      }
    }
  })

  it('can resolve to a reservoir or underground_stream anomaly, still deterministically', () => {
    const kinds = new Set(
      Array.from({ length: 200 }, (_, seed) => resolveWellWater(seed, 0, 0, 5, 0).kind),
    )
    expect(kinds.has('groundwater')).toBe(true)
    expect(kinds.has('reservoir') || kinds.has('underground_stream')).toBe(true)
  })

  it('never calls Math.random (same result regardless of ambient RNG state)', () => {
    const before = resolveWellWater(99, 3, 3, 6, 0)
    Math.random()
    Math.random()
    const after = resolveWellWater(99, 3, 3, 6, 0)
    expect(after).toEqual(before)
  })
})

describe('isDeepWellDepth', () => {
  it('is false below the threshold, true at and above it', () => {
    expect(isDeepWellDepth(DEEP_WELL_DEPTH_THRESHOLD - 0.01)).toBe(false)
    expect(isDeepWellDepth(DEEP_WELL_DEPTH_THRESHOLD)).toBe(true)
    expect(isDeepWellDepth(DEEP_WELL_DEPTH_THRESHOLD + 5)).toBe(true)
  })
})
