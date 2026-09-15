<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { QuestListEntry } from '../../quests/QuestManager'
import type { QuestState } from '../../quests/quests'
import { ITEM_DEFS, type ItemKind } from '../../items/items'
import { isTouchDevice } from '../../input/isTouchDevice'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import {
  projectQuestLog,
  type QuestLogFilter,
} from '../lib/questLogBuckets'
import { closeQuestLog, emitUiClick, isQuestLogOpen, ui } from '../store'

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
const currentView = ref<'list' | 'details'>('list')
const selectedId = ref<string | null>(null)
const panel = ref<HTMLElement | null>(null)
const touchDevice = isTouchDevice()

function onEscape(): void {
  if (currentView.value === 'details') {
    currentView.value = 'list'
    selectedId.value = null
    return
  }
  closeQuestLog()
}

useOverlayScreen('quest-log', isQuestLogOpen, onEscape)
useTouchScroll(panel)

watch(() => ui.questLog.open, (open) => {
  if (!open) {
    currentView.value = 'list'
    selectedId.value = null
    filter.value = 'current'
  }
})

const projected = computed(() => projectQuestLog(ui.questLog.entries))
const visibleEntries = computed(() => projected.value[filter.value])
const selectedEntry = computed<QuestListEntry | null>(() => {
  if (!selectedId.value) return null
  return ui.questLog.entries.find((entry) => entry.id === selectedId.value) ?? null
})

watch(selectedEntry, (entry) => {
  if (currentView.value === 'details' && !entry) {
    currentView.value = 'list'
    selectedId.value = null
  }
})

function openDetails(entry: QuestListEntry): void {
  emitUiClick()
  selectedId.value = entry.id
  currentView.value = 'details'
}

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
      <template v-if="currentView === 'list'">
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
          <button
            v-for="entry in visibleEntries"
            :key="entry.id"
            type="button"
            class="cursor-pointer rounded-md p-3 text-left"
            :class="entry.state === 'ready_to_report' ? 'bg-white/15 ring-1 ring-white/30' : 'bg-white/5 hover:bg-white/10'"
            @click="openDetails(entry)"
          >
            <div class="font-semibold text-sm">
              {{ entry.title }}
            </div>
            <div class="text-xs opacity-70">
              {{ entry.giverName }} · {{ STATE_LABEL[entry.state] }}<template v-if="entry.totalStages > 1">
                — Etap {{ entry.stageIndex + 1 }}/{{ entry.totalStages }}
              </template>
            </div>
            <div
              v-if="entry.currentObjective"
              class="mt-1 text-sm"
            >
              {{ entry.currentObjective }}
            </div>
          </button>
        </div>
      </template>

      <template v-else-if="selectedEntry">
        <div class="flex flex-row items-center justify-between gap-2">
          <h1 class="text-lg font-semibold tracking-wide">
            {{ selectedEntry.title }}
          </h1>
          <button
            type="button"
            class="cursor-pointer rounded-md border border-white/20 bg-transparent px-2.5 py-1 text-xs hover:bg-white/10"
            @click="currentView = 'list'; selectedId = null"
          >
            Powrót
          </button>
        </div>
        <div class="mt-1 text-xs opacity-70">
          {{ selectedEntry.giverName }} · {{ STATE_LABEL[selectedEntry.state] }}<template v-if="selectedEntry.totalStages > 1">
            — Etap {{ selectedEntry.stageIndex + 1 }}/{{ selectedEntry.totalStages }}
          </template>
        </div>
        <div class="mt-3 text-sm">
          {{ selectedEntry.description }}
        </div>
        <div
          v-if="selectedEntry.currentObjective"
          class="mt-2 text-sm"
        >
          {{ selectedEntry.currentObjective }}
        </div>

        <div
          v-if="selectedEntry.notes.length > 0"
          class="mt-4 flex flex-col gap-2"
        >
          <div class="text-xs font-semibold uppercase tracking-wide opacity-80">
            Notatki
          </div>
          <div
            v-for="(note, index) in selectedEntry.notes"
            :key="index"
            class="rounded-md bg-white/5 p-3"
          >
            <div class="text-xs opacity-70">
              <template v-if="note.dateLabel">{{ note.dateLabel }} · </template>{{ note.speakerName }}
            </div>
            <div class="mt-1 text-sm">
              {{ note.text }}
            </div>
          </div>
        </div>

        <div
          v-if="selectedEntry.promisedReward && selectedEntry.promisedReward.items.length > 0"
          class="mt-3 text-xs opacity-70"
        >
          Nagroda: {{ formatReward(selectedEntry.promisedReward.items) }}
        </div>
        <div class="mt-2 text-xs opacity-70">
          ♥ {{ selectedEntry.giverName }} {{ ui.questLog.relation(selectedEntry.giverNpcId) }}
        </div>
      </template>

      <div class="mt-3 text-[11px] opacity-60">
        {{ touchDevice ? 'Dotknij poza oknem — zamknij' : (currentView === 'details' ? 'Esc — wróć' : 'Esc — zamknij') }}
      </div>
    </div>
  </div>
</template>
