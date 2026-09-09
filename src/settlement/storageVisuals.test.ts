import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createSettlementEconomy } from '../economy/settlementEconomy'
import { FOOD_ITEM_KINDS } from '../items/foodItems'
import { Inventory } from '../items/Inventory'
import { createHousehold, type Household } from './household'
import {
  createFoodStorageVisual,
  createWoodPileVisual,
  findWoodPileStageNodes,
  FOOD_STORAGE_MAX_SLOTS,
  selectFoodStorageSlots,
  WOOD_PILE_MAX_EXTRA,
  WOOD_PILE_STAGES,
  woodPileStage,
  type WoodPileStage,
  woodPileVisualState,
} from './storageVisuals'

const sampleHeight = () => 0

function householdWithWood(id: string, wood: number): Household {
  const household = createHousehold(id, 's', `${id}:home`)
  household.stock.remove('wood', household.stock.query('wood'))
  household.stock.add('wood', wood)
  return household
}

function progressivePile(): THREE.Object3D {
  const root = new THREE.Object3D()
  for (const name of WOOD_PILE_STAGES) {
    const node = new THREE.Object3D()
    node.name = name
    root.add(node)
  }
  return root
}

function visibleStages(root: THREE.Object3D): WoodPileStage[] {
  return WOOD_PILE_STAGES.filter((name) => root.getObjectByName(name)?.visible)
}

describe('woodPileStage', () => {
  it('maps documented quantity boundaries onto authored variants', () => {
    expect(woodPileStage(0)).toBeNull()
    expect(woodPileStage(1)).toBe('Pile_01')
    expect(woodPileStage(2)).toBe('Pile_05')
    expect(woodPileStage(5)).toBe('Pile_05')
    expect(woodPileStage(6)).toBe('Pile_10')
    expect(woodPileStage(10)).toBe('Pile_10')
    expect(woodPileStage(11)).toBe('Pile_18')
    expect(woodPileStage(20)).toBe('Pile_18')
    expect(woodPileStage(21)).toBe('Pile_29')
    expect(woodPileStage(1000)).toBe('Pile_29')
  })

  it('is deterministic for the same quantity', () => {
    expect(woodPileStage(9)).toBe(woodPileStage(9))
  })
})

