import { describe, expect, it } from 'vitest'
import { resolveHaySpot } from './interactables'

describe('resolveHaySpot', () => {
  const garden = { x: 0, z: 0 }
  // A representative real hay-bale offset (`buildSettlementProps`'s
  // `gardenPlotRadius + 1.4 + up to 1.2`) — well outside a 2.5-unit
  // `INTERACT_RANGE`, matching the actual bug: standing at the garden pad
  // center let `[E]` fire on a bale that was actually this far away.
  const haySpots = [{ x: 4.5, z: 0 }]

  it('does not offer hay when only the garden pad (not the actual bale) is in range', () => {
    // Player at the garden center — 4.5 units from the real bale, outside
    // the 2.5-unit interact range.
    expect(resolveHaySpot(haySpots, garden, { x: 0, z: 0 }, 2.5)).toBeNull()
  })

  it('offers hay once the player is actually near the physical bale', () => {
    expect(resolveHaySpot(haySpots, garden, { x: 4, z: 0 }, 2.5)).toEqual({ x: 4.5, z: 0 })
  })

  it('falls back to the garden pad for landmark fixtures with no haySpots recorded', () => {
    expect(resolveHaySpot(undefined, garden, { x: 0, z: 0 }, 2.5)).toEqual(garden)
    expect(resolveHaySpot([], garden, { x: 0, z: 0 }, 2.5)).toEqual(garden)
  })

  it('returns null when nothing is in range', () => {
    expect(resolveHaySpot(haySpots, garden, { x: 100, z: 100 }, 2.5)).toBeNull()
  })
})
