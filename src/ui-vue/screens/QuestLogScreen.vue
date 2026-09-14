<script setup lang="ts">
import { computed, ref } from 'vue'
import type { QuestState } from '../../quests/quests'
import { ITEM_DEFS, type ItemKind } from '../../items/items'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import {
  projectQuestLog,
  type QuestLogFilter,
} from '../lib/questLogBuckets'
import { closeQuestLog, isQuestLogOpen, ui } from '../store'

const STATE_LABEL: Record<QuestState, string> = {
  not_offered: 'niedostępny',
  offered: 'zaoferowany',
  active: 'aktywny',
  ready_to_report: 'do zgłoszenia',
  complete: 'zakończony',
  failed: 'nieudany',
  invalidated: 'nieaktualny',
  abandoned: 'porzucony',
}

const FILTERS: readonly { id: QuestLogFilter, label: string }[] = [
  { id: 'current', label: 'Bieżące' },
  { id: 'offers', label: 'Oferty' },
  { id: 'history', label: 'Historia' },
]

const filter = ref<QuestLogFilter>('current')
const panel = ref<HTMLElement | null>(null)
useOverlayScreen('quest-log', isQuestLogOpen, closeQuestLog)
useTouchScroll(panel)

const projected = computed(() => projectQuestLog(ui.questLog.entries))
const visibleEntries = computed(() => projected.value[filter.value])

function formatReward(items: ReadonlyArray<{ kind: ItemKind, count: number }>): string {
  return items.map((item) => `${item.count}× ${ITEM_DEFS[item.kind].label}`).join(', ')
}
</script>

<template>
  <div
    v-if="ui.questLog.open"
    class="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
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

      <div class="mb-3 flex gap-1">
        <button
          v-for="item in FILTERS"
          :key="item.id"
          type="button"
          class="cursor-pointer rounded-md px-2 py-1 text-xs"
          :class="filter === item.id ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'"
          @click="filter = item.id"
        >
          {{ item.label }} ({{ projected.counts[item.id] }})
        </button>
      </div>

      <div class="flex flex-col gap-2">
        <div
          v-if="visibleEntries.length === 0"
          class="text-sm opacity-60"
        >
          Brak zadań w tej kategorii.
        </div>
        <div
          v-for="entry in visibleEntries"
          :key="entry.id"
          class="rounded-md p-3"
          :class="entry.state === 'ready_to_report' ? 'bg-white/15 ring-1 ring-white/30' : 'bg-white/5'"
        >
          <div class="font-semibold text-sm">
            {{ entry.title }}
          </div>
          <div class="text-xs opacity-70">
            {{ entry.giverName }} · {{ STATE_LABEL[entry.state] }}<template v-if="entry.totalStages > 1">
              — Etap {{ entry.stageIndex + 1 }}/{{ entry.totalStages }}
            </template>
          </div>
          <div class="mt-1 text-sm">
            {{ entry.description }}
          </div>
          <div
            v-if="entry.currentObjective"
            class="mt-1 text-sm"
          >
            {{ entry.currentObjective }}
          </div>
          <div
            v-if="entry.resultText"
            class="mt-1 text-sm opacity-80"
          >
            {{ entry.resultText }}
          </div>
          <div
            v-if="entry.promisedReward && entry.promisedReward.items.length > 0"
            class="mt-1 text-xs opacity-70"
          >
            Nagroda: {{ formatReward(entry.promisedReward.items) }}
          </div>
          <div class="mt-1 text-xs opacity-70">
            ♥ {{ entry.giverName }} {{ ui.questLog.relation(entry.giverNpcId) }}
          </div>
        </div>
      </div>

      <div class="mt-3 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </div>
  </div>
</template>
