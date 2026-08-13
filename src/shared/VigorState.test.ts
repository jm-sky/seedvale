import { describe, expect, it } from 'vitest'
import {
  createVigorState,
  drainVigor,
  getVigorRatio,
  isCollapsed,
  restoreVigor,
  VIGOR_COLLAPSE_THRESHOLD,
} from './VigorState'

describe('createVigorState', () => {
  it('starts full', () => {
    expect(createVigorState(100)).toEqual({ max: 100, current: 100 })
  })
})

describe('drainVigor', () => {
  it('drains correctly', () => {
    const vigor = createVigorState(100)
    drainVigor(vigor, 30)
    expect(vigor.current).toBe(70)
  })

  it('clamps at zero', () => {
    const vigor = createVigorState(10)
    drainVigor(vigor, 1000)
    expect(vigor.current).toBe(0)
  })

  it('ignores non-positive amounts', () => {
    const vigor = createVigorState(50)
    drainVigor(vigor, 0)
    drainVigor(vigor, -5)
    expect(vigor.current).toBe(50)
  })
})

describe('restoreVigor', () => {
  it('restores correctly', () => {
    const vigor = createVigorState(100)
    vigor.current = 40
    restoreVigor(vigor, 25)
    expect(vigor.current).toBe(65)
  })

  it('clamps at max', () => {
    const vigor = createVigorState(100)
    vigor.current = 90
    restoreVigor(vigor, 50)
    expect(vigor.current).toBe(100)
  })
})

describe('isCollapsed / getVigorRatio', () => {
  it('collapse is deterministic at the named threshold', () => {
    const vigor = createVigorState(100)
    vigor.current = VIGOR_COLLAPSE_THRESHOLD + 0.01
    expect(isCollapsed(vigor)).toBe(false)
    vigor.current = VIGOR_COLLAPSE_THRESHOLD
    expect(isCollapsed(vigor)).toBe(true)
    vigor.current = 0
    expect(isCollapsed(vigor)).toBe(true)
  })

  it('ratio is current/max', () => {
    const vigor = createVigorState(80)
    vigor.current = 20
    expect(getVigorRatio(vigor)).toBe(0.25)
  })
})
