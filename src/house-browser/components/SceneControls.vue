<script setup lang="ts">
const showGrid = defineModel<boolean>('showGrid', { required: true })
const showGround = defineModel<boolean>('showGround', { required: true })
const showShadows = defineModel<boolean>('showShadows', { required: true })
const cameraAutoFit = defineModel<boolean>('cameraAutoFit', { required: true })
</script>

<template>
  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-white/60">
      Scene
    </h2>
    <label class="flex items-center gap-2 text-sm">
      <input
        v-model="showGrid"
        type="checkbox"
      >
      Grid
    </label>
    <label class="flex items-center gap-2 text-sm">
      <input
        v-model="showGround"
        type="checkbox"
      >
      Ground
    </label>
    <label class="flex items-center gap-2 text-sm">
      <input
        v-model="showShadows"
        type="checkbox"
      >
      Shadows
    </label>
    <label class="flex items-center gap-2 text-sm">
      <input
        v-model="cameraAutoFit"
        type="checkbox"
      >
      Camera auto-fit
    </label>
  </section>
</template>
