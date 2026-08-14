<script setup lang="ts">
import { computed, type ComputedRef } from 'vue'
import type { LightActionResult } from '../../app/userActions'
import { showToast, ui } from '../store'

const emit = defineEmits<{
  (e: 'close-actions'): void
}>()

const lightStatusText: Record<Exclude<LightActionResult, 'ok'>, string> = {
  'already-lit': 'Już płonie',
  missing: 'Brakuje surowców / krzesiwa',
  'need-hold': 'Weź pochodnię w rękę (albo odłóż inne narzędzie)',
}

function lightBranch(): void {
  const result = ui.pauseMenu.onLightBranch?.() ?? 'missing'
  showToast(result === 'ok' ? 'Zapalono gałąź!' : lightStatusText[result], result === 'ok' ? 'info' : 'error')
}

function lightWoodenTorch(): void {
  const result = ui.pauseMenu.onLightWoodenTorch?.() ?? 'missing'
  showToast(result === 'ok' ? 'Zapalono pochodnię!' : lightStatusText[result], result === 'ok' ? 'info' : 'error')
}

function buildFirePit(): void {
  const built = ui.pauseMenu.onBuildFirePit?.() ?? false
  showToast(built ? 'Zbudowano palenisko!' : 'Brakuje kamieni', built ? 'info' : 'error')
}

function buildSimpleFire(): void {
  const built = ui.pauseMenu.onBuildSimpleFire?.() ?? false
  showToast(built ? 'Zapłonęło ognisko!' : 'Brakuje gałęzi/krzesiwa', built ? 'info' : 'error')
}

type Action = {
  label: string
  cost: string
  onClick: () => void
}

// Same `ui.quickActions.fireAvailability` source Quick Actions reads (review
// 007 C4/C8) — only currently-available fire actions are offered here too.
const actions: ComputedRef<readonly Action[]> = computed(() => {
  const avail = ui.quickActions.fireAvailability
  const list: Action[] = []
  if (avail.lightBranch) list.push({ label: 'Zapal gałąź', cost: '1x gałąź', onClick: lightBranch })
  if (avail.lightWoodenTorch) list.push({ label: 'Zapal pochodnię', cost: 'pochodnia w ręce', onClick: lightWoodenTorch })
  if (avail.buildFirePit) list.push({ label: 'Zbuduj palenisko', cost: '3x kamień', onClick: buildFirePit })
  if (avail.buildSimpleFire) list.push({ label: 'Zbuduj ognisko', cost: '2x gałąź', onClick: buildSimpleFire })
  return list
})
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
        {{ action.label }} ({{ action.cost }})
      </button>
    </template>
  </div>
</template>
