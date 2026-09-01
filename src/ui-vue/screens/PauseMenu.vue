<script setup lang="ts">
import { ref, watch } from 'vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closePauseMenu, isPauseMenuOpen, ui } from '../store'
import PauseMenuEntriesActions from './PauseMenuEntriesActions.vue'
import PauseMenuEntriesMain from './PauseMenuEntriesMain.vue'
import PauseMenuEntriesSaves from './PauseMenuEntriesSaves.vue'
import PauseMenuEntriesSettings from './PauseMenuEntriesSettings.vue'
import PauseMenuEntriesTools from './PauseMenuEntriesTools.vue'

const panel = ref<HTMLElement | null>(null)
const name = ref(ui.pauseMenu.playerName)
const currentScreen = ref<'main' | 'actions' | 'settings' | 'tools' | 'saves'>('main')
const savesMode = ref<'save-as' | 'load' | 'new-game'>('load')

useOverlayScreen('pause-menu', isPauseMenuOpen, closePauseMenu)
useTouchScroll(panel)
watch(() => ui.pauseMenu.playerName, (value) => { name.value = value })
watch(() => ui.pauseMenu.open, (open) => {
  if (!open) currentScreen.value = 'main'
})
</script>

<template>
  <div
    v-if="ui.pauseMenu.open"
    class="pointer-events-auto fixed inset-0 z-11 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    data-test-id="pause-menu"
    @click.self="closePauseMenu"
  >
    <PauseMenuEntriesMain
      v-if="currentScreen === 'main'"
      @open-actions="currentScreen = 'actions'"
      @open-settings="currentScreen = 'settings'"
      @open-tools="currentScreen = 'tools'"
      @open-save-as="savesMode = 'save-as'; currentScreen = 'saves'"
      @open-load="savesMode = 'load'; currentScreen = 'saves'"
      @open-new-game="savesMode = 'new-game'; currentScreen = 'saves'"
    />
    <PauseMenuEntriesActions
      v-if="currentScreen === 'actions'"
      @close-actions="currentScreen = 'main'"
    />
    <PauseMenuEntriesSettings
      v-if="currentScreen === 'settings'"
      @close-settings="currentScreen = 'main'"
    />
    <PauseMenuEntriesTools
      v-if="currentScreen === 'tools'"
      @close-tools="currentScreen = 'main'"
    />
    <PauseMenuEntriesSaves
      v-if="currentScreen === 'saves'"
      :mode="savesMode"
      @close-saves="currentScreen = 'main'"
    />
  </div>
</template>
