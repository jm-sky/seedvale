<script setup lang="ts">
import { computed } from 'vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import { visibleFireActions } from '../playerQuickActions'
import { showToast, ui } from '../store'

const emit = defineEmits<{
  (e: 'close-actions'): void
}>()

const actions = computed(() => visibleFireActions(ui.quickActions.fireAvailability, ui.pauseMenu))

function runAction(run: () => { ok: boolean; toast: string; kind: 'info' | 'error' }): void {
  const result = run()
  showToast(result.toast, result.kind)
}
</script>

<template>
  <UiPanel>
    <UiButton
      class="mb-2 w-full"
      @click="emit('close-actions')"
    >
      Wróć
    </UiButton>

    <UiButton
      v-for="action in actions"
      :key="action.id"
      class="mb-2 w-full"
      @click="runAction(action.run)"
    >
      {{ action.label }} ({{ action.cost }})
    </UiButton>
  </UiPanel>
</template>
