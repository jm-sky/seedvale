import { describe, expect, it, vi } from 'vitest'
import { createPlayerNeeds } from '../../player/PlayerNeeds'
import { createBusyAction } from '../busyAction'
import { maxSafeConstructionHours, startConstructionWorkSession } from './constructionWorkSession'

describe('maxSafeConstructionHours (plan ui-input-016)', () => {
  it('returns remaining work when needs allow a longer session', () => {
    const needs = createPlayerNeeds()
    expect(maxSafeConstructionHours(needs, 1.5, 4, 'moderate', 'moderate')).toBeCloseTo(1.5 * 0.999, 5)
  })

  it('stops at zero remaining work', () => {
    expect(maxSafeConstructionHours(createPlayerNeeds(), 0, 4, 'moderate', 'moderate')).toBe(0)
  })

  it('stops when stamina is already empty', () => {
    const needs = createPlayerNeeds()
    needs.stamina.current = 0
    expect(maxSafeConstructionHours(needs, 4, 4, 'moderate', 'moderate')).toBe(0)
  })

  it('caps hours so stamina would not overshoot', () => {
    const needs = createPlayerNeeds()
    needs.stamina.current = 12
    const hours = maxSafeConstructionHours(needs, 10, 4, 'moderate', 'moderate')
    expect(hours).toBeGreaterThan(0)
    expect(hours).toBeLessThan(1.5)
  })
})

describe('startConstructionWorkSession', () => {
  it('credits the full represented hours on natural completion', () => {
    const busy = createBusyAction()
    const needs = createPlayerNeeds()
    const contribute = vi.fn()
    expect(startConstructionWorkSession(busy, needs, {
      label: 'Budowa',
      remainingHours: 1,
      realSecondsPerRepresentedHour: 4,
      staminaEffort: 'light',
      vigorEffort: 'light',
      contribute,
    })).toBe(true)
    busy.tick(10)
    expect(contribute).toHaveBeenCalledTimes(1)
    expect(contribute.mock.calls[0]![0]).toBeCloseTo(0.999, 3)
  })

  it('credits only the elapsed fraction on cancel', () => {
    const busy = createBusyAction()
    const needs = createPlayerNeeds()
    const contribute = vi.fn()
    let now = 1_000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    startConstructionWorkSession(busy, needs, {
      label: 'Budowa',
      remainingHours: 1,
      realSecondsPerRepresentedHour: 4,
      staminaEffort: 'light',
      vigorEffort: 'light',
      contribute,
    })
    now += 2_000
    busy.cancel()
    expect(contribute).toHaveBeenCalledTimes(1)
    expect(contribute.mock.calls[0]![0]).toBeCloseTo(0.5, 1)
  })

  it('refuses to start when the player cannot safely continue', () => {
    const busy = createBusyAction()
    const needs = createPlayerNeeds()
    needs.stamina.current = 0
    expect(startConstructionWorkSession(busy, needs, {
      label: 'Budowa',
      remainingHours: 1,
      realSecondsPerRepresentedHour: 4,
      staminaEffort: 'moderate',
      vigorEffort: 'moderate',
      contribute: () => {},
    })).toBe(false)
    expect(busy.isActive()).toBe(false)
  })
})
