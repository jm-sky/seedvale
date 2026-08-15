<script setup lang="ts">
import { ref } from 'vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeSkillsScreen, emitUiClick, isSkillsScreenOpen, ui } from '../store'

const panel = ref<HTMLElement | null>(null)
useOverlayScreen('skills', isSkillsScreenOpen, closeSkillsScreen)
useTouchScroll(panel)

function toggleSneak(): void {
  emitUiClick()
  ui.skillsScreen.onToggleSneak?.()
}
</script>

<template>
  <div
    v-if="ui.skillsScreen.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeSkillsScreen"
  >
    <div
      ref="panel"
      class="max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style="touch-action: pan-y"
    >
      <h1 class="mb-4 text-lg font-semibold tracking-wide">
        Umiejętności
      </h1>

      <button
        type="button"
        class="flex w-full cursor-pointer items-center justify-between rounded-md border px-3.5 py-3 text-left transition-colors"
        :class="ui.skillsScreen.sneakActive
          ? 'border-emerald-400/50 bg-emerald-400/15'
          : 'border-white/15 bg-transparent hover:bg-white/10'"
        @click="toggleSneak"
      >
        <span>
          <span class="block text-sm font-medium">Skradanie się</span>
          <span class="block text-xs opacity-70">
            Wolniejszy ruch, trudniej Cię zauważyć zwierzętom · poziom {{ Math.round(ui.skillsScreen.sneakValue * 100) }}%
          </span>
        </span>
        <span
          class="ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide"
          :class="ui.skillsScreen.sneakActive ? 'bg-emerald-400 text-black' : 'bg-white/15 text-ink/70'"
        >
          {{ ui.skillsScreen.sneakActive ? 'Aktywne' : 'Wyłączone' }}
        </span>
      </button>

      <div class="mt-4 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </div>
  </div>
</template>
