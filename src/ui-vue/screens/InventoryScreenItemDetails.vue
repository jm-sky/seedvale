<script setup lang="ts">
import { computed, ref } from 'vue'
import InventoryScreenSection from '@/components/InventoryScreenSection.vue'
import ItemsScreenItemButton from '@/components/ItemsScreenItemButton.vue'
import { useItemCategoryLabels } from '@/composables/useItemCategoryLabels'
import { firstUpperCase } from '@/lib/firstUpperCase'
import { isToolKind } from '../../items/HeldTool'
import { ITEM_CATALOG } from '../../items/itemCatalog'
import { ITEM_DEFS, type ItemDef, type ItemKind } from '../../items/items'
import { useTouchScroll } from '../composables/useTouchScroll'
import { ui } from '../store'

const props = defineProps<{
  selectedItem: ItemKind | null
}>()

const emit = defineEmits<{
  'return-to-list': []
}>()

const panel = ref<HTMLElement | null>(null)
const { categoryLabel } = useItemCategoryLabels()

const item = computed<ItemDef | null>(() => props.selectedItem ? ITEM_DEFS[props.selectedItem] : null)
const itemCount = computed<number>(() => ui.inventory.counts[props.selectedItem as ItemKind ?? ''] ?? 0)
const itemDamage = computed<number | null>(() => ITEM_CATALOG[props.selectedItem as ItemKind]?.meleeDamage ?? null)
const consumable = computed(() => props.selectedItem ? ITEM_CATALOG[props.selectedItem].consumable ?? null : null)
const consumeLabel = computed(() => consumable.value?.need === 'thirst' ? 'Wypij' : 'Zjedz')

useTouchScroll(panel)

function formatWeight(kg: number): string { return `${kg.toFixed(1)} kg` }
function onDrop(kind: ItemKind): void { ui.inventory.onDrop?.(kind) }
function onEquip(kind: ItemKind): void { ui.inventory.onEquip?.(kind) }
function onUnequip(): void { ui.inventory.onUnequip?.() }
function onConsume(kind: ItemKind): void { ui.inventory.onConsume?.(kind) }
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

    <div class="my-2">
      {{ item.description ?? `To jest... ${item.label}.` }}
    </div>

    <div class="my-4 h-px border-white/20 border-b" />

    <div class="grid grid-cols-2 gap-2 my-2">
      <InventoryScreenSection
        label="Kategoria"
        :value="categoryLabel[item.category]"
      />

      <InventoryScreenSection
        label="Ilość"
        :value="`${itemCount} × ${item.label}`"
      />

      <InventoryScreenSection
        label="Waga"
        :value="formatWeight(item.weight)"
      />

      <InventoryScreenSection
        label="Obrażenia"
        :value="itemDamage?.toString() ?? 'Nie dotyczy'"
      />
    </div>

    <div class="my-4 h-px border-white/20 border-b" />

    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mx-auto max-w-md">
      <ItemsScreenItemButton
        v-if="consumable"
        :label="consumeLabel"
        @click="onConsume(item.kind)"
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
        label="Wyrzuć"
        destructive
        @click="onDrop(item.kind)"
      />
    </div>
  </div>
</template>
