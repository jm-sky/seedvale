<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import SeedPicker from '@/components/SeedPicker.vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import type { SeedChoice, SeedRecord } from '../../world/seedLibrary'
import {
  formatSaveDay,
  MAX_SAVES,
  nextDefaultSaveName,
  SAVE_NAME_MAX_LENGTH,
  saveErrorMessage,
  type SaveManagementEntry,
  type SaveSlotInfo,
  unhealthySaveStatusLabel,
  validateSaveName,
} from '../../persistence/saveSlots'
import SeedLibrary from './SeedLibrary.vue'

const props = defineProps<{
  entries: readonly SaveManagementEntry[]
  activeId: string | null
  /** Seed Library listing (plan world-015 §3/§4), loaded by `main.ts` before
   *  mounting this screen — rendering it here never itself reads IndexedDB
   *  or triggers worldgen/location scan. */
  seeds: readonly SeedRecord[]
}>()

const emit = defineEmits<{
  choose: [choice:
    | { type: 'continue' }
    | { type: 'load', id: string }
    | { type: 'new', name: string, seedChoice: SeedChoice }
    | { type: 'delete', id: string }
  ]
}>()

// The 8-slot limit and name-collision checks only ever count healthy slots —
// same contract `persistence/saveDb.ts`'s `createSave()` already uses
// (`listSaves()`, not the unhealthy-inclusive management list).
const healthySlots = computed(() => props.entries.filter((e): e is SaveSlotInfo & { status: 'ok' } => e.status === 'ok'))

const view = ref<'main' | 'seedLibrary'>('main')
const showNewGame = ref(false)
const name = ref(nextDefaultSaveName(healthySlots.value.map((slot) => slot.name)))
const error = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
const atLimit = computed(() => healthySlots.value.length >= MAX_SAVES)
const appVersion = __APP_VERSION__
const gitCommit = __GIT_COMMIT__
const buildDate = __BUILD_DATE__

// Default pick: the most recently used seed, if the library isn't empty —
// otherwise a fresh seed (plan §3 "przy pustej Seed Library pierwsza gra
// może automatycznie utworzyć pierwszy seed").
const mostRecentSeed = computed(() => [...props.seeds].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0] ?? null)
const seedChoice = ref<SeedChoice>(mostRecentSeed.value ? { kind: 'existing', seed: mostRecentSeed.value.seed } : { kind: 'generate' })

const saveCountsBySeed = computed<Record<number, number>>(() => {
  const counts: Record<number, number> = {}
  for (const slot of healthySlots.value) counts[slot.seed] = (counts[slot.seed] ?? 0) + 1
  return counts
})

function formatMeta(slot: SaveSlotInfo): string {
  return `${formatSaveDay(slot.elapsedDays)} · ${new Date(slot.savedAt).toLocaleString()} · seed ${slot.seed}`
}

function loadSlot(entry: SaveManagementEntry): void {
  // Unhealthy rows are display/delete-only (plan persistence-004 §5) — the
  // template already omits their Load click target, this is defense in depth.
  if (entry.status !== 'ok') return
  emit('choose', { type: 'load', id: entry.id })
}

function removeEntry(entry: SaveManagementEntry): void {
  const label = entry.status === 'ok' ? entry.name : (entry.name ?? `uszkodzony zapis (${entry.id.slice(0, 8)})`)
  if (!window.confirm(`Usunąć zapis „${label}”?`)) return
  emit('choose', { type: 'delete', id: entry.id })
}

