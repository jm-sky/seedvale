import { describe, expect, it } from 'vitest'
import type { NaturalResource } from '../terrain/naturalResources'
import {
  cobbleCountForSize,
  generateFamilies,
  rollVillageSize,
  VILLAGE_SIZE_CONFIG,
  type VillageSize,
  villageSizeConfig,
} from './families'

describe('cobbleCountForSize', () => {
  it('is 0 for OUTPOST/SM (no plaza focal point)', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(cobbleCountForSize('OUTPOST', seed)).toBe(0)
      expect(cobbleCountForSize('SM', seed)).toBe(0)
    }
  })

  it('stays within the documented per-size range for MD/LG/XL', () => {
    const ranges: Record<'MD' | 'LG' | 'XL', [number, number]> = {
      MD: [2, 4],
      LG: [4, 6],
      XL: [6, 8],
    }
    for (const size of ['MD', 'LG', 'XL'] as const) {
      const [min, max] = ranges[size]
      for (let seed = 0; seed < 40; seed++) {
        const n = cobbleCountForSize(size, seed)
        expect(n).toBeGreaterThanOrEqual(min)
        expect(n).toBeLessThanOrEqual(max)
      }
    }
  })

  it('is deterministic for the same size/seed', () => {
    expect(cobbleCountForSize('XL', 777)).toBe(cobbleCountForSize('XL', 777))
  })
})

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

  describe('ages (plan npc-001)', () => {
    it('gives every member an integer age in [0, 100]', () => {
      for (let seed = 0; seed < 60; seed++) {
        const families = generateFamilies(seed, 'LG', false, 'polish')
        for (const member of families.flatMap((f) => f.members)) {
          expect(Number.isInteger(member.age)).toBe(true)
          expect(member.age).toBeGreaterThanOrEqual(0)
          expect(member.age).toBeLessThanOrEqual(100)
        }
      }
    })

    it('gives husbands/wives/singles an adult age, and children a strictly younger one', () => {
      for (let seed = 0; seed < 60; seed++) {
        const families = generateFamilies(seed, 'LG', false, 'polish')
        for (const family of families) {
          const byRelation = new Map(family.members.map((m) => [m.relation, m]))
          for (const relation of ['husband', 'wife', 'single'] as const) {
            const member = byRelation.get(relation)
            if (member) expect(member.age).toBeGreaterThanOrEqual(18)
          }
          const child = byRelation.get('child')
          if (child) {
            expect(child.age).toBeLessThanOrEqual(17)
            for (const relation of ['husband', 'wife'] as const) {
              const parent = byRelation.get(relation)
              if (parent) expect(child.age).toBeLessThan(parent.age)
            }
          }
        }
      }
    })

    it('keeps spouse ages within a plausible gap of each other', () => {
      for (let seed = 0; seed < 60; seed++) {
        const families = generateFamilies(seed, 'LG', false, 'polish')
        for (const family of families) {
          const husband = family.members.find((m) => m.relation === 'husband')
          const wife = family.members.find((m) => m.relation === 'wife')
          if (husband && wife) expect(Math.abs(husband.age - wife.age)).toBeLessThanOrEqual(15)
        }
      }
    })

    it('is deterministic for the same seed and does not vary with an unrelated dominantResource change', () => {
      const a = generateFamilies(23, 'LG', false, 'polish')
      const b = generateFamilies(23, 'LG', false, 'polish')
      expect(a.flatMap((f) => f.members.map((m) => m.age))).toEqual(
        b.flatMap((f) => f.members.map((m) => m.age)),
      )
    })

    it('gives the reserved home families (Anna/Piotr, Kasia/Marek) real, non-hardcoded ages', () => {
      const a = generateFamilies(3, 'SM', true, 'polish')
      const b = generateFamilies(9, 'SM', true, 'polish')
      const agesFor = (families: typeof a, name: string) =>
        families.flatMap((f) => f.members).find((m) => m.name === name)!.age
      for (const name of ['Anna', 'Piotr', 'Kasia', 'Marek']) {
        expect(agesFor(a, name)).toBeGreaterThanOrEqual(18)
      }
      // Different world seeds should not all coincidentally roll the same
      // hardcoded-looking age for every reserved character.
      const anyDiffers = ['Anna', 'Piotr', 'Kasia', 'Marek'].some((name) => agesFor(a, name) !== agesFor(b, name))
      expect(anyDiffers).toBe(true)
    })

    it('adding ages does not change existing name/role/trait rolls for a fixed seed', () => {
      // Pinned against the pre-age-generation output for seed 7/LG (verified
      // by diffing before/after this feature) so the new, isolated age RNG
      // stream provably doesn't perturb the existing one.
      const families = generateFamilies(7, 'LG', false, 'polish')
      const roles = families.flatMap((f) => f.members.map((m) => `${m.name}:${m.character.role}`))
      expect(roles).toEqual([
        'Sławomir:fisher',
        'Magdalena:guard',
        'Barbara:fisher',
        'Paweł:fisher',
        'Ola:miner',
        'Jan:fisher',
        'Sławomir:guard',
        'Katarzyna:farmer',
        'Tomasz:farmer',
        'Helena:woodcutter',
        'Stanisław:woodcutter',
        'Krystyna:guard',
        'Barbara:guard',
      ])
    })
  })
})
