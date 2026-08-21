<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import { useItemCategoryLabels } from '@/composables/useItemCategoryLabels'
import { isInstanceBackedKind } from '../../items/itemInstances'
import { hasItemKindCategory, ITEM_DEFS, type ItemCategory, type ItemKind } from '../../items/items'
import { MERCHANT_STOCK, merchantPrice, offerValue, sellPrice } from '../../items/tradeCatalog'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeMerchant, isMerchantOpen, showToast, ui } from '../store'

useOverlayScreen('merchant', isMerchantOpen, closeMerchant)

type CategoryFilter = 'all' | ItemCategory
type PriceFilter = 'all' | 'low' | 'mid' | 'high'
type SortMode = 'name' | 'price-asc' | 'price-desc'

const { categoryLabel } = useItemCategoryLabels()
const merchantBody = ref<HTMLElement | null>(null)
const sellerPanel = ref<HTMLElement | null>(null)
const buyerPanel = ref<HTMLElement | null>(null)
const filtersOpen = ref(false)
useTouchScroll(merchantBody)
useTouchScroll(sellerPanel)
useTouchScroll(buyerPanel)

const barterKind = ref<ItemKind | null>(null)
const offer = ref<Partial<Record<ItemKind, number>>>({})
const buyCount = ref<Partial<Record<ItemKind, number>>>({})
const categoryFilter = ref<CategoryFilter>('all')
const priceFilter = ref<PriceFilter>('all')
const sortMode = ref<SortMode>('name')

watch(() => ui.merchant.open, (open) => {
  if (!open) return
  barterKind.value = null
  offer.value = {}
  buyCount.value = {}
  categoryFilter.value = 'all'
  priceFilter.value = 'all'
  sortMode.value = 'name'
  filtersOpen.value = false
})

const coins = computed(() => ui.merchant.counts.coin ?? 0)

const categoryChips: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'weapon', label: categoryLabel.weapon },
  { id: 'resource', label: categoryLabel.resource },
  { id: 'tool', label: categoryLabel.tool },
  { id: 'utility', label: categoryLabel.utility },
  { id: 'food', label: categoryLabel.food },
]
const priceChips: { id: PriceFilter; label: string }[] = [
  { id: 'all', label: 'Każda cena' },
  { id: 'low', label: '≤10' },
  { id: 'mid', label: '11–25' },
  { id: 'high', label: '>25' },
]
const sortChips: { id: SortMode; label: string }[] = [
  { id: 'name', label: 'Nazwa' },
  { id: 'price-asc', label: 'Cena ↑' },
  { id: 'price-desc', label: 'Cena ↓' },
]

const activeFilterSummary = computed(() => {
  const parts: string[] = []
  const cat = categoryChips.find((c) => c.id === categoryFilter.value)?.label
  if (cat) parts.push(cat)
  const price = priceChips.find((c) => c.id === priceFilter.value)?.label
  if (price) parts.push(price)
  const sort = sortChips.find((c) => c.id === sortMode.value)?.label
  if (sort) parts.push(sort)
  return parts.join(' · ')
})

const buyerSubtitle = computed(() => (
  barterKind.value
    ? `Wymiana na: ${ITEM_DEFS[barterKind.value].label} (${neededValue.value} · oferujesz ${offeredValue.value})`
    : 'Sprzedaj za monety albo wybierz towar z lewej, by wymienić.'
))

function matchesCategory(kind: ItemKind): boolean {
  if (categoryFilter.value === 'all') return true
  return hasItemKindCategory(kind, categoryFilter.value)
}

function matchesPrice(price: number): boolean {
  if (priceFilter.value === 'all') return true
  if (priceFilter.value === 'low') return price <= 10
  if (priceFilter.value === 'mid') return price >= 11 && price <= 25
  return price > 25
}

function sortRows<T extends { label: string; price: number }>(rows: T[]): T[] {
  const copy = [...rows]
  if (sortMode.value === 'name') {
    copy.sort((a, b) => a.label.localeCompare(b.label, 'pl'))
  } else if (sortMode.value === 'price-asc') {
    copy.sort((a, b) => a.price - b.price || a.label.localeCompare(b.label, 'pl'))
  } else {
    copy.sort((a, b) => b.price - a.price || a.label.localeCompare(b.label, 'pl'))
  }
  return copy
}

