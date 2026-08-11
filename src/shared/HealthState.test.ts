import { describe, expect, it } from 'vitest'
import { createHealthState, damageHealth, healHealth, isAlive } from './HealthState'

describe('createHealthState', () => {
  it('starts full and alive', () => {
    const health = createHealthState(100)
    expect(health).toEqual({ maxHp: 100, currentHp: 100, dead: false })
  })
})

describe('damageHealth', () => {
  it('drains currentHp by amount', () => {
    const health = createHealthState(100)
    damageHealth(health, 30)
    expect(health.currentHp).toBe(70)
    expect(health.dead).toBe(false)
  })

  it('clamps at zero and marks dead', () => {
    const health = createHealthState(100)
    damageHealth(health, 1000)
    expect(health.currentHp).toBe(0)
    expect(health.dead).toBe(true)
  })

  it('is a no-op on an already-dead target', () => {
    const health = createHealthState(50)
    damageHealth(health, 50)
    damageHealth(health, 10)
    expect(health.currentHp).toBe(0)
    expect(health.dead).toBe(true)
  })

  it('ignores non-positive amounts', () => {
    const health = createHealthState(100)
    damageHealth(health, 0)
    damageHealth(health, -5)
    expect(health.currentHp).toBe(100)
  })
})

describe('healHealth', () => {
  it('regenerates currentHp, capped at maxHp', () => {
    const health = createHealthState(100)
    health.currentHp = 40
    healHealth(health, 30)
    expect(health.currentHp).toBe(70)
    healHealth(health, 1000)
    expect(health.currentHp).toBe(100)
  })

  it('does not revive the dead', () => {
    const health = createHealthState(100)
    damageHealth(health, 100)
    healHealth(health, 50)
    expect(health.currentHp).toBe(0)
    expect(health.dead).toBe(true)
  })
})

describe('isAlive', () => {
  it('is true until dead', () => {
    const health = createHealthState(10)
    expect(isAlive(health)).toBe(true)
    damageHealth(health, 10)
    expect(isAlive(health)).toBe(false)
  })
})
