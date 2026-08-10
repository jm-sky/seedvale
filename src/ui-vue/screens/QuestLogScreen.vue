<script setup lang="ts">
import { ref } from 'vue'
import type { QuestState } from '../../quests/quests'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeQuestLog, isQuestLogOpen, ui } from '../store'

type Filter = 'all' | 'active' | 'complete'

const STATE_LABEL: Record<QuestState, string> = {
  not_offered: 'niedostępny',
  offered: 'zaoferowany',
  active: 'aktywny',
  ready_to_report: 'do zgłoszenia',
  complete: 'zakończony',
}

const filter = ref<Filter>('all')
const panel = ref<HTMLElement | null>(null)
useOverlayScreen('quest-log', isQuestLogOpen, closeQuestLog)
useTouchScroll(panel)

function matchesFilter(state: QuestState): boolean {
  if (filter.value === 'all') return true
  if (filter.value === 'complete') return state === 'complete'
  return state !== 'not_offered' && state !== 'complete'
}
</script>

<template>
  <div
    v-if="ui.questLog.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeQuestLog"
  >
    <div
      ref="panel"
      class="max-h-[calc(100dvh-32px)] w-full max-w-xl overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style="touch-action: pan-y"
    >
      <h1 class="mb-1 text-lg font-semibold tracking-wide">
        Zadania
      </h1>
      <div class="mb-4 text-xs opacity-70">
        Exp: {{ ui.questLog.exp }}
      </div>

      <div class="mb-3 flex gap-1">
        <button
          v-for="item in ([['all', 'Wszystkie'], ['active', 'W trakcie'], ['complete', 'Zakończone']] as const)"
          :key="item[0]"
          type="button"
          class="cursor-pointer rounded-md px-2 py-1 text-xs"
          :class="filter === item[0] ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'"
          @click="filter = item[0]"
        >
          {{ item[1] }}
        </button>
      </div>

      <div class="flex flex-col gap-2">
        <div
          v-if="ui.questLog.entries.filter((e) => matchesFilter(e.state)).length === 0"
          class="text-sm opacity-60"
        >
          Brak zadań w tej kategorii.
        </div>
        <div
          v-for="entry in ui.questLog.entries.filter((e) => matchesFilter(e.state))"
          :key="entry.giverName + entry.state + entry.stageIndex"
          class="rounded-md bg-white/5 p-3"
        >
          <div class="font-semibold text-sm">
            {{ entry.giverName }}
          </div>
          <div class="text-xs opacity-70">
            {{ STATE_LABEL[entry.state] }}<template v-if="entry.totalStages > 1">
              — Etap {{ entry.stageIndex + 1 }}/{{ entry.totalStages }}
            </template>
          </div>
          <div
            v-if="entry.currentObjective"
            class="mt-1 text-sm"
          >
            {{ entry.currentObjective }}
          </div>
          <div class="mt-1 text-xs opacity-70">
            ♥ {{ entry.giverName }} {{ ui.questLog.relation(entry.giverName) }}
          </div>
        </div>
      </div>

      <div class="mt-3 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </div>
  </div>
</template>
