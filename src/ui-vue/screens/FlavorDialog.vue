<script setup lang="ts">
import { ref } from 'vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeFlavorDialog, isFlavorDialogOpen, ui } from '../store'

useOverlayScreen('flavor-dialog', isFlavorDialogOpen, closeFlavorDialog)
const panel = ref<HTMLElement | null>(null)
useTouchScroll(panel)
</script>

<template>
  <div
    v-if="ui.flavorDialog.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeFlavorDialog"
  >
    <div
      ref="panel"
      class="max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-32px))] overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style="touch-action: pan-y"
    >
      <h2 class="mb-3 text-base font-semibold tracking-wide">
        {{ ui.flavorDialog.name }}
      </h2>
      <p class="text-sm leading-relaxed opacity-90">
        {{ ui.flavorDialog.line }}
      </p>
      <div class="mt-3 text-[11px] opacity-60">
        Esc / E — zamknij
      </div>
    </div>
  </div>

  <div
    v-if="!ui.flavorDialog.open && ui.flavorDialog.prompt"
    class="pointer-events-none fixed bottom-[90px] left-1/2 z-[6] -translate-x-1/2 rounded-md bg-black/70 px-3.5 py-1.5 text-[13px] text-white shadow"
  >
    [E] {{ ui.flavorDialog.prompt }}
  </div>
</template>
