<script setup lang="ts">
import { ref, watch } from 'vue'
import { isTouchDevice } from '../../input/isTouchDevice'
import { type ItemKind } from '../../items/items'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeInventory, emitUiClick, isInventoryOpen, ui } from '../store'
import InventoryScreenItemDetails from './InventoryScreenItemDetails.vue'
import InventoryScreenItemList from './InventoryScreenItemList.vue'

const currentView = ref<'list' | 'details'>('list')
const selectedItem = ref<ItemKind | null>(null)

const panel = ref<HTMLElement | null>(null)
const touchDevice = isTouchDevice()

function onEscape(): void {
  if (currentView.value === 'details') {
    currentView.value = 'list'
    selectedItem.value = null
  } else {
    closeInventory()
  }
}

useOverlayScreen('inventory', isInventoryOpen, onEscape)
useTouchScroll(panel)

watch(() => ui.inventory.open, (open) => {
  if (!open) {
    currentView.value = 'list'
    selectedItem.value = null
  }
})

const onSelectItem = (item: ItemKind) => {
  emitUiClick()
  selectedItem.value = item
  currentView.value = 'details'
}
</script>

<template>
  <div
    v-if="ui.inventory.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeInventory"
  >
    <InventoryScreenItemList
      v-if="currentView === 'list'"
      @select-item="onSelectItem"
    />
    <InventoryScreenItemDetails
      v-if="currentView === 'details'"
      :selected-item="selectedItem"
      @return-to-list="currentView = 'list'"
    />

    <div class="mt-4 text-[11px] opacity-60">
      {{ touchDevice ? 'Dotknij poza oknem — zamknij' : 'Esc — zamknij' }}
    </div>
  </div>
</template>
