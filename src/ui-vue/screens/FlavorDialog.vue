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
      <div
        v-if="ui.flavorDialog.actions.length"
        class="mt-3 flex flex-col gap-1.5"
      >
        <button
          v-for="action in ui.flavorDialog.actions"
          :key="action.label"
          type="button"
          class="cursor-pointer rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-left text-[13px] hover:bg-white/20 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white/10"
          :disabled="!action.enabled"
          @click="closeFlavorDialog(); action.run()"
        >
          {{ action.label }}
          <span
            v-if="!action.enabled && action.reasonLabel"
            class="block text-[11px] text-red-300"
          >
            {{ action.reasonLabel }}
          </span>
        </button>
      </div>
      <div class="mt-3 text-[11px] opacity-60">
        Esc / E — zamknij
      </div>
    </div>
  </div>

  <div
    v-if="!ui.flavorDialog.open && ui.flavorDialog.prompt"
    class="pointer-events-none fixed bottom-[90px] left-1/2 z-[6] -translate-x-1/2 rounded-md bg-black/70 px-3.5 py-1.5 text-[13px] text-white shadow"
    :class="ui.flavorDialog.promptHighlighted ? 'ring-1 ring-[rgba(255,196,92,0.9)] shadow-[0_0_10px_2px_rgba(255,196,92,0.5)]' : ''"
  >
    {{ ui.flavorDialog.prompt.startsWith('[') ? ui.flavorDialog.prompt : `[E] ${ui.flavorDialog.prompt}` }}
    <div
      v-if="ui.flavorDialog.progress !== null"
      class="mt-1.5 h-1 w-32 overflow-hidden rounded-full bg-white/20"
    >
      <div
        class="h-full bg-[rgba(255,196,92,0.9)] transition-[width] duration-75 ease-linear"
        :style="{ width: `${Math.round(ui.flavorDialog.progress * 100)}%` }"
      />
    </div>
  </div>
</template>
