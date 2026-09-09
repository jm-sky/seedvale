<script setup lang="ts">
import type { InspectionLiquidContainerOption } from '../../../app/inspection/worldInspectionView'
import UiButton from '../UiButton.vue'

defineProps<{
  emptyLabel: string
  options: readonly InspectionLiquidContainerOption[]
}>()

const emit = defineEmits<{
  fill: [instanceId: string]
}>()
</script>

<template>
  <div class="flex flex-col gap-2">
    <p
      v-if="options.length === 0"
      class="text-sm opacity-80"
    >
      {{ emptyLabel }}
    </p>
    <div
      v-for="option in options"
      :key="option.instanceId"
      class="flex items-center justify-between gap-3 rounded-md bg-white/5 px-3 py-2"
    >
      <div class="min-w-0">
        <div class="text-sm font-medium">
          {{ option.label }}
        </div>
        <div class="text-[12px] opacity-75">
          {{ option.detail }}
        </div>
        <div
          v-if="!option.canFill && option.reasonLabel"
          class="text-[11px] text-red-300"
        >
          {{ option.reasonLabel }}
        </div>
      </div>
      <UiButton
        class="shrink-0"
        :disabled="!option.canFill"
        @click="emit('fill', option.instanceId)"
      >
        Napełnij
      </UiButton>
    </div>
  </div>
</template>
