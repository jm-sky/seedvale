import { describe, expect, it } from 'vitest'
import { characterForSeed, RESERVED_CHARACTERS, type Role } from './characters'

describe('characterForSeed', () => {
  it('is deterministic for the same seed/gender', () => {
    const a = characterForSeed(12345, 'male')
    const b = characterForSeed(12345, 'male')
    expect(a).toEqual(b)
  })

  it('can roll hunter as a normal random role (plan 178)', () => {
    const roles = new Set<Role>()
    for (let seed = 0; seed < 500; seed++) {
      roles.add(characterForSeed(seed, seed % 2 === 0 ? 'male' : 'female').role)
    }
    expect(roles.has('hunter')).toBe(true)
    // trader stays reserved-only (plan 090) — never rolled by the random pool.
    expect(roles.has('trader')).toBe(false)
  })

  it('can roll blacksmith as a normal random role (plan settlements-npcs-002)', () => {
    const roles = new Set<Role>()
    for (let seed = 0; seed < 500; seed++) {
      roles.add(characterForSeed(seed, seed % 2 === 0 ? 'male' : 'female').role)
    }
    expect(roles.has('blacksmith')).toBe(true)
  })
})

describe('RESERVED_CHARACTERS (plan 178 must not change these)', () => {
  it('keeps the 4 quest-critical NPCs at their existing name/gender/role', () => {
    expect(RESERVED_CHARACTERS.map((c) => ({ name: c.name, gender: c.gender, role: c.role }))).toEqual([
      { name: 'Anna', gender: 'female', role: 'farmer' },
      { name: 'Piotr', gender: 'male', role: 'woodcutter' },
      { name: 'Kasia', gender: 'female', role: 'trader' },
      { name: 'Marek', gender: 'male', role: 'guard' },
    ])
  })
})
