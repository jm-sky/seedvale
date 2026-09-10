import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { createDroppedItems } from '../items/createDroppedItems'
import { Inventory } from '../items/Inventory'
import { ITEM_DEFS } from '../items/items'
import { DROPPED_ITEM_GROUP_RADIUS, groupDroppedItemCandidates, resolveHaySpot, worldItemAllowsAltInteract } from './interactables'

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

describe('groupDroppedItemCandidates (plan items-player-022)', () => {
  const sampleHeight = (): number => 0

  it('collapses six nearby plain branches into one group of quantity 6', () => {
    const dropped = createDroppedItems(new Scene(), sampleHeight)
    for (let i = 0; i < 6; i++) dropped.drop('branch', 0.05 * i, 0)
    const groups = groupDroppedItemCandidates(dropped.nodes())
    expect(groups).toHaveLength(1)
    expect(groups[0]?.kind).toBe('branch')
    expect(groups[0]?.memberIds).toHaveLength(6)
    expect(groups[0]?.memberIds).toEqual(dropped.nodes().map((item) => item.id))
  })

  it('keeps branch and beam piles as separate groups', () => {
    const dropped = createDroppedItems(new Scene(), sampleHeight)
    for (let i = 0; i < 3; i++) dropped.drop('branch', 0, 0)
    for (let i = 0; i < 3; i++) dropped.drop('beam', 0.1, 0)
    const groups = groupDroppedItemCandidates(dropped.nodes())
    expect(groups.map((group) => [group.kind, group.memberIds.length])).toEqual([
      ['branch', 3],
      ['beam', 3],
    ])
  })

  it('does not group instance-backed or perishable drops into a count-only stack', () => {
    const dropped = createDroppedItems(new Scene(), sampleHeight)
    dropped.drop('branch', 0, 0)
    dropped.drop('axe', 0, 0, { id: 'item:axe:1', kind: 'axe', durability: 0.4, sharpness: 0.5 })
    dropped.drop('deer_meat', 0, 0, undefined, undefined, {
      count: 1, acquiredAtDays: 1, accumulatedEffectiveAge: 0, lastCheckpointDays: 1, decayModifier: 1,
    })
    const groups = groupDroppedItemCandidates(dropped.nodes())
    expect(groups.map((group) => group.memberIds.length)).toEqual([1, 1, 1])
    expect(groups.map((group) => group.kind)).toEqual(['branch', 'axe', 'deer_meat'])
  })

  it('does not merge identical kinds beyond the cluster radius', () => {
    const dropped = createDroppedItems(new Scene(), sampleHeight)
    dropped.drop('branch', 0, 0)
    dropped.drop('branch', DROPPED_ITEM_GROUP_RADIUS + 0.2, 0)
    const groups = groupDroppedItemCandidates(dropped.nodes())
    expect(groups).toHaveLength(2)
  })

  it('keeps membership order stable across repeated grouping of the same nodes', () => {
    const dropped = createDroppedItems(new Scene(), sampleHeight)
    dropped.drop('branch', 0, 0)
    dropped.drop('beam', 0, 0)
    dropped.drop('branch', 0.1, 0)
    const first = groupDroppedItemCandidates(dropped.nodes())
    const second = groupDroppedItemCandidates(dropped.nodes())
    expect(second).toEqual(first)
  })

  it('partial capacity pickup leaves the remaining dropped records', () => {
    const dropped = createDroppedItems(new Scene(), sampleHeight)
    for (let i = 0; i < 6; i++) dropped.drop('branch', 0, 0)
    const inventory = new Inventory({}, ITEM_DEFS.branch.weight * 2)
    const [group] = groupDroppedItemCandidates(dropped.nodes())
    for (const id of group!.memberIds) {
      if (!inventory.canAdd('branch')) break
      const collected = dropped.collect(id)
      if (collected) inventory.add(collected.kind, 1)
    }
    expect(inventory.count('branch')).toBe(2)
    expect(dropped.nodes().map((item) => item.id)).toEqual(group!.memberIds.slice(2))
  })
})

describe('worldItemAllowsAltInteract', () => {
  it('rejects non-consumable world tools and materials (R is not pickup)', () => {
    expect(worldItemAllowsAltInteract('shovel')).toBe(false)
    expect(worldItemAllowsAltInteract('axe')).toBe(false)
    expect(worldItemAllowsAltInteract('branch')).toBe(false)
    expect(worldItemAllowsAltInteract('stone')).toBe(false)
  })

  it('allows single consumable items for the plan-153 pickup+consume alternate', () => {
    expect(worldItemAllowsAltInteract('mushroom')).toBe(true)
    expect(worldItemAllowsAltInteract('herb')).toBe(true)
  })

  it('rejects grouped/stacked targets even when the kind is consumable', () => {
    expect(worldItemAllowsAltInteract('mushroom', 2)).toBe(false)
  })
})
