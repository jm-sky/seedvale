<script setup lang="ts">
import { onMounted, ref } from 'vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import type { SaveSlotInfo } from '../../persistence/saveDb'
import {
  formatSaveDay,
  MAX_SAVES,
  nextDefaultSaveName,
  SAVE_NAME_MAX_LENGTH,
  saveErrorMessage,
  type SaveManagementEntry,
  unhealthySaveStatusLabel,
  validateSaveName,
} from '../../persistence/saveSlots'
import { emitUiClick, showToast, ui } from '../store'

const props = defineProps<{
  mode: 'save-as' | 'load' | 'new-game'
}>()

const emit = defineEmits<{
  'close-saves': []
}>()

const slots = ref<SaveSlotInfo[]>([])
// Load-mode entries (plan persistence-004 §5) — healthy *and* unhealthy rows,
// so a corrupted save stays visible/deletable instead of silently vanishing.
const entries = ref<SaveManagementEntry[]>([])
const name = ref('')
const error = ref('')
const busy = ref(false)

onMounted(() => {
  void refresh()
})

async function refresh(): Promise<void> {
  const list = await ui.pauseMenu.onListSaves?.() ?? []
  slots.value = list
  if (!name.value) name.value = nextDefaultSaveName(list.map((slot) => slot.name))
  if (props.mode === 'load') {
    const result = await ui.pauseMenu.onListSaveManagement?.()
    // A transient read failure keeps whatever was already shown (plan
    // persistence-004 §4) rather than blanking the list to "no saves".
    if (result?.ok) entries.value = result.entries
  }
}

function formatMeta(slot: SaveSlotInfo): string {
  return `${formatSaveDay(slot.elapsedDays)} · ${new Date(slot.savedAt).toLocaleString()} · seed ${slot.seed}`
}

async function removeEntry(entry: SaveManagementEntry): Promise<void> {
  emitUiClick()
  const label = entry.status === 'ok' ? entry.name : (entry.name ?? `uszkodzony zapis (${entry.id.slice(0, 8)})`)
  if (!window.confirm(`Usunąć zapis „${label}”?`)) return
  await ui.pauseMenu.onDeleteSave?.(entry.id)
  await refresh()
}

async function saveAs(): Promise<void> {
  emitUiClick()
  if (slots.value.length >= MAX_SAVES) {
    // Transient failure — toast only (plan `ui-input-002` §4); `error` stays
    // reserved for the persistent inline name-validation message below.
    error.value = ''
    showToast(saveErrorMessage('limit'), 'error')
    return
  }
  busy.value = true
  const result = await ui.pauseMenu.onSaveAs?.(name.value)
  busy.value = false
  if (!result) return
  if (!result.ok) {
    error.value = ''
    showToast(saveErrorMessage(result.error), 'error')
    return
  }
  error.value = ''
  showToast(`Zapisano jako ${result.name}`)
  emit('close-saves')
}

function loadSlot(entry: SaveManagementEntry): void {
  // An unhealthy row is never loadable (plan persistence-004 §5) — the
  // template already disables its click target, this is defense in depth.
  if (entry.status !== 'ok') return
  emitUiClick()
  const current = slots.value.find((slot) => slot.name === ui.pauseMenu.activeSaveName)
  if (current?.id === entry.id) {
    emit('close-saves')
    return
  }
  ui.pauseMenu.onLoadSave?.(entry.id)
}

function startNewGame(): void {
  emitUiClick()
  if (slots.value.length >= MAX_SAVES) {
    error.value = ''
    showToast(saveErrorMessage('limit'), 'error')
    return
  }
  const check = validateSaveName(name.value, slots.value.map((slot) => slot.name))
  if (!check.ok) {
    error.value = saveErrorMessage(check.error)
    return
  }
  ui.pauseMenu.onNewGame?.(check.name)
  emit('close-saves')
}

const titles = {
  'save-as': 'Zapisz jako',
  load: 'Wczytaj',
  'new-game': 'Nowa gra',
} as const
</script>

<template>
  <UiPanel>
    <UiButton
      class="mb-3 w-full"
      @click="emit('close-saves')"
    >
      Wróć
    </UiButton>
    <h2 class="mb-3 text-left text-xs font-semibold uppercase tracking-widest opacity-60">
      {{ titles[mode] }}
    </h2>

    <p
      v-if="ui.pauseMenu.activeSaveName"
      class="mb-3 text-left text-[13px] opacity-80"
    >
      Bieżący zapis: <span class="font-semibold">{{ ui.pauseMenu.activeSaveName }}</span>
    </p>

    <template v-if="mode === 'save-as' || mode === 'new-game'">
      <p
        v-if="mode === 'new-game' && ui.pauseMenu.activeSaveName"
        class="mb-3 text-left text-[13px] opacity-80"
      >
        Bieżąca gra zostanie zapisana jako „{{ ui.pauseMenu.activeSaveName }}”.
      </p>
      <label
        class="mb-1 block text-left text-xs opacity-75"
        for="seedvale-pause-save-name"
      >
        Nazwa zapisu
      </label>
      <input
        id="seedvale-pause-save-name"
        v-model="name"
        class="mb-2 w-full rounded-md border border-white/15 bg-white/5 px-2.5 py-2 text-sm outline-none focus:border-blue-400/60"
        type="text"
        autocomplete="off"
        :maxlength="SAVE_NAME_MAX_LENGTH"
        @keydown.enter="mode === 'save-as' ? saveAs() : startNewGame()"
      >
      <p
        v-if="error"
        class="mb-2 text-left text-xs text-red-300"
      >
        {{ error }}
      </p>
      <UiButton
        variant="primary"
        class="mb-3 w-full"
        :disabled="busy"
        @click="mode === 'save-as' ? saveAs() : startNewGame()"
      >
        {{ mode === 'save-as' ? 'Zapisz' : 'Rozpocznij' }}
      </UiButton>
    </template>

    <div
      v-if="mode === 'load'"
      class="flex flex-col gap-2"
    >
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="flex items-stretch overflow-hidden rounded-md border border-white/15 bg-white/5"
        :class="entry.status === 'ok' && entry.name === ui.pauseMenu.activeSaveName ? 'border-blue-400/70 bg-blue-500/20' : ''"
      >
        <button
          v-if="entry.status === 'ok'"
          type="button"
          class="min-w-0 flex-1 px-3 py-2.5 text-left text-sm hover:bg-white/10"
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
          v-if="entry.status !== 'ok'"
          type="button"
          class="w-11 shrink-0 border-l border-white/12 text-xs text-red-300 hover:bg-red-400/10"
          @click="removeEntry(entry)"
        >
          Usuń
        </button>
      </div>
    </div>
  </UiPanel>
</template>
