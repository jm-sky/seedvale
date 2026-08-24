<script setup lang="ts">
import { ui } from '../store'
</script>

<template>
  <div
    v-if="ui.terrainPreparationPreview.visible"
    class="pointer-events-none fixed inset-x-0 bottom-24 z-[12] flex justify-center"
  >
    <div class="relative flex flex-col items-center gap-1 rounded-lg bg-panel px-4.5 py-2 text-[15px] text-ink [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
      <div class="flex items-center gap-3">
        <span>Rozmiar: {{ ui.terrainPreparationPreview.sizeLabel }}</span>
        <span>Wysokość: {{ ui.terrainPreparationPreview.heightLabel }}</span>
      </div>
      <div
        v-if="!ui.terrainPreparationPreview.valid && ui.terrainPreparationPreview.reasonLabel"
        class="text-[13px] text-red-300"
      >
        {{ ui.terrainPreparationPreview.reasonLabel }}
      </div>
      <div class="text-[12px] text-ink/70">
        [Scroll]/[+/-] rozmiar · [,/.] wysokość · [E] zatwierdź · [Esc] anuluj
      </div>
    </div>
  </div>
</template>
