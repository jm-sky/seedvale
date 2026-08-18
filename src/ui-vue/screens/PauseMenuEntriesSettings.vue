<script setup lang="ts">
import { ref, watch } from 'vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { closePauseMenu, isPauseMenuOpen, openNotes, openWorldConfigScreen, setPausePlayerName, toggleHudFpsVisible, ui } from '../store'

const name = ref(ui.pauseMenu.playerName)

const emit = defineEmits<{
  (e: 'close-settings'): void
}>()

useOverlayScreen('pause-menu', isPauseMenuOpen, closePauseMenu)
watch(() => ui.pauseMenu.playerName, (value) => { name.value = value })

function commitName(): void { const value = name.value.trim(); if (value) ui.pauseMenu.onNameCommit?.(value) }
function onNameInput(): void { setPausePlayerName(name.value); ui.pauseMenu.onNameChange?.(name.value) }
function openVillagers(): void { closePauseMenu(); ui.pauseMenu.onVillagers?.() }
// No `ui.pauseMenu.onX` indirection needed here, unlike `openVillagers` —
// these two don't need any data fetched from `createApp.ts`'s game-world
// state, just the store's own open flag.
function openWorldConfig(): void { closePauseMenu(); openWorldConfigScreen() }
function openNotesScreen(): void { closePauseMenu(); openNotes() }
</script>

<template>
  <UiPanel>
    <UiButton
      class="mb-2 w-full"
      @click="emit('close-settings')"
    >
      Wróć
    </UiButton>
    <div class="mb-5 text-left">
      <h2 class="mb-2 text-xs font-semibold uppercase tracking-widest opacity-60">
        Postać
      </h2>
      <label
        class="mb-1 block text-xs opacity-75"
        for="seedvale-character-name"
      >Imię</label>
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
    <UiButton
      class="mb-2 w-full"
      @click="openVillagers"
    >
      Mieszkańcy
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="openWorldConfig"
    >
      Świat
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="openNotesScreen"
    >
      Notatki
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="ui.pauseMenu.onToggleGui?.()"
    >
      Panel debug
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="toggleHudFpsVisible"
    >
      FPS w HUD<span class="ml-2 text-xs opacity-75">{{ ui.hud.showFps ? 'włączone' : 'wyłączone' }}</span>
    </UiButton>
  </UiPanel>
</template>
