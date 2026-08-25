<script setup lang="ts">
import { computed } from 'vue'
import { useItemCategoryLabels } from '@/composables/useItemCategoryLabels'
import type { ItemCapability } from '../../items/itemCatalog'
import type { CapabilityFilter, CategoryFilter, PriceFilter, TradeFilters, TradeSortMode } from '../composables/useMerchantTradeState'

const props = defineProps<{
  modelValue: TradeFilters
  availableCapabilities: readonly ItemCapability[]
  sortOptions: readonly { id: TradeSortMode, label: string }[]
}>()

const emit = defineEmits<{
  'update:modelValue': [TradeFilters]
}>()

const { categoryLabel } = useItemCategoryLabels()

const CAPABILITY_LABEL: Record<ItemCapability, string> = {
  wood_chopping: 'Rąbanie drewna',
  meat_harvesting: 'Oprawianie',
  branch_trimming: 'Obcinanie gałęzi',
  soil_digging: 'Kopanie',
  rock_mining: 'Kucie w skale',
  fire_starting: 'Rozpalanie ognia',
  fishing: 'Wędkowanie',
}

const categoryChips: { id: CategoryFilter, label: string }[] = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'weapon', label: categoryLabel.weapon },
  { id: 'resource', label: categoryLabel.resource },
  { id: 'tool', label: categoryLabel.tool },
  { id: 'utility', label: categoryLabel.utility },
  { id: 'food', label: categoryLabel.food },
]

const capabilityChips = computed(() => [
  { id: 'all' as CapabilityFilter, label: 'Dowolna zdolność' },
  ...props.availableCapabilities.map((id) => ({ id: id as CapabilityFilter, label: CAPABILITY_LABEL[id] })),
])

const priceChips: { id: PriceFilter, label: string }[] = [
  { id: 'all', label: 'Każda cena' },
  { id: 'low', label: '≤10' },
  { id: 'mid', label: '11–25' },
  { id: 'high', label: '>25' },
]

function chipClass(active: boolean): string {
  return active ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'
}

function update(patch: Partial<TradeFilters>): void {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <input
      type="text"
      placeholder="Szukaj..."
      class="w-full rounded-md bg-white/5 px-2 py-1.5 text-xs outline-none placeholder:opacity-50 focus:bg-white/10"
      :value="modelValue.search"
      @input="update({ search: ($event.target as HTMLInputElement).value })"
    >
    <div class="flex flex-wrap gap-1">
      <button
        v-for="chip in categoryChips"
        :key="chip.id"
        type="button"
        class="cursor-pointer rounded-md px-2 py-1 text-xs max-md:px-1.5 max-md:py-0.5 max-md:text-[11px]"
        :class="chipClass(modelValue.category === chip.id)"
        @click="update({ category: chip.id })"
      >
        {{ chip.label }}
      </button>
    </div>
    <div
      v-if="capabilityChips.length > 1"
      class="flex flex-wrap gap-1"
    >
      <button
        v-for="chip in capabilityChips"
        :key="chip.id"
        type="button"
        class="cursor-pointer rounded-md px-2 py-1 text-xs max-md:px-1.5 max-md:py-0.5 max-md:text-[11px]"
        :class="chipClass(modelValue.capability === chip.id)"
        @click="update({ capability: chip.id })"
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
        :class="chipClass(modelValue.price === chip.id)"
        @click="update({ price: chip.id })"
      >
        {{ chip.label }}
      </button>
      <span class="mx-0.5 hidden opacity-30 md:inline">|</span>
      <button
        v-for="chip in sortOptions"
        :key="chip.id"
        type="button"
        class="cursor-pointer rounded-md px-2 py-1 text-xs max-md:px-1.5 max-md:py-0.5 max-md:text-[11px]"
        :class="chipClass(modelValue.sort === chip.id)"
        @click="update({ sort: chip.id })"
      >
        {{ chip.label }}
      </button>
    </div>
  </div>
</template>
