<script setup lang="ts">
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { closeQuantityDialog, confirmQuantityDialog, isQuantityDialogOpen, setQuantityDialogValue, ui } from '../store'

useOverlayScreen('quantityDialog', isQuantityDialogOpen, closeQuantityDialog)

function onInput(event: Event): void {
  setQuantityDialogValue(Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <div
    v-if="ui.quantityDialog.open"
    class="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeQuantityDialog"
  >
    <UiPanel class="!max-w-sm">
      <h2 class="mb-3 text-base font-semibold tracking-wide">
        {{ ui.quantityDialog.label }}
      </h2>
      <div class="flex items-center gap-3">
        <UiButton
          class="min-h-9 px-3 py-1 text-base"
          :disabled="ui.quantityDialog.value <= 1"
          @click="setQuantityDialogValue(ui.quantityDialog.value - 1)"
        >
          −
        </UiButton>
        <input
          type="range"
          min="1"
          :max="ui.quantityDialog.max"
          :value="ui.quantityDialog.value"
          class="flex-1"
          @input="onInput"
        >
        <UiButton
          class="min-h-9 px-3 py-1 text-base"
          :disabled="ui.quantityDialog.value >= ui.quantityDialog.max"
          @click="setQuantityDialogValue(ui.quantityDialog.value + 1)"
        >
          +
        </UiButton>
      </div>
      <div class="mt-2 text-center text-sm opacity-80">
        {{ ui.quantityDialog.value }} / {{ ui.quantityDialog.max }}
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <UiButton @click="closeQuantityDialog">
          Anuluj
        </UiButton>
        <UiButton
          variant="primary"
          @click="confirmQuantityDialog"
        >
          Zatwierdź
        </UiButton>
      </div>
    </UiPanel>
  </div>
</template>
