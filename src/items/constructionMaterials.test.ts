import { describe, expect, it } from 'vitest'
import type { DroppedItem, DroppedItems } from './createDroppedItems'
import type { ItemKind } from './items'
import {
  CONSTRUCTION_MATERIAL_RADIUS,
  consumeMaterial,
  hasMaterial,
  nearbyWorldMaterialCount,
} from './constructionMaterials'
import { Inventory } from './Inventory'

/** Minimal pure fake — `constructionMaterials.ts` only reads `nodes()`/calls
 *  `collect(id)`, so a full `createDroppedItems()` (THREE scene, height
 *  sampler) would be Three.js-heavy for no reason. */
function fakeDroppedItems(initial: readonly DroppedItem[]): DroppedItems {
  const items = [...initial]
  return {
    nodes: () => items,
    drop: () => {},
    collect(id) {
      const index = items.findIndex((item) => item.id === id)
      if (index === -1) return null
      const [item] = items.splice(index, 1)
      return { kind: item!.kind, x: item!.x, z: item!.z }
    },
    tick: () => {},
    dispose: () => {},
  }
}

function drop(id: string, kind: ItemKind, x: number, z: number): DroppedItem {
  return { id, kind, x, z }
}

describe('nearbyWorldMaterialCount', () => {
  it('counts only matching-kind items within radius', () => {
    const dropped = fakeDroppedItems([
      drop('a', 'branch', 1, 0),
      drop('b', 'branch', 2, 0),
      drop('c', 'stone', 1, 0),
      drop('d', 'branch', 100, 0),
    ])
    expect(nearbyWorldMaterialCount(dropped, 0, 0, 5, 'branch')).toBe(2)
    expect(nearbyWorldMaterialCount(dropped, 0, 0, 5, 'stone')).toBe(1)
  })
})

describe('hasMaterial / consumeMaterial', () => {
  it('is satisfiable from inventory alone', () => {
    const inventory = new Inventory({ branch: 3 })
    const dropped = fakeDroppedItems([])
    expect(hasMaterial(inventory, dropped, 0, 0, CONSTRUCTION_MATERIAL_RADIUS, { kind: 'branch', count: 3 })).toBe(true)
  })

  it('is satisfiable by combining inventory + nearby world items', () => {
    const inventory = new Inventory({ branch: 1 })
    const dropped = fakeDroppedItems([drop('a', 'branch', 0.5, 0), drop('b', 'branch', 1, 0)])
    expect(hasMaterial(inventory, dropped, 0, 0, CONSTRUCTION_MATERIAL_RADIUS, { kind: 'branch', count: 3 })).toBe(true)
  })

  it('ignores world items outside the radius', () => {
    const inventory = new Inventory({})
    const dropped = fakeDroppedItems([drop('a', 'branch', 50, 0)])
    expect(hasMaterial(inventory, dropped, 0, 0, CONSTRUCTION_MATERIAL_RADIUS, { kind: 'branch', count: 1 })).toBe(false)
  })

  it('does not let beam satisfy a branch requirement or vice versa', () => {
    const inventory = new Inventory({ beam: 5 })
    const dropped = fakeDroppedItems([drop('a', 'beam', 1, 0)])
    expect(hasMaterial(inventory, dropped, 0, 0, CONSTRUCTION_MATERIAL_RADIUS, { kind: 'branch', count: 1 })).toBe(false)
  })

  it('consumes nothing when the total is insufficient', () => {
    const inventory = new Inventory({ branch: 1 })
    const dropped = fakeDroppedItems([drop('a', 'branch', 1, 0)])
    const ok = consumeMaterial(inventory, dropped, 0, 0, CONSTRUCTION_MATERIAL_RADIUS, { kind: 'branch', count: 5 })
    expect(ok).toBe(false)
    expect(inventory.count('branch')).toBe(1)
    expect(dropped.nodes().length).toBe(1)
  })

  it('consumes exact quantity when sufficient, inventory first then nearest world stacks', () => {
    const inventory = new Inventory({ branch: 1 })
    const dropped = fakeDroppedItems([
      drop('far', 'branch', 2.9, 0),
      drop('near', 'branch', 0.5, 0),
    ])
    const ok = consumeMaterial(inventory, dropped, 0, 0, CONSTRUCTION_MATERIAL_RADIUS, { kind: 'branch', count: 3 })
    expect(ok).toBe(true)
    expect(inventory.count('branch')).toBe(0)
    // Exactly 3 consumed total: 1 from inventory + 2 world items — nothing left over.
    expect(dropped.nodes().length).toBe(0)
  })

  it('consumes only what is needed, leaving surplus nearby stacks untouched', () => {
    const inventory = new Inventory({})
    const dropped = fakeDroppedItems([
      drop('near', 'branch', 0.5, 0),
      drop('far', 'branch', 2.9, 0),
    ])
    const ok = consumeMaterial(inventory, dropped, 0, 0, CONSTRUCTION_MATERIAL_RADIUS, { kind: 'branch', count: 1 })
    expect(ok).toBe(true)
    expect(dropped.nodes().map((n) => n.id)).toEqual(['far'])
  })
})
