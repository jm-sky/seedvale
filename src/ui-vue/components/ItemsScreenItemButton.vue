<script setup lang="ts">
import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  label: string
  selected?: boolean
  disabled?: boolean
  destructive?: boolean
  class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  'click': []
}>()
</script>

<template>
  <button
    type="button"
    :class="cn(
      'cursor-pointer rounded-md border border-white/20 bg-transparent px-2.5 py-1 text-xs hover:bg-white/10',
      selected && 'border-primary/50',
      disabled && 'opacity-50',
      destructive && 'hover:border-destructive/80',
      props.class,
    )"
    :disabled="disabled"
    @click="emit('click')"
  >
    {{ label }}
  </button>
</template>
