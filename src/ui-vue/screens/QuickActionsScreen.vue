<script setup lang="ts">
import { onUnmounted, ref, type Ref, watch } from 'vue'
import { isTouchDevice } from '../../input/isTouchDevice'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeQuickActions, isQuickActionsOpen, toggleQuickActions, ui } from '../store'

const panel = ref<HTMLElement | null>(null)
const touchDevice = isTouchDevice()

useOverlayScreen('quick-actions', isQuickActionsOpen, closeQuickActions)
useTouchScroll(panel)

const restStatusText: Record<'too-far' | 'no-blanket', string> = {
  'too-far': 'Musisz być bliżej wioski',
  'no-blanket': 'Potrzebujesz koca',
}

const campfireStatus = ref('')
const firePitStatus = ref('')
const torchStatus = ref('')
const campStatus = ref('')
const townStatus = ref('')
let simpleFireTimeout = 0
let firePitTimeout = 0
let torchTimeout = 0
let campTimeout = 0
let townTimeout = 0

function buildFirePit(): void {
  const built = ui.quickActions.onBuildFirePit?.() ?? false
  firePitStatus.value = built ? 'Zbudowano!' : 'Brakuje surowców'
  window.clearTimeout(firePitTimeout)
  firePitTimeout = window.setTimeout(() => { firePitStatus.value = '' }, 1500)
}

function buildSimpleFire(): void {
  const built = ui.quickActions.onBuildSimpleFire?.() ?? false
  campfireStatus.value = built ? 'Zbudowano!' : 'Brakuje surowców'
  window.clearTimeout(simpleFireTimeout)
  simpleFireTimeout = window.setTimeout(() => { campfireStatus.value = '' }, 1500)
}

function lightTorch(): void {
  const built = ui.quickActions.onLightTorch?.() ?? false
  torchStatus.value = built ? 'Zapalono!' : 'Brakuje surowców'
  window.clearTimeout(torchTimeout)
  torchTimeout = window.setTimeout(() => { torchStatus.value = '' }, 1500)
}

function wait(hours: number): void {
  closeQuickActions()
  ui.quickActions.onWait?.(hours)
}

function rest(variant: 'camp' | 'town'): void {
  const result = ui.quickActions.onRest?.(variant) ?? (variant === 'camp' ? 'no-blanket' : 'too-far')
  if (result !== 'ok') {
    const status = variant === 'camp' ? campStatus : townStatus
    status.value = restStatusText[result]
    if (variant === 'camp') { window.clearTimeout(campTimeout); campTimeout = window.setTimeout(() => { campStatus.value = '' }, 1500) }
    else { window.clearTimeout(townTimeout); townTimeout = window.setTimeout(() => { townStatus.value = '' }, 1500) }
    return
  }
  closeQuickActions()
}

// Attached only while open, and only on the *next* tick — so the click that
// opened the popup (trigger button or touch controls' own button) doesn't
// immediately bubble into this listener and close it again. Mirrors the
// vanilla `createQuickActions.ts` behavior this replaces.
function onDocumentClick(event: MouseEvent): void {
  if (panel.value?.contains(event.target as Node)) return
  closeQuickActions()
}
let attachTimeout = 0
watch(() => ui.quickActions.open, (open) => {
  window.clearTimeout(attachTimeout)
  if (open) attachTimeout = window.setTimeout(() => document.addEventListener('click', onDocumentClick), 0)
  else document.removeEventListener('click', onDocumentClick)
})
onUnmounted(() => {
  window.clearTimeout(attachTimeout)
  window.clearTimeout(simpleFireTimeout)
  window.clearTimeout(campTimeout)
  window.clearTimeout(townTimeout)
  document.removeEventListener('click', onDocumentClick)
})

type Action = {
  label: string
  cost: string
  onClick: () => void
  status: Ref<string> | null
}

const actions: Action[] = [
  {
    label: 'Zapal pochodnię',
    cost: '1x gałąź',
    onClick: lightTorch,
    status: torchStatus,
  },
  {
    label: 'Zbuduj palenisko',
    cost: '3x kamień',
    onClick: buildFirePit,
    status: firePitStatus,
  },
  {
    label: 'Zbuduj ognisko',
    cost: '2x gałąź',
    onClick: buildSimpleFire,
    status: campfireStatus,
  },
]

</script>

<template>
  <button
    v-if="!touchDevice"
    type="button"
    class="pointer-events-auto fixed h-11 w-11 cursor-pointer rounded-lg border border-white/25 bg-black/40 text-lg text-ink hover:bg-black/60"
    style="right: max(20px, env(safe-area-inset-right)); bottom: max(20px, env(safe-area-inset-bottom))"
    @click="toggleQuickActions"
  >
    ⚡
  </button>
  <div
    v-if="ui.quickActions.open"
    ref="panel"
    class="pointer-events-auto p-2 fixed flex max-h-[calc(100dvh-220px)] flex-col gap-2 overflow-y-auto rounded-lg backdrop-blur-xs"
    style="right: max(20px, env(safe-area-inset-right)); bottom: max(190px, calc(env(safe-area-inset-bottom) + 190px)); touch-action: pan-y"
  >
    <template
      v-for="action in actions"
      :key="action.label"
    >
      <button
        type="button"
        class="block w-55 max-w-[calc(100vw-40px)] cursor-pointer rounded-lg border border-white/20 bg-panel px-3.5 py-2.5 text-left text-sm text-ink shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:bg-panel/30 hover:backdrop-blur-md"
        @click="action.onClick"
      >
        {{ action.label }}
        <div class="inline-block text-xs px-2 py-0.5 bg-black/50 rounded-lg font-mono">
          {{ action.cost }}
        </div>
        <span class="mt-1 block text-[11px] opacity-75">{{ action.status?.value }}</span>
      </button>
    </template>
    <div class="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink opacity-65">
      Czekaj
    </div>
    <div class="flex gap-2">
      <button
        v-for="hours in [1, 3, 6]"
        :key="hours"
        type="button"
        class="flex-1 cursor-pointer rounded-lg border border-white/20 bg-panel px-3.5 py-2.5 text-center text-sm text-ink shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:bg-panel/30 hover:backdrop-blur-md"
        @click="wait(hours)"
      >
        {{ hours }}h
      </button>
    </div>
    <div class="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink opacity-65">
      Odpoczynek
    </div>
    <button
      type="button"
      class="block w-55 max-w-[calc(100vw-40px)] cursor-pointer rounded-lg border border-white/20 bg-panel px-3.5 py-2.5 text-left text-sm text-ink shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:bg-panel/30 hover:backdrop-blur-md"
      @click="rest('camp')"
    >
      Rozbij obóz (8h)
      <span class="mt-1 block text-[11px] opacity-75">{{ campStatus }}</span>
    </button>
    <button
      type="button"
      class="block w-55 max-w-[calc(100vw-40px)] cursor-pointer rounded-lg border border-white/20 bg-panel px-3.5 py-2.5 text-left text-sm text-ink shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:bg-panel/30 hover:backdrop-blur-md"
      @click="rest('town')"
    >
      Odpocznij w mieście (8h)
      <span class="mt-1 block text-[11px] opacity-75">{{ townStatus }}</span>
    </button>
  </div>
</template>
