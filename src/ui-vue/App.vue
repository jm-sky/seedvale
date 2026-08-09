<script setup lang="ts">
// Proof-of-concept root for the Vue + Tailwind UI stack (plan 046, Faza 0).
// Confirms the #vue-ui mount point, Vue, and Tailwind classes all work
// end-to-end. Real screens replace/join this component in later phases.
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-40">
    <div class="pointer-events-none absolute bottom-2 right-2 rounded bg-black/40 px-2 py-1 text-xs text-white/70">
      vue-ui ready
    </div>
  </div>
</template>
