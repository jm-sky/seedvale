import { describe, expect, it } from 'vitest'
import {
  averageAbsHeightDelta,
  computeRequiredWork,
  exceedsMaxDeformation,
  MAX_PREPARATION_DELTA,
  MINIMUM_PREPARATION_WORK_HOURS,
  nearestGridPoint,
  preparationSamplesPerSide,
  progressiveHeight,
  progressiveHeights,
  resolveLevelSamples,
  resolvePreparationSamples,
  toolSpeedMultiplier,
  validatePreparationSamples,
} from './terrainPreparation'

// step = chunkSize/(resolution-1) = 32/8 = 4 — easy to reason about by hand.
const CHUNK_SIZE = 32
const RESOLUTION = 9

describe('nearestGridPoint / resolveLevelSamples', () => {
  it('snaps to the nearest grid vertex', () => {
    const p = nearestGridPoint(5.1, -1.9, CHUNK_SIZE, RESOLUTION)
    expect(p.x % 4).toBeCloseTo(0, 5)
    expect(p.z % 4).toBeCloseTo(0, 5)
  })

  it('always resolves exactly 9 samples centered on the nearest vertex', () => {
    const samples = resolveLevelSamples(5, 5, CHUNK_SIZE, RESOLUTION)
    expect(samples).toHaveLength(9)
    const center = nearestGridPoint(5, 5, CHUNK_SIZE, RESOLUTION)
    expect(samples).toContainEqual(center)
  })
})

describe('resolvePreparationSamples', () => {
  it('resolves a world-space area to the terrain grid, not a fixed sample count', () => {
    // step 1 (chunkSize/(resolution-1) = 32/32) — fine enough that 2m/4m
    // footprints actually resolve to different sample counts.
    const fineResolution = 33
    const twoByTwo = resolvePreparationSamples(0, 0, 2, CHUNK_SIZE, fineResolution)
    const fourByFour = resolvePreparationSamples(0, 0, 4, CHUNK_SIZE, fineResolution)
    expect(fourByFour.samples.length).toBeGreaterThan(twoByTwo.samples.length)
  })

  it('scales the sample count with configured resolution (finer step -> more samples for the same metre size)', () => {
    const coarse = resolvePreparationSamples(0, 0, 4, CHUNK_SIZE, 9) // step 4
    const fine = resolvePreparationSamples(0, 0, 4, CHUNK_SIZE, 33) // step 1
    expect(preparationSamplesPerSide(4, CHUNK_SIZE, 33)).toBeGreaterThan(preparationSamplesPerSide(4, CHUNK_SIZE, 9))
    expect(fine.samples.length).toBeGreaterThan(coarse.samples.length)
  })

  it('center is grid-aligned', () => {
    const { center } = resolvePreparationSamples(1, 1, 3, CHUNK_SIZE, RESOLUTION)
    expect(center.x % 4).toBeCloseTo(0, 5)
    expect(center.z % 4).toBeCloseTo(0, 5)
  })
})

describe('exceedsMaxDeformation', () => {
  it('rejects when any sample would need more than MAX_PREPARATION_DELTA of change', () => {
    const originals = [{ x: 0, z: 0, height: 10 }, { x: 4, z: 0, height: 10 + MAX_PREPARATION_DELTA + 0.5 }]
    expect(exceedsMaxDeformation(originals, 10)).toBe(true)
  })

  it('allows exactly MAX_PREPARATION_DELTA', () => {
    const originals = [{ x: 0, z: 0, height: 10 }, { x: 4, z: 0, height: 10 + MAX_PREPARATION_DELTA }]
    expect(exceedsMaxDeformation(originals, 10)).toBe(false)
  })
})

describe('computeRequiredWork', () => {
  it('has a minimum-work floor for a tiny/flat area', () => {
    expect(computeRequiredWork(4, 0)).toBe(MINIMUM_PREPARATION_WORK_HOURS)
  })

  it('scales up with area and height delta beyond the floor', () => {
    const small = computeRequiredWork(4, 2)
    const large = computeRequiredWork(16, 2)
    expect(large).toBeGreaterThan(small)
  })
})

