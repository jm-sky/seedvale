<script setup lang="ts">
import type { CameraView } from '../houseBrowserTypes'

const emit = defineEmits<{
  reset: []
  view: [view: CameraView]
}>()

const VIEWS: { id: CameraView, label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
]
</script>

<template>
  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-white/60">
      Camera
    </h2>
    <button
      type="button"
      class="rounded bg-white/10 px-2 py-1 text-sm hover:bg-white/20"
      @click="emit('reset')"
    >
      Reset / Fit
    </button>
    <div class="grid grid-cols-3 gap-1">
      <button
        v-for="view in VIEWS"
        :key="view.id"
        type="button"
        class="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
        @click="emit('view', view.id)"
      >
        {{ view.label }}
      </button>
    </div>
  </section>
</template>
