/** Plan world-terrain-017 — bounded massif suitability vs isolated/steep/wet terrain. */

import { describe, expect, it } from 'vitest'
import {
  collectSuitableMassifs,
  evaluateMassifSuitability,
  MASSIF_CONTEXT_RADIUS,
  MASSIF_SAMPLE_RADIUS,
  type MassifSampleFns,
} from './mountainMassif'

function samples(opts: {
  ridgeAt: (x: number, z: number) => number
  heightAt: (x: number, z: number) => number
  floorAt?: (x: number, z: number) => number
  waterLevel?: number
}): MassifSampleFns {
  return {
    sampleMountainRidge: opts.ridgeAt,
    sampleHeight: opts.heightAt,
    sampleFloor: opts.floorAt,
    waterLevel: opts.waterLevel ?? 0,
  }
}

describe('evaluateMassifSuitability', () => {
  it('accepts a coherent elevated mountain neighbourhood', () => {
    const s = samples({
      ridgeAt: () => 0.55,
      heightAt: (x, z) => {
        const dist = Math.hypot(x, z)
        return dist > MASSIF_SAMPLE_RADIUS + 20 ? 8 : 28
      },
    })
    const result = evaluateMassifSuitability(0, 0, s)
    expect(result.suitable).toBe(true)
    expect(result.reason).toBe('suitable')
    expect(result.mountainFraction).toBeGreaterThan(0.9)
    expect(result.score).toBeGreaterThan(0)
  })

  it('rejects an isolated hill with weak ridge and small extent', () => {
    const s = samples({
      ridgeAt: (x, z) => (Math.hypot(x, z) < 8 ? 0.22 : 0.02),
      heightAt: (x, z) => (Math.hypot(x, z) < 8 ? 12 : 10),
    })
    const result = evaluateMassifSuitability(0, 0, s)
    expect(result.suitable).toBe(false)
    expect(result.reason).toBe('isolated-hill')
  })

  it('rejects a steep lowland bank with high relief but no mountain ridge', () => {
    const s = samples({
      ridgeAt: () => 0.04,
      heightAt: (x) => 4 + x * 0.4,
    })
    const result = evaluateMassifSuitability(0, 0, s)
    expect(result.suitable).toBe(false)
    expect(result.reason).toBe('steep-lowland')
  })

  it('rejects a wet river bank even when locally steep', () => {
    const s = samples({
      ridgeAt: () => 0.12,
      heightAt: (x) => 3 + Math.abs(x) * 0.2,
      floorAt: () => -1,
      waterLevel: 0.45,
    })
    const result = evaluateMassifSuitability(0, 0, s)
    expect(result.suitable).toBe(false)
    expect(result.reason).toBe('wet-bank')
  })

  it('is deterministic for the same candidate and samplers', () => {
    const s = samples({
      ridgeAt: (x, z) => 0.4 + (x + z) * 0.0001,
      heightAt: (x, z) => 22 + Math.sin(x * 0.01) + Math.cos(z * 0.01),
    })
    expect(evaluateMassifSuitability(40, -30, s)).toEqual(evaluateMassifSuitability(40, -30, s))
  })
})

describe('collectSuitableMassifs', () => {
  it('returns no hits when the envelope is uniformly lowland', () => {
    const s = samples({
      ridgeAt: () => 0.02,
      heightAt: () => 6,
    })
    expect(collectSuitableMassifs({ minDist: 180, maxDist: 400 }, s)).toEqual([])
  })

  it('finds the elevated ridge patch inside a mixed envelope', () => {
    const s = samples({
      ridgeAt: (x, z) => {
        const dist = Math.hypot(x - 300, z)
        return dist < MASSIF_SAMPLE_RADIUS ? 0.6 : 0.03
      },
      heightAt: (x, z) => {
        const dist = Math.hypot(x - 300, z)
        return dist < MASSIF_CONTEXT_RADIUS ? 30 : 8
      },
    })
    const hits = collectSuitableMassifs({ minDist: 180, maxDist: 420 }, s)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.evaluation.suitable)).toBe(true)
    expect(hits[0]!.evaluation.score).toBeGreaterThanOrEqual(hits[hits.length - 1]!.evaluation.score)
  })
})
