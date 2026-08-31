<script setup lang="ts">
import { abortRest, ui } from '../store'
</script>

<template>
  <div
    v-if="ui.lodgingWalk.active"
    class="pointer-events-none fixed inset-x-0 bottom-24 z-[12] flex justify-center"
  >
    <button
      type="button"
      class="pointer-events-auto cursor-pointer rounded-md border border-white/20 bg-panel px-3 py-1 text-[13px] text-ink [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] hover:bg-white/20"
      @click="abortRest()"
    >
      Anuluj [Esc]
    </button>
  </div>
</template>
