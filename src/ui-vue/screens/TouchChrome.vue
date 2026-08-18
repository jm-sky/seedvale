<script setup lang="ts">
import { Zap } from 'lucide-vue-next'
import { isTouchDevice } from '../../input/isTouchDevice'
import { ui } from '../store'

const touch = isTouchDevice()
</script>

<template>
  <template v-if="touch && ui.touch.visible">
    <!-- Action cluster stays a sibling after FlavorDialog (App.vue) so E is
         tappable over NPC/flavor at z-10. Pause + skills + minimap live in
         HudRightColumn; Quick Actions is a fixed overlay on body. PauseMenu
         is z-11 and stays above. -->
    <div
      class="fixed z-10 flex flex-col items-center gap-3"
      style="right: max(20px, env(safe-area-inset-right)); bottom: max(20px, env(safe-area-inset-bottom))"
    >
      <button
        type="button"
        class="pointer-events-auto flex size-13 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(20,24,28,0.6)] text-ink [-webkit-tap-highlight-color:transparent]"
        :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled }"
        aria-label="Szybkie działania"
        @click="ui.touch.onQuickActions?.()"
      >
        <Zap :size="22" />
      </button>
      <div class="relative">
        <button
          type="button"
          class="pointer-events-auto flex size-17 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(61,123,209,0.75)] text-lg font-semibold text-ink [-webkit-tap-highlight-color:transparent]"
          aria-label="Interakcja"
          @click="ui.touch.onInteract?.()"
        >
          E
        </button>
        <button
          type="button"
          class="absolute right-full mr-1 top-2 pointer-events-auto flex size-13 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(161,123,209,0.50)] text-lg font-semibold text-ink [-webkit-tap-highlight-color:transparent]"
          :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled }"
          aria-label="Interakcja alternatywna"
          @click="ui.touch.onAltInteract?.()"
        >
          R
        </button>
      </div>
    </div>
  </template>
</template>
