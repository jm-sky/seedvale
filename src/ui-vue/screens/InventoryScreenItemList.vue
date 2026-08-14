<script setup lang="ts">
import { computed, ref } from 'vue'
import ItemsScreenItemButton from '@/components/ItemsScreenItemButton.vue'
import { useItemCategoryLabels } from '@/composables/useItemCategoryLabels'
import { isToolKind } from '../../items/HeldTool'
import { ITEM_CATALOG } from '../../items/itemCatalog'
import { ITEM_DEFS, type ItemKind } from '../../items/items'
import { useTouchScroll } from '../composables/useTouchScroll'
import { ui } from '../store'

const panel = ref<HTMLElement | null>(null)

const { categoryLabel } = useItemCategoryLabels()

const items = computed(() => (Object.keys(ITEM_DEFS) as ItemKind[]).filter((kind) => (ui.inventory.counts[kind] ?? 0) > 0).map((kind) => ({ kind, def: ITEM_DEFS[kind], count: ui.inventory.counts[kind] ?? 0, consumable: ITEM_CATALOG[kind].consumable ?? null })))

const emit = defineEmits<{
  'select-item': [item: ItemKind],
}>()

useTouchScroll(panel)

function formatWeight(kg: number): string { return `${kg.toFixed(1)} kg` }
function consumeLabel(need: 'hunger' | 'thirst'): string { return need === 'thirst' ? 'Wypij' : 'Zjedz' }
function onDrop(kind: ItemKind): void { ui.inventory.onDrop?.(kind) }
function onEquip(kind: ItemKind): void { ui.inventory.onEquip?.(kind) }
function onUnequip(): void { ui.inventory.onUnequip?.() }
function onConsume(kind: ItemKind): void { ui.inventory.onConsume?.(kind) }
</script>

<template>
  <div
    ref="panel"
    class="max-h-[calc(100dvh-32px)] w-full max-w-3xl overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
    style="touch-action: pan-y"
  >
    <h1 class="mb-2 text-lg font-semibold tracking-wide">
      Ekwipunek
    </h1>
    <div class="mb-4 text-[13px] opacity-75">
      Waga: {{ formatWeight(ui.inventory.totalWeight) }} / {{ formatWeight(ui.inventory.maxWeight) }}
      <span
        v-if="ui.inventory.heldTool"
        class="ml-2 opacity-90"
      >
        · w ręce: {{ ITEM_DEFS[ui.inventory.heldTool].label }}
      </span>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
      <div
        v-if="items.length === 0"
        class="text-[13px] opacity-60"
      >
        Ekwipunek jest pusty.
      </div>
      <div
        v-for="item in items"
        :key="item.kind"
        class="flex flex-col gap-1 rounded-md bg-white/5 p-3 border"
        :class="ui.inventory.heldTool === item.kind ? 'border-primary/50' : 'border-transparent'"
      >
        <button
          type="button"
          class="cursor-pointer flex items-baseline justify-between hover:text-primary"
          @click="emit('select-item', item.kind)"
        >
          <span class="text-sm font-semibold">
            {{ item.count }} × {{ item.def.label }}
          </span>
          <span class="text-[11px] uppercase tracking-wide opacity-60">
            {{ categoryLabel[item.def.category] }}
          </span>
        </button>
        <div class="text-xs opacity-70">
          {{ formatWeight(item.def.weight) }} szt. · {{ formatWeight(item.def.weight * item.count) }} razem
        </div>
        <div class="mt-1 -mb-1 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center justify-start gap-2">
            <ItemsScreenItemButton
              v-if="item.consumable"
              class="min-h-0 py-1"
              :label="consumeLabel(item.consumable.need)"
              @click="onConsume(item.kind)"
            />
            <ItemsScreenItemButton
              v-if="isToolKind(item.kind) && ui.inventory.heldTool !== item.kind"
              class="min-h-0 py-1"
              label="Weź"
              @click="onEquip(item.kind)"
            />
            <ItemsScreenItemButton
              v-if="ui.inventory.heldTool === item.kind"
              class="min-h-0 py-1"
              label="Odłóż"
              @click="onUnequip"
            />
          </div>
          <div class="flex items-center justify-end gap-2">
            <ItemsScreenItemButton
              class="min-h-0 py-1"
              label="Wyrzuć"
              destructive
              @click="onDrop(item.kind)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
