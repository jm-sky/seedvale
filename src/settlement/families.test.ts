import { describe, expect, it } from 'vitest'
import type { NaturalResource } from '../terrain/naturalResources'
import {
  generateFamilies,
  rollVillageSize,
  VILLAGE_SIZE_CONFIG,
  type VillageSize,
  villageSizeConfig,
} from './families'

describe('rollVillageSize', () => {
  it('is deterministic for the same terrain/seed', () => {
    expect(rollVillageSize('forest', 12345)).toBe(rollVillageSize('forest', 12345))
    expect(rollVillageSize('mountain', 999)).toBe(rollVillageSize('mountain', 999))
  })

  it('biases mountain/desert toward SM more than forest', () => {
    const sizesFor = (terrain: 'forest' | 'mountain') => {
      const counts = { SM: 0, MD: 0, LG: 0, XL: 0 }
      for (let seed = 0; seed < 500; seed++) counts[rollVillageSize(terrain, seed)]++
      return counts
    }
    const forest = sizesFor('forest')
    const mountain = sizesFor('mountain')
    expect(mountain.SM).toBeGreaterThan(forest.SM)
    expect(forest.LG + forest.XL).toBeGreaterThan(mountain.LG + mountain.XL)
  })

  it('can roll XL and never returns OUTPOST', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 2000; seed++) {
      const size = rollVillageSize('forest', seed)
      seen.add(size)
      expect(size).not.toBe('OUTPOST')
    }
    expect(seen.has('XL')).toBe(true)
  })
})

describe('VILLAGE_SIZE_CONFIG (plan 047)', () => {
  it('defines every VillageSize including XL and OUTPOST', () => {
    const sizes: VillageSize[] = ['OUTPOST', 'SM', 'MD', 'LG', 'XL']
    for (const size of sizes) {
      expect(VILLAGE_SIZE_CONFIG[size]).toBeDefined()
      expect(villageSizeConfig(size)).toBe(VILLAGE_SIZE_CONFIG[size])
    }
  })

  it('makes XL materially larger than LG', () => {
    const lg = villageSizeConfig('LG')
    const xl = villageSizeConfig('XL')
    expect(xl.footprintRadius).toBeGreaterThan(lg.footprintRadius)
    expect(xl.houseRingMax).toBeGreaterThan(lg.houseRingMax)
    expect(xl.familyCount[0]).toBeGreaterThanOrEqual(lg.familyCount[0])
    expect(xl.familyCount[1]).toBeGreaterThan(lg.familyCount[1])
    expect(xl.pathDensity).toBeGreaterThan(lg.pathDensity)
  })

  it('keeps OUTPOST minimal (no campfire/market, tiny footprint)', () => {
    const outpost = villageSizeConfig('OUTPOST')
    expect(outpost.familyCount).toEqual([1, 1])
    expect(outpost.infrastructure.campfires).toBe(0)
    expect(outpost.infrastructure.markets).toBe(0)
    expect(outpost.infrastructure.stockpiles).toBe(1)
    expect(outpost.footprintRadius).toBeLessThan(villageSizeConfig('SM').footprintRadius)
  })
})

