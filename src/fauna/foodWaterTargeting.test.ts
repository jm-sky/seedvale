import { describe, expect, it } from 'vitest'
import { forageEdgeScore, isCarcassEdible, nearestShoreProbePoint, shoreProbeHits } from './AnimalAgent'

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

describe('nearestShoreProbePoint (plan ui-input-006 ocean fishing fix)', () => {
  const flatAt = (h: number) => () => h

  it('is null for a point far from any water', () => {
    expect(nearestShoreProbePoint(5, -5, flatAt(10), 0)).toBeNull()
  })

  it('returns a real point distinct from the query position when water is nearby', () => {
    const point = nearestShoreProbePoint(5, -5, flatAt(-1), 0)
    expect(point).not.toBeNull()
    expect(point).not.toEqual({ x: 5, z: -5 })
    // Must be one of the actual probe offsets, not an arbitrary point.
    expect(Math.hypot(point!.x - 5, point!.z - (-5))).toBeCloseTo(1.5, 5)
  })

  it('only returns a point that actually reads as water', () => {
    // Water only on the +x side.
    const sampleHeight = (x: number) => (x > 5 ? -1 : 10)
    const point = nearestShoreProbePoint(5, 0, sampleHeight, 0)
    expect(point).toEqual({ x: 6.5, z: 0 })
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

describe('isCarcassEdible (plan 094)', () => {
  const eater = { id: 'wolf-a' }
  const other = { id: 'wolf-b' }

  it('allows an unclaimed dead prey that has not expired or been eaten', () => {
    expect(isCarcassEdible({
      dead: true,
      expired: false,
      consumed: false,
      claimedBy: null,
      eater,
    })).toBe(true)
  })

  it('allows the predator that already claimed the corpse', () => {
    expect(isCarcassEdible({
      dead: true,
      expired: false,
      consumed: false,
      claimedBy: eater,
      eater,
    })).toBe(true)
  })

  it('rejects a corpse claimed by another predator', () => {
    expect(isCarcassEdible({
      dead: true,
      expired: false,
      consumed: false,
      claimedBy: other,
      eater,
    })).toBe(false)
  })

  it('rejects a corpse after a completed eat, even for the original eater', () => {
    expect(isCarcassEdible({
      dead: true,
      expired: false,
      consumed: true,
      claimedBy: null,
      eater,
    })).toBe(false)
  })

  it('rejects a knife-harvested carcass — remains are not food (plan 137)', () => {
    expect(isCarcassEdible({
      dead: true,
      expired: false,
      consumed: false,
      harvested: true,
      claimedBy: null,
      eater,
    })).toBe(false)
  })

  it('rejects live or expired bodies', () => {
    expect(isCarcassEdible({
      dead: false,
      expired: false,
      consumed: false,
      claimedBy: null,
      eater,
    })).toBe(false)
    expect(isCarcassEdible({
      dead: true,
      expired: true,
      consumed: false,
      claimedBy: null,
      eater,
    })).toBe(false)
  })
})
