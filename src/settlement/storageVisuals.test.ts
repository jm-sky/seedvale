import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { FOOD_ITEM_KINDS } from '../items/foodItems'
import { Inventory } from '../items/Inventory'
import {
  createFoodStorageVisual,
  createWoodPileVisual,
  FOOD_STORAGE_MAX_SLOTS,
  selectFoodStorageSlots,
  WOOD_PILE_MAX_EXTRA,
  woodPileVisualState,
} from './storageVisuals'

const sampleHeight = () => 0

describe('woodPileVisualState', () => {
  it('produces no pile at zero', () => {
    expect(woodPileVisualState(0)).toEqual({ visible: false, scale: 0, extraPiles: 0 })
  })

  it('produces the correct band for each documented threshold', () => {
    expect(woodPileVisualState(1).visible).toBe(true)
    expect(woodPileVisualState(3).scale).toBe(woodPileVisualState(1).scale)
    expect(woodPileVisualState(4).scale).toBeGreaterThan(woodPileVisualState(3).scale)
    expect(woodPileVisualState(7).scale).toBe(woodPileVisualState(4).scale)
    expect(woodPileVisualState(8).scale).toBeGreaterThan(woodPileVisualState(7).scale)
    expect(woodPileVisualState(12).scale).toBe(woodPileVisualState(8).scale)
    expect(woodPileVisualState(13).scale).toBeGreaterThan(woodPileVisualState(12).scale)
    expect(woodPileVisualState(20).scale).toBe(woodPileVisualState(13).scale)
  })

  it('adds an additional pile once quantity passes 20, bounded', () => {
    expect(woodPileVisualState(20).extraPiles).toBe(0)
    expect(woodPileVisualState(21).extraPiles).toBe(1)
    expect(woodPileVisualState(40).extraPiles).toBe(1)
    expect(woodPileVisualState(41).extraPiles).toBe(2)
    expect(woodPileVisualState(1000).extraPiles).toBe(WOOD_PILE_MAX_EXTRA)
  })

  it('is deterministic for the same quantity', () => {
    expect(woodPileVisualState(9)).toEqual(woodPileVisualState(9))
  })
})

describe('selectFoodStorageSlots', () => {
  it('represents every existing food ItemKind on its own', () => {
    for (const kind of FOOD_ITEM_KINDS) {
      const items = new Inventory({ [kind]: 1 })
      const slots = selectFoodStorageSlots(items)
      expect(slots.map((s) => s.kind)).toContain(kind)
    }
  })

  it('keeps different food kinds distinguishable in the selection', () => {
    const items = new Inventory({ carrot: 3, fish: 2 })
    const slots = selectFoodStorageSlots(items)
    expect(slots.some((s) => s.kind === 'carrot')).toBe(true)
    expect(slots.some((s) => s.kind === 'fish')).toBe(true)
  })

  it('never selects a non-food ItemKind', () => {
    const items = new Inventory({ carrot: 3, arrow: 5, stone: 9 })
    const slots = selectFoodStorageSlots(items)
    expect(slots.some((s) => s.kind === 'arrow')).toBe(false)
    expect(slots.some((s) => s.kind === 'stone')).toBe(false)
  })

  it('bounds the number of simultaneous kinds represented', () => {
    const many: Partial<Record<string, number>> = {}
    for (const kind of FOOD_ITEM_KINDS) many[kind] = 1
    const items = new Inventory(many as Record<string, number>)
    expect(selectFoodStorageSlots(items).length).toBeLessThanOrEqual(FOOD_STORAGE_MAX_SLOTS)
  })

  it('never removes or alters stored items — read-only', () => {
    const items = new Inventory({ carrot: 4 })
    selectFoodStorageSlots(items)
    expect(items.count('carrot')).toBe(4)
  })

  it('is deterministic for the same contents', () => {
    const a = new Inventory({ carrot: 2, fish: 1 })
    const b = new Inventory({ carrot: 2, fish: 1 })
    expect(selectFoodStorageSlots(a)).toEqual(selectFoodStorageSlots(b))
  })
})

