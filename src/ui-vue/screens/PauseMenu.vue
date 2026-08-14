<script setup lang="ts">
import { ref, watch } from 'vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closePauseMenu, isPauseMenuOpen, ui } from '../store'
import PauseMenuEntriesActions from './PauseMenuEntriesActions.vue'
import PauseMenuEntriesMain from './PauseMenuEntriesMain.vue'
import PauseMenuEntriesSettings from './PauseMenuEntriesSettings.vue'

const panel = ref<HTMLElement | null>(null)
const name = ref(ui.pauseMenu.playerName)
const currentScreen = ref<'main' | 'actions' | 'settings'>('main')

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
    />
    <PauseMenuEntriesActions
      v-if="currentScreen === 'actions'"
      @close-actions="currentScreen = 'main'"
    />
    <PauseMenuEntriesSettings
      v-if="currentScreen === 'settings'"
      @close-settings="currentScreen = 'main'"
    />
  </div>
</template>
