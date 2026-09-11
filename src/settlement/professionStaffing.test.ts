import { describe, expect, it } from 'vitest'
import type { Role } from '../ai/characters'
import type { SettlementTerrain } from '../shared/SettlementName'
import type { NaturalResource, ResourceType } from '../terrain/naturalResources'
import type { FamilyDef, FamilyMember, VillageSize } from './families'
import type { FoodSourceType } from './villagePlan'
import { generateFamilies } from './families'
import {
  adultProfessionCoverage,
  isProfessionAdult,
  type ProfessionStaffingContext,
  resolveInitialProfessionStaffing,
  shepherdHouseholdIndex,
} from './professionStaffing'

const PERSONALITY = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
}

function resource(type: ResourceType, richness = 0.9): NaturalResource {
  return { id: `r-${type}`, type, x: 0, z: 0, radius: 10, richness }
}

function member(opts: {
  name: string
  role: Role
  age: number
  relation?: FamilyMember['relation']
  lastName?: string
  gender?: FamilyMember['character']['gender']
}): FamilyMember {
  const lastName = opts.lastName ?? 'Test'
  return {
    name: opts.name,
    lastName,
    relation: opts.relation ?? (opts.age < 18 ? 'child' : 'single'),
    character: {
      name: opts.name,
      lastName,
      gender: opts.gender ?? 'male',
      role: opts.role,
      personality: PERSONALITY,
      traits: ['curious'],
    },
    scale: opts.age < 18 ? 0.6 : 1,
    age: opts.age,
  }
}

function family(id: string, members: FamilyMember[]): FamilyDef {
  return { id, members }
}

function adults(count: number, role: Role = 'woodcutter'): FamilyDef[] {
  return Array.from({ length: count }, (_, i) => family(`family-${i}`, [
    member({ name: `A${i}`, role, age: 30 }),
  ]))
}

function staff(
  families: readonly FamilyDef[],
  overrides: Partial<ProfessionStaffingContext> = {},
): FamilyDef[] {
  const context: ProfessionStaffingContext = {
    size: overrides.size ?? 'MD',
    terrain: overrides.terrain ?? 'forest',
    foodSourceType: overrides.foodSourceType ?? 'garden',
    dominantResource: overrides.dominantResource === undefined ? null : overrides.dominantResource,
    isHome: overrides.isHome ?? false,
    seed: overrides.seed ?? 1,
  }
  return resolveInitialProfessionStaffing(families, context)
}

function adultRoles(families: readonly FamilyDef[]): Role[] {
  return families.flatMap((f) => f.members).filter(isProfessionAdult).map((m) => m.character.role)
}

function identityFingerprint(families: readonly FamilyDef[]) {
  return families.map((f) => ({
    id: f.id,
    members: f.members.map((m) => ({
      name: m.name,
      lastName: m.lastName,
      relation: m.relation,
      age: m.age,
      scale: m.scale,
      gender: m.character.gender,
      traits: m.character.traits,
      personality: m.character.personality,
    })),
  }))
}

function frequency(
  samples: number,
  build: (seed: number) => FamilyDef[],
  context: Omit<ProfessionStaffingContext, 'seed'>,
  role: Role,
): number {
  let hits = 0
  for (let seed = 0; seed < samples; seed++) {
    const coverage = adultProfessionCoverage(staff(build(seed), { ...context, seed }))
    if (coverage[role] > 0) hits++
  }
  return hits
}