describe('createWoodPileVisual', () => {
  it('hides the main pile and every extra pile at zero quantity', () => {
    const main = new THREE.Object3D()
    const extras = [new THREE.Object3D(), new THREE.Object3D()]
    const visual = createWoodPileVisual(main, extras)
    visual.sync(0)
    expect(main.visible).toBe(false)
    expect(extras.every((e) => !e.visible)).toBe(true)
  })

  it('shows the main pile and scales it once quantity is positive', () => {
    const main = new THREE.Object3D()
    const visual = createWoodPileVisual(main, [])
    visual.sync(5)
    expect(main.visible).toBe(true)
    expect(main.scale.x).toBeGreaterThan(0)
  })

  it('reveals extra piles only once quantity overflows the top band', () => {
    const main = new THREE.Object3D()
    const extras = [new THREE.Object3D(), new THREE.Object3D(), new THREE.Object3D()]
    const visual = createWoodPileVisual(main, extras)
    visual.sync(20)
    expect(extras.every((e) => !e.visible)).toBe(true)
    visual.sync(25)
    expect(extras[0]!.visible).toBe(true)
    expect(extras[1]!.visible).toBe(false)
  })

  it('updates visuals when the underlying quantity changes', () => {
    const main = new THREE.Object3D()
    const visual = createWoodPileVisual(main, [])
    visual.sync(2)
    const smallScale = main.scale.x
    visual.sync(15)
    expect(main.scale.x).toBeGreaterThan(smallScale)
  })

  it('disposal removes the extra-pile objects it created', () => {
    const main = new THREE.Object3D()
    const parent = new THREE.Group()
    const extra = new THREE.Object3D()
    parent.add(extra)
    const visual = createWoodPileVisual(main, [extra])
    visual.dispose()
    expect(extra.parent).toBeNull()
  })
})

describe('createFoodStorageVisual', () => {
  it('adds no children for an empty inventory', () => {
    const group = new THREE.Group()
    const visual = createFoodStorageVisual(group, { x: 0, z: 0 }, sampleHeight)
    visual.sync(new Inventory())
    expect(group.children.length).toBe(0)
  })

  it('adds a mesh for stored food and updates on content change', () => {
    const group = new THREE.Group()
    const visual = createFoodStorageVisual(group, { x: 0, z: 0 }, sampleHeight)
    visual.sync(new Inventory({ carrot: 2 }))
    expect(group.children.length).toBe(1)
    visual.sync(new Inventory({ carrot: 2, fish: 1 }))
    expect(group.children.length).toBe(2)
  })

  it('never mutates the inventory it reads', () => {
    const group = new THREE.Group()
    const visual = createFoodStorageVisual(group, { x: 0, z: 0 }, sampleHeight)
    const items = new Inventory({ carrot: 3 })
    visual.sync(items)
    expect(items.count('carrot')).toBe(3)
  })

  it('household and settlement storage use the same mechanism', () => {
    const householdGroup = new THREE.Group()
    const settlementGroup = new THREE.Group()
    const householdVisual = createFoodStorageVisual(householdGroup, { x: 1, z: 1 }, sampleHeight)
    const settlementVisual = createFoodStorageVisual(settlementGroup, { x: 2, z: 2 }, sampleHeight)
    const items = new Inventory({ carrot: 2 })
    householdVisual.sync(items)
    settlementVisual.sync(items)
    expect(householdGroup.children.length).toBe(settlementGroup.children.length)
  })

  it('disposal removes every created mesh from its parent', () => {
    const group = new THREE.Group()
    const visual = createFoodStorageVisual(group, { x: 0, z: 0 }, sampleHeight)
    visual.sync(new Inventory({ carrot: 2, fish: 1 }))
    expect(group.children.length).toBeGreaterThan(0)
    visual.dispose()
    expect(group.children.length).toBe(0)
  })
})
