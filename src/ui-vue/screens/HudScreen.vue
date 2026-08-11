<script setup lang="ts">
import { ui } from '../store'
</script>

<template>
  <div
    class="pointer-events-none fixed z-[5] select-none text-ink [text-shadow:0_1px_3px_rgba(0,0,0,0.55)] max-[700px]:left-[max(12px,env(safe-area-inset-left))] max-[700px]:top-[max(12px,env(safe-area-inset-top))]"
    style="left: 16px; top: 16px"
  >
    <div class="text-[28px] font-semibold tracking-wide max-[700px]:text-[22px] max-[500px]:text-[22px]">
      {{ ui.hud.time }}
    </div>
    <div class="mt-0.5 flex gap-3 text-[13px] opacity-90">
      <span v-if="ui.hud.phase">{{ ui.hud.phase }}</span>
      <span v-if="ui.hud.seed">{{ ui.hud.seed }}</span>
      <span v-if="ui.hud.exp">{{ ui.hud.exp }}</span>
      <span v-if="ui.hud.weight">{{ ui.hud.weight }}</span>
      <span v-if="ui.hud.held">{{ ui.hud.held }}</span>
    </div>
    <div class="mt-2.5 text-xs opacity-70 max-[700px]:hidden">
      {{ ui.hud.hint }}
    </div>
  </div>
</template>
