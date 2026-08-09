<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import InventoryScreen from './InventoryScreen.vue'
import NpcDialogueMenu from './NpcDialogueMenu.vue'
import VillagersScreen from './screens/VillagersScreen.vue'
import { closeTopOverlay, ui } from './store'

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (ui.openStack.length === 0) return
  closeTopOverlay()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-10">
    <NpcDialogueMenu />
    <VillagersScreen />
    <InventoryScreen />
  </div>
</template>
