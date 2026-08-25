<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiPanel from '@/components/UiPanel.vue'
import { ITEM_CATALOG, type ItemCapability } from '../../items/itemCatalog'
import { isInstanceBackedKind } from '../../items/itemInstances'
import { hasItemKindCategory, ITEM_DEFS, type ItemKind } from '../../items/items'
import { previewTransactionNetCoins } from '../../items/trade'
import { MERCHANT_STOCK, merchantPrice, tradeValue } from '../../items/tradeCatalog'
import MerchantFilterBar from '../components/MerchantFilterBar.vue'
import MerchantItemDetailsModal from '../components/MerchantItemDetailsModal.vue'
import MerchantItemRow from '../components/MerchantItemRow.vue'
import MerchantTransactionPanel, { type TransactionLine } from '../components/MerchantTransactionPanel.vue'
import { useCompactMerchantLayout } from '../composables/useCompactMerchantLayout'
import { useMerchantTradeState } from '../composables/useMerchantTradeState'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeMerchant, isMerchantOpen, showToast, ui } from '../store'

useOverlayScreen('merchant', isMerchantOpen, closeMerchant)

const drawerOpen = ref(false)
useOverlayScreen('merchant-drawer', () => drawerOpen.value, () => { drawerOpen.value = false })

const detailsKind = ref<ItemKind | null>(null)
useOverlayScreen('merchant-item-details', () => detailsKind.value !== null, () => { detailsKind.value = null })

const {
  buyFilters, offerFilters, transaction, resetAll,
  setPurchaseCount, setOfferCount,
  matchesCategory, matchesCapability, matchesPrice, matchesSearch, sortRows,
} = useMerchantTradeState()
const { isCompact } = useCompactMerchantLayout()

const activeContext = ref<'buy' | 'offer'>('buy')

const merchantBody = ref<HTMLElement | null>(null)
useTouchScroll(merchantBody)

watch(() => ui.merchant.open, (open) => {
  if (!open) return
  resetAll()
  activeContext.value = 'buy'
  drawerOpen.value = false
  detailsKind.value = null
})

const coins = computed(() => ui.merchant.counts.coin ?? 0)

const BUY_SORT_OPTIONS = [
  { id: 'name' as const, label: 'Nazwa' },
  { id: 'price-asc' as const, label: 'Cena ↑' },
  { id: 'price-desc' as const, label: 'Cena ↓' },
  { id: 'weight' as const, label: 'Waga' },
]
const OFFER_SORT_OPTIONS = [
  ...BUY_SORT_OPTIONS,
  { id: 'condition' as const, label: 'Stan' },
]

const buyCapabilities = computed<ItemCapability[]>(() => {
  const set = new Set<ItemCapability>()
  for (const kind of MERCHANT_STOCK) {
    for (const cap of ITEM_CATALOG[kind].capabilities ?? []) set.add(cap)
  }
  return [...set]
})

const offerableKinds = computed<ItemKind[]>(() => (Object.keys(ITEM_DEFS) as ItemKind[]).filter((kind) => {
  if (kind === 'shell' || kind === 'coin') return false
  return (ui.merchant.counts[kind] ?? 0) > 0
}))

const offerCapabilities = computed<ItemCapability[]>(() => {
  const set = new Set<ItemCapability>()
  for (const kind of offerableKinds.value) {
    for (const cap of ITEM_CATALOG[kind].capabilities ?? []) set.add(cap)
  }
  return [...set]
})

function conditionForOffer(kind: ItemKind): number | null {
  if (!isInstanceBackedKind(kind)) return null
  const group = ui.merchant.groups.find((entry) => entry.kind === kind)
  if (!group || group.instances.length === 0) return null
  if (group.condition === 'uniform') return group.uniformConditionPercent
  return group.instances.reduce((sum, inst) => sum + inst.conditionPercent, 0) / group.instances.length
}

const buyRows = computed(() => {
  const rows = MERCHANT_STOCK.flatMap((kind) => {
    const price = merchantPrice(kind) ?? 0
    if (!matchesCategory(kind, buyFilters, hasItemKindCategory)) return []
    if (!matchesCapability(ITEM_CATALOG[kind].capabilities, buyFilters)) return []
    if (!matchesPrice(price, buyFilters)) return []
    if (!matchesSearch(ITEM_DEFS[kind].label, buyFilters)) return []
    return [{ kind, label: ITEM_DEFS[kind].label, price, weight: ITEM_DEFS[kind].weight, conditionPercent: null as number | null }]
  })
  return sortRows(rows, buyFilters.sort)
})

