<script setup lang="ts">
import type { ModifierCategory } from '../../shared/effectivePhysicalAttributes'

const props = defineProps<{
  category: ModifierCategory
  delta: number
}>()

const CATEGORY_LABEL: Record<ModifierCategory, string> = {
  effect: 'Efekt',
  fatigue: 'Zmęczenie',
  illness: 'Choroba',
  injury: 'Uraz',
}

function formatSignedDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`
}
</script>

<template>
  <span
    class="inline-flex shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium"
    :class="props.delta < 0 ? 'bg-red-500/20 text-red-200' : 'bg-emerald-500/20 text-emerald-200'"
  >
    {{ CATEGORY_LABEL[props.category] }} {{ formatSignedDelta(props.delta) }}
  </span>
</template>
