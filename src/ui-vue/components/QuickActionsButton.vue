<script setup lang="ts">
import { cn } from '@/lib/utils'
import type { Component, HTMLAttributes } from 'vue'

const props = defineProps<{
  label: string
  cost?: string
  icon?: Component
  class?: HTMLAttributes['class']
  disabled?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    :class="cn(
      'inline-flex w-auto min-w-fit max-w-50 flex-1 cursor-pointer items-center justify-between flex-wrap gap-2 rounded-lg border border-white/20 bg-panel px-3.5 py-2.5 text-left text-sm text-ink shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:bg-panel/50 hover:border-white/50 hover:backdrop-blur-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-panel disabled:hover:border-white/20 disabled:hover:backdrop-blur-none',
      props.class)"
    @click="emit('click')"
  >
    <span class="min-w-0 inline-flex items-center gap-2 whitespace-nowrap">
      <component
        :is="icon"
        v-if="icon"
        class="size-4"
      />
      {{ label }}
    </span>
    <div
      v-if="cost"
      class="ml-auto inline-block shrink-0 truncate rounded-lg bg-black/50 px-2 py-0.5 font-mono text-xs"
    >
      {{ cost }}
    </div>
  </button>
</template>
