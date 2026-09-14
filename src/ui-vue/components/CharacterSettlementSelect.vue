<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import type { CharacterSettlementOption } from '../store'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { syncOverlayStack } from '../store'

const props = defineProps<{
  options: readonly CharacterSettlementOption[]
  selectedSettlementId: string | null
}>()

const emit = defineEmits<{
  select: [settlementId: string]
}>()

const open = ref(false)
const query = ref('')
const root = ref<HTMLElement | null>(null)
const filterInput = ref<HTMLInputElement | null>(null)

useOverlayScreen('character-settlement-select', () => open.value, () => { open.value = false })

function onDocumentPointerDown(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node)) open.value = false
}

watch(open, (isOpen) => {
  if (!isOpen) {
    query.value = ''
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    return
  }
  document.addEventListener('pointerdown', onDocumentPointerDown)
  void nextTick(() => filterInput.value?.focus())
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  open.value = false
  syncOverlayStack('character-settlement-select', false)
})

const selected = computed(() =>
  props.options.find((option) => option.settlementId === props.selectedSettlementId) ?? null,
)

const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('pl')
  if (!needle) return props.options
  return props.options.filter((option) => option.settlementName.toLocaleLowerCase('pl').includes(needle))
})

function toggle(): void {
  open.value = !open.value
}

function choose(settlementId: string): void {
  emit('select', settlementId)
  open.value = false
}
</script>

<template>
  <div
    ref="root"
    class="relative"
  >
    <button
      type="button"
      class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md bg-white/5 px-2 py-1.5 text-left text-sm outline-none hover:bg-white/10 focus:bg-white/10"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <span>{{ selected?.settlementName ?? 'Wybierz osadę' }}</span>
      <ChevronDown
        class="size-3.5 shrink-0 opacity-70"
        :class="open ? 'rotate-180' : ''"
      />
    </button>
    <div
      v-if="open"
      class="absolute z-10 mt-1 w-full rounded-md border border-white/10 bg-panel p-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
    >
      <input
        v-if="options.length > 1"
        ref="filterInput"
        v-model="query"
        type="text"
        placeholder="Szukaj osady..."
        class="mb-1 w-full rounded-md bg-white/5 px-2 py-1.5 text-xs outline-none placeholder:opacity-50 focus:bg-white/10"
        @click.stop
      >
      <ul
        class="max-h-40 overflow-y-auto"
        role="listbox"
      >
        <li
          v-for="option in filtered"
          :key="option.settlementId"
        >
          <button
            type="button"
            class="flex w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/10"
            :class="option.settlementId === selectedSettlementId ? 'bg-white/10' : ''"
            role="option"
            :aria-selected="option.settlementId === selectedSettlementId"
            @click="choose(option.settlementId)"
          >
            {{ option.settlementName }}
          </button>
        </li>
        <li
          v-if="filtered.length === 0"
          class="px-2 py-1.5 text-xs opacity-60"
        >
          Brak wyników
        </li>
      </ul>
    </div>
  </div>
</template>
