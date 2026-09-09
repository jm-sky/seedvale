<script setup lang="ts">
import type { InspectionMaterialItem } from '../../../app/inspection/worldInspectionView'

defineProps<{
  statusLabel: string
  items: readonly InspectionMaterialItem[]
}>()
</script>

<template>
  <div class="text-sm">
    <div class="opacity-80">
      {{ statusLabel }}
    </div>
    <ul
      v-if="items.length"
      class="mt-1 list-none pl-0 opacity-90"
    >
      <li
        v-for="item in items"
        :key="item.label"
      >
        {{ item.count }} × {{ item.label }}
      </li>
    </ul>
  </div>
</template>
