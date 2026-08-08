import { describe, expect, it } from 'vitest'
import { generateFamilies, rollVillageSize } from './families'

describe('rollVillageSize', () => {
  it('is deterministic for the same terrain/seed', () => {
    expect(rollVillageSize('forest', 12345)).toBe(rollVillageSize('forest', 12345))
    expect(rollVillageSize('mountain', 999)).toBe(rollVillageSize('mountain', 999))
  })

  it('biases mountain/desert toward SM more than forest', () => {
    const sizesFor = (terrain: 'forest' | 'mountain') => {
      const counts = { SM: 0, MD: 0, LG: 0 }
      for (let seed = 0; seed < 500; seed++) counts[rollVillageSize(terrain, seed)]++
      return counts
    }
    const forest = sizesFor('forest')
    const mountain = sizesFor('mountain')
    expect(mountain.SM).toBeGreaterThan(forest.SM)
    expect(forest.LG).toBeGreaterThan(mountain.LG)
  })
})

describe('generateFamilies', () => {
  it('is deterministic for the same inputs', () => {
    const a = generateFamilies(42, 'MD', false, 'polish')
    const b = generateFamilies(42, 'MD', false, 'polish')
    expect(a).toEqual(b)
  })

  it('guarantees the 2 reserved families (Anna/Piotr, Kasia/Marek) for the home settlement', () => {
    for (const size of ['SM', 'MD', 'LG'] as const) {
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
})
