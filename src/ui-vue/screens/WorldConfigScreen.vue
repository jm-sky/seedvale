<script setup lang="ts">
import { ref } from 'vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeWorldConfigScreen, isWorldConfigScreenOpen, ui } from '../store'

const panel = ref<HTMLElement | null>(null)
const state = ui.worldConfigScreen

useOverlayScreen('world-config', isWorldConfigScreenOpen, closeWorldConfigScreen)
useTouchScroll(panel)

function onDayNightInput(): void {
  state.onDayNightChange?.()
}

function onFlatShadingChange(): void {
  state.onTerrainChange?.()
}

function applySeed(): void {
  if (!window.confirm('Odtworzyć teren od nowa z tym seedem? Pozycja i ekwipunek zostaną zachowane.')) return
  state.onTerrainChange?.()
}
</script>

<template>
  <div
    v-if="state.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeWorldConfigScreen"
  >
    <div
      v-if="state.config && state.dayNight"
      ref="panel"
      class="max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style="touch-action: pan-y"
    >
      <h1 class="mb-4 text-lg font-semibold tracking-wide">
        Świat
      </h1>

      <div class="mb-5">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-widest opacity-60">
          Teren
        </h2>
        <label
          class="mb-1 block text-xs opacity-75"
          for="seedvale-world-seed"
        >Seed</label>
        <div class="flex gap-2">
          <input
            id="seedvale-world-seed"
            v-model.number="state.config!.seed"
            type="number"
            min="0"
            max="9999"
            class="w-full rounded-md border border-white/15 bg-white/5 px-2.5 py-2 text-sm outline-none focus:border-blue-400/60"
          >
          <button
            type="button"
            class="shrink-0 cursor-pointer rounded-md border border-white/15 bg-blue-600 px-3.5 py-2 text-sm text-white hover:bg-blue-500"
            @click="applySeed"
          >
            Zastosuj
          </button>
        </div>
        <label class="mt-3 flex items-center gap-2 text-sm">
          <input
            v-model="state.config!.terrain.flatShading"
            type="checkbox"
            @change="onFlatShadingChange"
          >
          Low-poly (flat shading)
        </label>
      </div>

      <div class="mb-5">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-widest opacity-60">
          Dzień / noc
        </h2>
        <label class="mb-3 flex items-center gap-2 text-sm">
          <input
            v-model="state.dayNight!.enabled"
            type="checkbox"
            @change="onDayNightInput"
          >
          Cykl dnia/nocy włączony
        </label>
        <label
          class="mb-1 block text-xs opacity-75"
          for="seedvale-time-multiplier"
        >Szybkość ({{ state.dayNight!.timeMultiplier.toFixed(1) }}×)</label>
        <input
          id="seedvale-time-multiplier"
          v-model.number="state.dayNight!.timeMultiplier"
          type="range"
          min="0"
          max="20"
          step="0.1"
          class="mb-3 w-full"
          @input="onDayNightInput"
        >
        <label
          class="mb-1 block text-xs opacity-75"
          for="seedvale-day-length"
        >Długość dnia ({{ Math.round(state.dayNight!.dayLengthSec) }}s)</label>
        <input
          id="seedvale-day-length"
          v-model.number="state.dayNight!.dayLengthSec"
          type="range"
          min="60"
          max="1200"
          step="10"
          class="w-full"
          @input="onDayNightInput"
        >
      </div>

      <button
        type="button"
        class="block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
        @click="closeWorldConfigScreen"
      >
        Wróć
      </button>
    </div>
  </div>
</template>
