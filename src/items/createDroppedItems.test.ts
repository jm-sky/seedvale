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
