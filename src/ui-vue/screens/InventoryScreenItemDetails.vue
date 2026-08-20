<script setup lang="ts">
import { Apple, Package, Sword, Wheat } from 'lucide-vue-next'
import { type Component, computed, ref } from 'vue'
import InventoryScreenSection from '@/components/InventoryScreenSection.vue'
import ItemsScreenItemButton from '@/components/ItemsScreenItemButton.vue'
import { useItemCategoryLabels } from '@/composables/useItemCategoryLabels'
import { firstUpperCase } from '@/lib/firstUpperCase'
import { isToolKind } from '../../items/HeldTool'
import { consumeNeedNoun, consumeVerbLabel, ITEM_CATALOG } from '../../items/itemCatalog'
import { isInstanceBackedKind } from '../../items/itemInstances'
import { ITEM_DEFS, type ItemCategory, type ItemDef, type ItemKind, primaryItemCategory } from '../../items/items'
import { tradeValue } from '../../items/tradeCatalog'
import { trapKindForItem } from '../../world/animalTraps'
import { useTouchScroll } from '../composables/useTouchScroll'
import { showToast, ui } from '../store'

const props = defineProps<{
  selectedItem: ItemKind | null
}>()

const emit = defineEmits<{
  'return-to-list': []
}>()

const panel = ref<HTMLElement | null>(null)
const { categoryLabel } = useItemCategoryLabels()

const CATEGORY_ICON: Record<ItemCategory, Component> = {
  weapon: Sword,
  tool: Sword,
  resource: Wheat,
  utility: Package,
  food: Apple,
}

const item = computed<ItemDef | null>(() => props.selectedItem ? ITEM_DEFS[props.selectedItem] : null)
const group = computed(() => props.selectedItem
  ? ui.inventory.groups.find((entry) => entry.kind === props.selectedItem) ?? null
  : null)
const itemCount = computed<number>(() => group.value?.count ?? ui.inventory.counts[props.selectedItem as ItemKind ?? ''] ?? 0)
const catalogEntry = computed(() => props.selectedItem ? ITEM_CATALOG[props.selectedItem] : null)
const melee = computed(() => catalogEntry.value?.melee ?? null)
const meleeSpeed = computed<string | null>(() => {
  const m = melee.value
  if (!m) return null
  const cycle = m.windUp + m.hitWindow + m.recovery
  if (cycle < 0.35) return 'szybki'
  if (cycle < 0.55) return 'średni'
  return 'wolny'
})
const ranged = computed(() => catalogEntry.value?.ranged ?? null)
const consumable = computed(() => catalogEntry.value?.consumable ?? null)
const consumeLabel = computed(() => consumable.value ? consumeVerbLabel(consumable.value.need) : 'Zjedz')
const itemValue = computed<number>(() => item.value ? tradeValue(item.value.kind) : 0)
const itemCategoryText = computed(() => item.value ? item.value.categories.map((cat) => categoryLabel[cat]).join(' · ') : '')
const itemCategoryIcon = computed(() => item.value ? CATEGORY_ICON[primaryItemCategory(item.value)] : Sword)
const imageUrl = computed<string | null>(() => null)

const instanceRows = computed(() => {
  if (!group.value || group.value.instances.length === 0) return []
  const buckets = new Map<string, { count: number, ids: string[], sellPrice: number, conditionPercent: number, sharpnessPercent: number | null }>()
  for (const row of group.value.instances) {
    const key = `${row.conditionPercent}:${row.sharpnessPercent ?? ''}`
    const existing = buckets.get(key)
    if (existing) {
      existing.count++
      existing.ids.push(row.id)
    } else {
      buckets.set(key, {
        count: 1,
        ids: [row.id],
        sellPrice: row.sellPrice,
        conditionPercent: row.conditionPercent,
        sharpnessPercent: row.sharpnessPercent,
      })
    }
  }
  return [...buckets.values()].sort((a, b) => b.conditionPercent - a.conditionPercent)
})

const whetstoneCount = computed<number>(() => ui.inventory.counts.whetstone ?? 0)
const merchantOpen = computed(() => ui.merchant.open)

useTouchScroll(panel)

function formatWeight(kg: number): string { return `${kg.toFixed(1)} kg` }
function onDrop(kind: ItemKind): void { ui.inventory.onDrop?.(kind) }
function onEquip(kind: ItemKind): void { ui.inventory.onEquip?.(kind) }
function onUnequip(): void { ui.inventory.onUnequip?.() }
function onConsume(kind: ItemKind): void { ui.inventory.onConsume?.(kind) }
function onPlaceTrap(kind: ItemKind): void {
  const trapKind = trapKindForItem(kind)
  if (trapKind) ui.inventory.onPlaceTrap?.(trapKind)
}

