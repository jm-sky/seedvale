<script setup lang="ts">
import { ui } from '../store'
</script>

<template>
  <div
    class="pointer-events-none fixed left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5"
    style="top: max(16px, env(safe-area-inset-top))"
  >
    <div
      v-for="item in ui.toast.items"
      :key="item.id"
      class="rounded-lg bg-[rgba(20,24,28,0.85)] px-4 py-2 font-sans text-[13px] whitespace-nowrap text-ink shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-opacity duration-300 ease-in-out"
      :class="{
        'opacity-0': item.fading,
        'opacity-100': !item.fading,
        'border border-[rgba(224,179,74,0.5)]': item.variant === 'pickup',
        'border border-[rgba(217,92,92,0.5)]': item.variant === 'error',
      }"
    >
      {{ item.text }}
    </div>
  </div>
</template>
