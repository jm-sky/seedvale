<script setup lang="ts">
import { computed, ref } from 'vue'
import { ITEM_DEFS, type ItemKind } from '../../items/items'
import { MERCHANT_STOCK, merchantPrice, offerValue, tradeValue } from '../../items/tradeCatalog'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { closeMerchant, isMerchantOpen, ui } from '../store'

useOverlayScreen('merchant', isMerchantOpen, closeMerchant)

const barterKind = ref<ItemKind | null>(null)
const offer = ref<Partial<Record<ItemKind, number>>>({})
const status = ref('')

const shells = computed(() => ui.merchant.counts.shell ?? 0)
const stock = computed(() => MERCHANT_STOCK.map((kind) => ({
  kind,
  label: ITEM_DEFS[kind].label,
  price: merchantPrice(kind) ?? 0,
})))
const offerKinds = computed(() =>
  (Object.keys(ITEM_DEFS) as ItemKind[]).filter((kind) => (ui.merchant.counts[kind] ?? 0) > 0),
)
const offeredValue = computed(() => offerValue(offer.value))
const neededValue = computed(() => (barterKind.value ? merchantPrice(barterKind.value) ?? 0 : 0))
const canBarter = computed(() => barterKind.value != null && offeredValue.value >= neededValue.value)

function setStatus(text: string): void {
  status.value = text
}

function buy(kind: ItemKind): void {
  const result = ui.merchant.onBuyShells?.(kind) ?? 'not_sold'
  if (result === 'ok') setStatus(`Kupiono: ${ITEM_DEFS[kind].label}`)
  else if (result === 'cannot_afford') setStatus('Za mało muszli.')
  else if (result === 'full') setStatus('Ekwipunek jest za ciężki.')
  else setStatus('Nie da się tego kupić.')
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
    setStatus(`Wymieniono na: ${ITEM_DEFS[barterKind.value].label}`)
    offer.value = {}
  } else if (result === 'cannot_afford') setStatus('Za niska wartość wymiany.')
  else if (result === 'full') setStatus('Ekwipunek jest za ciężki.')
  else setStatus('Nie da się wymienić.')
}

function selectBarter(kind: ItemKind): void {
  barterKind.value = kind
}
</script>

<template>
  <div
    v-if="ui.merchant.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeMerchant"
  >
    <div class="max-h-[calc(100dvh-32px)] w-[min(460px,calc(100vw-32px))] overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
      <h2 class="mb-1 text-base font-semibold tracking-wide">
        Kupiec
      </h2>
      <p class="mb-3 text-[13px] opacity-75">
        Muszle: {{ shells }}
      </p>
      <div class="flex flex-col gap-1.5">
        <div
          v-for="item in stock"
          :key="item.kind"
          class="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2"
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
          <button
            type="button"
            class="cursor-pointer rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium hover:bg-white/20"
            @click="buy(item.kind)"
          >
            Kup
          </button>
        </div>
      </div>
      <h3 class="mt-4 mb-1 text-[12px] font-semibold uppercase tracking-wide opacity-70">
        Wymiana
      </h3>
      <p class="mb-2 text-[12px] opacity-70">
        Wybierz towar, potem zaoferuj przedmioty o łącznej wartości co najmniej ceny.
        {{ barterKind ? `Cel: ${ITEM_DEFS[barterKind].label} (${neededValue} · oferujesz ${offeredValue})` : 'Nie wybrano towaru.' }}
      </p>
      <div
        v-if="offerKinds.length === 0"
        class="text-[12px] opacity-60"
      >
        Ekwipunek jest pusty.
      </div>
      <div
        v-else
        class="flex flex-col gap-1"
      >
        <div
          v-for="kind in offerKinds"
          :key="kind"
          class="flex items-center justify-between gap-2 rounded-md bg-white/5 px-3 py-1.5 text-sm"
        >
          <span>{{ ITEM_DEFS[kind].label }} ×{{ ui.merchant.counts[kind] }} <span class="opacity-60">({{ tradeValue(kind) }})</span></span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="cursor-pointer rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20"
              @click="setOfferCount(kind, (offer[kind] ?? 0) - 1)"
            >
              −
            </button>
            <span class="w-6 text-center text-xs">{{ offer[kind] ?? 0 }}</span>
            <button
              type="button"
              class="cursor-pointer rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20"
              @click="setOfferCount(kind, (offer[kind] ?? 0) + 1)"
            >
              +
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        class="mt-3 w-full cursor-pointer rounded-md px-3 py-2 text-sm font-medium"
        :class="canBarter ? 'bg-white/15 hover:bg-white/25' : 'bg-white/5 opacity-50'"
        :disabled="!canBarter"
        @click="barter"
      >
        Wymień
      </button>
      <p
        v-if="status"
        class="mt-2 text-[12px] opacity-80"
      >
        {{ status }}
      </p>
      <div class="mt-3 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </div>
  </div>
</template>
