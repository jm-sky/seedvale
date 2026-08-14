import { describe, expect, it } from 'vitest'
import { createHealthState, damageHealth, isAlive } from '../shared/HealthState'
import {
  createStaminaState,
  drainStamina,
  getStaminaRatio,
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

/**
 * Contract tests for the movement-resilience rebalance: `NpcAgent` now
 * drains stamina at a rate that depends on *what* the phase is doing
 * (`WALK_FATIGUE_RATE`/`LIGHT_EXECUTE_FATIGUE_RATE`/`BASE_FATIGUE_RATE` in
 * `NpcAgent.ts`), not one flat rate shared by walking and working. `NpcAgent`
 * itself is Three.js-heavy; these encode the rate contract in isolation.
 */
describe('NPC stamina rebalance contract (walk vs. work)', () => {
  const WALK_FATIGUE_RATE = 0.5
  const LIGHT_EXECUTE_FATIGUE_RATE = 0.3
  const HEAVY_EXECUTE_FATIGUE_RATE = 3
  const STAMINA_EXHAUSTED_RESUME_RATIO = 0.35

  it('normal walking (goTo) drains far less than heavy execute per second', () => {
    const stamina = createStaminaState(100)
    drainStamina(stamina, WALK_FATIGUE_RATE * 10)
    expect(stamina.current).toBe(95)
    expect(WALK_FATIGUE_RATE).toBeLessThan(HEAVY_EXECUTE_FATIGUE_RATE)
  })

  it('an ordinary multi-leg errand (house -> well -> workplace -> storage) does not exhaust stamina', () => {
    const stamina = createStaminaState(100)
    // ~4 walking legs of a few seconds each, plus brief light actions
    // (drink/deposit) at each stop.
    for (let leg = 0; leg < 4; leg++) {
      drainStamina(stamina, WALK_FATIGUE_RATE * 4)
      drainStamina(stamina, LIGHT_EXECUTE_FATIGUE_RATE * 1.5)
    }
    expect(isExhausted(stamina)).toBe(false)
    expect(getStaminaRatio(stamina)).toBeGreaterThan(0.85)
  })

  it('light execute actions (drink/eat/deposit) cost far less than heavy work', () => {
    expect(LIGHT_EXECUTE_FATIGUE_RATE).toBeLessThan(HEAVY_EXECUTE_FATIGUE_RATE)
  })

  it('sustained heavy work (chop/work) still meaningfully drains stamina', () => {
    const stamina = createStaminaState(100)
    drainStamina(stamina, HEAVY_EXECUTE_FATIGUE_RATE * 40)
    expect(isExhausted(stamina)).toBe(true)
  })

  it('exhaustion resume threshold sits below full recovery, above zero', () => {
    const stamina = createStaminaState(100)
    stamina.current = 0
    expect(getStaminaRatio(stamina) >= STAMINA_EXHAUSTED_RESUME_RATIO).toBe(false)
    restoreStamina(stamina, 100 * STAMINA_EXHAUSTED_RESUME_RATIO)
    expect(getStaminaRatio(stamina) >= STAMINA_EXHAUSTED_RESUME_RATIO).toBe(true)
    expect(getStaminaRatio(stamina)).toBeLessThan(1)
  })
})
