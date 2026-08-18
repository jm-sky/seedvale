<script setup lang="ts">
import { Menu } from 'lucide-vue-next'
import { isTouchDevice } from '../../input/isTouchDevice'
import SkillsHudButton from '../components/SkillsHudButton.vue'
import { ui } from '../store'
import MinimapScreen from './MinimapScreen.vue'

const touch = isTouchDevice()
</script>

<template>
  <div
    v-if="touch && ui.touch.visible"
    class="pointer-events-none fixed z-8 flex flex-col items-end gap-2"
    :style="{
      top: 'max(16px, env(safe-area-inset-top))',
      right: 'max(16px, env(safe-area-inset-right))',
      bottom: 'max(168px, calc(env(safe-area-inset-bottom) + 148px))',
    }"
  >
    <div class="flex items-center gap-2">
      <SkillsHudButton />
      <button
        type="button"
        class="pointer-events-auto flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-[rgba(20,24,28,0.6)] text-ink [-webkit-tap-highlight-color:transparent]"
        :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled }"
        aria-label="Pauza"
        @click="ui.touch.onPause?.()"
      >
        <Menu :size="20" />
      </button>
    </div>
    <MinimapScreen embedded />
  </div>
</template>