describe('generateFamilies', () => {
  it('is deterministic for the same inputs', () => {
    const a = generateFamilies(42, 'MD', false, 'polish')
    const b = generateFamilies(42, 'MD', false, 'polish')
    expect(a).toEqual(b)
  })

  it('guarantees the 2 reserved families (Anna/Piotr, Kasia/Marek) for the home settlement', () => {
    for (const size of ['SM', 'MD', 'LG', 'XL'] as const) {
      const families = generateFamilies(7, size, true, 'polish')
      const names = families.flatMap((f) => f.members.map((m) => m.name))
      expect(names).toContain('Anna')
      expect(names).toContain('Piotr')
      expect(names).toContain('Kasia')
      expect(names).toContain('Marek')
      expect(families.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('never reserves names for non-home settlements', () => {
    const families = generateFamilies(7, 'LG', false, 'polish')
    // Not a guarantee any of the reserved names appear at all — just that
    // the reserved-family roster isn't force-injected the way it is for isHome.
    expect(families.every((f) => !f.id.startsWith('family-reserved'))).toBe(true)
  })

  it('home has exactly one trader (Kasia); other settlements never roll trader (plan 090)', () => {
    const home = generateFamilies(7, 'XL', true, 'polish')
    const homeTraders = home.flatMap((f) => f.members).filter((m) => m.character.role === 'trader')
    expect(homeTraders).toHaveLength(1)
    expect(homeTraders[0]!.name).toBe('Kasia')
    for (let seed = 0; seed < 40; seed++) {
      const families = generateFamilies(seed, 'XL', false, 'polish')
      expect(families.flatMap((f) => f.members).every((m) => m.character.role !== 'trader')).toBe(true)
    }
  })

  it('every family has 1-3 members with a sensible relation shape', () => {
    for (let seed = 0; seed < 50; seed++) {
      const families = generateFamilies(seed, 'LG', false, 'polish')
      for (const family of families) {
        expect(family.members.length).toBeGreaterThanOrEqual(1)
        expect(family.members.length).toBeLessThanOrEqual(3)
        if (family.members.length === 1) {
          expect(family.members[0]!.relation).toBe('single')
        } else {
          const relations = new Set(family.members.map((m) => m.relation))
          expect(relations.has('husband')).toBe(true)
          expect(relations.has('wife')).toBe(true)
          if (family.members.length === 3) expect(relations.has('child')).toBe(true)
        }
      }
    }
  })

  it('gives every member a scale of 1 except children, who fall in [0.5, 0.8]', () => {
    for (let seed = 0; seed < 50; seed++) {
      const families = generateFamilies(seed, 'LG', false, 'polish')
      for (const member of families.flatMap((f) => f.members)) {
        if (member.relation === 'child') {
          expect(member.scale).toBeGreaterThanOrEqual(0.5)
          expect(member.scale).toBeLessThanOrEqual(0.8)
        } else {
          expect(member.scale).toBe(1)
        }
      }
    }
  })

  it('XL yields more families on average than LG for the same seeds', () => {
    let lgTotal = 0
    let xlTotal = 0
    for (let seed = 0; seed < 80; seed++) {
      lgTotal += generateFamilies(seed, 'LG', false, 'polish').length
      xlTotal += generateFamilies(seed, 'XL', false, 'polish').length
    }
    expect(xlTotal).toBeGreaterThan(lgTotal)
  })

  describe('dominantResource (plan 032)', () => {
    const ironDeposit: NaturalResource = { id: 'r1', type: 'iron', x: 0, z: 0, radius: 10, richness: 0.9 }
    const faintDeposit: NaturalResource = { id: 'r2', type: 'iron', x: 0, z: 0, radius: 10, richness: 0.1 }
    const unmappedDeposit: NaturalResource = { id: 'r3', type: 'herbs', x: 0, z: 0, radius: 10, richness: 0.9 }

    it('adds one extra dedicated-role family on top of the normal roster when the resource is significant', () => {
      const without = generateFamilies(11, 'MD', false, 'polish')
      const withResource = generateFamilies(11, 'MD', false, 'polish', ironDeposit)
      expect(withResource.length).toBe(without.length + 1)
      const dedicated = withResource[withResource.length - 1]!
      expect(dedicated.members.some((m) => m.character.role === 'miner')).toBe(true)
    })

    it('does not add a dedicated family when the resource is below the significance threshold', () => {
      const without = generateFamilies(11, 'MD', false, 'polish')
      const withFaint = generateFamilies(11, 'MD', false, 'polish', faintDeposit)
      expect(withFaint.length).toBe(without.length)
    })

    it('does not add a dedicated family for a resource type with no role mapping', () => {
      const without = generateFamilies(11, 'MD', false, 'polish')
      const withUnmapped = generateFamilies(11, 'MD', false, 'polish', unmappedDeposit)
      expect(withUnmapped.length).toBe(without.length)
    })

    it('OUTPOST size produces exactly one single-member family with the resource-forced role', () => {
      const outpost = generateFamilies(5, 'OUTPOST', false, 'polish', ironDeposit)
      expect(outpost.length).toBe(1)
      expect(outpost[0]!.members.length).toBe(1)
      expect(outpost[0]!.members[0]!.relation).toBe('single')
      expect(outpost[0]!.members[0]!.character.role).toBe('miner')
    })

    it('is deterministic including the dominantResource input', () => {
      const a = generateFamilies(11, 'MD', false, 'polish', ironDeposit)
      const b = generateFamilies(11, 'MD', false, 'polish', ironDeposit)
      expect(a).toEqual(b)
    })
  })
})
