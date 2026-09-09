<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <header class="mb-4">
    <h1
      id="world-inspection-title"
      class="text-lg font-semibold tracking-wide"
    >
      {{ title }}
    </h1>
    <p
      v-if="description"
      class="mt-1 whitespace-pre-line text-sm leading-relaxed opacity-85"
    >
      {{ description }}
    </p>
  </header>
</template>
