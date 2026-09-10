<script setup lang="ts">
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { closeActionConfirm, confirmActionConfirm, isActionConfirmOpen, ui } from '../store'

useOverlayScreen('action-confirm', isActionConfirmOpen, closeActionConfirm)
</script>

<template>
  <div
    v-if="ui.actionConfirm.open"
    class="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeActionConfirm"
  >
    <UiPanel class="!max-w-sm">
      <h2 class="mb-3 text-base font-semibold tracking-wide">
        {{ ui.actionConfirm.title }}
      </h2>
      <p class="whitespace-pre-wrap text-sm opacity-90">
        {{ ui.actionConfirm.body }}
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <UiButton @click="closeActionConfirm">
          Anuluj
        </UiButton>
        <UiButton
          variant="primary"
          @click="confirmActionConfirm"
        >
          {{ ui.actionConfirm.confirmLabel }}
        </UiButton>
      </div>
    </UiPanel>
  </div>
</template>
