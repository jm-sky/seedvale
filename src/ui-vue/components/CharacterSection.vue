<script setup lang="ts">
import { type HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  title: string
  class?: HTMLAttributes['class']
}>(), {
  class: undefined,
})
</script>

<template>
  <section :class="cn('rounded-md bg-white/5 p-3', props.class)">
    <h2 class="mb-2 text-sm font-semibold">
      {{ title }}
    </h2>
    <slot />
  </section>
</template>