const offerRows = computed(() => {
  const rows = offerableKinds.value.flatMap((kind) => {
    const price = tradeValue(kind)
    if (!matchesCategory(kind, offerFilters, hasItemKindCategory)) return []
    if (!matchesCapability(ITEM_CATALOG[kind].capabilities, offerFilters)) return []
    if (!matchesPrice(price, offerFilters)) return []
    if (!matchesSearch(ITEM_DEFS[kind].label, offerFilters)) return []
    return [{
      kind,
      label: ITEM_DEFS[kind].label,
      price,
      weight: ITEM_DEFS[kind].weight,
      conditionPercent: conditionForOffer(kind),
    }]
  })
  return sortRows(rows, offerFilters.sort)
})

function ownedCount(kind: ItemKind): number {
  return ui.merchant.counts[kind] ?? 0
}

function onCommitPurchase(kind: ItemKind, quantity: number): void {
  setPurchaseCount(kind, quantity)
}
function onClearPurchase(kind: ItemKind): void {
  setPurchaseCount(kind, 0)
}
function onCommitOffer(kind: ItemKind, quantity: number): void {
  setOfferCount(kind, quantity, ownedCount(kind))
}
function onClearOffer(kind: ItemKind): void {
  setOfferCount(kind, 0)
}

const purchaseLines = computed<TransactionLine[]>(() => (Object.entries(transaction.purchases) as [ItemKind, number][])
  .filter(([, count]) => count > 0)
  .map(([kind, count]) => ({ kind, label: ITEM_DEFS[kind].label, count, totalValue: (merchantPrice(kind) ?? 0) * count })))

const offerLines = computed<TransactionLine[]>(() => (Object.entries(transaction.offer) as [ItemKind, number][])
  .filter(([, count]) => count > 0)
  .map(([kind, count]) => ({ kind, label: ITEM_DEFS[kind].label, count, totalValue: tradeValue(kind) * count })))

const netCoins = computed(() => previewTransactionNetCoins(transaction.purchases, transaction.offer))
const canTrade = computed(() => purchaseLines.value.length > 0 || offerLines.value.length > 0)

function clampStaleTransaction(): boolean {
  let changed = false
  const nextPurchases: Partial<Record<ItemKind, number>> = {}
  for (const [kind, count] of Object.entries(transaction.purchases) as [ItemKind, number][]) {
    if (merchantPrice(kind) == null) { changed = true; continue }
    nextPurchases[kind] = count
  }
  const nextOffer: Partial<Record<ItemKind, number>> = {}
  for (const [kind, count] of Object.entries(transaction.offer) as [ItemKind, number][]) {
    const owned = ownedCount(kind)
    if (owned <= 0) { changed = true; continue }
    const clamped = Math.min(owned, count)
    if (clamped !== count) changed = true
    nextOffer[kind] = clamped
  }
  if (changed) {
    transaction.purchases = nextPurchases
    transaction.offer = nextOffer
  }
  return changed
}

function onTrade(): void {
  if (clampStaleTransaction()) {
    showToast('Oferta się zmieniła — sprawdź transakcję ponownie.', 'error')
    return
  }
  const result = ui.merchant.onSettleTransaction?.(transaction.purchases, transaction.offer) ?? 'not_sold'
  if (result === 'ok') {
    transaction.purchases = {}
    transaction.offer = {}
    if (isCompact.value) drawerOpen.value = false
    return
  }
  if (result === 'cannot_afford') showToast('Za mało monet.', 'error')
  else if (result === 'full') showToast('Ekwipunek jest za ciężki.', 'error')
  else showToast('Nie da się przeprowadzić tej transakcji.', 'error')
}

function openDetails(kind: ItemKind): void {
  detailsKind.value = kind
}
</script>

