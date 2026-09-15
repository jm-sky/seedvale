import { describe, expect, it } from 'vitest'
import { inventoryItemReadAction } from './inventoryItemReadAction'
import { ITEM_DEFS, primaryItemCategory } from './items'

describe('inventoryItemReadAction (plan quests-progression-035)', () => {
  it('exposes Odczytaj for treasure-map catalog metadata', () => {
    expect(inventoryItemReadAction('treasure_map_dark_forest')).toEqual({ label: 'Odczytaj' })
  })

  it('keeps Czytaj for books', () => {
    expect(inventoryItemReadAction('book_defense_basic')).toEqual({ label: 'Czytaj' })
  })

  it('does not invent a read action for ordinary items', () => {
    expect(inventoryItemReadAction('stone')).toBeNull()
    expect(inventoryItemReadAction('signet_ring')).toBeNull()
  })
})

describe('story item categories (plan quests-progression-035)', () => {
  it('assigns the five story items to story, not resource/utility', () => {
    expect(ITEM_DEFS.treasure_map_dark_forest.categories).toEqual(['story'])
    expect(ITEM_DEFS.signet_ring.categories).toEqual(['story'])
    expect(ITEM_DEFS.bandit_ledger.categories).toEqual(['story'])
    expect(ITEM_DEFS.marked_valuable.categories).toEqual(['story'])
    expect(ITEM_DEFS.expedition_journal.categories).toEqual(['story'])
    expect(primaryItemCategory(ITEM_DEFS.signet_ring)).toBe('story')
  })

  it('sorts story before knowledge and other last', () => {
    expect(primaryItemCategory({ categories: ['resource', 'story'] })).toBe('story')
    expect(primaryItemCategory({ categories: ['knowledge', 'story'] })).toBe('story')
    expect(primaryItemCategory({ categories: ['other', 'resource'] })).toBe('resource')
    expect(primaryItemCategory({ categories: ['other'] })).toBe('other')
  })
})
