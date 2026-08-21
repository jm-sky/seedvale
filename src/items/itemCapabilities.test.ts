import { describe, expect, it } from 'vitest'
import { isToolKind, type ToolKind } from './HeldTool'
import { Inventory } from './Inventory'
import {
  CAPABILITY_KINDS,
  CAPABILITY_NEED_LABEL,
  hasItemCapability,
  HOLDABLE_KINDS,
  ITEM_CATALOG,
  type ItemCapability,
} from './itemCatalog'
import { createItemInstanceId } from './itemInstances'
import { type ItemKind } from './items'

/** Plan 184 — semantic item capabilities: one declaration in `ITEM_CATALOG`
 *  answers every "can this item do X?" gate, instead of scattered
 *  `kind === 'shovel'` / `holdsAny('knife') || holdsAny('damascus_knife')`
 *  checks. */
describe('item capability lookup', () => {
  it('answers a declared capability per kind', () => {
    expect(hasItemCapability('shovel', 'soil_digging')).toBe(true)
    expect(hasItemCapability('pickaxe', 'rock_mining')).toBe(true)
    expect(hasItemCapability('axe', 'wood_chopping')).toBe(true)
    expect(hasItemCapability('firestarter', 'fire_starting')).toBe(true)
    expect(hasItemCapability('fishing_rod', 'fishing')).toBe(true)
  })

  it('is false for a kind without the capability, and for no item at all', () => {
    expect(hasItemCapability('shovel', 'rock_mining')).toBe(false)
    expect(hasItemCapability('pickaxe', 'soil_digging')).toBe(false)
    expect(hasItemCapability('bread', 'wood_chopping')).toBe(false)
    expect(hasItemCapability(null, 'soil_digging')).toBe(false)
    expect(hasItemCapability(undefined, 'soil_digging')).toBe(false)
  })

  it('lets several kinds substitute for the same operation', () => {
    expect(hasItemCapability('axe', 'wood_chopping')).toBe(true)
    expect(hasItemCapability('battle_axe', 'wood_chopping')).toBe(true)
    expect(hasItemCapability('knife', 'meat_harvesting')).toBe(true)
    expect(hasItemCapability('damascus_knife', 'meat_harvesting')).toBe(true)
  })

  it('derives CAPABILITY_KINDS from the catalog, best (highest melee damage) first', () => {
    expect(CAPABILITY_KINDS.wood_chopping).toEqual(['battle_axe', 'axe'])
    expect(CAPABILITY_KINDS.meat_harvesting).toEqual(['damascus_knife', 'knife'])
    expect(CAPABILITY_KINDS.soil_digging).toEqual(['shovel'])
    expect(CAPABILITY_KINDS.rock_mining).toEqual(['pickaxe'])
  })

  it('keeps CAPABILITY_KINDS and the per-entry declarations in sync', () => {
    for (const capability of Object.keys(CAPABILITY_NEED_LABEL) as ItemCapability[]) {
      const declared = (Object.keys(ITEM_CATALOG) as ItemKind[])
        .filter((kind) => ITEM_CATALOG[kind].capabilities?.includes(capability))
      expect([...CAPABILITY_KINDS[capability]].sort()).toEqual(declared.sort())
      expect(CAPABILITY_KINDS[capability].length).toBeGreaterThan(0)
    }
  })
})

describe('Inventory capability queries', () => {
  it('answers "any item that can do this" regardless of which kind it is', () => {
    expect(new Inventory({ shovel: 1 }).hasCapability('soil_digging')).toBe(true)
    expect(new Inventory({ pickaxe: 1 }).hasCapability('soil_digging')).toBe(false)
    expect(new Inventory().hasCapability('soil_digging')).toBe(false)
  })

  it('accepts either substitute for the same capability', () => {
    const axe = new Inventory(undefined, 100, [{ id: createItemInstanceId(), kind: 'axe' }])
    const battleAxe = new Inventory(undefined, 100, [{ id: createItemInstanceId(), kind: 'battle_axe' }])
    expect(axe.hasCapability('wood_chopping')).toBe(true)
    expect(battleAxe.hasCapability('wood_chopping')).toBe(true)
  })

  it('sees instance-backed kinds too (weapon-maintenance knives)', () => {
    const inv = new Inventory(undefined, 100, [{ id: createItemInstanceId(), kind: 'knife' }])
    expect(inv.count('knife')).toBe(0)
    expect(inv.hasCapability('meat_harvesting')).toBe(true)
    expect(inv.findWithCapability('meat_harvesting')).toBe('knife')
  })

  it('findWithCapability prefers the better tool when both are carried (plan 160)', () => {
    const inv = new Inventory(undefined, 100, [
      { id: createItemInstanceId(), kind: 'knife' },
      { id: createItemInstanceId(), kind: 'damascus_knife' },
    ])
    expect(inv.findWithCapability('meat_harvesting')).toBe('damascus_knife')
  })

  it('findWithCapability is null when nothing carried can do it', () => {
    expect(new Inventory({ bread: 3 }).findWithCapability('fishing')).toBeNull()
  })
})

describe('holdable is the single source of truth for the held-tool slot', () => {
  it('isToolKind accepts exactly the catalog holdable kinds', () => {
    for (const kind of Object.keys(ITEM_CATALOG) as ItemKind[]) {
      expect(isToolKind(kind)).toBe(ITEM_CATALOG[kind].holdable)
    }
  })

  it('every HOLDABLE_KINDS entry is assignable to ToolKind', () => {
    const asToolKinds: ToolKind[] = HOLDABLE_KINDS.filter(isToolKind)
    expect(asToolKinds).toHaveLength(HOLDABLE_KINDS.length)
  })

  it('every capability-carrying kind can actually be held or carried', () => {
    for (const kinds of Object.values(CAPABILITY_KINDS)) {
      for (const kind of kinds) expect(ITEM_CATALOG[kind].holdable).toBe(true)
    }
  })
})
