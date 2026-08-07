import { describe, expect, it } from 'vitest'
import { createHealthState, damageFor, MAX_HP } from './HealthState'

describe('fauna HealthState (re-exported from shared, MAX_HP/damageFor stay fauna-local)', () => {
  it('createHealthState still builds a full-health state after the shared/ extraction', () => {
    expect(createHealthState(MAX_HP.wolf)).toEqual({ maxHp: 50, currentHp: 50, dead: false })
  })

  it('has a MAX_HP entry for every animal kind', () => {
    expect(MAX_HP).toEqual({ wolf: 50, fox: 25, deer: 30, stag: 40 })
  })

  it('looks up predator/prey damage, falling back to the default', () => {
    expect(damageFor('wolf', 'deer')).toBe(15)
    expect(damageFor('fox', 'stag')).toBe(6)
    expect(damageFor('wolf', 'fox')).toBe(8) // no table entry -> DEFAULT_DAMAGE
  })
})
