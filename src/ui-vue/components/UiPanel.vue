<script setup lang="ts">
import { type HTMLAttributes, ref } from 'vue'
import { cn } from '@/lib/utils'
import { useTouchScroll } from '../composables/useTouchScroll'

const props = withDefaults(defineProps<{
  class?: HTMLAttributes['class']
}>(), {
  class: undefined,
})

const panel = ref<HTMLElement | null>(null)
useTouchScroll(panel)
</script>

<template>
  <div
    ref="panel"
    :class="cn(
      'max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]',
      props.class,
    )"
    style="touch-action: pan-y"
  >
    <slot />
  </div>
</template>
