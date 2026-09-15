import { describe, expect, it } from 'vitest'
import { ITEM_CATEGORY_LABELS, useItemCategoryLabels } from './useItemCategoryLabels'

describe('useItemCategoryLabels (plan quests-progression-035)', () => {
  it('labels story as Fabularne and other as Inne', () => {
    const { categoryLabel } = useItemCategoryLabels()
    expect(categoryLabel.story).toBe('Fabularne')
    expect(categoryLabel.other).toBe('Inne')
    expect(ITEM_CATEGORY_LABELS.story).toBe('Fabularne')
    expect(ITEM_CATEGORY_LABELS.other).toBe('Inne')
  })
})
