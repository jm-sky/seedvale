<script setup lang="ts">
import { computed, ref } from 'vue'
import { isTouchDevice } from '../input/isTouchDevice'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { useOverlayScreen } from './composables/useOverlayScreen'
import { useTouchScroll } from './composables/useTouchScroll'
import { closeInventory, isInventoryOpen, ui } from './store'

const panel = ref<HTMLElement | null>(null)
const touchDevice = isTouchDevice()
const categoryLabel: Record<string, string> = { resource: 'Surowiec', tool: 'Narzędzie', utility: 'Użytkowe' }
const items = computed(() => (Object.keys(ITEM_DEFS) as ItemKind[]).filter((kind) => (ui.inventory.counts[kind] ?? 0) > 0).map((kind) => ({ kind, def: ITEM_DEFS[kind], count: ui.inventory.counts[kind] ?? 0 })))
useOverlayScreen('inventory', isInventoryOpen, closeInventory)
useTouchScroll(panel)
function formatWeight(kg: number): string { return `${kg.toFixed(1)} kg` }
function onDrop(kind: ItemKind): void { ui.inventory.onDrop?.(kind) }
</script>

<template>
  <div
    v-if="ui.inventory.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeInventory"
  >
    <div
      ref="panel"
      class="max-h-[calc(100dvh-32px)] w-[min(480px,calc(100vw-32px))] overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style="touch-action: pan-y"
    >
      <h1 class="mb-2 text-lg font-semibold tracking-wide">
        Ekwipunek
      </h1>
      <div class="mb-4 text-[13px] opacity-75">
        Waga: {{ formatWeight(ui.inventory.totalWeight) }} / {{ formatWeight(ui.inventory.maxWeight) }}
      </div>
      <div class="flex flex-col gap-2">
        <div
          v-if="items.length === 0"
          class="text-[13px] opacity-60"
        >
          Ekwipunek jest pusty.
        </div>
        <div
          v-for="item in items"
          :key="item.kind"
          class="flex flex-col gap-1 rounded-md bg-white/5 p-3"
        >
          <div class="flex items-baseline justify-between">
            <span class="text-sm font-semibold">{{ item.count }} × {{ item.def.label }}</span><span class="text-[11px] uppercase tracking-wide opacity-60">{{ categoryLabel[item.def.category] }}</span>
          </div>
          <div class="text-xs opacity-70">
            {{ formatWeight(item.def.weight) }} szt. · {{ formatWeight(item.def.weight * item.count) }} razem
          </div>
          <button
            type="button"
            class="mt-0.5 self-start cursor-pointer rounded-md border border-white/20 bg-transparent px-2.5 py-1 text-xs hover:bg-white/10"
            @click="onDrop(item.kind)"
          >
            Wyrzuć
          </button>
        </div>
      </div>
      <div class="mt-4 text-[11px] opacity-60">
        {{ touchDevice ? 'Dotknij poza oknem — zamknij' : 'Esc — zamknij' }}
      </div>
    </div>
  </div>
</template>
