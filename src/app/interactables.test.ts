import { describe, expect, it } from 'vitest'
import { resolveHaySpot, resolveWaterBodyKind } from './interactables'

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

describe('resolveWaterBodyKind (plan ui-input-006)', () => {
  it('is lake when the shore probe hits and the point reads inland', () => {
    expect(resolveWaterBodyKind(true, 0, null)).toBe('lake')
  })

  it('is ocean when the shore probe hits and the point reads oceanic', () => {
    expect(resolveWaterBodyKind(true, 1, null)).toBe('ocean')
  })

  it('is river when within the shore margin of a river bank, even with no lake/ocean probe hit', () => {
    expect(resolveWaterBodyKind(false, 0, 0)).toBe('river')
    expect(resolveWaterBodyKind(false, 0, 1.5)).toBe('river')
  })

  it('is null away from any shoreline', () => {
    expect(resolveWaterBodyKind(false, 0, null)).toBeNull()
    expect(resolveWaterBodyKind(false, 0, 1.51)).toBeNull()
  })

  it('prefers the lake/ocean probe over a river reading at the same point', () => {
    expect(resolveWaterBodyKind(true, 0, 0)).toBe('lake')
  })
})
