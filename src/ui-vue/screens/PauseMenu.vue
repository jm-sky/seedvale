<script setup lang="ts">
import { ref, watch } from 'vue'
import { isTouchDevice } from '../../input/isTouchDevice'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closePauseMenu, isPauseMenuOpen, setPauseBuildCampfireStatus, setPausePlayerName, setPauseSaveStatus, ui } from '../store'

const panel = ref<HTMLElement | null>(null)
const name = ref(ui.pauseMenu.playerName)
const saveTimer = ref<number | null>(null)
const campfireTimer = ref<number | null>(null)
useOverlayScreen('pause-menu', isPauseMenuOpen, closePauseMenu)
useTouchScroll(panel)
watch(() => ui.pauseMenu.playerName, (value) => { name.value = value })

function save(): void { ui.pauseMenu.onSave?.(); setPauseSaveStatus('Saved'); if (saveTimer.value !== null) window.clearTimeout(saveTimer.value); saveTimer.value = window.setTimeout(() => setPauseSaveStatus(''), 1500) }
function buildCampfire(): void { const built = ui.pauseMenu.onBuildCampfire?.() ?? false; setPauseBuildCampfireStatus(built ? 'Zbudowano!' : 'Brakuje surowców'); if (campfireTimer.value !== null) window.clearTimeout(campfireTimer.value); campfireTimer.value = window.setTimeout(() => setPauseBuildCampfireStatus(''), 1500) }
function commitName(): void { const value = name.value.trim(); if (value) ui.pauseMenu.onNameCommit?.(value) }
function onNameInput(): void { setPausePlayerName(name.value); ui.pauseMenu.onNameChange?.(name.value) }
function openQuestLog(): void { closePauseMenu(); ui.pauseMenu.onQuestLog?.() }
function openVillagers(): void { closePauseMenu(); ui.pauseMenu.onVillagers?.() }
function openInventory(): void { closePauseMenu(); ui.pauseMenu.onInventory?.() }
</script>

<template>
  <div
    v-if="ui.pauseMenu.open"
    class="pointer-events-auto fixed inset-0 z-[11] flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closePauseMenu"
  >
    <div
      ref="panel"
      class="max-h-[calc(100dvh-32px)] min-w-[280px] w-[min(420px,calc(100vw-32px))] overflow-y-auto rounded-[10px] bg-panel p-7 text-ink text-center shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style="touch-action: pan-y"
    >
      <h1 class="mb-5 text-[22px] font-semibold tracking-wide">
        Seedvale
      </h1>
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
      <div class="mb-5 flex justify-between text-[13px] opacity-85">
        <span>Seed</span><span>{{ ui.pauseMenu.seed }}</span>
      </div>
      <button
        type="button"
        class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-blue-600 px-3.5 py-2.5 text-sm text-white hover:bg-blue-500"
        @click="closePauseMenu"
      >
        Resume
      </button>
      <button
        type="button"
        class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
        @click="openQuestLog"
      >
        Zadania [L]
      </button>
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
        @click="openInventory"
      >
        Ekwipunek [I]
      </button>
      <button
        type="button"
        class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
        @click="save"
      >
        Save<span class="ml-2 text-xs opacity-75">{{ ui.pauseMenu.saveStatus }}</span>
      </button>
      <button
        type="button"
        class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
        @click="ui.pauseMenu.onToggleGui?.()"
      >
        Toggle debug panel
      </button>
      <button
        type="button"
        class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
        @click="buildCampfire"
      >
        Zbuduj ognisko (2x gałąź, 2x kamień)<span class="ml-2 text-xs opacity-75">{{ ui.pauseMenu.buildCampfireStatus }}</span>
      </button>
      <button
        type="button"
        class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
        @click="ui.pauseMenu.onRefresh?.()"
      >
        Odśwież stronę
      </button>
      <button
        type="button"
        class="mb-2 block w-full cursor-pointer rounded-md border border-red-400/40 bg-transparent px-3.5 py-2.5 text-sm text-red-300 hover:bg-red-400/10"
        @click="ui.pauseMenu.onNewGame?.()"
      >
        New Game
      </button>
      <div class="mt-1 text-[11px] opacity-60">
        {{ isTouchDevice() ? 'Joystick — ruch · przeciągnij ekran — rozglądanie · dotknij poza oknem — zamknij' : 'WASD — ruch · mysz (klik) — rozglądanie · Esc — pauza' }}
      </div>
      <div class="mt-4 border-t border-white/10 pt-3 font-mono text-[10px] leading-relaxed opacity-40">
        v{{ __APP_VERSION__ }}<br>{{ __BUILD_DATE__ }}<br>{{ __GIT_COMMIT__ }}
      </div>
    </div>
  </div>
</template>
