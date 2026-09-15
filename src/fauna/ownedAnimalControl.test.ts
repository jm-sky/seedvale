import { describe, expect, it } from 'vitest'
import {
  createDefaultOwnedAnimalControlState,
  FOLLOW_START_DISTANCE,
  FOLLOW_STOP_DISTANCE,
  hydrateOwnedAnimalControl,
  isOwnedStayBlockingRoutineTrips,
  resolveOwnedControlMovement,
  setOwnedAnimalControlMode,
  snapshotOwnedAnimalControl,
  STAY_RETURN_START,
  STAY_RETURN_STOP,
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

  it('stay returns to the anchor outside the start band and stops inside the stop band', () => {
    const state = createDefaultOwnedAnimalControlState()
    const anchor = { x: 0, z: 0 }
    setOwnedAnimalControlMode(state, 'stay', anchor)

    const far = resolveOwnedControlMovement(
      state, true, { x: STAY_RETURN_START + 1, z: 0 }, { x: 100, z: 0 }, false, false,
    )
    expect(far).toEqual({ kind: 'returnToAnchor', x: 0, z: 0 })
    expect(state.following).toBe(true)

    const mid = resolveOwnedControlMovement(
      state, true,
      { x: (STAY_RETURN_START + STAY_RETURN_STOP) / 2, z: 0 },
      { x: 100, z: 0 }, false, false,
    )
    expect(mid.kind).toBe('returnToAnchor')

    const near = resolveOwnedControlMovement(
      state, true, { x: STAY_RETURN_STOP - 0.5, z: 0 }, { x: 100, z: 0 }, false, false,
    )
    expect(near.kind).toBe('none')
    expect(state.following).toBe(false)
  })

  it('mounted suppresses Stay return movement', () => {
    const state = createDefaultOwnedAnimalControlState()
    setOwnedAnimalControlMode(state, 'stay', { x: 0, z: 0 })
    expect(resolveOwnedControlMovement(
      state, true, { x: STAY_RETURN_START + 4, z: 0 }, { x: 100, z: 0 }, true, false,
    ).kind).toBe('none')
  })

  it('blocks routine trips only for live player-owned Stay', () => {
    const stay = createDefaultOwnedAnimalControlState()
    setOwnedAnimalControlMode(stay, 'stay', { x: 1, z: 2 })
    expect(isOwnedStayBlockingRoutineTrips(stay, true)).toBe(true)
    expect(isOwnedStayBlockingRoutineTrips(stay, false)).toBe(false)
    const follow = createDefaultOwnedAnimalControlState()
    expect(isOwnedStayBlockingRoutineTrips(follow, true)).toBe(false)
  })

  it('snapshot/hydrate keeps Stay mode and anchor, not hysteresis', () => {
    const state = createDefaultOwnedAnimalControlState()
    setOwnedAnimalControlMode(state, 'stay', { x: 7, z: 9 })
    state.following = true
    const snap = snapshotOwnedAnimalControl(state)
    expect(snap).toEqual({ mode: 'stay', stayAnchor: { x: 7, z: 9 } })
    const restored = createDefaultOwnedAnimalControlState()
    hydrateOwnedAnimalControl(restored, snap)
    expect(restored.mode).toBe('stay')
    expect(restored.stayAnchor).toEqual({ x: 7, z: 9 })
    expect(restored.following).toBe(false)
  })
})
