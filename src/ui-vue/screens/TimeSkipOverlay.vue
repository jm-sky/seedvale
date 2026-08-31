<script setup lang="ts">
import { abortRest, abortTerrainPreparation, finishTimeSkipHide, ui } from '../store'
</script>

<template>
  <div
    v-if="ui.timeSkip.visible"
    class="pointer-events-none fixed inset-0 z-[12] flex items-center justify-center"
  >
    <div
      class="pointer-events-none absolute inset-0 bg-black/10 opacity-0 backdrop-blur-[2px] backdrop-grayscale backdrop-brightness-90 transition-opacity duration-400 ease-in-out"
      :style="{ opacity: ui.timeSkip.fadeVisible ? ui.timeSkip.fadeStrength : 0 }"
      @transitionend="finishTimeSkipHide"
    />
    <div class="relative flex flex-col items-center gap-2 rounded-lg bg-panel px-4.5 py-2 text-[15px] text-ink [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
      <span>{{ ui.timeSkip.label }}</span>
      <button
        v-if="ui.timeSkip.canCancelRest"
        type="button"
        class="pointer-events-auto cursor-pointer rounded-md border border-white/20 bg-white/10 px-3 py-1 text-[13px] hover:bg-white/20"
        @click="abortRest()"
      >
        Esc
      </button>
      <button
        v-if="ui.timeSkip.canCancelTerrainPreparation"
        type="button"
        class="pointer-events-auto cursor-pointer rounded-md border border-white/20 bg-white/10 px-3 py-1 text-[13px] hover:bg-white/20"
        @click="abortTerrainPreparation()"
      >
        Anuluj [Esc]
      </button>
    </div>
  </div>
</template>