describe('averageAbsHeightDelta', () => {
  it('treats cut and fill symmetrically (magnitude only)', () => {
    const cut = averageAbsHeightDelta([{ x: 0, z: 0, height: 12 }], 10) // lowering by 2
    const fill = averageAbsHeightDelta([{ x: 0, z: 0, height: 8 }], 10) // raising by 2
    expect(cut).toBeCloseTo(2, 5)
    expect(fill).toBeCloseTo(2, 5)
  })
})

describe('toolSpeedMultiplier', () => {
  it('is additive and deterministic', () => {
    expect(toolSpeedMultiplier(false, false)).toBeCloseTo(1.0, 5)
    expect(toolSpeedMultiplier(true, false)).toBeCloseTo(1.05, 5)
    expect(toolSpeedMultiplier(false, true)).toBeCloseTo(1.1, 5)
    expect(toolSpeedMultiplier(true, true)).toBeCloseTo(1.15, 5)
  })
})

describe('progressiveHeight / progressiveHeights', () => {
  it('produces exact interpolation at 0 / 0.5 / 1', () => {
    expect(progressiveHeight(10, 14, 0)).toBeCloseTo(10, 5)
    expect(progressiveHeight(10, 14, 0.5)).toBeCloseTo(12, 5)
    expect(progressiveHeight(10, 14, 1)).toBeCloseTo(14, 5)
  })

  it('is idempotent — repeated calls at the same progress give the same result', () => {
    const a = progressiveHeight(10, 14, 0.37)
    const b = progressiveHeight(10, 14, 0.37)
    expect(a).toBe(b)
  })

  it('interruption/resume reproduces the exact same height an uninterrupted run would reach', () => {
    const originals = [{ x: 0, z: 0, height: 10 }, { x: 4, z: 0, height: 8 }]
    const uninterrupted = progressiveHeights(originals, 14, 0.6)
    // Simulate stopping at 0.3, resuming, and separately re-deriving at 0.6 —
    // always from the immutable original, never accumulated.
    progressiveHeights(originals, 14, 0.3)
    const resumed = progressiveHeights(originals, 14, 0.6)
    expect(resumed).toEqual(uninterrupted)
  })

  it('always derives from the immutable original, never accumulates', () => {
    const originals = [{ x: 0, z: 0, height: 10 }]
    const first = progressiveHeights(originals, 20, 0.5)[0]!.height
    // A second call at the same progress must return the identical value,
    // not `first + delta` (which would indicate accumulation).
    const second = progressiveHeights(originals, 20, 0.5)[0]!.height
    expect(second).toBe(first)
  })
})

describe('validatePreparationSamples', () => {
  const env = { sampleHeight: () => 0, sampleMountainRidge: () => 0, waterLevel: 0, seed: 1 }

  it('rejects a sample too close to water', () => {
    const originals = [{ x: 0, z: 0, height: 0.5 }]
    const result = validatePreparationSamples(originals, 1, env)
    expect(result).toEqual({ ok: false, reason: 'water' })
  })

  it('rejects a deformation beyond the cap', () => {
    const originals = [{ x: 0, z: 0, height: 10 }]
    const result = validatePreparationSamples(originals, 10 + MAX_PREPARATION_DELTA + 1, env)
    expect(result).toEqual({ ok: false, reason: 'deformation' })
  })

  it('flags requiresPickaxe when any sample sits on mountain rock', () => {
    const originals = [{ x: 0, z: 0, height: 10 }]
    const rockyEnv = { ...env, sampleMountainRidge: () => 0.5 }
    const result = validatePreparationSamples(originals, 11, rockyEnv)
    expect(result).toEqual({ ok: true, requiresPickaxe: true })
  })

  it('accepts an ordinary, in-range preparation', () => {
    const originals = [{ x: 0, z: 0, height: 10 }, { x: 4, z: 0, height: 9 }]
    const result = validatePreparationSamples(originals, 10, env)
    expect(result).toEqual({ ok: true, requiresPickaxe: false })
  })
})
