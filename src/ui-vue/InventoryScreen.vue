<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { enableTouchScroll } from '../input/enableTouchScroll'
import { isTouchDevice } from '../input/isTouchDevice'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { closeInventory, ui } from './store'

const categoryLabel: Record<string, string> = {
  resource: 'Surowiec',
  tool: 'Narzędzie',
  utility: 'Użytkowe',
}

const items = computed(() =>
  (Object.keys(ITEM_DEFS) as ItemKind[])
    .filter((kind) => (ui.inventory.counts[kind] ?? 0) > 0)
    .map((kind) => ({
      kind,
      def: ITEM_DEFS[kind],
      count: ui.inventory.counts[kind] ?? 0,
    })),
)

function formatWeight(kg: number): string {
  return `${kg.toFixed(1)} kg`
}

function onDrop(kind: ItemKind): void {
  ui.inventory.onDrop?.(kind)
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.code !== 'Escape' || !ui.inventory.open) return
  event.preventDefault()
  event.stopImmediatePropagation()
  closeInventory()
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown, true)
  const panel = document.querySelector<HTMLElement>('.seedvale-inventory__panel')
  if (panel && isTouchDevice()) {
    const disposeTouchScroll = enableTouchScroll(panel)
    onBeforeUnmount(disposeTouchScroll)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown, true)
})
</script>

<template>
  <div
    v-if="ui.inventory.open"
    class="seedvale-inventory"
    @click.self="closeInventory"
  >
    <div class="seedvale-inventory__panel">
      <h1>Ekwipunek</h1>

      <div class="seedvale-inventory__weight">
        Waga: {{ formatWeight(ui.inventory.totalWeight) }} / {{ formatWeight(ui.inventory.maxWeight) }}
      </div>

      <div class="seedvale-inventory__list">
        <div v-if="items.length === 0" class="seedvale-inventory__empty">
          Ekwipunek jest pusty.
        </div>

        <div v-for="item in items" :key="item.kind" class="seedvale-inventory__row">
          <div class="seedvale-inventory__row-main">
            <span class="seedvale-inventory__row-name">
              {{ item.count }} × {{ item.def.label }}
            </span>
            <span class="seedvale-inventory__row-category">
              {{ categoryLabel[item.def.category] }}
            </span>
          </div>
          <div class="seedvale-inventory__row-weight">
            {{ formatWeight(item.def.weight) }} szt. · {{ formatWeight(item.def.weight * item.count) }} razem
          </div>
          <button
            type="button"
            class="seedvale-inventory__drop"
            @click="onDrop(item.kind)"
          >
            Wyrzuć
          </button>
        </div>
      </div>

      <div class="seedvale-inventory__hint">
        {{ isTouchDevice() ? 'Dotknij poza oknem — zamknij' : 'Esc — zamknij' }}
      </div>
    </div>
  </div>
</template>
