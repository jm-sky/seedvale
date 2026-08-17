import { describe, expect, it } from 'vitest'
import { corpseLingerSeconds, HARVESTED_REMAINS_LINGER_SECONDS } from './AnimalAgent'
import {
  createHarvestedRemains,
  largeBoneCount,
  meatScrapCount,
} from './harvestedRemains'

describe('corpseLingerSeconds (plan 137)', () => {
  it('uses the harvested remains TTL after a knife harvest, not the leftover 60s corpse linger', () => {
    expect(corpseLingerSeconds(false)).toBe(60)
    expect(corpseLingerSeconds(true)).toBe(HARVESTED_REMAINS_LINGER_SECONDS)
    expect(HARVESTED_REMAINS_LINGER_SECONDS).toBe(90)
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
