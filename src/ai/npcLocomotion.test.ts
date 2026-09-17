import { describe, expect, it } from 'vitest'
import { createStaminaState, drainStamina } from '../shared/StaminaState'
import {
  resolveNpcEffectiveLocomotionMode,
  resolveNpcLocomotionSpeed,
  RUN_FATIGUE_RATE,
  RUN_SPEED_MULTIPLIER,
} from './npcLocomotion'

describe('resolveNpcEffectiveLocomotionMode', () => {
  it('keeps walk as walk regardless of stamina', () => {
    const stamina = createStaminaState(100)
    expect(resolveNpcEffectiveLocomotionMode('walk', stamina)).toBe('walk')
    drainStamina(stamina, 100)
    expect(resolveNpcEffectiveLocomotionMode('walk', stamina)).toBe('walk')
  })

  it('keeps a committed run intent while stamina remains', () => {
    const stamina = createStaminaState(100)
    stamina.current = 1
    expect(resolveNpcEffectiveLocomotionMode('run', stamina)).toBe('run')
  })

  it('degrades run to walk once stamina is fully exhausted, without a stuck state', () => {
    const stamina = createStaminaState(100)
    drainStamina(stamina, 100)
    expect(resolveNpcEffectiveLocomotionMode('run', stamina)).toBe('walk')
  })
})

describe('resolveNpcLocomotionSpeed', () => {
  const WALK_SPEED = 2.4

  it('resolves ordinary walk speed unchanged', () => {
    expect(resolveNpcLocomotionSpeed('walk', WALK_SPEED)).toBe(WALK_SPEED)
  })

  it('resolves a dedicated, faster run speed', () => {
    const runSpeed = resolveNpcLocomotionSpeed('run', WALK_SPEED)
    expect(runSpeed).toBeGreaterThan(WALK_SPEED)
    expect(runSpeed).toBeCloseTo(WALK_SPEED * RUN_SPEED_MULTIPLIER, 10)
  })

  it('composes with exhaustion degradation: an exhausted NPC never gets run speed', () => {
    const stamina = createStaminaState(100)
    drainStamina(stamina, 100)
    const effective = resolveNpcEffectiveLocomotionMode('run', stamina)
    expect(resolveNpcLocomotionSpeed(effective, WALK_SPEED)).toBe(WALK_SPEED)
  })
})

describe('RUN_FATIGUE_RATE', () => {
  it('is a positive fixed V1 drain rate, distinct from ordinary walk fatigue', () => {
    // Mirrors NpcAgent's own WALK_FATIGUE_RATE (0.5) — run must cost
    // meaningfully more than ordinary errand walking per second.
    const WALK_FATIGUE_RATE = 0.5
    expect(RUN_FATIGUE_RATE).toBeGreaterThan(WALK_FATIGUE_RATE)
  })

  it('drains stamina over time and eventually exhausts an unlimited sprint', () => {
    const stamina = createStaminaState(100)
    drainStamina(stamina, RUN_FATIGUE_RATE * 30)
    expect(stamina.current).toBe(0)
  })
})
