<script setup lang="ts">
defineProps<{
  label: string
  value: string
}>()
</script>

<template>
  <div class="px-3 py-2 text-xs flex items-center justify-between gap-2 border border-white/20 rounded-md">
    <span class="font-bold opacity-80">{{ label }}:</span>
    <span>
      {{ value }}
    </span>
  </div>
</template>
