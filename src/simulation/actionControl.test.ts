import { describe, expect, it } from 'vitest'
import {
  adoptPlannedAction,
  finishActionLifecycle,
  replaceActionLifecycle,
} from './actionControl'
import { createActionLifecycle, isActionActive } from './actionLifecycle'

describe('replaceActionLifecycle', () => {
  it('cancels active then starts', () => {
    const life = createActionLifecycle()
    replaceActionLifecycle(life)
    expect(isActionActive(life)).toBe(true)
    replaceActionLifecycle(life)
    expect(life.status).toBe('active')
  })
})

describe('adoptPlannedAction', () => {
  it('starts a new kind and reports changed', () => {
    const life = createActionLifecycle()
    const first = adoptPlannedAction(life, null, { kind: 'flee' })
    expect(first.changed).toBe(true)
    expect(first.action.kind).toBe('flee')
    expect(isActionActive(life)).toBe(true)

    const same = adoptPlannedAction(life, first.action, { kind: 'flee' })
    expect(same.changed).toBe(false)

    const next = adoptPlannedAction(life, same.action, { kind: 'attack' })
    expect(next.changed).toBe(true)
    expect(next.action.kind).toBe('attack')
    expect(isActionActive(life)).toBe(true)
  })

  it('finishActionLifecycle completes an active action', () => {
    const life = createActionLifecycle()
    replaceActionLifecycle(life)
    finishActionLifecycle(life)
    expect(life.status).toBe('complete')
  })
})