async function openNewGame(): Promise<void> {
  if (atLimit.value) return
  showNewGame.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

function submitNew(): void {
  if (atLimit.value) {
    error.value = saveErrorMessage('limit')
    return
  }
  const check = validateSaveName(name.value, healthySlots.value.map((slot) => slot.name))
  if (!check.ok) {
    error.value = saveErrorMessage(check.error)
    return
  }
  emit('choose', { type: 'new', name: check.name, seedChoice: seedChoice.value })
}

function useSeedFromLibrary(seed: number): void {
  seedChoice.value = { kind: 'existing', seed }
  view.value = 'main'
  void openNewGame()
}
</script>

<template>
  <div
    class="pointer-events-auto fixed inset-0 z-11 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    data-test-id="start-screen"
  >
    <SeedLibrary
      v-if="view === 'seedLibrary'"
      :save-counts-by-seed="saveCountsBySeed"
      @close="view = 'main'"
      @use-seed="useSeedFromLibrary"
    />
    <UiPanel v-else>
      <h1 class="mb-4.5 text-center text-[22px] font-semibold tracking-wide">
        Seedvale
      </h1>

      <div class="mb-3.5 flex flex-col gap-2">
        <div
          v-for="entry in entries"
          :key="entry.id"
          class="flex items-stretch overflow-hidden rounded-md border border-white/15 bg-white/5"
          :class="entry.status === 'ok' && entry.id === activeId ? 'border-blue-400/70 bg-blue-500/20' : ''"
        >
          <button
            v-if="entry.status === 'ok'"
            type="button"
            class="cursor-pointer min-w-0 flex-1 px-3 py-2.5 text-left text-sm hover:bg-white/10"
            @click="loadSlot(entry)"
          >
            <span class="block font-semibold">{{ entry.name }}</span>
            <span class="mt-0.5 block text-[11px] opacity-70">{{ formatMeta(entry) }}</span>
          </button>
          <div
            v-else
            class="min-w-0 flex-1 px-3 py-2.5 text-left text-sm opacity-70"
          >
            <span class="block font-semibold">{{ entry.name ?? 'Zapis' }}</span>
            <span class="mt-0.5 block text-[11px] text-red-300">{{ unhealthySaveStatusLabel(entry.status) }} — nie można wczytać</span>
          </div>
          <button
            type="button"
            class="cursor-pointer w-11 shrink-0 border-l border-white/12 text-xs text-red-300 hover:bg-red-400/10"
            @click="removeEntry(entry)"
          >
            Usuń
          </button>
        </div>
      </div>

      <UiButton
        variant="primary"
        class="mb-2 w-full"
        :disabled="healthySlots.length === 0"
        @click="emit('choose', { type: 'continue' })"
      >
        Kontynuuj
      </UiButton>

      <template v-if="!showNewGame">
        <UiButton
          class="mb-2 w-full"
          :disabled="atLimit"
          @click="openNewGame"
        >
          {{ atLimit ? 'Nowa gra (limit 8)' : 'Nowa gra' }}
        </UiButton>
        <UiButton
          class="mb-2 w-full"
          @click="view = 'seedLibrary'"
        >
          Biblioteka seedów
        </UiButton>
      </template>

      <div v-else>
        <label
          class="mb-1.5 block text-left text-xs opacity-75"
          for="seedvale-seed-picker"
        >
          Świat
        </label>
        <SeedPicker
          id="seedvale-seed-picker"
          v-model="seedChoice"
          :seeds="seeds"
          class="mb-2.5"
        />
        <label
          class="mb-1.5 block text-left text-xs opacity-75"
          for="seedvale-new-save-name"
        >
          Nazwa zapisu
        </label>
        <input
          id="seedvale-new-save-name"
          ref="nameInput"
          v-model="name"
          class="mb-2.5 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-blue-400/60"
          type="text"
          autocomplete="off"
          :maxlength="SAVE_NAME_MAX_LENGTH"
          @keydown.enter="submitNew"
        >
        <p
          v-if="error"
          class="mb-2.5 text-left text-xs text-red-300"
        >
          {{ error }}
        </p>
        <UiButton
          variant="primary"
          class="mb-2 w-full"
          @click="submitNew"
        >
          Rozpocznij
        </UiButton>
      </div>

      <div class="mt-4 border-t border-white/10 pt-3 text-center font-mono text-[10px] opacity-40">
        v{{ appVersion }} | {{ gitCommit }} | {{ buildDate }}
      </div>
    </UiPanel>
  </div>
</template>
