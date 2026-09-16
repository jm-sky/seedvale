import { describe, expect, it } from 'vitest'
import type { Role } from '../ai/characters'
import type { FamilyDef, FamilyMember } from './families'
import { RESERVED_CHARACTERS } from '../ai/characters'
import { formatPolishSurnameForGender } from '../ai/nameCultures'
import { generateFamilies } from './families'
import {
  applyProfessionFamilySurnames,
  isWorldgenFamilyId,
} from './professionFamilySurnames'

const PERSONALITY = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
}

const BLACKSMITH_POOL = ['Kowalski', 'Smith', 'Schmidt', 'Ferrarius', 'Steel', 'Forge'] as const
const WOODCUTTER_POOL = ['Leśniewski', 'Woodward', 'Forester', 'Sawyer', 'Greenwood', 'Timber'] as const
const FARMER_POOL = ['Rolnik', 'Farmer', 'Fields', 'Meadows', 'Granger', 'Agricola'] as const
const HUNTER_POOL = ['Łowicki', 'Hunter', 'Fletcher', 'Archer', 'Venator', 'Lupus'] as const

function member(opts: {
  name: string
  role: Role
  age: number
  relation?: FamilyMember['relation']
  lastName?: string
  gender?: FamilyMember['character']['gender']
}): FamilyMember {
  const lastName = opts.lastName ?? 'Placeholder'
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

function gendered(pool: readonly string[], gender: FamilyMember['character']['gender']): Set<string> {
  return new Set(pool.map((base) => formatPolishSurnameForGender(base, gender)))
}

function lastNames(def: FamilyDef): string[] {
  return def.members.map((row) => row.lastName)
}

describe('isWorldgenFamilyId', () => {
  it('accepts procedural and reserved household ids only', () => {
    expect(isWorldgenFamilyId('family-0')).toBe(true)
    expect(isWorldgenFamilyId('family-12')).toBe(true)
    expect(isWorldgenFamilyId('family-reserved-0')).toBe(true)
    expect(isWorldgenFamilyId('family-reserved-1')).toBe(true)
    expect(isWorldgenFamilyId('family-story-lost-treasure-elder')).toBe(false)
    expect(isWorldgenFamilyId('family-story-lost-treasure-archaeologist')).toBe(false)
    expect(isWorldgenFamilyId('family-story-lost-treasure-specialist')).toBe(false)
  })
})

describe('applyProfessionFamilySurnames', () => {
  it('gives every worldgen family member one shared base surname', () => {
    const input = [
      family('family-0', [
        member({ name: 'Jan', role: 'blacksmith', age: 40, gender: 'male', lastName: 'Old' }),
        member({ name: 'Ola', role: 'farmer', age: 38, gender: 'female', lastName: 'Oldska', relation: 'wife' }),
        member({ name: 'Tomek', role: 'farmer', age: 8, gender: 'male', lastName: 'Old', relation: 'child' }),
      ]),
    ]
    const [out] = applyProfessionFamilySurnames(input, 11)
    expect(out).toBeDefined()
    const maleName = out!.members[0]!.lastName
    expect(gendered(BLACKSMITH_POOL, 'male').has(maleName)).toBe(true)
    expect(out!.members[1]!.lastName).toBe(formatPolishSurnameForGender(maleName, 'female'))
    expect(out!.members[2]!.lastName).toBe(maleName)
    for (const row of out!.members) {
      expect(row.character.lastName).toBe(row.lastName)
    }
  })

  it('inflects Leśniewski / Kowalski through formatPolishSurnameForGender', () => {
    expect(formatPolishSurnameForGender('Leśniewski', 'female')).toBe('Leśniewska')
    expect(formatPolishSurnameForGender('Leśniewski', 'male')).toBe('Leśniewski')
    expect(formatPolishSurnameForGender('Kowalski', 'female')).toBe('Kowalska')
    expect(formatPolishSurnameForGender('Kowalski', 'male')).toBe('Kowalski')
    expect(formatPolishSurnameForGender('Hornblower', 'female')).toBe('Hornblower')
  })

  it('is deterministic for the same seed and staffed roster', () => {
    const input = [
      family('family-0', [
        member({ name: 'A', role: 'hunter', age: 30 }),
        member({ name: 'B', role: 'farmer', age: 28, gender: 'female', relation: 'wife' }),
      ]),
    ]
    expect(applyProfessionFamilySurnames(input, 99)).toEqual(
      applyProfessionFamilySurnames(input, 99),
    )
  })

  it('can pick a different surname from the same role pool for a different seed', () => {
    const input = [
      family('family-0', [member({ name: 'A', role: 'blacksmith', age: 30 })]),
    ]
    const seen = new Set<string>()
    for (let seed = 0; seed < 80; seed++) {
      seen.add(applyProfessionFamilySurnames(input, seed)[0]!.members[0]!.lastName)
    }
    expect(seen.size).toBeGreaterThan(1)
    for (const name of seen) {
      expect(gendered(BLACKSMITH_POOL, 'male').has(name)).toBe(true)
    }
  })

  it('prefers the blacksmith pool over a farmer in the same household', () => {
    const input = [
      family('family-0', [
        member({ name: 'Farmer', role: 'farmer', age: 40 }),
        member({ name: 'Smith', role: 'blacksmith', age: 36, gender: 'female', relation: 'wife' }),
      ]),
    ]
    const [out] = applyProfessionFamilySurnames(input, 3)
    expect(gendered(BLACKSMITH_POOL, 'male').has(out!.members[0]!.lastName)).toBe(true)
    expect(gendered(FARMER_POOL, 'male').has(out!.members[0]!.lastName)).toBe(false)
  })

  it('prefers the woodcutter pool over a farmer in the same household', () => {
    const input = [
      family('family-0', [
        member({ name: 'Farmer', role: 'farmer', age: 40, gender: 'female' }),
        member({ name: 'Cutter', role: 'woodcutter', age: 42, relation: 'husband' }),
      ]),
    ]
    const [out] = applyProfessionFamilySurnames(input, 8)
    expect(gendered(WOODCUTTER_POOL, 'male').has(out!.members[1]!.lastName)).toBe(true)
    expect(gendered(FARMER_POOL, 'male').has(out!.members[1]!.lastName)).toBe(false)
  })

  it('ignores children when choosing the surname profession', () => {
    const input = [
      family('family-0', [
        member({ name: 'Kid', role: 'hunter', age: 10, relation: 'child' }),
        member({ name: 'Adult', role: 'farmer', age: 34 }),
      ]),
    ]
    const [out] = applyProfessionFamilySurnames(input, 21)
    expect(gendered(FARMER_POOL, 'male').has(out!.members[1]!.lastName)).toBe(true)
    expect(gendered(HUNTER_POOL, 'male').has(out!.members[1]!.lastName)).toBe(false)
    expect(out!.members[0]!.lastName).toBe(out!.members[1]!.lastName)
  })

  it('does not mutate the input families', () => {
    const input = [
      family('family-0', [member({ name: 'A', role: 'miner', age: 30, lastName: 'Before' })]),
    ]
    applyProfessionFamilySurnames(input, 4)
    expect(input[0]!.members[0]!.lastName).toBe('Before')
    expect(input[0]!.members[0]!.character.lastName).toBe('Before')
  })

  it('leaves a household without adults unchanged', () => {
    const input = [
      family('family-0', [
        member({ name: 'Kid', role: 'blacksmith', age: 12, lastName: 'Kept', relation: 'child' }),
      ]),
    ]
    const out = applyProfessionFamilySurnames(input, 5)
    expect(lastNames(out[0]!)).toEqual(['Kept'])
    expect(out[0]!.members[0]!.character.lastName).toBe('Kept')
  })

  it('does not rename authored or specialist resident families', () => {
    const input = [
      family('family-story-lost-treasure-elder', [
        member({ name: 'Kazimierz', role: 'blacksmith', age: 74, lastName: 'Nowak' }),
      ]),
      family('family-0', [
        member({ name: 'A', role: 'blacksmith', age: 30, lastName: 'Old' }),
      ]),
    ]
    const out = applyProfessionFamilySurnames(input, 6)
    expect(out[0]!.members[0]!.lastName).toBe('Nowak')
    expect(out[0]!.members[0]!.character.lastName).toBe('Nowak')
    expect(out[1]!.members[0]!.lastName).not.toBe('Old')
    expect(gendered(BLACKSMITH_POOL, 'male').has(out[1]!.members[0]!.lastName)).toBe(true)
  })

  it('keeps reserved home surnames Leśniewski / Hornblower', () => {
    const [anna, piotr, kasia, marek] = RESERVED_CHARACTERS
    const input = [
      family('family-reserved-0', [
        member({
          name: piotr!.name,
          role: piotr!.role,
          age: 40,
          lastName: piotr!.lastName,
          gender: piotr!.gender,
          relation: 'husband',
        }),
        member({
          name: anna!.name,
          role: anna!.role,
          age: 38,
          lastName: anna!.lastName,
          gender: anna!.gender,
          relation: 'wife',
        }),
      ]),
      family('family-reserved-1', [
        member({
          name: marek!.name,
          role: marek!.role,
          age: 36,
          lastName: marek!.lastName,
          gender: marek!.gender,
          relation: 'husband',
        }),
        member({
          name: kasia!.name,
          role: kasia!.role,
          age: 34,
          lastName: kasia!.lastName,
          gender: kasia!.gender,
          relation: 'wife',
        }),
      ]),
    ]
    const out = applyProfessionFamilySurnames(input, 42)
    expect(out[0]!.members.map((row) => ({ name: row.name, lastName: row.lastName }))).toEqual([
      { name: 'Piotr', lastName: 'Leśniewski' },
      { name: 'Anna', lastName: 'Leśniewska' },
    ])
    expect(out[1]!.members.map((row) => ({ name: row.name, lastName: row.lastName }))).toEqual([
      { name: 'Marek', lastName: 'Hornblower' },
      { name: 'Kasia', lastName: 'Hornblower' },
    ])
  })
})

describe('reserved home families through generateFamilies', () => {
  it('materializes Piotr/Anna as Leśniewski and Marek/Kasia as Hornblower', () => {
    const families = generateFamilies(7, 'MD', true, 'polish')
    const byName = new Map(
      families.flatMap((row) => row.members.map((member) => [member.name, member])),
    )
    expect(byName.get('Piotr')?.lastName).toBe('Leśniewski')
    expect(byName.get('Anna')?.lastName).toBe('Leśniewska')
    expect(byName.get('Marek')?.lastName).toBe('Hornblower')
    expect(byName.get('Kasia')?.lastName).toBe('Hornblower')
  })
})
