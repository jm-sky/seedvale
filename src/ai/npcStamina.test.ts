import { describe, expect, it } from 'vitest'
import { createHealthState, damageHealth, isAlive } from '../shared/HealthState'
import {
  createStaminaState,
  drainStamina,
  isExhausted,
  restoreStamina,
} from '../shared/StaminaState'

/**
 * Contract tests for the NPC fatigue → stamina migration (plan 045).
 * NpcAgent itself is Three.js-heavy; these encode the physical-state rules
 * the agent must follow after migration.
 */
describe('NPC stamina migration contract', () => {
  const FATIGUE_RATE = 3
  const REST_RATE = 6

  it('work/effort reduces stamina, not HP', () => {
    const health = createHealthState(100)
    const stamina = createStaminaState(100)
    drainStamina(stamina, FATIGUE_RATE * 5)
    expect(health.currentHp).toBe(100)
    expect(stamina.current).toBe(85)
    expect(isAlive(health)).toBe(true)
  })

  it('rest regenerates stamina without healing HP', () => {
    const health = createHealthState(100)
    damageHealth(health, 40)
    const stamina = createStaminaState(100)
    stamina.current = 20
    restoreStamina(stamina, REST_RATE * 5)
    expect(stamina.current).toBe(50)
    expect(health.currentHp).toBe(60)
  })

  it('zero stamina does not kill the NPC', () => {
    const health = createHealthState(100)
    const stamina = createStaminaState(100)
    drainStamina(stamina, 10_000)
    expect(isExhausted(stamina)).toBe(true)
    expect(stamina.current).toBe(0)
    expect(health.dead).toBe(false)
    expect(health.currentHp).toBe(100)
  })

  it('HP remains available for real damage independently of stamina', () => {
    const health = createHealthState(100)
    const stamina = createStaminaState(100)
    drainStamina(stamina, 50)
    damageHealth(health, 25)
    expect(stamina.current).toBe(50)
    expect(health.currentHp).toBe(75)
    expect(health.dead).toBe(false)
  })
})
