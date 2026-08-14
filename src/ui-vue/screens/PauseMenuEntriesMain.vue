<script setup lang="ts">
import { ref, watch } from 'vue'
import { isTouchDevice } from '../../input/isTouchDevice'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closePauseMenu, emitUiClick, isPauseMenuOpen, openCharacterScreen, setPauseSaveStatus, ui } from '../store'

const panel = ref<HTMLElement | null>(null)
const name = ref(ui.pauseMenu.playerName)
const saveTimer = ref<number | null>(null)

const emit = defineEmits<{
  'open-actions': []
  'open-settings': []
}>()

useOverlayScreen('pause-menu', isPauseMenuOpen, closePauseMenu)
useTouchScroll(panel)
watch(() => ui.pauseMenu.playerName, (value) => { name.value = value })

function save(): void { emitUiClick(); ui.pauseMenu.onSave?.(); setPauseSaveStatus('Zapisano'); if (saveTimer.value !== null) window.clearTimeout(saveTimer.value); saveTimer.value = window.setTimeout(() => setPauseSaveStatus(''), 1500) }
function openQuestLog(): void { emitUiClick(); closePauseMenu(); ui.pauseMenu.onQuestLog?.() }
function openInventory(): void { emitUiClick(); closePauseMenu(); ui.pauseMenu.onInventory?.() }
function openCharacter(): void { emitUiClick(); closePauseMenu(); openCharacterScreen() }
function openMap(): void { emitUiClick(); closePauseMenu(); ui.pauseMenu.onWorldMap?.() }
function resume(): void { emitUiClick(); closePauseMenu() }
function openActions(): void { emitUiClick(); emit('open-actions') }
function openSettings(): void { emitUiClick(); emit('open-settings') }
</script>

<template>
  <div
    ref="panel"
    class="max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
    style="touch-action: pan-y"
  >
    <div class="mb-5 flex justify-between text-[13px] opacity-85">
      <span>Seed</span><span>{{ ui.pauseMenu.seed }}</span>
    </div>
    <button
      type="button"
      class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-blue-600 px-3.5 py-2.5 text-sm text-white hover:bg-blue-500"
      @click="resume"
    >
      Wznów
    </button>
    <button
      type="button"
      class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
      @click="openCharacter"
    >
      Postać
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
      @click="openQuestLog"
    >
      Zadania [L]
    </button>
    <button
      type="button"
      class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
      @click="openMap"
    >
      Mapa [M]
    </button>
    <button
      type="button"
      class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
      @click="openActions"
    >
      Akcje
    </button>
    <div class="my-3 mx-auto h-px w-1/2 self-center border-t border-white/15" />
    <button
      type="button"
      class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
      @click="openSettings"
    >
      Ustawienia
    </button>
    <button
      type="button"
      class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
      @click="save"
    >
      Zapisz<span class="ml-2 text-xs opacity-75">{{ ui.pauseMenu.saveStatus }}</span>
    </button>
    <button
      type="button"
      class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
      @click="emitUiClick(); ui.pauseMenu.onRefresh?.()"
    >
      Odśwież stronę
    </button>
    <button
      type="button"
      class="mb-2 block w-full cursor-pointer rounded-md border border-red-400/40 bg-transparent px-3.5 py-2.5 text-sm text-red-300 hover:bg-red-400/10"
      @click="emitUiClick(); ui.pauseMenu.onNewGame?.()"
    >
      Nowa gra
    </button>
    <div class="mt-1 text-[11px] opacity-60">
      {{ isTouchDevice() ? 'Joystick — ruch · przeciągnij ekran — rozglądanie · dotknij poza oknem — zamknij' : 'WASD — ruch · mysz (klik) — rozglądanie · Esc — pauza' }}
    </div>
  </div>
</template>
