<script setup lang="ts">
import { finishTimeSkipHide, ui } from '../store'
</script>

<template>
  <div
    v-if="ui.timeSkip.visible"
    class="pointer-events-none fixed inset-0 flex items-center justify-center"
  >
    <div
      class="pointer-events-none absolute inset-0 bg-black/10 opacity-0 backdrop-blur-[2px] backdrop-grayscale backdrop-brightness-90 transition-opacity duration-400 ease-in-out"
      :class="{ 'opacity-100': ui.timeSkip.fadeVisible }"
      @transitionend="finishTimeSkipHide"
    />
    <div class="relative rounded-lg bg-panel px-4.5 py-2 text-[15px] text-ink [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
      {{ ui.timeSkip.label }}
    </div>
  </div>
</template>
