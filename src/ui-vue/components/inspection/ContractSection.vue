<script setup lang="ts">
defineProps<{
  statusLabel: string
  rows: readonly { label: string, value: string }[]
}>()
</script>

<template>
  <div class="flex flex-col gap-1.5 text-sm">
    <div class="font-medium">
      {{ statusLabel }}
    </div>
    <div
      v-for="row in rows"
      :key="row.label"
      class="flex items-baseline justify-between gap-3"
    >
      <span class="opacity-80">{{ row.label }}</span>
      <span class="text-right">{{ row.value }}</span>
    </div>
  </div>
</template>
