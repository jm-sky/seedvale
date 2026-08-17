import { describe, expect, it } from 'vitest'
import {
  anyWithinRadius,
  createShadowBudgetState,
  recordShadowBudgetFrame,
  SHADOW_DIRTY_MAX_STALE_FRAMES,
  SHADOW_DIRTY_PLAYER_EPS_M,
  shouldUpdateShadowMap,
} from './shadowBudget'

describe('shouldUpdateShadowMap', () => {
  it('stays clean when the player has not moved and nothing is nearby', () => {
    const state = createShadowBudgetState(10, 20)
    expect(shouldUpdateShadowMap(state, 10, 20, false)).toBe(false)
  })

  it('goes dirty once the player moves beyond the epsilon', () => {
    const state = createShadowBudgetState(0, 0)
    expect(shouldUpdateShadowMap(state, SHADOW_DIRTY_PLAYER_EPS_M * 0.5, 0, false)).toBe(false)
    expect(shouldUpdateShadowMap(state, SHADOW_DIRTY_PLAYER_EPS_M * 2, 0, false)).toBe(true)
  })

  it('is fail-open: any nearby caster forces dirty regardless of player movement', () => {
    const state = createShadowBudgetState(0, 0)
    expect(shouldUpdateShadowMap(state, 0, 0, true)).toBe(true)
  })

  it('forces a refresh once the stale-frame safety net is reached', () => {
    const state = createShadowBudgetState(0, 0)
    state.framesSinceUpdate = SHADOW_DIRTY_MAX_STALE_FRAMES - 1
    expect(shouldUpdateShadowMap(state, 0, 0, false)).toBe(false)
    state.framesSinceUpdate = SHADOW_DIRTY_MAX_STALE_FRAMES
    expect(shouldUpdateShadowMap(state, 0, 0, false)).toBe(true)
  })
})

describe('recordShadowBudgetFrame', () => {
  it('resets the stale counter and rebaselines position on an update', () => {
    const state = createShadowBudgetState(0, 0)
    state.framesSinceUpdate = 4
    recordShadowBudgetFrame(state, 5, 6, true)
    expect(state).toEqual({ lastPlayerX: 5, lastPlayerZ: 6, framesSinceUpdate: 0 })
  })

  it('increments the stale counter and keeps the baseline on a skipped frame', () => {
    const state = createShadowBudgetState(1, 2)
    recordShadowBudgetFrame(state, 1, 2, false)
    recordShadowBudgetFrame(state, 1, 2, false)
    expect(state).toEqual({ lastPlayerX: 1, lastPlayerZ: 2, framesSinceUpdate: 2 })
  })
})

describe('anyWithinRadius', () => {
  const positionOf = (p: { x: number, z: number }): { x: number, z: number } => p

  it('is false for an empty list', () => {
    expect(anyWithinRadius(0, 0, [], 36, positionOf)).toBe(false)
  })

  it('finds an item inside the radius', () => {
    const items = [{ x: 100, z: 100 }, { x: 5, z: 0 }]
    expect(anyWithinRadius(0, 0, items, 36, positionOf)).toBe(true)
  })

  it('is false when every item is outside the radius', () => {
    const items = [{ x: 100, z: 100 }, { x: -50, z: 0 }]
    expect(anyWithinRadius(0, 0, items, 36, positionOf)).toBe(false)
  })

  it('treats the radius as inclusive', () => {
    expect(anyWithinRadius(0, 0, [{ x: 36, z: 0 }], 36, positionOf)).toBe(true)
  })
})
