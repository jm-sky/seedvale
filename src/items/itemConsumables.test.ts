import { describe, expect, it } from 'vitest'
import type { ItemKind } from './items'
import { Inventory } from './Inventory'
import { CONSUMABLE_KINDS_BY_NEED, type ConsumableNeed, ITEM_CATALOG } from './itemCatalog'

/** Plan npc-002 — catalog-driven consumable lookup, the `Inventory`
 *  counterpart of plan 184's `CAPABILITY_KINDS`/`findWithCapability` for
 *  `ITEM_CATALOG[kind].consumable.need`. */
describe('CONSUMABLE_KINDS_BY_NEED', () => {
  it('derives every need bucket from the catalog, best (highest relief) first', () => {
    expect(CONSUMABLE_KINDS_BY_NEED.health).toEqual(['bandage', 'herb'])
  })

  it('keeps every bucket in sync with the per-entry declarations', () => {
    for (const need of Object.keys(CONSUMABLE_KINDS_BY_NEED) as ConsumableNeed[]) {
      const declared = (Object.keys(ITEM_CATALOG) as ItemKind[])
        .filter((kind) => ITEM_CATALOG[kind].consumable?.need === need)
      expect([...CONSUMABLE_KINDS_BY_NEED[need]].sort()).toEqual(declared.sort())
    }
  })
})

describe('Inventory.findConsumableForNeed', () => {
  it('finds the best (highest-relief) held item for a need', () => {
    const inv = new Inventory({ herb: 1, bandage: 1 })
    expect(inv.findConsumableForNeed('health')).toBe('bandage')
  })

  it('falls back to a weaker item when the best one is not held', () => {
    const inv = new Inventory({ herb: 1 })
    expect(inv.findConsumableForNeed('health')).toBe('herb')
  })

  it('is null when nothing carried satisfies the need', () => {
    expect(new Inventory({ bread: 3 }).findConsumableForNeed('health')).toBeNull()
    expect(new Inventory().findConsumableForNeed('health')).toBeNull()
  })
})
