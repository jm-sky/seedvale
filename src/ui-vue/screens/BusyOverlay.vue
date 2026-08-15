<script setup lang="ts">
import { ui } from '../store'
</script>

<template>
  <div
    v-if="ui.busy.visible"
    class="pointer-events-none fixed inset-0 z-[12] flex items-center justify-center"
  >
    <div
      v-if="ui.busy.blurred"
      class="pointer-events-none absolute inset-0 bg-black/10 backdrop-blur-[2px] backdrop-grayscale backdrop-brightness-90"
    />
    <div class="relative rounded-lg bg-panel px-4.5 py-2 text-[15px] text-ink [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
      {{ ui.busy.label }}
      <div
        v-if="ui.busy.progress !== null"
        class="mt-1.5 h-1 w-40 overflow-hidden rounded-full bg-white/20"
      >
        <div
          class="h-full bg-ink transition-[width] duration-100 ease-linear"
          :style="{ width: `${Math.round(ui.busy.progress * 100)}%` }"
        />
      </div>
    </div>
  </div>
</template>
