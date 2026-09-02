<script setup lang="ts">
import { ref, watch } from 'vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import { isTouchDevice } from '../../input/isTouchDevice'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { closePauseMenu, emitUiClick, isPauseMenuOpen, openCharacterScreen, openSkillsScreen, setPauseSaveStatus, ui } from '../store'

const name = ref(ui.pauseMenu.playerName)
const saveTimer = ref<number | null>(null)
const appVersion = __APP_VERSION__
const gitCommit = __GIT_COMMIT__
const buildDate = __BUILD_DATE__

const emit = defineEmits<{
  'open-actions': []
  'open-settings': []
  'open-tools': []
  'open-save-as': []
  'open-load': []
  'open-new-game': []
}>()

useOverlayScreen('pause-menu', isPauseMenuOpen, closePauseMenu)
watch(() => ui.pauseMenu.playerName, (value) => { name.value = value })

function save(): void {
  emitUiClick()
  ui.pauseMenu.onSave?.()
  const label = ui.pauseMenu.activeSaveName ? `Zapisano · ${ui.pauseMenu.activeSaveName}` : 'Zapisano'
  setPauseSaveStatus(label)
  if (saveTimer.value !== null) window.clearTimeout(saveTimer.value)
  saveTimer.value = window.setTimeout(() => setPauseSaveStatus(''), 1500)
}
function openQuestLog(): void { emitUiClick(); closePauseMenu(); ui.pauseMenu.onQuestLog?.() }
function openInventory(): void { emitUiClick(); closePauseMenu(); ui.pauseMenu.onInventory?.() }
function openCharacter(): void { emitUiClick(); closePauseMenu(); openCharacterScreen() }
function openSkills(): void { emitUiClick(); closePauseMenu(); openSkillsScreen() }
function openMap(): void { emitUiClick(); closePauseMenu(); ui.pauseMenu.onWorldMap?.() }
function resume(): void { emitUiClick(); closePauseMenu() }
function openActions(): void { emitUiClick(); emit('open-actions') }
function openSettings(): void { emitUiClick(); emit('open-settings') }
function openTools(): void { emitUiClick(); emit('open-tools') }
</script>

<template>
  <UiPanel>
    <div class="mb-5 flex justify-between text-[13px] opacity-85">
      <span>Seed</span><span>{{ ui.pauseMenu.seed }}</span>
    </div>
    <UiButton
      variant="primary"
      class="mb-2 w-full"
      @click="resume"
    >
      Wznów
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="openCharacter"
    >
      Postać [C]
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="openSkills"
    >
      Umiejętności [U]
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="openInventory"
    >
      Ekwipunek [I]
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="openQuestLog"
    >
      Zadania [L]
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="openMap"
    >
      Mapa [M]
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="openActions"
    >
      Akcje
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="openTools"
    >
      Narzędzia ›
    </UiButton>
    <div class="my-3 mx-auto h-px w-1/2 self-center border-t border-white/15" />
    <UiButton
      class="mb-2 w-full"
      @click="openSettings"
    >
      Ustawienia
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="save"
    >
      Zapisz<span class="ml-2 text-xs opacity-75">{{ ui.pauseMenu.saveStatus || ui.pauseMenu.activeSaveName }}</span>
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="emitUiClick(); emit('open-save-as')"
    >
      Zapisz jako
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="emitUiClick(); emit('open-load')"
    >
      Wczytaj
    </UiButton>
    <UiButton
      class="mb-2 w-full"
      @click="emitUiClick(); ui.pauseMenu.onRefresh?.()"
    >
      Odśwież stronę
    </UiButton>
    <UiButton
      variant="danger"
      class="mb-2 w-full"
      @click="emitUiClick(); emit('open-new-game')"
    >
      Nowa gra
    </UiButton>
    <div class="mt-4 border-t border-white/10 pt-3 text-center font-mono text-[10px] opacity-40">
      v{{ appVersion }} | {{ gitCommit }} | {{ buildDate }}
    </div>
    <div class="mt-1 text-[11px] opacity-60">
      {{ isTouchDevice() ? 'Joystick — ruch · przeciągnij ekran — rozglądanie · dotknij poza oknem — zamknij' : 'WASD — ruch · mysz (klik) — rozglądanie · Esc — pauza' }}
    </div>
  </UiPanel>
</template>
