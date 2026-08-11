<script setup lang="ts">
import { ui } from '../store'
</script>

<template>
  <div
    v-if="ui.busy.visible"
    class="pointer-events-none fixed inset-0 z-[12] flex items-center justify-center"
  >
    <div class="relative rounded-lg bg-panel px-4.5 py-2 text-[15px] text-ink [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
      {{ ui.busy.label }}
    </div>
  </div>
</template>
