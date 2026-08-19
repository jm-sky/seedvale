import { describe, expect, it } from 'vitest'
import { isMeleeTool } from '../fauna/faunaCombat'
import { createHeldTool, isToolKind } from './HeldTool'
import { Inventory } from './Inventory'
import { isChopTool, isHarvestKnife, ITEM_CATALOG } from './itemCatalog'
import { hasItemKindCategory, ITEM_DEFS } from './items'
import { isMerchantStock, merchantPrice, tradeValue } from './tradeCatalog'

const HQ_KINDS = [
  'damascus_knife',
  'damascus_short_sword',
  'damascus_long_sword',
  'obsidian_sword',
  'battle_axe',
  'masterwork_sword',
] as const

describe('high-quality melee weapons (plan 160)', () => {
  it('registers all six kinds as holdable melee with defense', () => {
    for (const kind of HQ_KINDS) {
      expect(ITEM_DEFS[kind]).toBeDefined()
      expect(ITEM_CATALOG[kind].holdable).toBe(true)
      expect(ITEM_CATALOG[kind].melee).not.toBeNull()
      expect(ITEM_CATALOG[kind].defense?.canBlock).toBe(true)
      expect(ITEM_CATALOG[kind].spawn).toBe('none')
      expect(ITEM_CATALOG[kind].modelUrl).toBeNull()
      expect(isToolKind(kind)).toBe(true)
      expect(isMeleeTool(kind)).toBe(true)
    }
  })

  it('keeps a readable damage hierarchy over the base weapons', () => {
    expect(ITEM_CATALOG.knife.melee!.damage).toBeLessThan(ITEM_CATALOG.damascus_knife.melee!.damage)
    expect(ITEM_CATALOG.short_sword.melee!.damage).toBeLessThan(ITEM_CATALOG.damascus_short_sword.melee!.damage)
    expect(ITEM_CATALOG.long_sword.melee!.damage).toBeLessThan(ITEM_CATALOG.masterwork_sword.melee!.damage)
    expect(ITEM_CATALOG.masterwork_sword.melee!.damage).toBeLessThan(ITEM_CATALOG.damascus_long_sword.melee!.damage)
    expect(ITEM_CATALOG.axe.melee!.damage).toBeLessThan(ITEM_CATALOG.battle_axe.melee!.damage)
    expect(ITEM_CATALOG.obsidian_sword.melee!.damage).toBeGreaterThan(ITEM_CATALOG.damascus_long_sword.melee!.damage)
  })

  it('treats battle_axe as a tool and a weapon that still chops trees', () => {
    expect(hasItemKindCategory('battle_axe', 'tool')).toBe(true)
    expect(hasItemKindCategory('battle_axe', 'weapon')).toBe(true)
    expect(isChopTool('battle_axe')).toBe(true)
    expect(isChopTool('axe')).toBe(true)
    expect(isChopTool('long_sword')).toBe(false)
  })

  it('treats damascus_knife as a harvest knife', () => {
    expect(hasItemKindCategory('damascus_knife', 'tool')).toBe(true)
    expect(hasItemKindCategory('damascus_knife', 'weapon')).toBe(true)
    expect(isHarvestKnife('damascus_knife')).toBe(true)
    expect(isHarvestKnife('knife')).toBe(true)
    expect(isHarvestKnife('short_sword')).toBe(false)
  })

  it('stocks four elite weapons at Kupiec and keeps the two rarest quest-only', () => {
    expect(merchantPrice('damascus_knife')).toBe(90)
    expect(merchantPrice('damascus_short_sword')).toBe(140)
    expect(merchantPrice('masterwork_sword')).toBe(160)
    expect(merchantPrice('battle_axe')).toBe(110)
    expect(isMerchantStock('damascus_long_sword')).toBe(false)
    expect(isMerchantStock('obsidian_sword')).toBe(false)
    expect(tradeValue('damascus_long_sword')).toBe(240)
    expect(tradeValue('obsidian_sword')).toBe(320)
  })

  it('equips the new weapons from inventory', () => {
    const inventory = new Inventory({ battle_axe: 1, obsidian_sword: 1 })
    const held = createHeldTool(inventory)
    expect(held.equip('battle_axe')).toBe(true)
    expect(held.held()).toBe('battle_axe')
    expect(held.equip('obsidian_sword')).toBe(true)
    expect(held.held()).toBe('obsidian_sword')
  })
})
