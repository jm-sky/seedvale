<script setup lang="ts">
import { ref, watch } from 'vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closePauseMenu, isPauseMenuOpen, setPausePlayerName, ui } from '../store'

const panel = ref<HTMLElement | null>(null)
const name = ref(ui.pauseMenu.playerName)

const emit = defineEmits<{
  (e: 'close-settings'): void
}>()

useOverlayScreen('pause-menu', isPauseMenuOpen, closePauseMenu)
useTouchScroll(panel)
watch(() => ui.pauseMenu.playerName, (value) => { name.value = value })

function commitName(): void { const value = name.value.trim(); if (value) ui.pauseMenu.onNameCommit?.(value) }
function onNameInput(): void { setPausePlayerName(name.value); ui.pauseMenu.onNameChange?.(name.value) }
function openVillagers(): void { closePauseMenu(); ui.pauseMenu.onVillagers?.() }
</script>

<template>
  <div
    ref="panel"
    class="max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
    style="touch-action: pan-y"
  >
    <button
      type="button"
      class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
      @click="emit('close-settings')"
    >
      Wróć
    </button>
    <div class="mb-5 text-left">
      <h2 class="mb-2 text-xs font-semibold uppercase tracking-widest opacity-60">
        Character
      </h2>
      <label
        class="mb-1 block text-xs opacity-75"
        for="seedvale-character-name"
      >Name</label>
      <input
        id="seedvale-character-name"
        v-model="name"
        maxlength="24"
        type="text"
        autocomplete="off"
        class="w-full rounded-md border border-white/15 bg-white/5 px-2.5 py-2 text-sm outline-none focus:border-blue-400/60"
        @input="onNameInput"
        @change="commitName"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      >
    </div>
    <button
      type="button"
      class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
      @click="openVillagers"
    >
      Mieszkańcy
    </button>
    <button
      type="button"
      class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
      @click="ui.pauseMenu.onToggleGui?.()"
    >
      Toggle debug panel
    </button>
  </div>
</template>
