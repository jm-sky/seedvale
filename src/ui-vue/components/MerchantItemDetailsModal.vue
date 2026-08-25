<script setup lang="ts">
import { Apple, Package, Sword, Wheat } from 'lucide-vue-next'
import { type Component, computed, ref } from 'vue'
import InventoryScreenSection from '@/components/InventoryScreenSection.vue'
import { useItemCategoryLabels } from '@/composables/useItemCategoryLabels'
import { firstUpperCase } from '@/lib/firstUpperCase'
import { consumeNeedNoun, ITEM_CATALOG } from '../../items/itemCatalog'
import { ITEM_DEFS, type ItemCategory, type ItemKind, primaryItemCategory } from '../../items/items'
import { merchantPrice, tradeValue } from '../../items/tradeCatalog'
import { useTouchScroll } from '../composables/useTouchScroll'
import { ui } from '../store'

const props = defineProps<{
  kind: ItemKind | null
}>()

const emit = defineEmits<{
  close: []
}>()

const panel = ref<HTMLElement | null>(null)
useTouchScroll(panel)
const { categoryLabel } = useItemCategoryLabels()

const CATEGORY_ICON: Record<ItemCategory, Component> = {
  weapon: Sword,
  tool: Sword,
  resource: Wheat,
  utility: Package,
  food: Apple,
}

const item = computed(() => props.kind ? ITEM_DEFS[props.kind] : null)
const catalogEntry = computed(() => props.kind ? ITEM_CATALOG[props.kind] : null)
const group = computed(() => props.kind ? ui.merchant.groups.find((entry) => entry.kind === props.kind) ?? null : null)

const melee = computed(() => catalogEntry.value?.melee ?? null)
const ranged = computed(() => catalogEntry.value?.ranged ?? null)
const consumable = computed(() => catalogEntry.value?.consumable ?? null)
const capabilities = computed(() => catalogEntry.value?.capabilities ?? [])
const buyPrice = computed<number | null>(() => props.kind ? merchantPrice(props.kind) : null)
const barterValue = computed<number>(() => props.kind ? tradeValue(props.kind) : 0)
const itemCategoryText = computed(() => item.value ? item.value.categories.map((cat) => categoryLabel[cat]).join(' · ') : '')
const itemCategoryIcon = computed(() => item.value ? CATEGORY_ICON[primaryItemCategory(item.value)] : Sword)

function formatWeight(kg: number): string { return `${kg.toFixed(1)} kg` }
</script>

<template>
  <div
    v-if="item"
    class="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="emit('close')"
  >
    <div
      ref="panel"
      class="max-h-[calc(100dvh-32px)] w-full max-w-lg overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style="touch-action: pan-y"
    >
      <div class="flex flex-row items-center justify-between gap-2">
        <h1 class="mb-2 text-xl font-semibold tracking-wide">
          {{ firstUpperCase(item.label) }}
        </h1>
        <button
          type="button"
          class="cursor-pointer rounded-md border border-white/20 bg-transparent px-2.5 py-1 text-xs hover:bg-white/10"
          @click="emit('close')"
        >
          Zamknij
        </button>
      </div>

      <div class="my-4 h-px border-white/20 border-b" />

      <div class="my-4 flex h-24 items-center justify-center rounded-md bg-white/5">
        <component
          :is="itemCategoryIcon"
          :size="36"
          class="opacity-40"
        />
      </div>

      <div
        v-if="item.description"
        class="my-2"
      >
        {{ item.description }}
      </div>

      <div class="my-4 h-px border-white/20 border-b" />

      <div class="my-2 grid grid-cols-2 gap-2">
        <InventoryScreenSection
          label="Kategoria"
          :value="itemCategoryText"
        />
        <InventoryScreenSection
          label="Waga"
          :value="formatWeight(item.weight)"
        />
        <InventoryScreenSection
          v-if="buyPrice != null"
          label="Cena kupna"
          :value="`${buyPrice} monet`"
        />
        <InventoryScreenSection
          label="Wartość wymiany"
          :value="`${barterValue} monet`"
        />
        <InventoryScreenSection
          v-if="group?.condition === 'uniform' && group.uniformConditionPercent != null"
          label="Stan"
          :value="`${group.uniformConditionPercent}%`"
        />
        <InventoryScreenSection
          v-if="melee"
          label="Obrażenia"
          :value="melee.damage.toString()"
        />
        <InventoryScreenSection
          v-if="melee"
          label="Zasięg"
          :value="`${melee.range.toFixed(1)} m`"
        />
        <InventoryScreenSection
          v-if="ranged"
          label="Obrażenia"
          :value="ranged.damage.toString()"
        />
        <InventoryScreenSection
          v-if="ranged"
          label="Zasięg"
          :value="`${ranged.range.toFixed(1)} m`"
        />
        <InventoryScreenSection
          v-if="consumable"
          label="Efekt"
          :value="`+${consumable.relief} ${consumeNeedNoun(consumable.need)}`"
        />
        <InventoryScreenSection
          v-if="capabilities.length > 0"
          label="Zdolności"
          :value="capabilities.join(', ')"
        />
      </div>

      <div
        v-if="group?.condition === 'mixed' && group.instances.length > 0"
        class="my-4"
      >
        <div class="mb-2 text-sm font-semibold">
          Egzemplarze
        </div>
        <div class="flex flex-col gap-1">
          <div
            v-for="row in group.instances"
            :key="row.id"
            class="flex items-center justify-between rounded-md bg-white/5 px-3 py-1.5 text-sm"
          >
            <span v-if="row.sharpnessPercent !== null">
              Stan {{ row.conditionPercent }}% / ostrość {{ row.sharpnessPercent }}%
            </span>
            <span v-else>Stan {{ row.conditionPercent }}%</span>
            <span class="opacity-70">{{ row.sellPrice }} monet</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
