<script setup lang="ts">
import { ShoppingCartIcon } from 'lucide-vue-next'
import { ref } from 'vue'
import UiButton from '@/components/UiButton.vue'
import type { ItemKind } from '../../items/items'

const props = defineProps<{
  kind: ItemKind
  label: string
  price: number
  priceSuffix?: string
  /** Current quantity already in the transaction basket for this kind (0 = not added). */
  committedCount: number
  /** Upper bound for the stepper (owned count for OFFER); `null` = unbounded (BUY, capped only by coins). */
  maxCount: number | null
}>()

const emit = defineEmits<{
  commit: [kind: ItemKind, quantity: number]
  clear: [kind: ItemKind]
  'open-details': [kind: ItemKind]
}>()

const expanded = ref(false)
const pendingQty = ref(1)

function clampQty(next: number): number {
  const floored = Math.max(1, Math.floor(next))
  return props.maxCount != null ? Math.min(props.maxCount, floored) : floored
}

function toggleExpanded(): void {
  if (!expanded.value) pendingQty.value = clampQty(props.committedCount > 0 ? props.committedCount : 1)
  expanded.value = !expanded.value
}

function add(): void {
  emit('commit', props.kind, pendingQty.value)
  expanded.value = false
}

function clear(): void {
  emit('clear', props.kind)
  expanded.value = false
}
</script>

<template>
  <div
    class="flex flex-col gap-1 rounded-md border border-transparent bg-white/5 px-3 py-2 hover:border-white/30 max-md:px-2 max-md:py-1.5"
    :class="committedCount > 0 ? 'ring-1 ring-white/30 opacity-80' : ''"
  >
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="min-w-0 flex-1 cursor-pointer text-left text-sm hover:opacity-90 max-md:text-[13px]"
        @click="toggleExpanded"
      >
        <span
          v-if="committedCount > 0"
          class="mr-1 opacity-80"
        >✓</span>
        <span class="font-medium capitalize">{{ label }}</span>
        <span
          v-if="committedCount > 0"
          class="ml-2 text-[12px] opacity-70"
        >×{{ committedCount }}</span>
      </button>
      <span class="shrink-0 text-[12px] opacity-70 max-md:text-[11px]">{{ price }}{{ priceSuffix ? ` ${priceSuffix}` : '' }}</span>
      <button
        type="button"
        class="shrink-0 cursor-pointer rounded-full border border-white/20 px-1.5 text-[11px] opacity-70 hover:opacity-100"
        title="Szczegóły"
        @click="emit('open-details', kind)"
      >
        i
      </button>
      <button
        v-if="committedCount > 0"
        type="button"
        class="shrink-0 cursor-pointer text-[11px] opacity-60 hover:opacity-100"
        @click="clear"
      >
        Usuń
      </button>
    </div>

    <div
      v-if="expanded"
      class="flex items-center gap-2"
    >
      <button
        type="button"
        class="cursor-pointer rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20"
        @click="pendingQty = clampQty(pendingQty - 1)"
      >
        −
      </button>
      <span class="w-8 text-center text-xs">{{ pendingQty }}</span>
      <button
        type="button"
        class="cursor-pointer rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20"
        @click="pendingQty = clampQty(pendingQty + 1)"
      >
        +
      </button>
      <UiButton
        class="ml-auto min-h-9 px-3 py-0.5 text-xs"
        label="Dodaj"
        @click="add"
      >
        <ShoppingCartIcon class="size-3" />
      </UiButton>
    </div>
  </div>
</template>
