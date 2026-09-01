import { describe, expect, it } from 'vitest'
import { pickInGaze } from './findInteractionTarget'

describe('pickInGaze (plan ui-input-006 fishing-interaction fix)', () => {
  const playerPos = { x: 10, z: 10 }
  const facingNorth = 0 // yaw 0 → forward is -z, per pickInGaze's own convention

  it('never selects a candidate sitting exactly on the player position', () => {
    // This is the bug: `waterEdge` used to be built with
    // `position: { x: playerPos.x, z: playerPos.z }`, so `dist` here is
    // always exactly 0 and the `dist < 1e-4` guard silently drops it —
    // no [E] prompt ever appears at any shoreline.
    const candidates = [{ position: { x: playerPos.x, z: playerPos.z } }]
    expect(pickInGaze(candidates, playerPos, facingNorth, 5, 0.5)).toBeNull()
  })

  it('selects a candidate offset from the player and within the gaze cone', () => {
    // A real shore point a couple of units away, in front of the player.
    const candidates = [{ position: { x: 10, z: 8 } }]
    expect(pickInGaze(candidates, playerPos, facingNorth, 5, 0.5)).toBe(candidates[0])
  })
})
