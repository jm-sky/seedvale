<script setup lang="ts">
import type { InspectionRow } from '../../../app/inspection/worldInspectionView'
import ContractSection from './ContractSection.vue'
import InfoRow from './InfoRow.vue'
import LiquidContainerSection from './LiquidContainerSection.vue'
import MaterialsSection from './MaterialsSection.vue'
import ProgressBar from './ProgressBar.vue'

defineProps<{
  title: string
  rows: readonly InspectionRow[]
}>()

const emit = defineEmits<{
  fill: [instanceId: string]
}>()
</script>

<template>
  <section class="rounded-md bg-white/5 p-3">
    <h2 class="mb-2 text-sm font-semibold">
      {{ title }}
    </h2>
    <div class="flex flex-col gap-2">
      <template
        v-for="(row, index) in rows"
        :key="`${row.kind}-${index}`"
      >
        <InfoRow
          v-if="row.kind === 'info'"
          :label="row.label"
          :value="row.value"
        />
        <ProgressBar
          v-else-if="row.kind === 'progress'"
          :label="row.label"
          :value-label="row.valueLabel"
          :completed="row.completed"
          :required="row.required"
        />
        <MaterialsSection
          v-else-if="row.kind === 'materials'"
          :status-label="row.statusLabel"
          :items="row.items"
        />
        <LiquidContainerSection
          v-else-if="row.kind === 'liquidContainers'"
          :empty-label="row.emptyLabel"
          :options="row.options"
          @fill="emit('fill', $event)"
        />
        <ContractSection
          v-else-if="row.kind === 'contract'"
          :status-label="row.statusLabel"
          :rows="row.rows"
        />
      </template>
    </div>
  </section>
</template>
