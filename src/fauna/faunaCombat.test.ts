import { describe, expect, it } from 'vitest'
import { createHealthState, damageFor, damageVsHuman, isMeleeTool, MAX_HP } from './faunaCombat'

describe('faunaCombat (createHealthState re-exported from shared, MAX_HP/damageFor fauna-local)', () => {
  it('createHealthState still builds a full-health state after the shared/ extraction', () => {
    expect(createHealthState(MAX_HP.wolf)).toEqual({ maxHp: 50, currentHp: 50, dead: false })
  })

  it('has a MAX_HP entry for every animal kind', () => {
    expect(MAX_HP).toEqual({
      wolf: 50,
      fox: 25,
      deer: 30,
      stag: 40,
      rabbit: 10,
      duck: 8,
      boar: 35,
      horse: 80,
      donkey: 55,
      cow: 70,
      sheep: 22,
      chicken: 6,
    })
  })

  it('looks up predator/prey damage, falling back to the default', () => {
    expect(damageFor('wolf', 'deer')).toBe(15)
    expect(damageFor('fox', 'stag')).toBe(6)
    expect(damageFor('wolf', 'fox')).toBe(8) // no table entry -> DEFAULT_DAMAGE
  })

  it('looks up predator→human damage (plan 056)', () => {
    expect(damageVsHuman('wolf')).toBe(12)
    expect(damageVsHuman('fox')).toBe(6)
    expect(damageVsHuman('boar')).toBe(8) // no table entry -> DEFAULT_DAMAGE
  })

  it('flags melee-capable tools via ITEM_CATALOG (plan 123 — damage/timing assertions moved to playerMelee.test.ts)', () => {
    expect(isMeleeTool('long_sword')).toBe(true)
    expect(isMeleeTool('axe')).toBe(true)
    expect(isMeleeTool('pitchfork')).toBe(true)
    expect(isMeleeTool('sickle')).toBe(true)
    expect(isMeleeTool('knife')).toBe(true)
    expect(isMeleeTool('shovel')).toBe(true)
    expect(isMeleeTool('pickaxe')).toBe(false)
    expect(isMeleeTool('firestarter')).toBe(false)
    expect(isMeleeTool(null)).toBe(false)
  })
})
