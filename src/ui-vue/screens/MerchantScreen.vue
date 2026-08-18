<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import { useItemCategoryLabels } from '@/composables/useItemCategoryLabels'
import { ITEM_DEFS, type ItemCategory, type ItemKind } from '../../items/items'
import { MERCHANT_STOCK, merchantPrice, offerValue, sellPrice } from '../../items/tradeCatalog'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeMerchant, isMerchantOpen, showToast, ui } from '../store'

useOverlayScreen('merchant', isMerchantOpen, closeMerchant)

type CategoryFilter = 'all' | ItemCategory
type PriceFilter = 'all' | 'low' | 'mid' | 'high'
type SortMode = 'name' | 'price-asc' | 'price-desc'

const { categoryLabel } = useItemCategoryLabels()
const sellerPanel = ref<HTMLElement | null>(null)
const buyerPanel = ref<HTMLElement | null>(null)
useTouchScroll(sellerPanel)
useTouchScroll(buyerPanel)

const barterKind = ref<ItemKind | null>(null)
const offer = ref<Partial<Record<ItemKind, number>>>({})
const categoryFilter = ref<CategoryFilter>('all')
const priceFilter = ref<PriceFilter>('all')
const sortMode = ref<SortMode>('name')

watch(() => ui.merchant.open, (open) => {
  if (!open) return
  barterKind.value = null
  offer.value = {}
  categoryFilter.value = 'all'
  priceFilter.value = 'all'
  sortMode.value = 'name'
})

const shells = computed(() => ui.merchant.counts.shell ?? 0)

const categoryChips: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'Wszystkie' },
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

