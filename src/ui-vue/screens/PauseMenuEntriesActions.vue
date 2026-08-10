<script setup lang="ts">
import { computed, type ComputedRef, ref } from 'vue'
import { setPauseFirePitStatus, setPauseSimpleFireStatus, setPauseTorchStatus, ui } from '../store'

const torchTimer = ref<number | null>(null)
const firePitTimer = ref<number | null>(null)
const simpleFireTimer = ref<number | null>(null)

const emit = defineEmits<{
  (e: 'close-actions'): void
}>()

function lightTorch(): void {
  const lit = ui.pauseMenu.onLightTorch?.() ?? false; setPauseTorchStatus(lit ? 'Zapalono!' : 'Brakuje gałęzi/krzesiwa lub już płonie')
  if (torchTimer.value !== null) {
    window.clearTimeout(torchTimer.value)
  }
  torchTimer.value = window.setTimeout(() => setPauseTorchStatus(''), 1500)
}

function buildFirePit(): void {
  const built = ui.pauseMenu.onBuildFirePit?.() ?? false; setPauseFirePitStatus(built ? 'Zbudowano!' : 'Brakuje kamieni')
  if (firePitTimer.value !== null) {
    window.clearTimeout(firePitTimer.value)
  }
  firePitTimer.value = window.setTimeout(() => setPauseFirePitStatus(''), 1500)
}

function buildSimpleFire(): void {
  const built = ui.pauseMenu.onBuildSimpleFire?.() ?? false; setPauseSimpleFireStatus(built ? 'Zapłonęło!' : 'Brakuje gałęzi/krzesiwa')
  if (simpleFireTimer.value !== null) {
    window.clearTimeout(simpleFireTimer.value)
  }
  simpleFireTimer.value = window.setTimeout(() => setPauseSimpleFireStatus(''), 1500)
}

type Action = {
  label: string
  cost: string
  onClick: () => void
  status: string | null
}

const actions: ComputedRef<readonly Action[]> = computed(() => [
  {
    label: 'Zapal pochodnię',
    cost: '1x gałąź',
    onClick: lightTorch,
    status: ui.pauseMenu.torchStatus,
  },
  {
    label: 'Zbuduj palenisko',
    cost: '3x kamień',
    onClick: buildFirePit,
    status: ui.pauseMenu.firePitStatus,
  },
  {
    label: 'Zbuduj ognisko',
    cost: '2x gałąź',
    onClick: buildSimpleFire,
    status: ui.pauseMenu.simpleFireStatus,
  },
])
</script>

<template>
  <div
    ref="panel"
    class="max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
    style="touch-action: pan-y"
  >
    <button
      type="button"
      class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
      @click="emit('close-actions')"
    >
      Wróć
    </button>

    <template
      v-for="action in actions"
      :key="action.label"
    >
      <button
        type="button"
        class="mb-2 block w-full cursor-pointer rounded-md border border-white/15 bg-transparent px-3.5 py-2.5 text-sm hover:bg-white/10"
        @click="action.onClick"
      >
        {{ action.label }} ({{ action.cost }})<span class="ml-2 text-xs opacity-75">{{ action.status }}</span>
      </button>
    </template>
  </div>
</template>
