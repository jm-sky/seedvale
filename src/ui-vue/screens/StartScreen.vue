<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import SeedPicker from '@/components/SeedPicker.vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import {
  DEFAULT_PLAYER_NAME,
  PLAYER_NAME_MAX_LENGTH,
  playerNameErrorMessage,
  validatePlayerName,
} from '../../config/worldConfig'
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
import { resolveInitialSeedChoice, type SeedChoice, type SeedRecord } from '../../world/seedLibrary'
import SeedLibrary from './SeedLibrary.vue'

const props = defineProps<{
  entries: readonly SaveManagementEntry[]
  activeId: string | null
  /** Seed Library listing (plan world-015 §3/§4), loaded by `main.ts` before
   *  mounting this screen — rendering it here never itself reads IndexedDB
   *  or triggers worldgen/location scan. */
  seeds: readonly SeedRecord[]
  /** Explicit `?seed=` detected at boot (plan persistence-004 §9 follow-up),
   *  `null` when the URL carries none. */
  urlSeed: number | null
}>()

const emit = defineEmits<{
  choose: [choice:
    | { type: 'continue' }
    | { type: 'load', id: string }
    | { type: 'new', name: string, playerName: string, seedChoice: SeedChoice }
    | { type: 'delete', id: string }
  ]
}>()

// The 8-slot limit and name-collision checks only ever count healthy slots —
// same contract `persistence/saveDb.ts`'s `createSave()` already uses
// (`listSaves()`, not the unhealthy-inclusive management list).
const healthySlots = computed(() => props.entries.filter((e): e is SaveSlotInfo & { status: 'ok' } => e.status === 'ok'))

const view = ref<'main' | 'seedLibrary'>('main')
// No save rows at all is a first-class state (plan ui-input-011 §1/§3), not a
// reason to skip this screen or to demand an extra `Nowa gra` click: the form
// simply starts open. `main.ts` mounts a fresh instance per loop iteration, so
// this initial value also covers "deleted the last save" without any
// cross-mount flag.
const showNewGame = ref(props.entries.length === 0)
const name = ref(nextDefaultSaveName(healthySlots.value.map((slot) => slot.name)))
// Per-save player name (plan ui-input-011 §4/§5) — a separate concept from the
// save-slot name, prefilled from the canonical default rather than any global
// player profile.
const playerName = ref(DEFAULT_PLAYER_NAME)
const error = ref('')
const playerNameInput = ref<HTMLInputElement | null>(null)
const atLimit = computed(() => healthySlots.value.length >= MAX_SAVES)
const appVersion = __APP_VERSION__
const gitCommit = __GIT_COMMIT__
const buildDate = __BUILD_DATE__

// Default pick, in priority order: an explicit URL seed, then the most
// recently used library seed, then a fresh seed (plan §3 "przy pustej Seed
// Library pierwsza gra może automatycznie utworzyć pierwszy seed").
const seedChoice = ref<SeedChoice>(resolveInitialSeedChoice(props.urlSeed, props.seeds))

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
  playerNameInput.value?.focus()
  playerNameInput.value?.select()
}

function submitNew(): void {
  if (atLimit.value) {
    error.value = saveErrorMessage('limit')
    return
  }
  const player = validatePlayerName(playerName.value)
  if (!player.ok) {
    error.value = playerNameErrorMessage(player.error)
    return
  }
  const check = validateSaveName(name.value, healthySlots.value.map((slot) => slot.name))
  if (!check.ok) {
    error.value = saveErrorMessage(check.error)
    return
  }
  emit('choose', { type: 'new', name: check.name, playerName: player.name, seedChoice: seedChoice.value })
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

      <div
        v-if="entries.length > 0"
        class="mb-3.5 flex flex-col gap-2"
      >
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

      <!-- Nothing healthy to continue (no saves at all, or only unhealthy
           rows) — `Kontynuuj` is not actionable then (plan ui-input-011 §3),
           so it stays out of the way instead of sitting there disabled. -->
      <UiButton
        v-if="healthySlots.length > 0"
        variant="primary"
        class="mb-2 w-full"
        @click="emit('choose', { type: 'continue' })"
      >
        Kontynuuj
      </UiButton>

      <UiButton
        v-if="!showNewGame"
        class="mb-2 w-full"
        :disabled="atLimit"
        @click="openNewGame"
      >
        {{ atLimit ? 'Nowa gra (limit 8)' : 'Nowa gra' }}
      </UiButton>
      <div v-if="showNewGame">
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
          :url-seed="urlSeed"
          class="mb-2.5"
        />
        <label
          class="mb-1.5 block text-left text-xs opacity-75"
          for="seedvale-new-player-name"
        >
          Imię gracza
        </label>
        <input
          id="seedvale-new-player-name"
          ref="playerNameInput"
          v-model="playerName"
          class="mb-2.5 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-blue-400/60"
          type="text"
          autocomplete="off"
          :maxlength="PLAYER_NAME_MAX_LENGTH"
          @keydown.enter="submitNew"
        >
        <label
          class="mb-1.5 block text-left text-xs opacity-75"
          for="seedvale-new-save-name"
        >
          Nazwa zapisu
        </label>
        <input
          id="seedvale-new-save-name"
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

      <!-- Seed Library stays reachable in the empty state too (plan
           ui-input-011 §3): its entries outlive every save, so a world with
           zero saves can still be started from a previously named seed. -->
      <UiButton
        class="mb-2 w-full"
        @click="view = 'seedLibrary'"
      >
        Biblioteka seedów
      </UiButton>

      <div class="mt-4 border-t border-white/10 pt-3 text-center font-mono text-[10px] opacity-40">
        v{{ appVersion }} | {{ gitCommit }} | {{ buildDate }}
      </div>
    </UiPanel>
  </div>
</template>
