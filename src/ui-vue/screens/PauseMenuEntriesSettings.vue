<script setup lang="ts">
import { ref, watch } from 'vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import type { AudioVolumeKey } from '../../audio/audioSettings'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { closePauseMenu, isPauseMenuOpen, openNotes, openWorldConfigScreen, resetAudioSettings, resetGraphicsQuality, setAudioVolume, setPausePlayerName, toggleHudFpsVisible, ui } from '../store'

const name = ref(ui.pauseMenu.playerName)
const volumes = ui.audio.volumes

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
function onVolumeInput(key: AudioVolumeKey, event: Event): void {
  setAudioVolume(key, Number((event.target as HTMLInputElement).value))
}
function volumePercent(key: AudioVolumeKey): number {
  return Math.round(volumes[key] * 100)
}
function resetSettings(): void {
  resetAudioSettings()
  resetGraphicsQuality()
}
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
    <div class="mb-5 text-left">
      <h2 class="mb-2 text-xs font-semibold uppercase tracking-widest opacity-60">
        Dźwięk
      </h2>
      <label
        class="mb-1 block text-xs opacity-75"
        for="seedvale-volume-master"
      >Wszystko ({{ volumePercent('master') }}%)</label>
      <input
        id="seedvale-volume-master"
        :value="volumes.master"
        class="mb-3 w-full"
        max="1"
        min="0"
        step="0.01"
        type="range"
        @input="onVolumeInput('master', $event)"
      >
      <label
        class="mb-1 block text-xs opacity-75"
        for="seedvale-volume-ambient"
      >Otoczenie ({{ volumePercent('ambient') }}%)</label>
      <input
        id="seedvale-volume-ambient"
        :value="volumes.ambient"
        class="mb-3 w-full"
        max="1"
        min="0"
        step="0.01"
        type="range"
        @input="onVolumeInput('ambient', $event)"
      >
      <label
        class="mb-1 block text-xs opacity-75"
        for="seedvale-volume-sfx"
      >Efekty ({{ volumePercent('sfx') }}%)</label>
      <input
        id="seedvale-volume-sfx"
        :value="volumes.sfx"
        class="mb-2 w-full"
        max="1"
        min="0"
        step="0.01"
        type="range"
        @input="onVolumeInput('sfx', $event)"
      >
    </div>
    <UiButton
      class="mb-2 w-full"
      @click="toggleHudFpsVisible"
    >
      FPS w HUD<span class="ml-2 text-xs opacity-75">{{ ui.hud.showFps ? 'włączone' : 'wyłączone' }}</span>
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="resetSettings"
    >
      Resetuj ustawienia
    </UiButton>
  </UiPanel>
</template>
