import { reactive } from 'vue'
import type { ItemCapability } from '../../items/itemCatalog'
import type { ItemCategory, ItemKind } from '../../items/items'

export type MerchantContext = 'buy' | 'offer'
export type CategoryFilter = 'all' | ItemCategory
export type CapabilityFilter = 'all' | ItemCapability
export type PriceFilter = 'all' | 'low' | 'mid' | 'high'
export type TradeSortMode = 'name' | 'price-asc' | 'price-desc' | 'weight' | 'condition'

export type TradeFilters = {
  search: string
  category: CategoryFilter
  capability: CapabilityFilter
  price: PriceFilter
  sort: TradeSortMode
}

export type TradeRow = {
  kind: ItemKind
  label: string
  price: number
  weight: number
  conditionPercent: number | null
}

function emptyFilters(): TradeFilters {
  return { search: '', category: 'all', capability: 'all', price: 'all', sort: 'name' }
}

/** Independent BUY/OFFER search/filter/sort state plus the persistent
 *  cross-context transaction basket (plan ui-input-003 — BUY/OFFER
 *  independence, transaction state survives filter/sort/context changes). */
export function useMerchantTradeState() {
  const buyFilters = reactive<TradeFilters>(emptyFilters())
  const offerFilters = reactive<TradeFilters>(emptyFilters())
  const transaction = reactive<{
    purchases: Partial<Record<ItemKind, number>>
    offer: Partial<Record<ItemKind, number>>
  }>({ purchases: {}, offer: {} })

  function resetAll(): void {
    Object.assign(buyFilters, emptyFilters())
    Object.assign(offerFilters, emptyFilters())
    transaction.purchases = {}
    transaction.offer = {}
  }

  function setCount(bag: Partial<Record<ItemKind, number>>, kind: ItemKind, next: number, max?: number): void {
    let count = Math.max(0, Math.floor(next))
    if (max != null) count = Math.min(max, count)
    if (count <= 0) delete bag[kind]
    else bag[kind] = count
  }

  function setPurchaseCount(kind: ItemKind, next: number, max?: number): void {
    setCount(transaction.purchases, kind, next, max)
  }

  function setOfferCount(kind: ItemKind, next: number, max?: number): void {
    setCount(transaction.offer, kind, next, max)
  }

  function matchesCategory(kind: ItemKind, filters: TradeFilters, hasCategory: (kind: ItemKind, category: ItemCategory) => boolean): boolean {
    if (filters.category === 'all') return true
    return hasCategory(kind, filters.category)
  }

  function matchesCapability(capabilities: readonly ItemCapability[] | undefined, filters: TradeFilters): boolean {
    if (filters.capability === 'all') return true
    return (capabilities ?? []).includes(filters.capability)
  }

  function matchesPrice(price: number, filters: TradeFilters): boolean {
    if (filters.price === 'all') return true
    if (filters.price === 'low') return price <= 10
    if (filters.price === 'mid') return price >= 11 && price <= 25
    return price > 25
  }

  function matchesSearch(label: string, filters: TradeFilters): boolean {
    if (!filters.search.trim()) return true
    return label.toLocaleLowerCase('pl').includes(filters.search.trim().toLocaleLowerCase('pl'))
  }

  function sortRows<T extends TradeRow>(rows: T[], sort: TradeSortMode): T[] {
    const copy = [...rows]
    const byName = (a: T, b: T) => a.label.localeCompare(b.label, 'pl')
    if (sort === 'price-asc') copy.sort((a, b) => a.price - b.price || byName(a, b))
    else if (sort === 'price-desc') copy.sort((a, b) => b.price - a.price || byName(a, b))
    else if (sort === 'weight') copy.sort((a, b) => a.weight - b.weight || byName(a, b))
    else if (sort === 'condition') copy.sort((a, b) => (a.conditionPercent ?? 100) - (b.conditionPercent ?? 100) || byName(a, b))
    else copy.sort(byName)
    return copy
  }

  return {
    buyFilters,
    offerFilters,
    transaction,
    resetAll,
    setPurchaseCount,
    setOfferCount,
    matchesCategory,
    matchesCapability,
    matchesPrice,
    matchesSearch,
    sortRows,
  }
}

export type MerchantTradeState = ReturnType<typeof useMerchantTradeState>
