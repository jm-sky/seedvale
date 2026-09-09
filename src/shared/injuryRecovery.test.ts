import { describe, expect, it } from 'vitest'
import { createHealthState, healHealth } from './HealthState'
import {
  applyInjurySeverityForDebug,
  type InjuryRecoveryState,
  registerPhysicalInjuryFromDamage,
  registerPhysicalInjuryFromHeal,
  resolveInjuryRecovery,
} from './injuryRecovery'
import { criticalInjuryFloor, resolveInjurySeverity } from './injurySeverity'

function injuredState(injury: number, currentHp = 100 - injury, nowDays = 0): InjuryRecoveryState {
  const health = createHealthState(100)
  health.currentHp = currentHp
  return {
    health,
    injuryRecoveryUpdatedAtDays: nowDays,
    physicalInjury: injury,
  }
}

describe('resolveInjuryRecovery (plan npc-025)', () => {
  it('restores HP through healHealth and reduces injury by actual restored HP', () => {
    const state = injuredState(20, 80, 0)
    resolveInjuryRecovery(state, 1)
    expect(state.health.currentHp).toBeGreaterThan(80)
    expect(state.physicalInjury).toBe(100 - state.health.currentHp)
    expect(state.physicalInjury).toBeGreaterThanOrEqual(0)
  })

  it('does not heal unrelated non-physical HP deficit beyond outstanding injury', () => {
    const state = injuredState(5, 50, 0)
    resolveInjuryRecovery(state, 10)
    expect(state.physicalInjury).toBe(0)
    expect(state.health.currentHp).toBe(55)
  })

  it('initializes a missing recovery anchor without retroactive healing', () => {
    const health = createHealthState(100)
    health.currentHp = 80
    const state: InjuryRecoveryState = { health, physicalInjury: 20 }
    resolveInjuryRecovery(state, 12)
    expect(state.physicalInjury).toBe(20)
    expect(state.health.currentHp).toBe(80)
    expect(state.injuryRecoveryUpdatedAtDays).toBe(12)
  })

  it('is idempotent at the same nowDays and does not double a saved interval', () => {
    const state = injuredState(20, 80, 0)
    resolveInjuryRecovery(state, 1)
    const injury = state.physicalInjury
    const hp = state.health.currentHp
    resolveInjuryRecovery(state, 1)
    expect(state.physicalInjury).toBe(injury)
    expect(state.health.currentHp).toBe(hp)
  })

  it('clamps a large time skip of critical injury at the serious boundary', () => {
    const state = injuredState(80, 20, 0)
    resolveInjuryRecovery(state, 40)
    expect(state.physicalInjury).toBeCloseTo(criticalInjuryFloor(100))
    expect(resolveInjurySeverity(state.physicalInjury, 100)).toBe('critical')
    expect(state.health.currentHp).toBeCloseTo(20 + (80 - criticalInjuryFloor(100)))
  })

  it('does not recover while dead', () => {
    const state = injuredState(40, 0, 0)
    state.health.dead = true
    resolveInjuryRecovery(state, 5)
    expect(state.physicalInjury).toBe(40)
    expect(state.health.currentHp).toBe(0)
  })
})

describe('injury debug accounting', () => {
  it('apply/clear uses damage and heal helpers rather than independent writes', () => {
    const state = injuredState(0, 100, 0)
    applyInjurySeverityForDebug(state, 'serious', 0)
    expect(resolveInjurySeverity(state.physicalInjury, 100)).toBe('serious')
    expect(state.health.currentHp + state.physicalInjury).toBe(100)

    applyInjurySeverityForDebug(state, 'none', 0)
    expect(state.physicalInjury).toBe(0)
    expect(state.health.currentHp).toBe(100)
  })

  it('suitable treatment can reduce critical injury into serious', () => {
    const state = injuredState(80, 20, 0)
    const hpBefore = state.health.currentHp
    healHealth(state.health, 35)
    registerPhysicalInjuryFromHeal(state, state.health.currentHp - hpBefore, 0)
    expect(state.physicalInjury).toBe(45)
    expect(resolveInjurySeverity(state.physicalInjury, 100)).toBe('serious')
  })

  it('registerPhysicalInjuryFromDamage / FromHeal stay within accounting invariants', () => {
    const state = injuredState(0, 100, 0)
    state.health.currentHp = 85
    registerPhysicalInjuryFromDamage(state, 15, 0)
    expect(state.physicalInjury).toBe(15)
    registerPhysicalInjuryFromHeal(state, 8, 0)
    expect(state.physicalInjury).toBe(7)
  })
})
