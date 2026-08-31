<script setup lang="ts">
import { abortPlacementPreview, confirmPlacementPreview, ui } from '../store'
</script>

<template>
  <div
    v-if="ui.placementPreview.visible"
    class="pointer-events-none fixed inset-x-0 bottom-24 z-[12] flex justify-center"
  >
    <div class="pointer-events-auto relative flex flex-col items-center gap-1.5 rounded-lg bg-panel px-4.5 py-2 text-[15px] text-ink [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
      <div>{{ ui.placementPreview.label }}</div>
      <div
        v-if="!ui.placementPreview.valid && ui.placementPreview.reasonLabel"
        class="text-[13px] text-red-300"
      >
        {{ ui.placementPreview.reasonLabel }}
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="cursor-pointer rounded-md border border-white/20 bg-white/10 px-3 py-1 text-[13px] hover:bg-white/20 disabled:cursor-default disabled:opacity-40"
          :disabled="!ui.placementPreview.valid"
          @click="confirmPlacementPreview"
        >
          Zatwierdź [E]
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md border border-white/20 bg-white/10 px-3 py-1 text-[13px] hover:bg-white/20"
          @click="abortPlacementPreview"
        >
          Anuluj [Esc]
        </button>
      </div>
    </div>
  </div>
</template>
