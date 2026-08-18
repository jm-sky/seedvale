<script setup lang="ts">
import QuickActionsGroupLabel from './QuickActionsGroupLabel.vue'

defineProps<{
  label?: string | null
}>()
</script>

<template>
  <div class="p-1 flex flex-col gap-1">
    <QuickActionsGroupLabel
      v-if="label"
      :label
    />
    <div class="flex gap-2">
      <slot />
    </div>
  </div>
</template>
