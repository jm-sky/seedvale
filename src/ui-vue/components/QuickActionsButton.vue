<script setup lang="ts">
import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  label: string
  cost?: string
  status?: string
  class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    type="button"
    :class="cn('inline-flex items-center w-55 max-w-[calc(100vw-40px)] cursor-pointer rounded-lg border border-white/20 bg-panel px-3.5 py-2.5 text-left text-sm text-ink shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:bg-panel/30 hover:backdrop-blur-md', props.class)"
    @click="emit('click')"
  >
    {{ label }}
    <div
      v-if="cost"
      class="inline-block text-xs px-2 py-0.5 bg-black/50 rounded-lg font-mono"
    >
      {{ cost }}
    </div>
    <span
      v-if="status"
      class="mt-1 block text-[11px] opacity-75"
    >{{ status }}</span>
  </button>
</template>
