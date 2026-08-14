<script setup lang="ts">
import { ref } from 'vue'
import { QUALITY_PRESET_IDS, type QualityPreset } from '../../config/qualityProfiles'
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

function onGraphicsChange(): void {
  state.onPostProcessingChange?.()
}

function onPresetChange(preset: QualityPreset): void {
  state.onQualityPresetChange?.(preset)
}

function onPixelRatioChange(): void {
  state.onRenderQualityChange?.()
}

function onTerrainShadowChange(): void {
  state.onTerrainShadowChange?.()
}

function onShadowMapChange(): void {
  state.onShadowMapSizeChange?.()
}

function onLodScaleChange(): void {
  state.onLodScaleChange?.()
}

function applySeed(): void {
  if (!window.confirm('Odtworzyć teren od nowa z tym seedem? Pozycja i ekwipunek zostaną zachowane.')) return
  state.onTerrainChange?.()
}

function onHomeSizeSelect(event: Event): void {
  const select = event.target as HTMLSelectElement
  const previous = state.config!.settlements.homeSize
  const next = select.value as typeof previous
  if (next === previous) return
  if (!window.confirm('Odtworzyć świat z nową wielkością osady domowej? Pozycja i ekwipunek zostaną zachowane.')) {
    select.value = previous
    return
  }
  state.config!.settlements.homeSize = next
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
        <label
          class="mt-3 mb-1 block text-xs opacity-75"
          for="seedvale-home-size"
        >Wielkość osady domowej</label>
        <select
          id="seedvale-home-size"
          :value="state.config!.settlements.homeSize"
          class="w-full rounded-md border border-white/15 bg-[rgb(28,34,40)] px-2.5 py-2 text-sm text-ink outline-none focus:border-blue-400/60 [color-scheme:dark]"
          @change="onHomeSizeSelect"
        >
          <option
            value="auto"
            class="bg-[rgb(28,34,40)] text-ink"
          >
            Auto
          </option>
          <option
            value="SM"
            class="bg-[rgb(28,34,40)] text-ink"
          >
            Mała
          </option>
          <option
            value="MD"
            class="bg-[rgb(28,34,40)] text-ink"
          >
            Średnia
          </option>
          <option
            value="LG"
            class="bg-[rgb(28,34,40)] text-ink"
          >
            Duża
          </option>
          <option
            value="XL"
            class="bg-[rgb(28,34,40)] text-ink"
          >
            Bardzo duża
          </option>
        </select>
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

      <div class="mb-5">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-widest opacity-60">
          Grafika
        </h2>
        <fieldset class="mb-3">
          <legend class="mb-2 text-xs opacity-75">
            Jakość
          </legend>
          <label
            v-for="preset in QUALITY_PRESET_IDS"
            :key="preset"
            class="mb-1 flex items-center gap-2 text-sm"
          >
            <input
              v-model="state.config!.quality.preset"
              type="radio"
              :value="preset"
              @change="onPresetChange(preset)"
            >
            {{ preset }}
          </label>
        </fieldset>
        <label class="mb-3 flex items-center gap-2 text-sm">
          <input
            v-model="state.config!.postProcessing.aoEnabled"
            type="checkbox"
            @change="onGraphicsChange"
          >
          Ambient occlusion
        </label>
        <label class="mb-3 flex items-center gap-2 text-sm">
          <input
            v-model="state.config!.postProcessing.bloomEnabled"
            type="checkbox"
            @change="onGraphicsChange"
          >
          Bloom
        </label>
        <label class="mb-3 flex items-center gap-2 text-sm">
          <input
            v-model="state.config!.postProcessing.godRaysEnabled"
            type="checkbox"
            @change="onGraphicsChange"
          >
          God rays
        </label>
        <label class="mb-3 flex items-center gap-2 text-sm">
          <input
            v-model="state.config!.postProcessing.waterReflections"
            type="checkbox"
            @change="onGraphicsChange"
          >
          Odbicia wody
        </label>
        <label class="mb-3 flex items-center gap-2 text-sm">
          <input
            v-model="state.config!.postProcessing.terrainCastsShadow"
            type="checkbox"
            @change="onTerrainShadowChange"
          >
          Cienie terenu
        </label>
        <label
          class="mb-1 block text-xs opacity-75"
          for="seedvale-pixel-ratio"
        >Skala renderu ({{ state.config!.postProcessing.pixelRatioCap }}×)</label>
        <input
          id="seedvale-pixel-ratio"
          v-model.number="state.config!.postProcessing.pixelRatioCap"
          type="range"
          min="1"
          max="2"
          step="0.25"
          class="mb-3 w-full"
          @change="onPixelRatioChange"
        >
        <label
          class="mb-1 block text-xs opacity-75"
          for="seedvale-shadow-map"
        >Mapa cieni</label>
        <select
          id="seedvale-shadow-map"
          v-model.number="state.config!.postProcessing.shadowMapSize"
          class="mb-3 w-full rounded-md border border-white/15 bg-[rgb(28,34,40)] px-2.5 py-2 text-sm text-ink outline-none focus:border-blue-400/60 [color-scheme:dark]"
          @change="onShadowMapChange"
        >
          <option :value="512">
            512
          </option>
          <option :value="1024">
            1024
          </option>
          <option :value="2048">
            2048
          </option>
        </select>
        <label
          class="mb-1 block text-xs opacity-75"
          for="seedvale-lod-scale"
        >LOD roślinności ({{ state.config!.quality.lodScale.toFixed(2) }})</label>
        <input
          id="seedvale-lod-scale"
          v-model.number="state.config!.quality.lodScale"
          type="range"
          min="0.25"
          max="1"
          step="0.05"
          class="w-full"
          @change="onLodScaleChange"
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
