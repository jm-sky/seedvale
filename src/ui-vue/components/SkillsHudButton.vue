<script setup lang="ts">
import { Footprints } from 'lucide-vue-next'
import { closeSkillsScreen, isSkillsScreenOpen, openSkillsScreen, ui } from '../store'

function toggle(): void {
  if (isSkillsScreenOpen()) closeSkillsScreen()
  else openSkillsScreen()
}
</script>

<template>
  <button
    type="button"
    class="pointer-events-auto relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border bg-[rgba(20,24,28,0.6)] text-ink [-webkit-tap-highlight-color:transparent] hover:bg-[rgba(20,24,28,0.8)]"
    :class="ui.skillsScreen.sneakActive ? 'border-emerald-400/70' : 'border-white/25'"
    aria-label="Umiejętności"
    @click="toggle"
  >
    <Footprints :size="20" />
    <span
      v-if="ui.skillsScreen.sneakActive"
      class="absolute top-1 right-1 size-2 rounded-full bg-emerald-400"
    />
  </button>
</template>
