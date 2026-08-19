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
  validateSaveName,
} from '../../persistence/saveSlots'
import { emitUiClick, showToast, ui } from '../store'

defineProps<{
  mode: 'save-as' | 'load' | 'new-game'
}>()

const emit = defineEmits<{
  'close-saves': []
}>()

const slots = ref<SaveSlotInfo[]>([])
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
}

function formatMeta(slot: SaveSlotInfo): string {
  return `${formatSaveDay(slot.elapsedDays)} · ${new Date(slot.savedAt).toLocaleString()} · seed ${slot.seed}`
}

async function saveAs(): Promise<void> {
  emitUiClick()
  if (slots.value.length >= MAX_SAVES) {
    error.value = saveErrorMessage('limit')
    showToast(error.value, 'error')
    return
  }
  busy.value = true
  const result = await ui.pauseMenu.onSaveAs?.(name.value)
  busy.value = false
  if (!result) return
  if (!result.ok) {
    error.value = saveErrorMessage(result.error)
    showToast(error.value, 'error')
    return
  }
  error.value = ''
  showToast(`Zapisano jako ${result.name}`)
  emit('close-saves')
}

function loadSlot(id: string): void {
  emitUiClick()
  const current = slots.value.find((slot) => slot.name === ui.pauseMenu.activeSaveName)
  if (current?.id === id) {
    emit('close-saves')
    return
  }
  ui.pauseMenu.onLoadSave?.(id)
}

function startNewGame(): void {
  emitUiClick()
  if (slots.value.length >= MAX_SAVES) {
    error.value = saveErrorMessage('limit')
    showToast(error.value, 'error')
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
      <button
        v-for="slot in slots"
        :key="slot.id"
        type="button"
        class="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-left text-sm hover:bg-white/10"
        :class="slot.name === ui.pauseMenu.activeSaveName ? 'border-blue-400/70 bg-blue-500/20' : ''"
        @click="loadSlot(slot.id)"
      >
        <span class="block font-semibold">{{ slot.name }}</span>
        <span class="mt-0.5 block text-[11px] opacity-70">{{ formatMeta(slot) }}</span>
      </button>
    </div>
  </UiPanel>
</template>
