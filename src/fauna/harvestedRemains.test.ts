import { describe, expect, it } from 'vitest'
import { CORPSE_REMOVE_DAYS, corpseLingerDays, HARVESTED_REMAINS_LINGER_DAYS } from './animalCorpse'
import {
  createHarvestedRemains,
  largeBoneCount,
  meatScrapCount,
} from './harvestedRemains'

describe('corpseLingerDays (plan fauna-029)', () => {
  it('uses a short harvested-remains linger distinct from the natural corpse clock', () => {
    expect(corpseLingerDays(false)).toBe(CORPSE_REMOVE_DAYS)
    expect(corpseLingerDays(true)).toBe(HARVESTED_REMAINS_LINGER_DAYS)
    expect(HARVESTED_REMAINS_LINGER_DAYS).toBeLessThan(CORPSE_REMOVE_DAYS)
  })
})

describe('createHarvestedRemains (sync fallback)', () => {
  it('builds a non-empty pile of bones, meat scraps and hide', () => {
    const remains = createHarvestedRemains('deer', 1.1)
    expect(remains.name).toBe('harvested-remains')
    expect(remains.children.length).toBeGreaterThanOrEqual(5)
  })

  it('scales down for small animals without dropping below a visible pile', () => {
    const remains = createHarvestedRemains('rabbit', 0.25)
    expect(remains.children.length).toBeGreaterThanOrEqual(4)
  })
})

describe('harvested remains GLB composition (plan 138)', () => {
  it('uses two large bones for deer/stag/boar/livestock and one for small animals', () => {
    expect(largeBoneCount('deer')).toBe(2)
    expect(largeBoneCount('stag')).toBe(2)
    expect(largeBoneCount('boar')).toBe(2)
    expect(largeBoneCount('cow')).toBe(2)
    expect(largeBoneCount('rabbit')).toBe(1)
    expect(largeBoneCount('chicken')).toBe(1)
    expect(largeBoneCount('wolf')).toBe(1)
  })

  it('always places two meat scraps and adds extras for larger animals, capped at 4', () => {
    expect(meatScrapCount(0.25)).toBe(2)
    expect(meatScrapCount(0.6)).toBe(3)
    expect(meatScrapCount(1.1)).toBe(4)
  })
})
