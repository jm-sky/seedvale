import { describe, expect, it } from 'vitest'
import { applyFatigue, createHealthState, rest } from './HealthState'

describe('createHealthState', () => {
  it('starts full and alive', () => {
    const health = createHealthState(100)
    expect(health).toEqual({ maxHp: 100, currentHp: 100, dead: false })
  })
})

describe('applyFatigue', () => {
  it('drains currentHp by amount', () => {
    const health = createHealthState(100)
    applyFatigue(health, 30)
    expect(health.currentHp).toBe(70)
  })

  it('never drops below the floor', () => {
    const health = createHealthState(100)
    applyFatigue(health, 1000, 15)
    expect(health.currentHp).toBe(15)
  })

  it('never sets dead — that stays fauna combat-only', () => {
    const health = createHealthState(100)
    applyFatigue(health, 1000, 0)
    expect(health.currentHp).toBe(0)
    expect(health.dead).toBe(false)
  })
})

describe('rest', () => {
  it('regenerates currentHp, capped at maxHp', () => {
    const health = createHealthState(100)
    health.currentHp = 40
    rest(health, 30)
    expect(health.currentHp).toBe(70)
    rest(health, 1000)
    expect(health.currentHp).toBe(100)
  })
})
