import { describe, expect, it } from 'vitest'
import { hasItemCategory, hasItemKindCategory, ITEM_DEFS, primaryItemCategory } from './items'

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

  it('battle_axe matches tool and weapon (plan 160)', () => {
    expect(hasItemKindCategory('battle_axe', 'tool')).toBe(true)
    expect(hasItemKindCategory('battle_axe', 'weapon')).toBe(true)
  })

  it('membership helper works on defs', () => {
    expect(hasItemCategory(ITEM_DEFS.axe, 'weapon')).toBe(true)
    expect(hasItemCategory(ITEM_DEFS.bread, 'food')).toBe(true)
    expect(hasItemCategory(ITEM_DEFS.bread, 'weapon')).toBe(false)
  })

  it('wearable armor kinds use armor category, not weapon (plan items-player-031)', () => {
    expect(hasItemKindCategory('leather_armor', 'armor')).toBe(true)
    expect(hasItemKindCategory('chainmail', 'armor')).toBe(true)
    expect(hasItemKindCategory('leather_armor', 'weapon')).toBe(false)
    expect(hasItemKindCategory('chainmail', 'weapon')).toBe(false)
    expect(primaryItemCategory(ITEM_DEFS.chainmail)).toBe('armor')
  })

  it('story items use the story category (plan quests-progression-035)', () => {
    expect(hasItemKindCategory('treasure_map_dark_forest', 'story')).toBe(true)
    expect(hasItemKindCategory('signet_ring', 'story')).toBe(true)
    expect(hasItemKindCategory('bandit_ledger', 'story')).toBe(true)
    expect(hasItemKindCategory('marked_valuable', 'story')).toBe(true)
    expect(hasItemKindCategory('expedition_journal', 'story')).toBe(true)
    expect(hasItemKindCategory('treasure_map_dark_forest', 'utility')).toBe(false)
  })
})