const stock = computed(() => {
  const rows = MERCHANT_STOCK.flatMap((kind) => {
    const price = merchantPrice(kind) ?? 0
    if (!matchesCategory(kind) || !matchesPrice(price)) return []
    return [{ kind, label: ITEM_DEFS[kind].label, price }]
  })
  return sortRows(rows)
})

function autoSellDisplayPrice(kind: ItemKind): number {
  if (!isInstanceBackedKind(kind)) return sellPrice(kind) ?? 0
  const group = ui.merchant.groups.find((entry) => entry.kind === kind)
  if (!group || group.instances.length === 0) return sellPrice(kind) ?? 0
  const sorted = [...group.instances].sort(
    (a, b) => a.conditionPercent - b.conditionPercent || a.id.localeCompare(b.id),
  )
  return sorted[0]?.sellPrice ?? 0
}

const offerKinds = computed(() => {
  const kinds = (Object.keys(ITEM_DEFS) as ItemKind[]).filter((kind) => {
    if (kind === 'shell' || kind === 'coin') return false
    if ((ui.merchant.counts[kind] ?? 0) <= 0) return false
    const price = autoSellDisplayPrice(kind)
    return matchesCategory(kind) && matchesPrice(price)
  })
  const rows = kinds.map((kind) => ({
    kind,
    label: ITEM_DEFS[kind].label,
    price: autoSellDisplayPrice(kind),
    count: ui.merchant.counts[kind] ?? 0,
  }))
  return sortRows(rows)
})

const offeredValue = computed(() => offerValue(offer.value))
const neededValue = computed(() => (
  barterKind.value ? (merchantPrice(barterKind.value) ?? 0) * effectiveBuyCount(barterKind.value) : 0
))
const canBarter = computed(() => barterKind.value != null && offeredValue.value >= neededValue.value)

function effectiveBuyCount(kind: ItemKind): number {
  return Math.max(1, buyCount.value[kind] ?? 0)
}

function setBuyCount(kind: ItemKind, next: number): void {
  const count = Math.max(0, Math.floor(next))
  const copy = { ...buyCount.value }
  if (count <= 0) delete copy[kind]
  else copy[kind] = count
  buyCount.value = copy
}

function buy(kind: ItemKind): void {
  const result = ui.merchant.onBuyCoins?.(kind, effectiveBuyCount(kind)) ?? 'not_sold'
  if (result === 'ok') return
  if (result === 'cannot_afford') showToast('Za mało monet.', 'error')
  else if (result === 'full') showToast('Ekwipunek jest za ciężki.', 'error')
  else showToast('Nie da się tego kupić.', 'error')
}

function sell(kind: ItemKind): void {
  const result = ui.merchant.onSellCoins?.(kind) ?? 'not_sold'
  if (result === 'ok') {
    const next = { ...offer.value }
    const owned = (ui.merchant.counts[kind] ?? 1) - 1
    if ((next[kind] ?? 0) > owned) {
      if (owned <= 0) delete next[kind]
      else next[kind] = owned
      offer.value = next
    }
  } else if (result === 'invalid_offer') showToast('Nie masz tego przedmiotu.', 'error')
  else if (result === 'full') showToast('Ekwipunek jest za ciężki.', 'error')
  else if (result === 'not_sold') showToast('Kupiec tego nie kupi.', 'error')
}

function setOfferCount(kind: ItemKind, next: number): void {
  const max = ui.merchant.counts[kind] ?? 0
  const count = Math.max(0, Math.min(max, Math.floor(next)))
  const copy = { ...offer.value }
  if (count <= 0) delete copy[kind]
  else copy[kind] = count
  offer.value = copy
}

function barter(): void {
  if (!barterKind.value) return
  const result = ui.merchant.onBuyBarter?.(barterKind.value, { ...offer.value }, effectiveBuyCount(barterKind.value)) ?? 'invalid_offer'
  if (result === 'ok') {
    offer.value = {}
    return
  }
  if (result === 'cannot_afford') showToast('Za niska wartość wymiany.', 'error')
  else if (result === 'full') showToast('Ekwipunek jest za ciężki.', 'error')
  else showToast('Nie da się wymienić.', 'error')
}

function selectBarter(kind: ItemKind): void {
  barterKind.value = barterKind.value === kind ? null : kind
}

function chipClass(active: boolean): string {
  return active ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'
}
</script>