describe('woodPileVisualState', () => {
  it('produces no primary stage at zero', () => {
    expect(woodPileVisualState(0)).toEqual({ stage: null, extraPiles: 0 })
  })

  it('adds an additional pile once quantity passes 20, bounded', () => {
    expect(woodPileVisualState(20).extraPiles).toBe(0)
    expect(woodPileVisualState(21).extraPiles).toBe(1)
    expect(woodPileVisualState(40).extraPiles).toBe(1)
    expect(woodPileVisualState(41).extraPiles).toBe(2)
    expect(woodPileVisualState(1000).extraPiles).toBe(WOOD_PILE_MAX_EXTRA)
  })

  it('keeps Pile_29 as the primary stage for high stock', () => {
    expect(woodPileVisualState(21).stage).toBe('Pile_29')
    expect(woodPileVisualState(1000).stage).toBe('Pile_29')
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

describe('wood pile visual ownership (settlements-npcs-025 follow-up)', () => {
  it('settlement and household piles stay independent', () => {
    const settlementPile = progressivePile()
    const householdAPile = progressivePile()
    const householdBPile = progressivePile()
    const settlementVisual = createWoodPileVisual(settlementPile, [])
    const householdAVisual = createWoodPileVisual(householdAPile, [])
    const householdBVisual = createWoodPileVisual(householdBPile, [])

    const economy = createSettlementEconomy('s', { wood: 10 }, [])
    const householdA = householdWithWood('a', 2)
    const householdB = householdWithWood('b', 6)

    settlementVisual.sync(economy.query('wood'))
    householdAVisual.sync(householdA.stock.query('wood'))
    householdBVisual.sync(householdB.stock.query('wood'))

    expect(visibleStages(settlementPile)).toEqual(['Pile_10'])
    expect(visibleStages(householdAPile)).toEqual(['Pile_05'])
    expect(visibleStages(householdBPile)).toEqual(['Pile_10'])

    householdA.stock.add('wood', 9)
    householdAVisual.sync(householdA.stock.query('wood'))
    expect(visibleStages(householdAPile)).toEqual(['Pile_18'])
    expect(visibleStages(householdBPile)).toEqual(['Pile_10'])
    expect(visibleStages(settlementPile)).toEqual(['Pile_10'])

    economy.add('wood', 8)
    settlementVisual.sync(economy.query('wood'))
    expect(visibleStages(settlementPile)).toEqual(['Pile_18'])
    expect(visibleStages(householdBPile)).toEqual(['Pile_10'])
  })
})

describe('createWoodPileVisual', () => {
  it('hides every authored variant and extra pile at zero quantity', () => {
    const main = progressivePile()
    const extras = [new THREE.Object3D(), new THREE.Object3D()]
    const visual = createWoodPileVisual(main, extras)
    visual.sync(0)
    expect(visibleStages(main)).toEqual([])
    expect(extras.every((e) => !e.visible)).toBe(true)
  })

  it('shows exactly one authored variant for a positive quantity', () => {
    const main = progressivePile()
    const visual = createWoodPileVisual(main, [])
    visual.sync(5)
    expect(visibleStages(main)).toEqual(['Pile_05'])
  })

  it('selects Pile_29 for 21+ without scaling the primary pile', () => {
    const main = progressivePile()
    const baseScale = main.scale.x
    const visual = createWoodPileVisual(main, [])
    visual.sync(21)
    expect(visibleStages(main)).toEqual(['Pile_29'])
    visual.sync(1000)
    expect(visibleStages(main)).toEqual(['Pile_29'])
    expect(main.scale.x).toBe(baseScale)
  })

  it('reveals extra piles only once quantity overflows the last authored stage, bounded', () => {
    const main = progressivePile()
    const extras = [new THREE.Object3D(), new THREE.Object3D(), new THREE.Object3D()]
    const visual = createWoodPileVisual(main, extras)
    visual.sync(20)
    expect(extras.every((e) => !e.visible)).toBe(true)
    visual.sync(21)
    expect(extras[0]!.visible).toBe(true)
    expect(extras[1]!.visible).toBe(false)
    visual.sync(1000)
    expect(extras.filter((e) => e.visible)).toHaveLength(WOOD_PILE_MAX_EXTRA)
  })

  it('updates the visible variant when the underlying quantity changes', () => {
    const main = progressivePile()
    const visual = createWoodPileVisual(main, [])
    visual.sync(1)
    expect(visibleStages(main)).toEqual(['Pile_01'])
    visual.sync(15)
    expect(visibleStages(main)).toEqual(['Pile_18'])
  })

  it('does not replace object identities across repeated sync calls', () => {
    const main = progressivePile()
    const extras = [new THREE.Object3D()]
    const nodes = Object.fromEntries(
      WOOD_PILE_STAGES.map((name) => [name, main.getObjectByName(name)]),
    )
    const extra = extras[0]!
    const visual = createWoodPileVisual(main, extras)
    visual.sync(1)
    visual.sync(21)
    visual.sync(1)
    expect(main.children).toHaveLength(WOOD_PILE_STAGES.length)
    for (const name of WOOD_PILE_STAGES) {
      expect(main.getObjectByName(name)).toBe(nodes[name])
    }
    expect(extras[0]).toBe(extra)
  })

  it('falls back to showing the whole pile when authored node names are missing', () => {
    const main = new THREE.Object3D()
    const baseScale = main.scale.clone()
    const visual = createWoodPileVisual(main, [])
    expect(findWoodPileStageNodes(main)).toBeNull()
    visual.sync(0)
    expect(main.visible).toBe(false)
    visual.sync(5)
    expect(main.visible).toBe(true)
    expect(main.scale.equals(baseScale)).toBe(true)
  })

  it('disposal removes the extra-pile objects it created', () => {
    const main = progressivePile()
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