<template>
  <div
    v-if="ui.merchant.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px] max-md:items-stretch max-md:p-2"
    @click.self="closeMerchant"
  >
    <UiPanel
      class="flex h-[min(760px,calc(100dvh-32px))] w-[min(1200px,calc(100vw-32px))] max-w-6xl flex-col !overflow-hidden !p-5 max-md:h-[calc(100dvh-16px)] max-md:max-h-none max-md:w-full max-md:!p-3"
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
            v-if="isCompact"
            type="button"
            class="text-[12px] opacity-90 rounded-md px-2 py-1 border border-white/20 max-md:px-1.5 max-md:py-0.5 max-md:text-[11px]"
            @click="drawerOpen = true"
          >
            Transakcja{{ canTrade ? ` (${purchaseLines.length + offerLines.length})` : '' }}
          </button>
          <button
            type="button"
            class="text-[12px] opacity-75 rounded-md px-2 py-1 border border-white/10 max-md:px-1.5 max-md:py-0.5 max-md:text-[11px]"
            @click="closeMerchant"
          >
            Zamknij
          </button>
        </div>
      </div>

      <div
        v-if="isCompact"
        class="mb-2 flex shrink-0 gap-1"
      >
        <button
          type="button"
          class="flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs"
          :class="activeContext === 'buy' ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'"
          @click="activeContext = 'buy'"
        >
          BUY
        </button>
        <button
          type="button"
          class="flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs"
          :class="activeContext === 'offer' ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'"
          @click="activeContext = 'offer'"
        >
          OFFER
        </button>
      </div>

      <div
        ref="merchantBody"
        class="min-h-0 flex-1 max-md:overflow-y-auto md:flex md:flex-col md:overflow-hidden"
        style="touch-action: pan-y"
      >
        <div
          class="grid grid-cols-1 gap-4 md:min-h-0 md:flex-1 md:gap-4 md:overflow-hidden"
          :class="isCompact ? '' : 'md:grid-cols-3'"
        >
          <section
            v-if="!isCompact || activeContext === 'buy'"
            class="flex min-w-0 flex-col gap-2 md:min-h-0"
          >
            <h3 class="shrink-0 text-[12px] font-semibold uppercase tracking-wide opacity-70 max-md:text-[11px]">
              BUY
            </h3>
            <MerchantFilterBar
              :model-value="buyFilters"
              :available-capabilities="buyCapabilities"
              :sort-options="BUY_SORT_OPTIONS"
              @update:model-value="Object.assign(buyFilters, $event)"
            />
            <div class="flex flex-col gap-1.5 md:min-h-0 md:flex-1 md:overflow-y-auto">
              <div
                v-if="buyRows.length === 0"
                class="text-[12px] opacity-60"
              >
                Brak towarów w tej kategorii.
              </div>
              <MerchantItemRow
                v-for="row in buyRows"
                :key="row.kind"
                :kind="row.kind"
                :label="row.label"
                :price="row.price"
                price-suffix="monet"
                :committed-count="transaction.purchases[row.kind] ?? 0"
                :max-count="null"
                @commit="onCommitPurchase"
                @clear="onClearPurchase"
                @open-details="openDetails"
              />
            </div>
          </section>

          <section
            v-if="!isCompact || activeContext === 'offer'"
            class="flex min-w-0 flex-col gap-2 md:min-h-0"
          >
            <h3 class="shrink-0 text-[12px] font-semibold uppercase tracking-wide opacity-70 max-md:text-[11px]">
              OFFER
            </h3>
            <MerchantFilterBar
              :model-value="offerFilters"
              :available-capabilities="offerCapabilities"
              :sort-options="OFFER_SORT_OPTIONS"
              @update:model-value="Object.assign(offerFilters, $event)"
            />
            <div class="flex flex-col gap-1.5 md:min-h-0 md:flex-1 md:overflow-y-auto">
              <div
                v-if="offerRows.length === 0"
                class="text-[12px] opacity-60"
              >
                {{ offerableKinds.length === 0 ? 'Ekwipunek jest pusty.' : 'Brak towarów w tej kategorii.' }}
              </div>
              <MerchantItemRow
                v-for="row in offerRows"
                :key="row.kind"
                :kind="row.kind"
                :label="row.label"
                :price="row.price"
                price-suffix="monet"
                :committed-count="transaction.offer[row.kind] ?? 0"
                :max-count="ownedCount(row.kind)"
                @commit="onCommitOffer"
                @clear="onClearOffer"
                @open-details="openDetails"
              />
            </div>
          </section>

          <section
            v-if="!isCompact"
            class="flex min-w-0 flex-col md:min-h-0"
          >
            <MerchantTransactionPanel
              :purchases="purchaseLines"
              :offer-items="offerLines"
              :net-coins="netCoins"
              :coins="coins"
              :can-trade="canTrade"
              @trade="onTrade"
              @remove-purchase="onClearPurchase"
              @remove-offer="onClearOffer"
            />
          </section>
        </div>
      </div>

      <div class="mt-3 shrink-0 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </UiPanel>

    <div
      v-if="isCompact && drawerOpen"
      class="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
      @click.self="drawerOpen = false"
    >
      <div class="flex max-h-[calc(100dvh-32px)] w-[min(520px,calc(100vw-32px))] flex-col rounded-[10px] bg-panel p-4 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-sm font-semibold">
            Transakcja
          </h2>
          <button
            type="button"
            class="cursor-pointer rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
            @click="drawerOpen = false"
          >
            Zamknij
          </button>
        </div>
        <MerchantTransactionPanel
          :purchases="purchaseLines"
          :offer-items="offerLines"
          :net-coins="netCoins"
          :coins="coins"
          :can-trade="canTrade"
          @trade="onTrade"
          @remove-purchase="onClearPurchase"
          @remove-offer="onClearOffer"
        />
      </div>
    </div>

    <MerchantItemDetailsModal
      :kind="detailsKind"
      @close="detailsKind = null"
    />
  </div>
</template>