function matchesCategory(kind: ItemKind): boolean {
  if (categoryFilter.value === 'all') return true
  return ITEM_DEFS[kind].category === categoryFilter.value
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

const offerKinds = computed(() => {
  const kinds = (Object.keys(ITEM_DEFS) as ItemKind[]).filter((kind) => {
    if (kind === 'shell' || kind === 'coin') return false
    if ((ui.merchant.counts[kind] ?? 0) <= 0) return false
    const price = sellPrice(kind) ?? 0
    return matchesCategory(kind) && matchesPrice(price)
  })
  const rows = kinds.map((kind) => ({
    kind,
    label: ITEM_DEFS[kind].label,
    price: sellPrice(kind) ?? 0,
    count: ui.merchant.counts[kind] ?? 0,
  }))
  return sortRows(rows)
})

const offeredValue = computed(() => offerValue(offer.value))
const neededValue = computed(() => (barterKind.value ? merchantPrice(barterKind.value) ?? 0 : 0))
const canBarter = computed(() => barterKind.value != null && offeredValue.value >= neededValue.value)

function buy(kind: ItemKind): void {
  const result = ui.merchant.onBuyShells?.(kind) ?? 'not_sold'
  if (result === 'ok') return
  if (result === 'cannot_afford') showToast('Za mało muszli.', 'error')
  else if (result === 'full') showToast('Ekwipunek jest za ciężki.', 'error')
  else showToast('Nie da się tego kupić.', 'error')
}

function sell(kind: ItemKind): void {
  const result = ui.merchant.onSellShells?.(kind) ?? 'not_sold'
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
  const result = ui.merchant.onBuyBarter?.(barterKind.value, { ...offer.value }) ?? 'invalid_offer'
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
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeMerchant"
  >
    <UiPanel class="flex h-[min(720px,calc(100dvh-32px))] w-[min(920px,calc(100vw-32px))] max-w-4xl flex-col overflow-hidden">
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-base font-semibold tracking-wide">
          Kupiec
        </h2>
        <div class="flex flex-row gap-4 items-center">
          <p class="text-[13px] opacity-75">
            Muszle: {{ shells }}
          </p>
          <button
            type="button"
            class="text-[12px] opacity-75 rounded-md px-2 py-1 border border-white/10"
            @click="closeMerchant"
          >
            Zamknij
          </button>
        </div>
      </div>

      <div class="mb-2 flex flex-wrap gap-1">
        <button
          v-for="chip in categoryChips"
          :key="chip.id"
          type="button"
          class="cursor-pointer rounded-md px-2 py-1 text-xs"
          :class="chipClass(categoryFilter === chip.id)"
          @click="categoryFilter = chip.id"
        >
          {{ chip.label }}
        </button>
      </div>
      <div class="flex flex-col lg:flex-row items-center gap-1 lg:gap-4">
        <div class="mb-2 flex flex-wrap items-center gap-1">
          <button
            v-for="chip in priceChips"
            :key="chip.id"
            type="button"
            class="cursor-pointer rounded-md px-2 py-1 text-xs"
            :class="chipClass(priceFilter === chip.id)"
            @click="priceFilter = chip.id"
          >
            {{ chip.label }}
          </button>
        </div>
        <div class="mb-3 flex flex-wrap items-center gap-1">
          <button
            v-for="chip in sortChips"
            :key="chip.id"
            type="button"
            class="cursor-pointer rounded-md px-2 py-1 text-xs"
            :class="chipClass(sortMode === chip.id)"
            @click="sortMode = chip.id"
          >
            {{ chip.label }}
          </button>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-2">
        <section class="flex min-h-0 min-w-0 flex-col">
          <h3 class="mb-1 text-[12px] font-semibold uppercase tracking-wide opacity-70">
            Sprzedawca
          </h3>
          <p class="mb-2 text-[12px] opacity-70">
            Tu możesz kupić towary od sprzedawcy.
          </p>
          <div
            ref="sellerPanel"
            class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto"
            style="touch-action: pan-y"
          >
            <div
              v-if="stock.length === 0"
              class="text-[12px] opacity-60"
            >
              Brak towarów w tej kategorii.
            </div>
            <div
              v-for="item in stock"
              :key="item.kind"
              class="flex items-center gap-2 rounded-md border border-transparent bg-white/5 px-3 py-2 hover:border-white/30"
              :class="barterKind === item.kind ? 'ring-1 ring-white/30' : ''"
            >
              <button
                type="button"
                class="min-w-0 flex-1 cursor-pointer text-left text-sm hover:opacity-90"
                @click="selectBarter(item.kind)"
              >
                <span class="font-medium capitalize">{{ item.label }}</span>
                <span class="ml-2 text-[12px] opacity-70">{{ item.price }} muszli</span>
              </button>
              <UiButton
                class="min-h-11 shrink-0 px-2.5 py-1 text-xs"
                :disabled="item.price > shells"
                @click="buy(item.kind)"
              >
                Kup
              </UiButton>
            </div>
          </div>
        </section>

        <section class="flex min-h-0 min-w-0 flex-col">
          <h3 class="mb-1 text-[12px] font-semibold uppercase tracking-wide opacity-70">
            Kupujący
          </h3>
          <p class="mb-2 text-[12px] opacity-70">
            {{ barterKind
              ? `Wymiana na: ${ITEM_DEFS[barterKind].label} (${neededValue} · oferujesz ${offeredValue})`
              : 'Sprzedaj za muszle albo wybierz towar z lewej, by wymienić.' }}
          </p>
          <div
            ref="buyerPanel"
            class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
            style="touch-action: pan-y"
          >
            <div
              v-if="offerKinds.length === 0"
              class="text-[12px] opacity-60"
            >
              {{ (Object.keys(ITEM_DEFS) as ItemKind[]).some((k) => k !== 'shell' && k !== 'coin' && (ui.merchant.counts[k] ?? 0) > 0)
                ? 'Brak towarów w tej kategorii.'
                : 'Ekwipunek jest pusty.' }}
            </div>
            <div
              v-for="item in offerKinds"
              :key="item.kind"
              class="flex items-center justify-between gap-2 rounded-md bg-white/5 px-3 py-1.5 text-sm"
            >
              <span class="min-w-0">
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
                  class="min-h-11 px-2.5 py-1 text-xs"
                  @click="sell(item.kind)"
                >
                  Sprzedaj
                </UiButton>
              </div>
            </div>
          </div>
          <UiButton
            class="mt-3 w-full"
            :disabled="!canBarter"
            :class="canBarter ? '' : 'opacity-50'"
            @click="barter"
          >
            Wymień
          </UiButton>
        </section>
      </div>

      <div class="mt-3 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </UiPanel>
  </div>
</template>
