<script setup lang="ts">
import { CheckIcon } from '@lucide/vue'
import { ref } from 'vue'
import UiButton from '@/components/UiButton.vue'
import type { ItemKind } from '../../items/items'
import { useTouchScroll } from '../composables/useTouchScroll'

export type TransactionLine = { kind: ItemKind, label: string, count: number, totalValue: number }

const props = defineProps<{
  purchases: readonly TransactionLine[]
  offerItems: readonly TransactionLine[]
  /** Positive = "To pay", negative = "You receive", 0 = nothing to settle. */
  netCoins: number
  coins: number
  canTrade: boolean
}>()

const emit = defineEmits<{
  trade: []
  'remove-purchase': [kind: ItemKind]
  'remove-offer': [kind: ItemKind]
}>()

const list = ref<HTMLElement | null>(null)
useTouchScroll(list)

function afterTrade(): number {
  return props.coins - props.netCoins
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <h3 class="mb-2 shrink-0 text-[12px] font-semibold uppercase tracking-wide opacity-70 max-md:text-[11px]">
      Transakcja
    </h3>
    <div
      ref="list"
      class="min-h-0 flex-1 space-y-2 overflow-y-auto"
      style="touch-action: pan-y"
    >
      <div
        v-if="purchases.length === 0 && offerItems.length === 0"
        class="text-[12px] opacity-60"
      >
        Wybierz towary do kupienia lub oferowane przedmioty.
      </div>
      <div v-if="purchases.length > 0">
        <div class="mb-1 text-[11px] opacity-60">
          BUY
        </div>
        <div
          v-for="line in purchases"
          :key="`buy-${line.kind}`"
          class="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1 text-sm"
        >
          <span class="min-w-0 truncate capitalize">{{ line.label }} ×{{ line.count }}</span>
          <span class="flex shrink-0 items-center gap-2">
            <span class="text-[12px] opacity-70">{{ line.totalValue }}</span>
            <button
              type="button"
              class="cursor-pointer text-[11px] opacity-60 hover:opacity-100"
              @click="emit('remove-purchase', line.kind)"
            >
              ✕
            </button>
          </span>
        </div>
      </div>
      <div v-if="offerItems.length > 0">
        <div class="mb-1 text-[11px] opacity-60">
          OFFER
        </div>
        <div
          v-for="line in offerItems"
          :key="`offer-${line.kind}`"
          class="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1 text-sm"
        >
          <span class="min-w-0 truncate capitalize">{{ line.label }} ×{{ line.count }}</span>
          <span class="flex shrink-0 items-center gap-2">
            <span class="text-[12px] opacity-70">−{{ line.totalValue }}</span>
            <button
              type="button"
              class="cursor-pointer text-[11px] opacity-60 hover:opacity-100"
              @click="emit('remove-offer', line.kind)"
            >
              ✕
            </button>
          </span>
        </div>
      </div>
    </div>

    <div class="mt-2 shrink-0 space-y-1 border-t border-white/10 pt-2 text-sm">
      <div class="flex items-center justify-between">
        <span>{{ netCoins > 0 ? 'To pay' : 'You receive' }}</span>
        <span class="font-semibold">{{ Math.abs(netCoins) }} monet</span>
      </div>
      <div class="flex items-center justify-between text-[12px] opacity-70">
        <span>Twoje monety</span>
        <span>{{ coins }}</span>
      </div>
      <div class="flex items-center justify-between text-[12px] opacity-70">
        <span>Po transakcji</span>
        <span>{{ afterTrade() }}</span>
      </div>
      <UiButton
        class="mt-2 w-full"
        label="Handluj"
        :disabled="!canTrade"
        :class="canTrade ? '' : 'opacity-50'"
        @click="emit('trade')"
      >
        <CheckIcon class="size-4" />
      </UiButton>
    </div>
  </div>
</template>
