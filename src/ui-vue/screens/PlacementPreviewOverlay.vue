<script setup lang="ts">
import { computed } from 'vue'
import { formatPlacementRequirement } from '../../app/actions/placementRequirementView'
import { isTouchDevice } from '../../input/isTouchDevice'
import {
  abortPlacementPreview,
  confirmPlacementPreview,
  rotatePlacementPreviewLeft,
  rotatePlacementPreviewRight,
  togglePlacementPreviewRepeat,
  ui,
} from '../store'

const touchDevice = isTouchDevice()

const reasonClass = computed(() => {
  if (ui.placementPreview.state === 'invalid') return 'text-red-300'
  if (ui.placementPreview.state === 'preparation') return 'text-amber-300'
  return 'text-green-300'
})
</script>

<template>
  <div
    v-if="ui.placementPreview.visible"
    class="pointer-events-none fixed inset-x-0 bottom-24 z-[12] flex justify-center"
  >
    <div class="pointer-events-auto relative flex flex-col items-center gap-1.5 rounded-lg bg-panel px-4.5 py-2 text-[15px] text-ink [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
      <div>{{ ui.placementPreview.label }}</div>
      <div
        v-if="ui.placementPreview.reasonLabel"
        class="text-[13px]"
        :class="reasonClass"
      >
        {{ ui.placementPreview.reasonLabel }}
      </div>
      <ul
        v-if="ui.placementPreview.requirements.length"
        class="list-none pl-0 text-[12px] opacity-90"
      >
        <li
          v-for="requirement in ui.placementPreview.requirements"
          :key="requirement.kind"
        >
          {{ formatPlacementRequirement(requirement) }}
        </li>
      </ul>
      <div
        v-if="ui.placementPreview.supportsRotation"
        class="flex items-center gap-2"
      >
        <button
          type="button"
          class="cursor-pointer rounded-md border border-white/20 bg-white/10 px-3 py-1 text-[13px] hover:bg-white/20"
          aria-label="Obróć w lewo"
          @click="rotatePlacementPreviewLeft"
        >
          ↶
          <span
            v-if="!touchDevice"
            class="text-[11px] opacity-70"
          >[F]</span>
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md border border-white/20 bg-white/10 px-3 py-1 text-[13px] hover:bg-white/20"
          aria-label="Obróć w prawo"
          @click="rotatePlacementPreviewRight"
        >
          <span
            v-if="!touchDevice"
            class="text-[11px] opacity-70"
          >[G]</span>
          ↷
        </button>
      </div>
      <label
        v-if="ui.placementPreview.supportsRepeat"
        class="flex items-center gap-2 text-[13px]"
      >
        <input
          type="checkbox"
          :checked="ui.placementPreview.repeatEnabled"
          @change="togglePlacementPreviewRepeat"
        >
        Postaw kolejny
      </label>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="cursor-pointer rounded-md border border-white/20 bg-white/10 px-3 py-1 text-[13px] hover:bg-white/20 disabled:cursor-default disabled:opacity-40"
          :disabled="!ui.placementPreview.canConfirm"
          @click="confirmPlacementPreview"
        >
          {{ ui.placementPreview.confirmLabel }}
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
