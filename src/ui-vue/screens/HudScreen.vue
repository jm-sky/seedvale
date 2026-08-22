<script setup lang="ts">
import { computed } from 'vue'
import { isTouchDevice } from '../../input/isTouchDevice'
import { ui } from '../store'

const touchDevice = isTouchDevice()

/** Free Aim reticle offset (plan 186 follow-up: reticle positioning) — the
 *  third-person camera looks at the player's chest/eye point (`PlayerController`
 *  `lookAtHeight`), which sits at screen center, so a reticle left at dead
 *  center renders on top of the player model. Nudging it up by a small,
 *  fixed screen-space amount clears the model without introducing a
 *  world-space aim point for Free Aim. */
const FREE_AIM_RETICLE_OFFSET_PX = 56

const reticleStyle = computed(() => {
  const target = ui.hud.aimTargetScreen
  if (target) return { left: `${target.x * 100}%`, top: `${target.y * 100}%` }
  return { left: '50%', top: `calc(50% - ${FREE_AIM_RETICLE_OFFSET_PX}px)` }
})

/** Plan 106 + issue 034 — colors match the existing NPC/animal label bars
 *  (`.npc-label__bar--{hp,stamina,vigor,satiety,hydration}`, index.html) so the
 *  player's own bars read as the same visual language. */
const needBars = computed(() => [
  { key: 'hp', label: 'Zdrowie', value: ui.hud.playerNeeds.hp, color: '#e05555' },
  { key: 'stamina', label: 'Kondycja', value: ui.hud.playerNeeds.stamina, color: '#e0c040' },
  { key: 'vigor', label: 'Wigor', value: ui.hud.playerNeeds.vigor, color: '#5cbfa8' },
  { key: 'hunger', label: 'Głód', value: ui.hud.playerNeeds.hunger, color: '#d4893a' },
  { key: 'thirst', label: 'Pragnienie', value: ui.hud.playerNeeds.thirst, color: '#4a9fd8' },
])
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
      <span v-if="ui.hud.showFps && ui.hud.fps">{{ ui.hud.fps }}</span>
      <span v-if="ui.hud.exp">{{ ui.hud.exp }}</span>
      <span v-if="ui.hud.weight">{{ ui.hud.weight }}</span>
      <span v-if="ui.hud.held">{{ ui.hud.held }}</span>
    </div>
    <div class="mt-2 flex w-[130px] flex-col gap-1 max-[700px]:w-[100px]">
      <div
        v-for="bar in needBars"
        :key="bar.key"
        class="flex items-center gap-1.5"
        :title="bar.label"
      >
        <div class="h-[3px] flex-1 overflow-hidden rounded-full bg-black/45">
          <div
            class="h-full rounded-full transition-[width]"
            :style="{ width: `${Math.round(bar.value * 100)}%`, background: bar.color }"
          />
        </div>
      </div>
    </div>

    <div
      v-if="!touchDevice"
      class="mt-2.5 text-xs opacity-70 max-[700px]:hidden"
    >
      {{ ui.hud.hint }}
    </div>
  </div>

  <!-- Ranged-aim reticle (plan 186 §1) — visible only while drawing a bow.
       Free Aim sits at a fixed screen-space offset from center; a soft lock
       reprojects the target's world-space aim point every frame instead
       (`ui.hud.aimTargetScreen`, set from `app/gameLoop.ts`). Presentation
       only: never touches accuracy/deviation, which stay entirely in
       `combat/rangedAttack.ts`. -->
  <div
    v-if="ui.hud.aiming"
    class="pointer-events-none fixed z-[5]"
    :style="reticleStyle"
  >
    <div class="relative h-9 w-9 -translate-x-1/2 -translate-y-1/2">
      <div class="absolute inset-0 rounded-full border border-ink/70" />
      <div class="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/90" />
    </div>
  </div>
</template>
