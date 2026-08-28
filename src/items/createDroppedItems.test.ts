import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import type { TrapItemInstance, WeaponItemInstance } from './itemInstances'
import { createDroppedItems } from './createDroppedItems'
import { toSaveItemInstance } from './Inventory'

const sampleHeight = (): number => 0

// Plan 199 — a dropped instance-backed item (trap/weapon-maintenance kind)
// must carry its `ItemInstance` id/durability/sharpness through the world
// round trip, not just its `kind`; `collect()` hands back exactly what
// `drop()` was given so a caller can restore the same instance instead of
// minting a fresh default one.
describe('createDroppedItems instance identity (plan 199)', () => {
  it('round-trips an instance-backed drop unchanged through collect()', () => {
    const dropped = createDroppedItems(new Scene(), sampleHeight)
    const weapon: WeaponItemInstance = { id: 'item:123:1', kind: 'axe', durability: 0.4, sharpness: 0.7 }
    const instance = toSaveItemInstance(weapon)
    dropped.drop('axe', 5, 7, instance)

    const [node] = dropped.nodes()
    expect(node!.instance).toEqual(instance)

    const collected = dropped.collect(node!.id)
    expect(collected).toEqual({ kind: 'axe', x: 5, z: 7, instance })
  })

  it('leaves instance undefined for a plain stackable drop', () => {
    const dropped = createDroppedItems(new Scene(), sampleHeight)
    dropped.drop('stone', 1, 2)
    const [node] = dropped.nodes()
    expect(node!.instance).toBeUndefined()
    const collected = dropped.collect(node!.id)
    expect(collected?.instance).toBeUndefined()
  })

  it('preserves distinct instances across two separately dropped items of the same kind', () => {
    const dropped = createDroppedItems(new Scene(), sampleHeight)
    const trapA: TrapItemInstance = { id: 'item:1', kind: 'trap_simple', durability: 1 }
    const trapB: TrapItemInstance = { id: 'item:2', kind: 'trap_simple', durability: 0.2 }
    const a = toSaveItemInstance(trapA)
    const b = toSaveItemInstance(trapB)
    dropped.drop('trap_simple', 0, 0, a)
    dropped.drop('trap_simple', 1, 1, b)

    const [nodeA, nodeB] = dropped.nodes()
    expect(dropped.collect(nodeA!.id)?.instance).toEqual(a)
    expect(dropped.collect(nodeB!.id)?.instance).toEqual(b)
  })
})

// Plan fauna-002 — a producer (e.g. a chicken's egg-laying cycle) needs to
// know when its own drop is actually picked up, so it can gate starting a
// new cycle on real collection instead of a blind timer.
describe('createDroppedItems onCollected hook (plan fauna-002)', () => {
  it('fires onCollected exactly once when collect() finds the item', () => {
    const dropped = createDroppedItems(new Scene(), sampleHeight)
    let collectedCount = 0
    dropped.drop('egg', 3, 4, undefined, () => { collectedCount++ })
    const [node] = dropped.nodes()
    expect(dropped.collect(node!.id)).toEqual({ kind: 'egg', x: 3, z: 4, instance: undefined })
    expect(collectedCount).toBe(1)
  })

  it('never fires onCollected for an id that was never dropped', () => {
    const dropped = createDroppedItems(new Scene(), sampleHeight)
    let collectedCount = 0
    dropped.drop('egg', 0, 0, undefined, () => { collectedCount++ })
    expect(dropped.collect('not-a-real-id')).toBeNull()
    expect(collectedCount).toBe(0)
  })

  it('does not require onCollected — plain drops still collect fine', () => {
    const dropped = createDroppedItems(new Scene(), sampleHeight)
    dropped.drop('egg', 0, 0)
    const [node] = dropped.nodes()
    expect(dropped.collect(node!.id)).toEqual({ kind: 'egg', x: 0, z: 0, instance: undefined })
  })
})
