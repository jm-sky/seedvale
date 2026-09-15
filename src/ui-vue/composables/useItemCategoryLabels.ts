import type { ItemCategory } from '../../items/items'

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  resource: 'Surowiec',
  tool: 'Narzędzie',
  utility: 'Użytkowe',
  food: 'Jedzenie',
  weapon: 'Broń',
  armor: 'Pancerze',
  knowledge: 'Wiedza',
  story: 'Fabularne',
  other: 'Inne',
}

export const useItemCategoryLabels = () => {
  return {
    categoryLabel: ITEM_CATEGORY_LABELS,
  }
}
