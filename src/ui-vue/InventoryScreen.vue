<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { enableTouchScroll } from '../input/enableTouchScroll'
import { isTouchDevice } from '../input/isTouchDevice'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { closeInventory, ui } from './store'

const panel = ref<HTMLElement | null>(null)
const touchDevice = isTouchDevice()

const categoryLabel: Record<string, string> = {
  resource: 'Surowiec',
  tool: 'Narzędzie',
  utility: 'Użytkowe',
}

const items = computed(() =>
  (Object.keys(ITEM_DEFS) as ItemKind[])
    .filter((kind) => (ui.inventory.counts[kind] ?? 0) > 0)
    .map((kind) => ({ kind, def: ITEM_DEFS[kind], count: ui.inventory.counts[kind] ?? 0 })),
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

let disposeTouchScroll: (() => void) | null = null

onMounted(() => {
  window.addEventListener('keydown', onKeyDown, true)
  if (touchDevice && panel.value) disposeTouchScroll = enableTouchScroll(panel.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown, true)
  disposeTouchScroll?.()
})
</script>

<template>
  <div v-show="ui.inventory.open" class="seedvale-inventory" @click.self="closeInventory">
    <div ref="panel" class="seedvale-inventory__panel">
      <h1>Ekwipunek</h1>
      <div class="seedvale-inventory__weight">
        Waga: {{ formatWeight(ui.inventory.totalWeight) }} / {{ formatWeight(ui.inventory.maxWeight) }}
      </div>

      <div class="seedvale-inventory__list">
        <div v-if="items.length === 0" class="seedvale-inventory__empty">Ekwipunek jest pusty.</div>
        <div v-for="item in items" :key="item.kind" class="seedvale-inventory__row">
          <div class="seedvale-inventory__row-main">
            <span class="seedvale-inventory__row-name">{{ item.count }} × {{ item.def.label }}</span>
            <span class="seedvale-inventory__row-category">{{ categoryLabel[item.def.category] }}</span>
          </div>
          <div class="seedvale-inventory__row-weight">
            {{ formatWeight(item.def.weight) }} szt. · {{ formatWeight(item.def.weight * item.count) }} razem
          </div>
          <button type="button" class="seedvale-inventory__drop" @click="onDrop(item.kind)">Wyrzuć</button>
        </div>
      </div>

      <div class="seedvale-inventory__hint">
        {{ touchDevice ? 'Dotknij poza oknem — zamknij' : 'Esc — zamknij' }}
      </div>
    </div>
  </div>
</template>
