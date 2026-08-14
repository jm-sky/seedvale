<script setup lang="ts">
import { Menu, Zap } from 'lucide-vue-next'
import { isTouchDevice } from '../../input/isTouchDevice'
import { ui } from '../store'

const touch = isTouchDevice()
</script>

<template>
  <template v-if="touch && ui.touch.visible">
    <!-- Pause — top-right; MinimapScreen sits directly below this button. -->
    <button
      type="button"
      class="pointer-events-auto fixed z-8 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-[rgba(20,24,28,0.6)] text-ink [-webkit-tap-highlight-color:transparent]"
      style="top: max(16px, env(safe-area-inset-top)); right: max(16px, env(safe-area-inset-right))"
      :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled }"
      aria-label="Pauza"
      @click="ui.touch.onPause?.()"
    >
      <Menu :size="20" />
    </button>

    <!-- Action cluster — same stacking level as flavor/NPC dialogue (z-10);
         rendered after those overlays in App.vue so E stays tappable for
         quest-accept. PauseMenu is z-11 and stays above. Interact (E) stays
         enabled while the rest of the layer is disabled. -->
    <div
      class="fixed z-10 flex flex-col items-center gap-3"
      style="right: max(20px, env(safe-area-inset-right)); bottom: max(20px, env(safe-area-inset-bottom))"
    >
      <button
        type="button"
        class="pointer-events-auto flex h-[52px] w-[52px] cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(20,24,28,0.6)] text-ink [-webkit-tap-highlight-color:transparent]"
        :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled }"
        aria-label="Szybkie działania"
        @click="ui.touch.onQuickActions?.()"
      >
        <Zap :size="22" />
      </button>
      <button
        type="button"
        class="pointer-events-auto flex h-[68px] w-[68px] cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(61,123,209,0.75)] text-lg font-semibold text-ink [-webkit-tap-highlight-color:transparent]"
        aria-label="Interakcja"
        @click="ui.touch.onInteract?.()"
      >
        E
      </button>
    </div>
  </template>
</template>