<template>
  <div
    v-if="ui.merchant.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px] max-md:items-stretch max-md:p-2"
    @click.self="closeMerchant"
  >
    <UiPanel
      class="flex h-[min(720px,calc(100dvh-32px))] w-[min(920px,calc(100vw-32px))] max-w-4xl flex-col !overflow-hidden !p-5 max-md:h-[calc(100dvh-16px)] max-md:max-h-none max-md:w-full max-md:!p-3"
    >
      <div class="mb-2 flex shrink-0 flex-wrap items-baseline justify-between gap-2 max-md:mb-1.5">
        <h2 class="text-base font-semibold tracking-wide max-md:text-sm">
          Kupiec
        </h2>
        <div class="flex flex-row items-center gap-3 max-md:gap-2">
          <p class="text-[13px] opacity-75 max-md:text-xs">
            Monety: {{ coins }}
          </p>
          <button
            type="button"
            class="text-[12px] opacity-75 rounded-md px-2 py-1 border border-white/10 max-md:px-1.5 max-md:py-0.5 max-md:text-[11px]"
            @click="closeMerchant"
          >
            Zamknij
          </button>
        </div>
      </div>

      <div class="shrink-0">
        <button
          type="button"
          class="mb-1.5 flex w-full items-center justify-between gap-2 rounded-md bg-white/5 px-2 py-1.5 text-left text-xs md:hidden"
          @click="filtersOpen = !filtersOpen"
        >
          <span class="font-medium">Filtry</span>
          <span class="min-w-0 truncate opacity-60">{{ activeFilterSummary }}</span>
          <span class="shrink-0 opacity-60">{{ filtersOpen ? '▲' : '▼' }}</span>
        </button>
        <div
          class="mb-2 space-y-1.5 max-md:mb-1.5"
          :class="filtersOpen ? '' : 'max-md:hidden'"
        >
          <div class="flex flex-wrap gap-1">
            <button
              v-for="chip in categoryChips"
              :key="chip.id"
              type="button"
              class="cursor-pointer rounded-md px-2 py-1 text-xs max-md:px-1.5 max-md:py-0.5 max-md:text-[11px]"
              :class="chipClass(categoryFilter === chip.id)"
              @click="categoryFilter = chip.id"
            >
              {{ chip.label }}
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-1">
            <button
              v-for="chip in priceChips"
              :key="chip.id"
              type="button"
              class="cursor-pointer rounded-md px-2 py-1 text-xs max-md:px-1.5 max-md:py-0.5 max-md:text-[11px]"
              :class="chipClass(priceFilter === chip.id)"
              @click="priceFilter = chip.id"
            >
              {{ chip.label }}
            </button>
            <span class="mx-0.5 hidden opacity-30 md:inline">|</span>
            <button
              v-for="chip in sortChips"
              :key="chip.id"
              type="button"
              class="cursor-pointer rounded-md px-2 py-1 text-xs max-md:px-1.5 max-md:py-0.5 max-md:text-[11px]"
              :class="chipClass(sortMode === chip.id)"
              @click="sortMode = chip.id"
            >
              {{ chip.label }}
            </button>
          </div>
        </div>
      </div>

      <div
        ref="merchantBody"
        class="min-h-0 flex-1 max-md:overflow-y-auto md:flex md:flex-col md:overflow-hidden"
        style="touch-action: pan-y"
      >
        <div class="grid grid-cols-1 gap-4 md:min-h-0 md:flex-1 md:grid-cols-2 md:gap-4 md:overflow-hidden">
          <section class="flex min-w-0 flex-col md:min-h-0">
            <div class="mb-2 flex items-baseline gap-2 max-md:mb-1.5">
              <h3 class="shrink-0 text-[12px] font-semibold uppercase tracking-wide opacity-70 max-md:text-[11px]">
                Sprzedawca
              </h3>
              <p class="min-w-0 flex-1 truncate text-right text-[12px] opacity-60 max-md:text-[11px]">
                Tu możesz kupić towary od sprzedawcy.
              </p>
            </div>
            <div
              ref="sellerPanel"
              class="flex flex-col gap-1.5 max-md:overflow-visible md:min-h-0 md:flex-1 md:overflow-y-auto"
              style="touch-action: pan-y"
            >
              <div
                v-if="stock.length === 0"
                class="text-[12px] opacity-60 max-md:text-[11px]"
              >
                Brak towarów w tej kategorii.
              </div>
              <div
                v-for="item in stock"
                :key="item.kind"
                class="flex items-center gap-2 rounded-md border border-transparent bg-white/5 px-3 py-2 hover:border-white/30 max-md:px-2 max-md:py-1.5"
                :class="barterKind === item.kind ? 'ring-1 ring-white/30' : ''"
              >
                <button
                  type="button"
                  class="min-w-0 flex-1 cursor-pointer text-left text-sm hover:opacity-90 max-md:text-[13px]"
                  @click="selectBarter(item.kind)"
                >
                  <span class="font-medium capitalize">{{ item.label }}</span>
                  <span class="ml-2 text-[12px] opacity-70 max-md:text-[11px]">{{ item.price }} monet</span>
                </button>
                <div class="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    class="cursor-pointer rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20"
                    @click="setBuyCount(item.kind, (buyCount[item.kind] ?? 0) - 1)"
                  >
                    −
                  </button>
                  <span class="w-6 text-center text-xs">{{ buyCount[item.kind] ?? 0 }}</span>
                  <button
                    type="button"
                    class="cursor-pointer rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20"
                    @click="setBuyCount(item.kind, (buyCount[item.kind] ?? 0) + 1)"
                  >
                    +
                  </button>
                  <UiButton
                    class="min-h-11 shrink-0 px-2.5 py-1 text-xs max-md:min-h-9"
                    :disabled="item.price > coins"
                    @click="buy(item.kind)"
                  >
                    Kup
                  </UiButton>
                </div>
              </div>
            </div>
          </section>

          <section class="flex min-w-0 flex-col md:min-h-0">
            <div class="mb-2 flex items-baseline gap-2 max-md:mb-1.5">
              <h3 class="shrink-0 text-[12px] font-semibold uppercase tracking-wide opacity-70 max-md:text-[11px]">
                Kupujący
              </h3>
              <p class="min-w-0 flex-1 truncate text-right text-[12px] opacity-60 max-md:text-[11px]">
                {{ buyerSubtitle }}
              </p>
            </div>
            <div
              ref="buyerPanel"
              class="flex flex-col gap-1 max-md:overflow-visible md:min-h-0 md:flex-1 md:overflow-y-auto"
              style="touch-action: pan-y"
            >
              <div
                v-if="offerKinds.length === 0"
                class="text-[12px] opacity-60 max-md:text-[11px]"
              >
                {{ (Object.keys(ITEM_DEFS) as ItemKind[]).some((k) => k !== 'shell' && k !== 'coin' && (ui.merchant.counts[k] ?? 0) > 0)
                  ? 'Brak towarów w tej kategorii.'
                  : 'Ekwipunek jest pusty.' }}
              </div>
              <div
                v-for="item in offerKinds"
                :key="item.kind"
                class="flex items-center justify-between gap-2 rounded-md bg-white/5 px-3 py-1.5 text-sm max-md:px-2 max-md:py-1"
              >
                <span class="min-w-0 truncate">
                  {{ item.label }} ×{{ item.count }}
                  <span class="opacity-60">({{ item.price }})</span>
                </span>
                <div class="flex shrink-0 items-center gap-1">
                  <template v-if="barterKind">
                    <button
                      type="button"
                      class="cursor-pointer rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20"
                      @click="setOfferCount(item.kind, (offer[item.kind] ?? 0) - 1)"
                    >
                      −
                    </button>
                    <span class="w-6 text-center text-xs">{{ offer[item.kind] ?? 0 }}</span>
                    <button
                      type="button"
                      class="cursor-pointer rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20"
                      @click="setOfferCount(item.kind, (offer[item.kind] ?? 0) + 1)"
                    >
                      +
                    </button>
                  </template>
                  <UiButton
                    class="min-h-11 px-2.5 py-1 text-xs max-md:min-h-9"
                    @click="sell(item.kind)"
                  >
                    Sprzedaj
                  </UiButton>
                </div>
              </div>
            </div>
            <UiButton
              class="mt-3 w-full max-md:mt-2"
              :disabled="!canBarter"
              :class="canBarter ? '' : 'opacity-50'"
              @click="barter"
            >
              Wymień
            </UiButton>
          </section>
        </div>

        <div class="mt-3 text-[11px] opacity-60 max-md:mt-2 max-md:text-[10px] md:hidden">
          Esc — zamknij
        </div>
      </div>

      <div class="mt-3 hidden shrink-0 text-[11px] opacity-60 md:block">
        Esc — zamknij
      </div>
    </UiPanel>
  </div>
</template>