describe('resolveInitialProfessionStaffing', () => {
  it('is deterministic for the same families and context', () => {
    const families = adults(7)
    const context: ProfessionStaffingContext = {
      size: 'LG',
      terrain: 'mountain',
      foodSourceType: 'garden',
      dominantResource: resource('iron'),
      isHome: false,
      seed: 42,
    }
    expect(resolveInitialProfessionStaffing(families, context)).toEqual(
      resolveInitialProfessionStaffing(families, context),
    )
  })

  it('does not change family structure, names, ages, traits or personality', () => {
    const families = [
      family('family-0', [
        member({ name: 'Jan', role: 'guard', age: 40, relation: 'husband' }),
        member({ name: 'Ewa', role: 'miner', age: 38, relation: 'wife', gender: 'female' }),
        member({ name: 'Ola', role: 'farmer', age: 8, relation: 'child', gender: 'female' }),
      ]),
      family('family-1', [member({ name: 'Bartek', role: 'blacksmith', age: 22 })]),
    ]
    const staffed = staff(families, { size: 'MD', foodSourceType: 'garden', seed: 9 })
    expect(identityFingerprint(staffed)).toEqual(identityFingerprint(families))
    expect(staffed.map((f) => f.id)).toEqual(families.map((f) => f.id))
    expect(staffed.flatMap((f) => f.members).map((m) => m.name)).toEqual(
      families.flatMap((f) => f.members).map((m) => m.name),
    )
  })

  it('does not use the family demographic RNG — leftover baseline roles are replaced independently', () => {
    const before = adults(4, 'blacksmith')
    const after = staff(before, { size: 'SM', foodSourceType: 'garden', seed: 3 })
    expect(adultProfessionCoverage(after).blacksmith).toBe(0)
    expect(adultProfessionCoverage(after).farmer).toBeGreaterThanOrEqual(1)
  })

  describe('scenario A — tiny garden settlement', () => {
    const context = {
      size: 'SM' as VillageSize,
      terrain: 'forest' as SettlementTerrain,
      foodSourceType: 'garden' as FoodSourceType,
      dominantResource: null,
    }

    it('covers food with Farmer and never rolls Trader or Blacksmith', () => {
      for (let seed = 0; seed < 40; seed++) {
        const roles = adultRoles(staff(adults(2), { ...context, seed }))
        expect(roles).toHaveLength(2)
        expect(roles[0]).toBe('farmer')
        expect(roles).not.toContain('trader')
        expect(roles).not.toContain('blacksmith')
        expect(roles).not.toContain('textile_worker')
      }
    })

    it('keeps deterministic variety on the second slot', () => {
      const rosters = new Set<string>()
      for (let seed = 0; seed < 60; seed++) {
        rosters.add(adultRoles(staff(adults(2), { ...context, seed })).join(','))
      }
      expect(rosters.size).toBeGreaterThan(1)
    })
  })

  describe('scenario B — fishing settlement', () => {
    const context = {
      size: 'MD' as VillageSize,
      terrain: 'ocean' as SettlementTerrain,
      foodSourceType: 'fishing' as FoodSourceType,
      dominantResource: resource('fish'),
    }

    it('assigns Fisher before remainder and excludes Trader', () => {
      for (let seed = 0; seed < 30; seed++) {
        const staffed = staff(adults(4), { ...context, seed })
        const roles = adultRoles(staffed)
        expect(roles[0]).toBe('fisher')
        expect(adultProfessionCoverage(staffed).trader).toBe(0)
      }
    })

    it('allows a second Fisher without guaranteeing one', () => {
      let second = 0
      for (let seed = 0; seed < 50; seed++) {
        if (adultProfessionCoverage(staff(adults(4), { ...context, seed })).fisher >= 2) second++
      }
      expect(second).toBeGreaterThan(0)
      expect(second).toBeLessThan(50)
    })
  })

  describe('scenario C — fertile field', () => {
    it('covers food and fertile-soil with one Farmer and does not grow families', () => {
      const before = adults(4)
      const staffed = staff(before, {
        size: 'MD',
        terrain: 'forest',
        foodSourceType: 'field',
        dominantResource: resource('fertile_soil'),
        seed: 4,
      })
      expect(staffed).toHaveLength(before.length)
      expect(adultRoles(staffed)[0]).toBe('farmer')
      expect(adultProfessionCoverage(staffed).farmer).toBeGreaterThanOrEqual(1)
    })
  })

  describe('scenario D — small ore settlement', () => {
    it('covers Miner then food, and excludes Blacksmith/Trader', () => {
      const staffed = staff(adults(2), {
        size: 'SM',
        terrain: 'mountain',
        foodSourceType: 'garden',
        dominantResource: resource('iron'),
        seed: 8,
      })
      expect(adultRoles(staffed)).toEqual(['farmer', 'miner'])
      expect(adultProfessionCoverage(staffed).blacksmith).toBe(0)
      expect(adultProfessionCoverage(staffed).trader).toBe(0)
    })
  })

  describe('scenario E — medium ore settlement', () => {
    const context = {
      size: 'LG' as VillageSize,
      terrain: 'mountain' as SettlementTerrain,
      foodSourceType: 'garden' as FoodSourceType,
      dominantResource: resource('iron'),
    }

    it('covers Miner and Farmer, with Guard/Blacksmith/Trader possible', () => {
      const coverage = adultProfessionCoverage(staff(adults(7), { ...context, seed: 11 }))
      expect(coverage.miner).toBeGreaterThanOrEqual(1)
      expect(coverage.farmer).toBeGreaterThanOrEqual(1)
    })

    it('still varies remainder roles across staffing seeds', () => {
      const rosters = new Set<string>()
      for (let seed = 0; seed < 40; seed++) {
        rosters.add(adultRoles(staff(adults(7), { ...context, seed })).join(','))
      }
      expect(rosters.size).toBeGreaterThan(1)
    })
  })

  describe('scenario F — large generic settlement', () => {
    const context = {
      size: 'XL' as VillageSize,
      terrain: 'swamp' as SettlementTerrain,
      foodSourceType: 'garden' as FoodSourceType,
      dominantResource: null,
    }

    it('covers Farmer, never a second Trader, and does not require Miner/Fisher', () => {
      const rosters = new Set<string>()
      for (let seed = 0; seed < 50; seed++) {
        const staffed = staff(adults(11), { ...context, seed })
        const coverage = adultProfessionCoverage(staffed)
        expect(coverage.farmer).toBeGreaterThanOrEqual(1)
        expect(coverage.trader).toBeLessThanOrEqual(1)
        rosters.add(adultRoles(staffed).join(','))
      }
      expect(rosters.size).toBeGreaterThan(1)
    })
  })

  describe('scenario G — home settlement', () => {
    it('leaves reserved roles in place and does not add a second Trader from baseline', () => {
      const families = generateFamilies(7, 'MD', true, 'polish')
      const staffed = staff(families, {
        size: 'MD',
        terrain: 'forest',
        foodSourceType: 'garden',
        isHome: true,
        seed: 7,
      })
      const byName = new Map(staffed.flatMap((f) => f.members).map((m) => [m.name, m]))
      expect(byName.get('Anna')?.character.role).toBe('farmer')
      expect(byName.get('Piotr')?.character.role).toBe('woodcutter')
      expect(byName.get('Kasia')?.character.role).toBe('trader')
      expect(byName.get('Marek')?.character.role).toBe('guard')
      expect(adultProfessionCoverage(staffed).trader).toBe(1)
      expect(identityFingerprint(staffed)).toEqual(identityFingerprint(families))
    })
  })

  describe('scenario H — child does not satisfy coverage', () => {
    it('keeps the child Farmer and restaffs the adult for uncovered food', () => {
      const families = [
        family('family-0', [
          member({ name: 'Adult', role: 'woodcutter', age: 32 }),
          member({ name: 'Kid', role: 'farmer', age: 9, relation: 'child' }),
        ]),
      ]
      const staffed = staff(families, { foodSourceType: 'garden', seed: 1 })
      expect(staffed[0]!.members[1]!.character.role).toBe('farmer')
      expect(staffed[0]!.members[1]!.age).toBe(9)
      expect(adultProfessionCoverage(staffed).farmer).toBe(1)
      expect(staffed[0]!.members[0]!.character.role).toBe('farmer')
    })
  })

  describe('scenario I — OUTPOST', () => {
    it('returns the existing forced specialist without remainder staffing', () => {
      const families = generateFamilies(5, 'OUTPOST', false, 'polish', resource('gold'))
      const staffed = resolveInitialProfessionStaffing(families, {
        size: 'OUTPOST',
        terrain: 'mountain',
        foodSourceType: 'garden',
        dominantResource: resource('gold'),
        isHome: false,
        seed: 5,
      })
      expect(staffed).toBe(families)
      expect(staffed).toHaveLength(1)
      expect(staffed[0]!.members).toHaveLength(1)
      expect(staffed[0]!.members[0]!.character.role).toBe('miner')
    })
  })

  describe('scenario J — unmapped resource', () => {
    it('does not invent a specialist for herbs', () => {
      const staffed = staff(adults(4), {
        size: 'MD',
        terrain: 'forest',
        foodSourceType: 'foraging',
        dominantResource: resource('herbs'),
        seed: 12,
      })
      expect(adultRoles(staffed)[0]).toBe('farmer')
      expect(staffed).toHaveLength(4)
    })
  })

  describe('gating', () => {
    it('never assigns Trader below 6 adults or on SM', () => {
      for (let seed = 0; seed < 30; seed++) {
        expect(adultProfessionCoverage(staff(adults(5), { size: 'MD', seed })).trader).toBe(0)
        expect(adultProfessionCoverage(staff(adults(6), { size: 'SM', seed })).trader).toBe(0)
      }
    })

    it('never assigns Blacksmith at 1–3 adults', () => {
      for (let n = 1; n <= 3; n++) {
        for (let seed = 0; seed < 20; seed++) {
          expect(adultProfessionCoverage(staff(adults(n), { size: 'MD', seed })).blacksmith).toBe(0)
        }
      }
    })

    it('never assigns a second Guard below 6 adults', () => {
      for (let seed = 0; seed < 30; seed++) {
        expect(adultProfessionCoverage(staff(adults(5), { size: 'MD', seed })).guard).toBeLessThanOrEqual(1)
      }
    })

    it('never assigns shepherd at 1–3 adults (plan fauna-004)', () => {
      for (let n = 1; n <= 3; n++) {
        for (let seed = 0; seed < 20; seed++) {
          expect(adultProfessionCoverage(staff(adults(n), { size: 'MD', terrain: 'forest', seed })).shepherd).toBe(0)
        }
      }
    })

    it('assigns at most one shepherd (plan fauna-004)', () => {
      for (let seed = 0; seed < 40; seed++) {
        expect(adultProfessionCoverage(staff(adults(11), { size: 'XL', terrain: 'forest', foodSourceType: 'garden', seed })).shepherd).toBeLessThanOrEqual(1)
      }
    })

    it('absence of shepherd is a valid outcome (plan fauna-004)', () => {
      let absent = false
      for (let seed = 0; seed < 40; seed++) {
        if (adultProfessionCoverage(staff(adults(5), { size: 'MD', terrain: 'desert', foodSourceType: 'garden', seed })).shepherd === 0) {
          absent = true
          break
        }
      }
      expect(absent).toBe(true)
    })

    it('never assigns textile_worker at 1–3 adults (plan settlements-npcs-006)', () => {
      for (let n = 1; n <= 3; n++) {
        for (let seed = 0; seed < 20; seed++) {
          expect(adultProfessionCoverage(staff(adults(n), { size: 'MD', terrain: 'forest', seed })).textile_worker).toBe(0)
        }
      }
    })

    it('assigns at most one textile_worker (plan settlements-npcs-006)', () => {
      for (let seed = 0; seed < 40; seed++) {
        expect(adultProfessionCoverage(staff(adults(11), { size: 'XL', terrain: 'forest', foodSourceType: 'garden', seed })).textile_worker).toBeLessThanOrEqual(1)
      }
    })

    it('absence of textile_worker is a valid outcome (plan settlements-npcs-006)', () => {
      let absent = false
      for (let seed = 0; seed < 40; seed++) {
        if (adultProfessionCoverage(staff(adults(5), { size: 'MD', terrain: 'desert', foodSourceType: 'garden', seed })).textile_worker === 0) {
          absent = true
          break
        }
      }
      expect(absent).toBe(true)
    })
  })

  describe('distribution', () => {
    const samples = 80

    it('fishing contexts produce Fisher more often than matching garden contexts', () => {
      const fishing = frequency(samples, () => adults(4), {
        size: 'MD',
        terrain: 'ocean',
        foodSourceType: 'fishing',
        dominantResource: resource('fish'),
        isHome: false,
      }, 'fisher')
      const garden = frequency(samples, () => adults(4), {
        size: 'MD',
        terrain: 'swamp',
        foodSourceType: 'garden',
        dominantResource: null,
        isHome: false,
      }, 'fisher')
      expect(fishing).toBeGreaterThan(garden)
    })

    it('ore contexts produce Miner more often than non-ore contexts', () => {
      const ore = frequency(samples, () => adults(4), {
        size: 'MD',
        terrain: 'mountain',
        foodSourceType: 'garden',
        dominantResource: resource('iron'),
        isHome: false,
      }, 'miner')
      const plain = frequency(samples, () => adults(4), {
        size: 'MD',
        terrain: 'mountain',
        foodSourceType: 'garden',
        dominantResource: null,
        isHome: false,
      }, 'miner')
      expect(ore).toBeGreaterThan(plain)
    })

    it('larger adultCapacity raises Guard/Blacksmith/Trader frequency versus tiny capacity', () => {
      const tiny = { size: 'SM' as VillageSize, terrain: 'swamp' as SettlementTerrain, foodSourceType: 'garden' as FoodSourceType, dominantResource: null, isHome: false }
      const large = { size: 'XL' as VillageSize, terrain: 'swamp' as SettlementTerrain, foodSourceType: 'garden' as FoodSourceType, dominantResource: null, isHome: false }
      expect(frequency(samples, () => adults(11), large, 'guard')).toBeGreaterThan(
        frequency(samples, () => adults(2), tiny, 'guard'),
      )
      expect(frequency(samples, () => adults(11), large, 'blacksmith')).toBeGreaterThan(
        frequency(samples, () => adults(2), tiny, 'blacksmith'),
      )
      expect(frequency(samples, () => adults(11), large, 'trader')).toBeGreaterThan(
        frequency(samples, () => adults(2), tiny, 'trader'),
      )
    })

    it('forest/garden contexts produce shepherd more often than desert (plan fauna-004)', () => {
      const grazing = frequency(samples, () => adults(8), {
        size: 'LG',
        terrain: 'forest',
        foodSourceType: 'garden',
        dominantResource: null,
        isHome: false,
      }, 'shepherd')
      const desert = frequency(samples, () => adults(8), {
        size: 'LG',
        terrain: 'desert',
        foodSourceType: 'garden',
        dominantResource: null,
        isHome: false,
      }, 'shepherd')
      expect(grazing).toBeGreaterThan(desert)
    })

    it('large forest/garden settlements can staff a textile_worker (plan settlements-npcs-006)', () => {
      const hits = frequency(samples, () => adults(11), {
        size: 'XL',
        terrain: 'forest',
        foodSourceType: 'garden',
        dominantResource: null,
        isHome: false,
      }, 'textile_worker')
      expect(hits).toBeGreaterThan(0)
      expect(hits).toBeLessThan(samples)
    })
  })

  describe('shepherd household (plan fauna-004)', () => {
    it('points at the household that actually has the shepherd adult', () => {
      const families = [
        family('family-0', [member({ name: 'A', role: 'farmer', age: 30 })]),
        family('family-1', [member({ name: 'B', role: 'shepherd', age: 28 })]),
      ]
      expect(shepherdHouseholdIndex(families)).toBe(1)
      expect(shepherdHouseholdIndex(staff(adults(2), { size: 'SM' }))).toBeNull()
    })
  })
})
