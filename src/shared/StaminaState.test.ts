import { describe, expect, it } from 'vitest'
import {
  createStaminaState,
  drainStamina,
  getStaminaRatio,
  isExhausted,
  restoreStamina,
} from './StaminaState'

describe('createStaminaState', () => {
  it('starts full', () => {
    expect(createStaminaState(100)).toEqual({ max: 100, current: 100 })
  })
})

describe('drainStamina', () => {
  it('drains correctly', () => {
    const stamina = createStaminaState(100)
    drainStamina(stamina, 30)
    expect(stamina.current).toBe(70)
  })

  it('clamps at zero', () => {
    const stamina = createStaminaState(10)
    drainStamina(stamina, 1000)
    expect(stamina.current).toBe(0)
  })

  it('ignores non-positive amounts', () => {
    const stamina = createStaminaState(50)
    drainStamina(stamina, 0)
    drainStamina(stamina, -5)
    expect(stamina.current).toBe(50)
  })
})

describe('restoreStamina', () => {
  it('restores correctly', () => {
    const stamina = createStaminaState(100)
    stamina.current = 40
    restoreStamina(stamina, 25)
    expect(stamina.current).toBe(65)
  })

  it('clamps at max', () => {
    const stamina = createStaminaState(100)
    stamina.current = 90
    restoreStamina(stamina, 50)
    expect(stamina.current).toBe(100)
  })
})

describe('isExhausted / getStaminaRatio', () => {
  it('exhaustion is deterministic at zero', () => {
    const stamina = createStaminaState(1)
    expect(isExhausted(stamina)).toBe(false)
    drainStamina(stamina, 1)
    expect(isExhausted(stamina)).toBe(true)
  })

  it('ratio is current/max', () => {
    const stamina = createStaminaState(80)
    stamina.current = 20
    expect(getStaminaRatio(stamina)).toBe(0.25)
  })
})
