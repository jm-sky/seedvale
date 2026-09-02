<script setup lang="ts">
import type { HouseDefinition } from '../../assets/houseDefinitionExampleConfig'

defineProps<{
  houses: readonly HouseDefinition[]
  selectedId: string
}>()

const emit = defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <section class="flex flex-col gap-1">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-white/60">
      Houses ({{ houses.length }})
    </h2>
    <ul class="max-h-56 overflow-y-auto rounded border border-white/10">
      <li
        v-for="house in houses"
        :key="house.id"
      >
        <button
          type="button"
          class="flex items-center justify-between w-full truncate px-2 py-1 text-left text-sm hover:bg-white/10"
          :class="house.id === selectedId ? 'bg-white/15 font-medium' : ''"
          @click="emit('select', house.id)"
        >
          <span>{{ house.label ?? house.id }} {{ house.footprint.width }} × {{ house.footprint.depth }} m</span>
          <span class="text-xs text-white/50">({{ house.id }})</span>
        </button>
      </li>
    </ul>
  </section>
</template>
