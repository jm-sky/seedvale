<script setup lang="ts">
const props = defineProps<{
  label: string
  valueLabel: string
  completed: number
  required: number
}>()

function ratio(): number {
  if (!(props.required > 0)) return 1
  return Math.max(0, Math.min(1, props.completed / props.required))
}
</script>

<template>
  <div>
    <div class="mb-1 flex items-baseline justify-between gap-3 text-sm">
      <span class="opacity-80">{{ label }}</span>
      <span>{{ valueLabel }}</span>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-white/20">
      <div
        class="h-full bg-[rgba(255,196,92,0.9)]"
        :style="{ width: `${Math.round(ratio() * 100)}%` }"
      />
    </div>
  </div>
</template>
