<script setup lang="ts">
import type { HouseDefinition } from '../../assets/houseDefinitionExampleConfig'
import type { HouseBrowserAssemblyInfo } from '../houseBrowserTypes'

defineProps<{
  definition: HouseDefinition | null
  assemblyInfo: HouseBrowserAssemblyInfo | null
}>()

function row(label: string, value: string | number): [string, string | number] {
  return [label, value]
}
</script>

<template>
  <section class="flex flex-col gap-1 text-sm">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-white/60">
      House Info
    </h2>
    <template v-if="definition">
      <div
        v-for="[label, value] in [
          row('ID', definition.id),
          row('Label', definition.label ?? '—'),
          row('Footprint', `${definition.footprint.width} × ${definition.footprint.depth} m`),
          row('Size class', definition.sizeClass ?? '—'),
        ]"
        :key="label"
        class="flex justify-between gap-2"
      >
        <span class="opacity-60">{{ label }}</span>
        <span class="text-right">{{ value }}</span>
      </div>
      <template v-if="assemblyInfo && assemblyInfo.definitionId === definition.id">
        <div
          v-for="[label, value] in [
            row('Renderables', assemblyInfo.census.renderables),
            row('Static meshes', assemblyInfo.census.staticMeshes),
            row('Static instances', assemblyInfo.census.staticInstances),
            row('Interactive meshes', assemblyInfo.census.interactiveMeshes),
            row('Colliders', assemblyInfo.colliderCount),
          ]"
          :key="label"
          class="flex justify-between gap-2"
        >
          <span class="opacity-60">{{ label }}</span>
          <span class="text-right">{{ value }}</span>
        </div>
      </template>
      <p
        v-else
        class="opacity-50"
      >
        Loading…
      </p>
    </template>
    <p
      v-else
      class="opacity-50"
    >
      No house selected.
    </p>
  </section>
</template>
