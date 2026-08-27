<script setup lang="ts">
import { BowArrow, Crosshair, Sword, Zap } from 'lucide-vue-next'
import { isTouchDevice } from '../../input/isTouchDevice'
import { equipPrimaryMelee, equipPrimaryRanged, ui } from '../store'

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
        v-if="ui.touch.cycleTargetAvailable"
        type="button"
        class="pointer-events-auto flex size-13 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(255,196,92,0.35)] text-ink [-webkit-tap-highlight-color:transparent]"
        :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled }"
        aria-label="Następny cel"
        @click="ui.touch.onCycleTarget?.()"
      >
        <Crosshair :size="20" />
      </button>
      <button
        v-if="ui.hud.primaryRangedLabel"
        type="button"
        class="pointer-events-auto flex size-11 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(20,24,28,0.6)] text-ink [-webkit-tap-highlight-color:transparent]"
        :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled }"
        :aria-label="`Broń dystansowa: ${ui.hud.primaryRangedLabel}`"
        @click="equipPrimaryRanged"
      >
        <BowArrow :size="18" />
      </button>
      <button
        v-if="ui.hud.primaryMeleeLabel"
        type="button"
        class="pointer-events-auto flex size-11 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(20,24,28,0.6)] text-ink [-webkit-tap-highlight-color:transparent]"
        :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled }"
        :aria-label="`Broń biała: ${ui.hud.primaryMeleeLabel}`"
        @click="equipPrimaryMelee"
      >
        <Sword :size="18" />
      </button>
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
          @pointerdown="ui.touch.onInteract?.()"
          @pointerup="ui.touch.onInteractUp?.()"
          @pointercancel="ui.touch.onInteractUp?.()"
          @pointerleave="ui.touch.onInteractUp?.()"
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
