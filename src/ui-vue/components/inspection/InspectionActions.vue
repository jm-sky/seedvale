<script setup lang="ts">
import type { InspectionAction } from '../../../app/inspection/worldInspectionView'
import UiButton from '../UiButton.vue'

defineProps<{
  actions: readonly InspectionAction[]
}>()

const emit = defineEmits<{
  run: [id: InspectionAction['id']]
}>()
</script>

<template>
  <div
    v-if="actions.length"
    class="mt-3 flex flex-col gap-1.5"
  >
    <UiButton
      v-for="action in actions"
      :key="action.id"
      :variant="action.variant ?? 'ghost'"
      :disabled="!action.enabled"
      class="w-full justify-start"
      @click="emit('run', action.id)"
    >
      <span class="flex w-full flex-col items-start">
        <span>{{ action.label }}</span>
        <span
          v-if="!action.enabled && action.reasonLabel"
          class="text-[11px] font-normal text-red-300"
        >
          {{ action.reasonLabel }}
        </span>
      </span>
    </UiButton>
  </div>
</template>