function sellInstance(id: string): void {
  const result = ui.inventory.onSellInstances?.([id]) ?? 'invalid_offer'
  if (result === 'ok') return
  if (result === 'invalid_offer') showToast('Nie masz tego przedmiotu.', 'error')
  else if (result === 'full') showToast('Ekwipunek jest za ciężki.', 'error')
  else if (result === 'not_sold') showToast('Kupiec tego nie kupi.', 'error')
}

function sharpenInstance(id: string): void {
  const result = ui.inventory.onSharpen?.(id) ?? 'invalid'
  if (result === 'ok') return
  if (result === 'no_whetstone') showToast('Brak osełki.', 'error')
  else if (result === 'already_max') showToast('Ostrość jest już maksymalna.', 'error')
  else showToast('Nie można naostrzyć tej broni.', 'error')
}
</script>

<template>
  <div
    v-if="ui.inventory.open && item"
    ref="panel"
    class="max-h-[calc(100dvh-32px)] w-full max-w-2xl overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
    style="touch-action: pan-y"
  >
    <div class="flex flex-row items-center justify-between gap-2">
      <h1 class="mb-2 text-xl font-semibold tracking-wide">
        {{ firstUpperCase(item.label) }}
      </h1>
      <button
        type="button"
        class="cursor-pointer rounded-md border border-white/20 bg-transparent px-2.5 py-1 text-xs hover:bg-white/10"
        @click="emit('return-to-list')"
      >
        Powrót
      </button>
    </div>

    <div class="my-4 h-px border-white/20 border-b" />

    <div class="my-4 flex h-28 items-center justify-center rounded-md bg-white/5">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="item.label"
        class="h-full w-full rounded-md object-cover"
      >
      <component
        :is="itemCategoryIcon"
        v-else
        :size="40"
        class="opacity-40"
      />
    </div>

    <div class="my-2">
      {{ item.description ?? `To jest... ${item.label}.` }}
    </div>

    <div class="my-4 h-px border-white/20 border-b" />

    <div class="grid grid-cols-2 gap-2 my-2">
      <InventoryScreenSection
        label="Kategoria"
        :value="itemCategoryText"
      />

      <InventoryScreenSection
        label="Ilość"
        :value="`×${itemCount}`"
      />

      <InventoryScreenSection
        label="Waga"
        :value="formatWeight(item.weight)"
      />

      <InventoryScreenSection
        label="Wartość"
        :value="`${itemValue} monet`"
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
        v-if="meleeSpeed"
        label="Szybkość ataku"
        :value="meleeSpeed"
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
    </div>

    <div
      v-if="instanceRows.length > 0"
      class="my-4"
    >
      <div class="mb-2 text-sm font-semibold">
        Lista
      </div>
      <div class="flex flex-col gap-2">
        <div
          v-for="row in instanceRows"
          :key="`${row.conditionPercent}:${row.sharpnessPercent}`"
          class="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/5 px-3 py-2 text-sm"
        >
          <span v-if="row.sharpnessPercent !== null">
            {{ row.count }}× stan {{ row.conditionPercent }}% / ostrość {{ row.sharpnessPercent }}%
          </span>
          <span v-else>{{ row.count }}× {{ firstUpperCase(item.label) }} {{ row.conditionPercent }}%</span>
          <div class="flex flex-wrap gap-2">
            <template v-if="row.sharpnessPercent !== null && row.sharpnessPercent < 100">
              <ItemsScreenItemButton
                v-for="id in row.ids"
                :key="`sharpen-${id}`"
                class="min-h-0 py-1"
                :label="`Naostrz (${whetstoneCount})`"
                @click="sharpenInstance(id)"
              />
            </template>
            <template v-if="merchantOpen">
              <ItemsScreenItemButton
                v-for="id in row.ids"
                :key="`sell-${id}`"
                class="min-h-0 py-1"
                :label="`Sprzedaj (${row.sellPrice})`"
                @click="sellInstance(id)"
              />
            </template>
          </div>
        </div>
      </div>
    </div>

    <div class="my-4 h-px border-white/20 border-b" />

    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mx-auto max-w-md">
      <ItemsScreenItemButton
        v-if="consumable"
        :label="consumeLabel"
        @click="onConsume(item.kind)"
      />
      <ItemsScreenItemButton
        v-if="trapKindForItem(item.kind)"
        label="Zastaw"
        @click="onPlaceTrap(item.kind)"
      />
      <ItemsScreenItemButton
        v-if="isToolKind(item.kind) && ui.inventory.heldTool !== item.kind"
        label="Weź"
        @click="onEquip(item.kind)"
      />
      <ItemsScreenItemButton
        v-if="ui.inventory.heldTool === item.kind"
        label="Odłóż"
        @click="onUnequip"
      />
      <ItemsScreenItemButton
        v-if="!isInstanceBackedKind(item.kind)"
        label="Wyrzuć"
        destructive
        @click="onDrop(item.kind)"
      />
    </div>
  </div>
</template>
