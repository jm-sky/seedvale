<script setup lang="ts">
import InventoryScreen from './InventoryScreen.vue'
import NpcDialogueMenu from './NpcDialogueMenu.vue'
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-10">
    <NpcDialogueMenu />
    <InventoryScreen />
  </div>
</template>
