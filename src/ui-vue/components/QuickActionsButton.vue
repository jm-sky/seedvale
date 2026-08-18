<script setup lang="ts">
import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  label: string
  cost?: string
  class?: HTMLAttributes['class']
  isRowButton?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    type="button"
    :class="cn(
      'inline-flex w-30 max-w-50 cursor-pointer items-center justify-between gap-2 rounded-lg border border-white/20 bg-panel px-3.5 py-2.5 text-left text-sm text-ink shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:bg-panel/30 hover:backdrop-blur-md',
      props.isRowButton ? 'w-auto min-w-0 flex-1' : '',
      props.class)"
    @click="emit('click')"
  >
    <span class="min-w-0 truncate">{{ label }}</span>
    <div
      v-if="cost"
      class="ml-auto inline-block shrink-0 rounded-lg bg-black/50 px-2 py-0.5 font-mono text-xs"
    >
      {{ cost }}
    </div>
  </button>
</template>
