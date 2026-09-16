<script setup lang="ts">
import { ArrowDownToLine, BowArrow, Crosshair, Search, Sword, Zap } from 'lucide-vue-next'
import { type Component, computed } from 'vue'
import { isTouchDevice } from '../../input/isTouchDevice'
import { alternateActionState, primaryActionState } from '../../interaction/interactionView'
import { hudWeaponShortcuts } from '../hudWeaponShortcuts'
import { equipPrimaryMelee, equipPrimaryRanged, sheatheCombatWeapon, ui } from '../store'

const touch = isTouchDevice()
const primaryAction = computed(() => primaryActionState(ui.flavorDialog.interactionPrompt))
const alternateAction = computed(() => alternateActionState(ui.flavorDialog.interactionPrompt))
const showAlternate = computed(() => alternateAction.value != null)
const alternateEnabled = computed(() => alternateAction.value?.enabled ?? false)
const primaryEnabled = computed(() => primaryAction.value?.enabled ?? true)
const weaponShortcuts = computed(() => hudWeaponShortcuts({
  combatWeapon: ui.hud.combatWeapon,
  primaryMeleeLabel: ui.hud.primaryMeleeLabel,
  primaryRangedLabel: ui.hud.primaryRangedLabel,
}))

function onWeaponShortcut(action: 'melee' | 'ranged' | 'sheathe'): void {
  if (action === 'sheathe') sheatheCombatWeapon()
  else if (action === 'melee') equipPrimaryMelee()
  else equipPrimaryRanged()
}

function weaponShortcutIcon(action: 'melee' | 'ranged' | 'sheathe'): Component {
  if (action === 'sheathe') return ArrowDownToLine
  if (action === 'ranged') return BowArrow
  return Sword
}
</script>

<template>
  <template v-if="touch && ui.touch.visible">
    <!-- Action cluster stays a sibling after FlavorDialog (App.vue) so E is
         tappable over NPC/flavor at z-10. Pause + skills + minimap live in
         HudRightColumn; Quick Actions is a fixed overlay on body. PauseMenu
         is z-11 and stays above. -->
    <div
      class="fixed z-10 flex flex-col items-center gap-3"
      style="right: max(20px, env(safe-area-inset-right)); bottom: max(20px, env(safe-area-inset-bottom))"
    >
      <button
        v-if="ui.touch.cycleTargetAvailable"
        type="button"
        class="pointer-events-auto flex size-13 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(255,196,92,0.35)] text-ink [-webkit-tap-highlight-color:transparent]"
        :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled }"
        aria-label="Następny cel"
        @click="ui.touch.onCycleTarget?.()"
      >
        <Crosshair :size="20" />
      </button>
      <button
        v-for="shortcut in weaponShortcuts"
        :key="shortcut.id"
        type="button"
        class="pointer-events-auto flex size-11 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(20,24,28,0.6)] text-ink [-webkit-tap-highlight-color:transparent]"
        :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled }"
        :aria-label="shortcut.ariaLabel"
        @click="onWeaponShortcut(shortcut.action)"
      >
        <component
          :is="weaponShortcutIcon(shortcut.action)"
          :size="18"
        />
      </button>
      <button
        type="button"
        class="pointer-events-auto flex size-13 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(20,24,28,0.6)] text-ink [-webkit-tap-highlight-color:transparent]"
        :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled }"
        aria-label="Szybkie działania"
        @click="ui.touch.onQuickActions?.()"
      >
        <Zap :size="22" />
      </button>
      <div class="flex items-end gap-1">
        <button
          v-if="ui.touch.inspectAvailable"
          type="button"
          class="pointer-events-auto flex size-13 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(92,180,196,0.55)] text-ink [-webkit-tap-highlight-color:transparent]"
          :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled }"
          aria-label="Sprawdź"
          @click="ui.touch.onInspect?.()"
        >
          <Search :size="20" />
        </button>
        <button
          v-if="showAlternate"
          type="button"
          class="pointer-events-auto flex size-13 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-[rgba(161,123,209,0.50)] text-lg font-semibold text-ink [-webkit-tap-highlight-color:transparent]"
          :class="{ 'pointer-events-none opacity-40': !ui.touch.inputEnabled || !alternateEnabled }"
          aria-label="Interakcja alternatywna"
          @click="ui.touch.onAltInteract?.()"
        >
          R
        </button>
        <button
          type="button"
          class="pointer-events-auto flex size-17 cursor-pointer items-center justify-center rounded-full border border-white/25 text-lg font-semibold text-ink [-webkit-tap-highlight-color:transparent]"
          :class="{
            'pointer-events-none opacity-40': !ui.touch.inputEnabled || !primaryEnabled,
            'bg-[rgba(180,60,60,0.75)]': primaryAction?.consequenceTone === 'negative',
            'bg-[rgba(200,130,40,0.75)]': primaryAction?.consequenceTone === 'caution',
            'bg-[rgba(61,123,209,0.75)]': primaryAction?.consequenceTone !== 'negative' && primaryAction?.consequenceTone !== 'caution',
          }"
          aria-label="Interakcja"
          @pointerdown="ui.touch.onInteract?.()"
          @pointerup="ui.touch.onInteractUp?.()"
          @pointercancel="ui.touch.onInteractUp?.()"
          @pointerleave="ui.touch.onInteractUp?.()"
        >
          E
        </button>
      </div>
    </div>
  </template>
</template>
