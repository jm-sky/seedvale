<script setup lang="ts">
withDefaults(defineProps<{ doorCount?: number }>(), { doorCount: 0 })

const visible = defineModel<boolean>('visible', { required: true })
const padding = defineModel<number>('padding', { required: true })
const doorsOpen = defineModel<boolean>('doorsOpen', { required: true })
</script>

<template>
  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-white/60">
      Colliders
    </h2>
    <label class="flex items-center gap-2 text-sm">
      <input
        v-model="visible"
        type="checkbox"
      >
      Show colliders
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span>Padding: {{ padding.toFixed(2) }} m</span>
      <input
        v-model.number="padding"
        type="range"
        min="0"
        max="0.5"
        step="0.01"
      >
    </label>
  </section>
  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-white/60">
      Doors
    </h2>
    <label
      class="flex items-center gap-2 text-sm"
      :class="{ 'opacity-40': doorCount === 0 }"
    >
      <input
        v-model="doorsOpen"
        type="checkbox"
        :disabled="doorCount === 0"
      >
      Open doors ({{ doorCount }})
    </label>
    <button
      type="button"
      class="rounded bg-white/10 px-2 py-1 text-sm hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/10"
      :disabled="doorCount === 0"
      @click="doorsOpen = !doorsOpen"
    >
      Toggle doors
    </button>
  </section>
</template>
