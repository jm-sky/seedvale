import { describe, expect, it } from 'vitest'
import { isMeleeTool } from '../fauna/faunaCombat'
import { createHeldTool, isToolKind } from './HeldTool'
import { Inventory } from './Inventory'
import { hasItemCapability, ITEM_CATALOG } from './itemCatalog'
import { isWeaponMaintenanceKind } from './itemInstances'
import { hasItemKindCategory, ITEM_DEFS } from './items'
import { createWeaponInstance } from './weaponMaintenance'

describe('dagger and hatchet (plan items-player-047)', () => {
  it('are registered as holdable melee weapons with defense', () => {
    for (const kind of ['dagger', 'hatchet'] as const) {
      expect(ITEM_DEFS[kind]).toBeDefined()
      expect(ITEM_CATALOG[kind].holdable).toBe(true)
      expect(ITEM_CATALOG[kind].melee).not.toBeNull()
      expect(ITEM_CATALOG[kind].defense?.canBlock).toBe(true)
      expect(ITEM_CATALOG[kind].spawn).toBe('none')
      expect(isToolKind(kind)).toBe(true)
      expect(isMeleeTool(kind)).toBe(true)
      expect(isWeaponMaintenanceKind(kind)).toBe(true)
    }
  })

  it('keeps the knife → dagger → damascus_knife melee progression readable', () => {
    expect(ITEM_CATALOG.knife.melee!.damage).toBeLessThan(ITEM_CATALOG.dagger.melee!.damage)
    expect(ITEM_CATALOG.dagger.melee!.damage).toBeLessThan(ITEM_CATALOG.damascus_knife.melee!.damage)
  })

  it('keeps hatchet between dagger and short_sword without replacing either', () => {
    expect(ITEM_CATALOG.dagger.melee!.damage).toBeLessThan(ITEM_CATALOG.hatchet.melee!.damage)
    expect(ITEM_CATALOG.hatchet.melee!.range).toBeLessThan(ITEM_CATALOG.short_sword.melee!.range)
  })

  it('dagger keeps knife-like harvest capabilities; hatchet has none in V1', () => {
    expect(hasItemKindCategory('dagger', 'tool')).toBe(true)
    expect(hasItemKindCategory('dagger', 'weapon')).toBe(true)
    expect(hasItemCapability('dagger', 'meat_harvesting')).toBe(true)
    expect(hasItemCapability('dagger', 'branch_trimming')).toBe(true)
    expect(hasItemKindCategory('hatchet', 'weapon')).toBe(true)
    expect(hasItemKindCategory('hatchet', 'tool')).toBe(false)
    expect(hasItemCapability('hatchet', 'wood_chopping')).toBe(false)
    expect(ITEM_CATALOG.hatchet.capabilities ?? []).toHaveLength(0)
  })

  it('equips from inventory as fresh full-condition instances', () => {
    const inventory = new Inventory({}, undefined, [createWeaponInstance('dagger'), createWeaponInstance('hatchet')])
    const held = createHeldTool(inventory)
    expect(held.equip('dagger')).toBe(true)
    expect(held.held()).toBe('dagger')
    expect(held.equip('hatchet')).toBe(true)
    expect(held.held()).toBe('hatchet')
  })
})

describe('masterwork hunting bow (plan items-player-047)', () => {
  it('uses the normal ranged pipeline with the plan-fixed profile', () => {
    expect(ITEM_DEFS.masterwork_hunting_bow).toBeDefined()
    expect(ITEM_DEFS.masterwork_hunting_bow.size).toBe('MD')
    expect(ITEM_CATALOG.masterwork_hunting_bow.holdable).toBe(true)
    expect(ITEM_CATALOG.masterwork_hunting_bow.melee).toBeNull()
    const ranged = ITEM_CATALOG.masterwork_hunting_bow.ranged
    expect(ranged).not.toBeNull()
    expect(ranged!.damage).toBe(24)
    expect(ranged!.drawTime).toBe(0.38)
    expect(ranged!.recovery).toBe(0.25)
    expect(ranged!.accuracy).toBe(0.9)
    expect(ranged!.criticalChance).toBe(0.1)
    expect(ranged!.ammoKinds).toEqual(['arrow', 'broadhead_arrow', 'war_arrow'])
    expect(isToolKind('masterwork_hunting_bow')).toBe(true)
    expect(isWeaponMaintenanceKind('masterwork_hunting_bow')).toBe(false)
  })

  it('sits between hunting_bow and long_bow on damage, but wins on speed/accuracy', () => {
    const huntingBow = ITEM_CATALOG.hunting_bow.ranged!
    const longBow = ITEM_CATALOG.long_bow.ranged!
    const masterwork = ITEM_CATALOG.masterwork_hunting_bow.ranged!
    expect(masterwork.damage).toBeGreaterThan(huntingBow.damage)
    expect(masterwork.damage).toBeLessThan(longBow.damage)
    expect(masterwork.drawTime).toBeLessThan(huntingBow.drawTime)
    expect(masterwork.drawTime).toBeLessThan(longBow.drawTime)
    expect(masterwork.accuracy).toBeGreaterThan(huntingBow.accuracy)
    expect(masterwork.accuracy).toBeGreaterThan(longBow.accuracy)
    expect(ITEM_DEFS.masterwork_hunting_bow.weight).toBeLessThanOrEqual(ITEM_DEFS.hunting_bow.weight)
  })

  it('is never instance-backed like the other bows and stays a stack item', () => {
    const inventory = new Inventory({ masterwork_hunting_bow: 1 })
    expect(inventory.count('masterwork_hunting_bow')).toBe(1)
    expect(inventory.countInstances('masterwork_hunting_bow')).toBe(0)
  })
})
