import { describe, expect, it } from 'vitest'
import { type FollowHysteresisState, resolveFollowHysteresis } from './followHysteresis'

describe('resolveFollowHysteresis', () => {
  it('starts only beyond the start threshold and keeps following until stop', () => {
    const state: FollowHysteresisState = {}
    const actor = { x: 0, z: 0 }
    expect(resolveFollowHysteresis(state, actor, { x: 10, z: 0 }, 12, 6).kind).toBe('none')
    expect(state.following).toBe(false)
    expect(resolveFollowHysteresis(state, actor, { x: 13, z: 0 }, 12, 6)).toEqual({
      kind: 'follow',
      x: 13,
      z: 0,
    })
    expect(state.following).toBe(true)
    expect(resolveFollowHysteresis(state, actor, { x: 9, z: 0 }, 12, 6).kind).toBe('follow')
    expect(resolveFollowHysteresis(state, actor, { x: 5, z: 0 }, 12, 6).kind).toBe('none')
    expect(state.following).toBe(false)
  })

  it('does not jitter when distance sits between the start and stop bands', () => {
    const state: FollowHysteresisState = { following: true }
    expect(resolveFollowHysteresis(state, { x: 0, z: 0 }, { x: 9, z: 0 }, 12, 6).kind).toBe('follow')
    const idle: FollowHysteresisState = { following: false }
    expect(resolveFollowHysteresis(idle, { x: 0, z: 0 }, { x: 9, z: 0 }, 12, 6).kind).toBe('none')
  })

  it('returns none when the target is missing', () => {
    expect(resolveFollowHysteresis({}, { x: 0, z: 0 }, null, 12, 6).kind).toBe('none')
    expect(resolveFollowHysteresis({}, { x: 0, z: 0 }, undefined, 12, 6).kind).toBe('none')
  })
})
