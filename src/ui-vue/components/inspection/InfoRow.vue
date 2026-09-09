<script setup lang="ts">
defineProps<{
  label: string
  value: string
}>()
</script>

<template>
  <div class="flex items-baseline justify-between gap-3 text-sm">
    <span class="opacity-80">{{ label }}</span>
    <span class="text-right">{{ value }}</span>
  </div>
</template>
