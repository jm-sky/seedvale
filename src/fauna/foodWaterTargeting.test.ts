import { describe, expect, it } from 'vitest'
import { forageEdgeScore, shoreProbeHits } from './AnimalAgent'

describe('shoreProbeHits (plan 094)', () => {
  const flatAt = (h: number) => () => h

  it('is 0 for a point far from any water (all probes above threshold)', () => {
    expect(shoreProbeHits(0, 0, flatAt(10), 0)).toBe(0)
  })

  it('is 4 for a point fully submerged (all probes at/below threshold)', () => {
    expect(shoreProbeHits(0, 0, flatAt(-1), 0)).toBe(4)
  })

  it('is between 0 and 4 for a point straddling the shoreline', () => {
    // Water to the +x side only, dry land to -x/+z/-z.
    const sampleHeight = (x: number) => (x > 0 ? -1 : 10)
    const hits = shoreProbeHits(0, 0, sampleHeight, 0)
    expect(hits).toBeGreaterThan(0)
    expect(hits).toBeLessThan(4)
  })
})

describe('forageEdgeScore (plan 094)', () => {
  it('peaks at forest-edge density (0.45)', () => {
    expect(forageEdgeScore(0.45)).toBe(1)
  })

  it('is lower for open meadow (low forestFactor) than for forest edge', () => {
    expect(forageEdgeScore(0)).toBeLessThan(forageEdgeScore(0.45))
  })

  it('is lower for deep forest (high forestFactor) than for forest edge', () => {
    expect(forageEdgeScore(1)).toBeLessThan(forageEdgeScore(0.45))
  })

  it('never goes negative', () => {
    expect(forageEdgeScore(0)).toBeGreaterThanOrEqual(0)
    expect(forageEdgeScore(1)).toBeGreaterThanOrEqual(0)
  })
})
