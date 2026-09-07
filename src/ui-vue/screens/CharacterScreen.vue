<script setup lang="ts">
import { computed, ref } from 'vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeCharacterScreen, isCharacterScreenOpen, ui } from '../store'

const panel = ref<HTMLElement | null>(null)
useOverlayScreen('character', isCharacterScreenOpen, closeCharacterScreen)
useTouchScroll(panel)

/** Below this ratio a stat reads as critical — same 20% used by the fauna/NPC
 *  label bars this screen's colors are borrowed from (index.html). */
const CRITICAL_RATIO = 0.2

type StatRow = { key: string, label: string, current: number, max: number, color: string }

/** Presentation-only: every value is read from `ui.characterScreen`, pushed
 *  once/frame from `gameLoop.ts` (`Hud.setCharacterStats`) off the
 *  authoritative `player.health` / `player.needs` — this screen never writes
 *  back to player state. Driven by a list (not one row per stat hardcoded in
 *  the template) so future additions (Traits/Skills/Equipment/Injuries —
 *  plan 105 §"UI architecture") extend this array instead of restructuring
 *  the screen. */
const rows = computed<StatRow[]>(() => {
  const c = ui.characterScreen
  return [
    { key: 'hp', label: 'Zdrowie', current: c.hp.current, max: c.hp.max, color: '#e05555' },
    { key: 'stamina', label: 'Kondycja', current: c.stamina.current, max: c.stamina.max, color: '#e0c040' },
    { key: 'vigor', label: 'Wigor', current: c.vigor.current, max: c.vigor.max, color: '#5cbfa8' },
    { key: 'hunger', label: 'Głód', current: c.hunger.current, max: c.hunger.max, color: '#d4893a' },
    { key: 'thirst', label: 'Pragnienie', current: c.thirst.current, max: c.thirst.max, color: '#4a9fd8' },
  ]
})

function ratio(row: StatRow): number { return row.max > 0 ? row.current / row.max : 0 }
function isCritical(row: StatRow): boolean { return ratio(row) <= CRITICAL_RATIO }

/** Five reputation dimensions (plan quests-progression-001 §14) — each is
 *  its own `-100..100` value, deliberately never averaged into one score. */
const reputationRows = computed(() => {
  const rep = ui.characterScreen.reputation?.reputation
  if (!rep) return []
  return [
    { key: 'trust', label: 'Zaufanie', value: rep.trust },
    { key: 'competence', label: 'Kompetencja', value: rep.competence },
    { key: 'benevolence', label: 'Życzliwość', value: rep.benevolence },
    { key: 'courage', label: 'Odwaga', value: rep.courage },
    { key: 'integrity', label: 'Uczciwość', value: rep.integrity },
  ]
})
</script>

<template>
  <div
    v-if="ui.characterScreen.open"
    class="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeCharacterScreen"
  >
    <div
      ref="panel"
      class="max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style="touch-action: pan-y"
    >
      <h1 class="mb-4 text-lg font-semibold tracking-wide">
        Postać
      </h1>

      <div class="flex flex-col gap-3">
        <div
          v-for="row in rows"
          :key="row.key"
        >
          <div class="mb-1 flex items-baseline justify-between text-sm">
            <span :class="isCritical(row) ? 'font-semibold text-red-400' : ''">
              {{ row.label }}
              <span
                v-if="isCritical(row)"
                class="ml-1 text-[11px] font-normal uppercase tracking-wide"
              >krytyczne</span>
            </span>
            <span class="text-xs opacity-70">{{ Math.round(row.current) }} / {{ Math.round(row.max) }}</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-black/45">
            <div
              class="h-full rounded-full transition-[width]"
              :style="{ width: `${Math.round(ratio(row) * 100)}%`, background: isCritical(row) ? '#e05555' : row.color }"
            />
          </div>
        </div>
      </div>

      <div class="mt-4 border-t border-white/10 pt-3">
        <div
          v-if="ui.characterScreen.reputation"
          class="flex flex-col gap-2"
        >
          <div class="text-sm font-semibold">
            Reputacja — {{ ui.characterScreen.reputation.settlementName }}
          </div>
          <div
            v-for="row in reputationRows"
            :key="row.key"
            class="flex items-baseline justify-between text-xs"
          >
            <span class="opacity-80">{{ row.label }}</span>
            <span class="opacity-70">{{ row.value }}</span>
          </div>
          <div class="mt-1 flex items-baseline justify-between text-xs">
            <span class="opacity-80">Rozpoznawalność</span>
            <span class="opacity-70">{{ ui.characterScreen.reputation.renown }}</span>
          </div>
        </div>
        <div
          v-else
          class="text-xs opacity-60"
        >
          Brak lokalnej reputacji
        </div>
      </div>

      <div
        v-if="ui.characterScreen.badges.length > 0"
        class="mt-3 border-t border-white/10 pt-3"
      >
        <div class="mb-2 text-sm">
          Znany z
        </div>
        <div class="flex flex-col gap-1.5">
          <div
            v-for="badge in ui.characterScreen.badges"
            :key="badge.id"
            class="text-xs"
            :title="badge.description"
          >
            <span class="mr-1">{{ badge.icon }}</span>
            <span class="opacity-90">{{ badge.label }}</span>
          </div>
        </div>
      </div>

      <div class="mt-4 text-[11px] opacity-60">
        C / Esc — zamknij
      </div>
    </div>
  </div>
</template>
