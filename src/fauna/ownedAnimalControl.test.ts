import { describe, expect, it } from 'vitest'
import {
  createDefaultOwnedAnimalControlState,
  FOLLOW_START_DISTANCE,
  FOLLOW_STOP_DISTANCE,
  resolveOwnedControlMovement,
  setOwnedAnimalControlMode,
} from './ownedAnimalControl'

describe('ownedAnimalControl', () => {
  it('starts follow only beyond the start threshold and keeps commitment until stop', () => {
    const state = createDefaultOwnedAnimalControlState()
    const animal = { x: 0, z: 0 }
    const playerFar = { x: FOLLOW_START_DISTANCE + 1, z: 0 }
    const playerMid = { x: (FOLLOW_START_DISTANCE + FOLLOW_STOP_DISTANCE) / 2, z: 0 }

    expect(resolveOwnedControlMovement(state, true, animal, playerFar, false, false).kind)
      .toBe('follow')
    expect(state.following).toBe(true)

    expect(resolveOwnedControlMovement(state, true, animal, playerMid, false, false).kind)
      .toBe('follow')

    const playerNear = { x: FOLLOW_STOP_DISTANCE - 0.5, z: 0 }
    expect(resolveOwnedControlMovement(state, true, animal, playerNear, false, false).kind)
      .toBe('none')
    expect(state.following).toBe(false)
  })

  it('does not oscillate when distance sits between thresholds while already following', () => {
    const state = createDefaultOwnedAnimalControlState()
    state.following = true
    const animal = { x: 0, z: 0 }
    const playerMid = { x: (FOLLOW_START_DISTANCE + FOLLOW_STOP_DISTANCE) / 2, z: 0 }

    expect(resolveOwnedControlMovement(state, true, animal, playerMid, false, false).kind)
      .toBe('follow')
  })

  it('stay mode returns stay semantics and mounted suppresses movement', () => {
    const state = createDefaultOwnedAnimalControlState()
    setOwnedAnimalControlMode(state, 'stay', { x: 3, z: 4 })
    expect(resolveOwnedControlMovement(state, true, { x: 0, z: 0 }, { x: 100, z: 0 }, false, false).kind)
      .toBe('stay')
    expect(resolveOwnedControlMovement(state, true, { x: 0, z: 0 }, { x: 100, z: 0 }, true, false).kind)
      .toBe('none')
  })
})
