import { describe, expect, it } from 'vitest'
import {
  cancelActionLifecycle,
  completeActionLifecycle,
  createActionLifecycle,
  failActionLifecycle,
  isActionActive,
  isActionTerminal,
  resetActionLifecycle,
  startActionLifecycle,
} from './actionLifecycle'

describe('actionLifecycle', () => {
  it('starts idle', () => {
    expect(createActionLifecycle()).toEqual({ status: 'idle' })
  })

  it('idle → active → complete', () => {
    const life = createActionLifecycle()
    expect(startActionLifecycle(life)).toBe(true)
    expect(life.status).toBe('active')
    expect(isActionActive(life)).toBe(true)
    expect(completeActionLifecycle(life)).toBe(true)
    expect(life.status).toBe('complete')
    expect(isActionTerminal(life)).toBe(true)
  })

  it('active → failed / cancelled', () => {
    const failed = createActionLifecycle()
    startActionLifecycle(failed)
    expect(failActionLifecycle(failed)).toBe(true)
    expect(failed.status).toBe('failed')

    const cancelled = createActionLifecycle()
    startActionLifecycle(cancelled)
    expect(cancelActionLifecycle(cancelled)).toBe(true)
    expect(cancelled.status).toBe('cancelled')
  })

  it('rejects terminal transitions from non-active', () => {
    const life = createActionLifecycle()
    expect(completeActionLifecycle(life)).toBe(false)
    expect(failActionLifecycle(life)).toBe(false)
    expect(cancelActionLifecycle(life)).toBe(false)
    expect(life.status).toBe('idle')
  })

  it('start is a no-op when already active', () => {
    const life = createActionLifecycle()
    startActionLifecycle(life)
    expect(startActionLifecycle(life)).toBe(false)
    expect(life.status).toBe('active')
  })

  it('can restart from a terminal status', () => {
    const life = createActionLifecycle()
    startActionLifecycle(life)
    completeActionLifecycle(life)
    expect(startActionLifecycle(life)).toBe(true)
    expect(life.status).toBe('active')
  })

  it('reset returns to idle from any status', () => {
    const life = createActionLifecycle()
    startActionLifecycle(life)
    resetActionLifecycle(life)
    expect(life.status).toBe('idle')
  })
})
