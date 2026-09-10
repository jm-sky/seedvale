<script setup lang="ts">
import type { InspectionMaterialItem } from '../../../app/inspection/worldInspectionView'

defineProps<{
  statusLabel: string
  items: readonly InspectionMaterialItem[]
}>()

function itemLine(item: InspectionMaterialItem): string {
  if (item.available == null) return `${item.count} × ${item.label}`
  return `${item.label}: ${item.available}/${item.count} — przy sobie ${item.inInventory ?? 0} · w pobliżu ${item.nearbyWorld ?? 0}`
}
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
        {{ itemLine(item) }}
      </li>
    </ul>
  </div>
</template>
