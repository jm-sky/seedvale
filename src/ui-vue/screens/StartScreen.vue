<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import {
  formatSaveDay,
  MAX_SAVES,
  nextDefaultSaveName,
  SAVE_NAME_MAX_LENGTH,
  saveErrorMessage,
  type SaveSlotInfo,
  validateSaveName,
} from '../../persistence/saveSlots'

const props = defineProps<{
  slots: readonly SaveSlotInfo[]
  activeId: string | null
}>()

const emit = defineEmits<{
  choose: [choice:
    | { type: 'continue' }
    | { type: 'load', id: string }
    | { type: 'new', name: string }
    | { type: 'delete', id: string }
  ]
}>()

const showNewGame = ref(false)
const name = ref(nextDefaultSaveName(props.slots.map((slot) => slot.name)))
const error = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
const atLimit = computed(() => props.slots.length >= MAX_SAVES)
const appVersion = __APP_VERSION__
const gitCommit = __GIT_COMMIT__
const buildDate = __BUILD_DATE__

function formatMeta(slot: SaveSlotInfo): string {
  return `${formatSaveDay(slot.elapsedDays)} · ${new Date(slot.savedAt).toLocaleString()} · seed ${slot.seed}`
}

function loadSlot(id: string): void {
  emit('choose', { type: 'load', id })
}

function removeSlot(slot: SaveSlotInfo): void {
  if (!window.confirm(`Usunąć zapis „${slot.name}”?`)) return
  emit('choose', { type: 'delete', id: slot.id })
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
  const check = validateSaveName(name.value, props.slots.map((slot) => slot.name))
  if (!check.ok) {
    error.value = saveErrorMessage(check.error)
    return
  }
  emit('choose', { type: 'new', name: check.name })
}
</script>

<template>
  <div
    class="pointer-events-auto fixed inset-0 z-11 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    data-test-id="start-screen"
  >
    <UiPanel>
      <h1 class="mb-4.5 text-center text-[22px] font-semibold tracking-wide">
        Seedvale
      </h1>

      <div class="mb-3.5 flex flex-col gap-2">
        <div
          v-for="slot in slots"
          :key="slot.id"
          class="flex items-stretch overflow-hidden rounded-md border border-white/15 bg-white/5"
          :class="slot.id === activeId ? 'border-blue-400/70 bg-blue-500/20' : ''"
        >
          <button
            type="button"
            class="min-w-0 flex-1 px-3 py-2.5 text-left text-sm hover:bg-white/10"
            @click="loadSlot(slot.id)"
          >
            <span class="block font-semibold">{{ slot.name }}</span>
            <span class="mt-0.5 block text-[11px] opacity-70">{{ formatMeta(slot) }}</span>
          </button>
          <button
            type="button"
            class="w-11 shrink-0 border-l border-white/12 text-xs text-red-300 hover:bg-red-400/10"
            @click="removeSlot(slot)"
          >
            Usuń
          </button>
        </div>
      </div>

      <UiButton
        variant="primary"
        class="mb-2 w-full"
        :disabled="slots.length === 0"
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

      <div v-else>
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
