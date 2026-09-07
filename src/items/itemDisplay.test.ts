import { describe, expect, it } from 'vitest'
import { itemDisplayName } from './itemDisplay'
import { ITEM_DEFS } from './items'

describe('itemDisplayName', () => {
  it('leaves a non-book item label unchanged', () => {
    expect(itemDisplayName('axe')).toBe(ITEM_DEFS.axe.label)
  })

  it('prefixes a book with "Książka: "', () => {
    expect(itemDisplayName('book_riding_basic')).toBe(`Książka: ${ITEM_DEFS.book_riding_basic.label}`)
  })

  it('does not treat other knowledge-category items as books', () => {
    expect(itemDisplayName('map_near')).toBe(ITEM_DEFS.map_near.label)
    expect(itemDisplayName('map_far')).toBe(ITEM_DEFS.map_far.label)
  })
})
