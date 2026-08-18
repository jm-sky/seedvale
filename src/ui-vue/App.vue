<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { isTouchDevice } from '../input/isTouchDevice'
import NpcDialogueMenu from './NpcDialogueMenu.vue'
import BusyOverlay from './screens/BusyOverlay.vue'
import CharacterScreen from './screens/CharacterScreen.vue'
import FlavorDialog from './screens/FlavorDialog.vue'
import HudRightColumn from './screens/HudRightColumn.vue'
import HudScreen from './screens/HudScreen.vue'
import InventoryScreen from './screens/InventoryScreen.vue'
import MerchantScreen from './screens/MerchantScreen.vue'
import MinimapScreen from './screens/MinimapScreen.vue'
import NotesScreen from './screens/NotesScreen.vue'
import PauseMenu from './screens/PauseMenu.vue'
import QuestLogScreen from './screens/QuestLogScreen.vue'
import QuickActionsScreen from './screens/QuickActionsScreen.vue'
import SkillsScreen from './screens/SkillsScreen.vue'
import TimeSkipOverlay from './screens/TimeSkipOverlay.vue'
import ToastStack from './screens/ToastStack.vue'
import TouchChrome from './screens/TouchChrome.vue'
import VillagersScreen from './screens/VillagersScreen.vue'
import WorldConfigScreen from './screens/WorldConfigScreen.vue'
import WorldMapScreen from './screens/WorldMapScreen.vue'
import { abortBusy, abortRest, closeTopOverlay, togglePause, ui } from './store'

const touchDevice = isTouchDevice()

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (abortRest()) return
  if (abortBusy()) return
  if (ui.openStack.length > 0) closeTopOverlay()
  else togglePause()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-10">
    <!-- Always-visible chrome (under modal screens). -->
    <HudScreen />
    <ToastStack />
    <HudRightColumn />
    <MinimapScreen v-if="!touchDevice" />
    <PauseMenu />
    <QuestLogScreen />
    <VillagersScreen />
    <InventoryScreen />
    <CharacterScreen />
    <SkillsScreen />
    <MerchantScreen />
    <QuickActionsScreen />
    <WorldConfigScreen />
    <NotesScreen />
    <WorldMapScreen />
    <!-- Flavor / NPC dialogue first, then TouchChrome so E sits above those
         dialogs (former z-9 > z-8) while PauseMenu (z-11) stays on top. -->
    <NpcDialogueMenu />
    <FlavorDialog />
    <TouchChrome />
    <!-- Last so it paints above every other overlay (matches the vanilla
         overlay's z-index 12, above pause menu's 11) — a time skip can be
         showing while the player also has the pause menu open. -->
    <TimeSkipOverlay />
    <BusyOverlay />
  </div>
</template>
