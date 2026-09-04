import { describe, expect, it } from 'vitest'
import {
  depleteGrassPatch,
  GRASS_REGROWTH_DAYS,
  type GrassForageOverrides,
  grassPatchCandidate,
  grassPatchCandidatesNear,
  grassPatchCellCoord,
  isGrassPatchAvailable,
  pruneGrassForageOverrides,
} from './grassForage'

describe('grassPatchCandidate (plan fauna-010 §3)', () => {
  it('is deterministic — same (cx, cz, seed) always yields the same result', () => {
    const a = grassPatchCandidate(3, -2, 42)
    const b = grassPatchCandidate(3, -2, 42)
    expect(a).toEqual(b)
  })

  it('a different seed can change whether/where a cell holds a patch', () => {
    const results = new Set<string>()
    for (let seed = 0; seed < 20; seed++) {
      results.add(JSON.stringify(grassPatchCandidate(0, 0, seed)))
    }
    expect(results.size).toBeGreaterThan(1)
  })

  it('a patch position stays inside its own cell plus jitter', () => {
    const candidate = grassPatchCandidate(10, 10, 1)
    if (!candidate) return
    const cell = grassPatchCellCoord(candidate.x, candidate.z)
    expect(cell).toEqual({ cx: 10, cz: 10 })
  })
})

describe('grassPatchCandidatesNear (plan fauna-010 §3/§4)', () => {
  it('only returns candidates within radius of the query point', () => {
    const candidates = grassPatchCandidatesNear(0, 0, 20, 7)
    for (const c of candidates) {
      expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(20)
    }
  })

  it('applies the caller-supplied terrain suitability filter', () => {
    const unfiltered = grassPatchCandidatesNear(0, 0, 30, 7)
    const filtered = grassPatchCandidatesNear(0, 0, 30, 7, () => false)
    expect(unfiltered.length).toBeGreaterThan(0)
    expect(filtered.length).toBe(0)
  })

  it('is a small scattered set, not every cell in range (plan "Performance")', () => {
    const candidates = grassPatchCandidatesNear(0, 0, 40, 7)
    // 40m radius at 5m cells is up to ~16x16=256 cells; the exists-chance
    // (0.35) keeps the actual set well below that.
    expect(candidates.length).toBeLessThan(150)
  })
})

describe('grass forage depletion overrides (plan fauna-010 §3/§4)', () => {
  it('an id absent from overrides is available', () => {
    const overrides: GrassForageOverrides = {}
    expect(isGrassPatchAvailable(overrides, 'gf:1:1', 5)).toBe(true)
  })

  it('depleteGrassPatch marks it unavailable until nowDays + GRASS_REGROWTH_DAYS', () => {
    const overrides: GrassForageOverrides = {}
    expect(depleteGrassPatch(overrides, 'gf:1:1', 10)).toBe(true)
    expect(isGrassPatchAvailable(overrides, 'gf:1:1', 10)).toBe(false)
    expect(isGrassPatchAvailable(overrides, 'gf:1:1', 10 + GRASS_REGROWTH_DAYS - 0.01)).toBe(false)
    expect(isGrassPatchAvailable(overrides, 'gf:1:1', 10 + GRASS_REGROWTH_DAYS)).toBe(true)
  })

  it('two competitors racing for one patch: the first consume wins, the second fails cleanly', () => {
    const overrides: GrassForageOverrides = {}
    expect(depleteGrassPatch(overrides, 'gf:1:1', 10)).toBe(true)
    expect(depleteGrassPatch(overrides, 'gf:1:1', 10)).toBe(false)
  })

  it('pruneGrassForageOverrides drops entries that have regrown', () => {
    const overrides: GrassForageOverrides = { 'gf:1:1': 10, 'gf:2:2': 100 }
    pruneGrassForageOverrides(overrides, 10)
    expect(overrides['gf:1:1']).toBeUndefined()
    expect(overrides['gf:2:2']).toBe(100)
  })
})
