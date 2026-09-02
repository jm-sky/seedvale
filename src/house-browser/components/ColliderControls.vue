<script setup lang="ts">
const visible = defineModel<boolean>('visible', { required: true })
const padding = defineModel<number>('padding', { required: true })
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
</template>
