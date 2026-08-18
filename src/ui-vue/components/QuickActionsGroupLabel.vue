<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div class="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink opacity-65">
    {{ label }}
  </div>
</template>
