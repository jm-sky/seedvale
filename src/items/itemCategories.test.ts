import { describe, expect, it } from 'vitest'
import { hasItemCategory, hasItemKindCategory, ITEM_DEFS } from './items'

describe('item categories', () => {
  it('axe matches tool and weapon', () => {
    expect(hasItemKindCategory('axe', 'tool')).toBe(true)
    expect(hasItemKindCategory('axe', 'weapon')).toBe(true)
    expect(hasItemKindCategory('axe', 'food')).toBe(false)
  })

  it('a normal tool matches tool but not weapon', () => {
    expect(hasItemKindCategory('shovel', 'tool')).toBe(true)
    expect(hasItemKindCategory('shovel', 'weapon')).toBe(false)
  })

  it('swords are weapon-only', () => {
    expect(ITEM_DEFS.long_sword.categories).toEqual(['weapon'])
    expect(hasItemKindCategory('long_sword', 'weapon')).toBe(true)
    expect(hasItemKindCategory('long_sword', 'tool')).toBe(false)
  })

  it('membership helper works on defs', () => {
    expect(hasItemCategory(ITEM_DEFS.axe, 'weapon')).toBe(true)
    expect(hasItemCategory(ITEM_DEFS.bread, 'food')).toBe(true)
    expect(hasItemCategory(ITEM_DEFS.bread, 'weapon')).toBe(false)
  })
})
