<script setup lang="ts">
import { Zap } from 'lucide-vue-next'
import { computed, onUnmounted, ref, watch } from 'vue'
import type { LightActionResult } from '../../app/userActions'
import type { RestOutcome, RestVariant } from '../../ui/createQuickActions'
import { isTouchDevice } from '../../input/isTouchDevice'
import QuickActionsButton from '../components/QuickActionsButton.vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeQuickActions, isQuickActionsOpen, showToast, toggleQuickActions, ui } from '../store'

const panel = ref<HTMLElement | null>(null)
const touchDevice = isTouchDevice()

useOverlayScreen('quick-actions', isQuickActionsOpen, closeQuickActions)
useTouchScroll(panel)

// Result feedback goes to the toast stack, not inline button text (review 007
// C3) — the buttons below only render when `ui.quickActions.fireAvailability`
// says the action's guard passes (C4), so the "missing"/"already-lit" toast
// text mainly covers the rare race where state changed between render and click.
const restStatusText: Record<Exclude<RestOutcome, 'ok'>, string> = {
  'too-far': 'Musisz być bliżej wioski',
  'no-blanket': 'Potrzebujesz koca',
}

const lightStatusText: Record<Exclude<LightActionResult, 'ok'>, string> = {
  'already-lit': 'Już płonie',
  missing: 'Brakuje surowców',
  'need-hold': 'Weź pochodnię w rękę',
}

function buildFirePit(): void {
  const built = ui.quickActions.onBuildFirePit?.() ?? false
  showToast(built ? 'Zbudowano palenisko!' : 'Brakuje kamieni', built ? 'info' : 'error')
}

function buildSimpleFire(): void {
  const built = ui.quickActions.onBuildSimpleFire?.() ?? false
  showToast(built ? 'Zbudowano ognisko!' : 'Brakuje surowców', built ? 'info' : 'error')
}

function lightBranch(): void {
  const result = ui.quickActions.onLightBranch?.() ?? 'missing'
  showToast(result === 'ok' ? 'Zapalono gałąź!' : lightStatusText[result], result === 'ok' ? 'info' : 'error')
}

function lightWoodenTorch(): void {
  const result = ui.quickActions.onLightWoodenTorch?.() ?? 'missing'
  showToast(result === 'ok' ? 'Zapalono pochodnię!' : lightStatusText[result], result === 'ok' ? 'info' : 'error')
}

function wait(hours: number): void {
  closeQuickActions()
  ui.quickActions.onWait?.(hours)
}

function rest(variant: RestVariant): void {
  const result = ui.quickActions.onRest?.(variant) ?? (variant === 'camp' ? 'no-blanket' : 'too-far')
  if (result !== 'ok') {
    showToast(restStatusText[result], 'error')
    return
  }
  closeQuickActions()
}

function placeTent(): void {
  closeQuickActions()
  ui.quickActions.onPlaceTent?.()
}

function dig(): void {
  closeQuickActions()
  ui.quickActions.onDig?.()
}

function level(): void {
  closeQuickActions()
  ui.quickActions.onLevel?.()
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
  document.removeEventListener('click', onDocumentClick)
})

type Action = {
  label: string
  cost: string
  onClick: () => void
}

// Only actions whose resource/state guard currently passes are offered
// (review 007 C4) — `ui.quickActions.fireAvailability` is kept live by
// `createApp.ts`'s `syncQuickActionAvailability`.
const actions = computed<Action[]>(() => {
  const avail = ui.quickActions.fireAvailability
  const list: Action[] = []
  if (avail.lightBranch) list.push({ label: 'Zapal gałąź', cost: '1x gałąź', onClick: lightBranch })
  if (avail.lightWoodenTorch) list.push({ label: 'Zapal pochodnię', cost: 'pochodnia w ręce', onClick: lightWoodenTorch })
  if (avail.buildFirePit) list.push({ label: 'Zbuduj palenisko', cost: '3x kamień', onClick: buildFirePit })
  if (avail.buildSimpleFire) list.push({ label: 'Zbuduj ognisko', cost: '2x gałąź', onClick: buildSimpleFire })
  return list
})

const shovelActions: Action[] = [
  {
    label: 'Wykop dołek',
    cost: 'łopata',
    onClick: dig,
  },
  {
    label: 'Wyrównaj',
    cost: 'łopata',
    onClick: level,
  },
]

</script>

<template>
  <button
    v-if="!touchDevice"
    type="button"
    class="pointer-events-auto fixed flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-black/40 text-ink hover:bg-black/60"
    style="right: max(20px, env(safe-area-inset-right)); bottom: max(20px, env(safe-area-inset-bottom))"
    aria-label="Szybkie działania"
    @click="toggleQuickActions"
  >
    <Zap :size="22" />
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
      <QuickActionsButton
        :label="action.label"
        :cost="action.cost"
        @click="action.onClick"
      />
    </template>
    <template v-if="ui.quickActions.hasShovel">
      <div class="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink opacity-65">
        Łopata
      </div>
      <template
        v-for="action in shovelActions"
        :key="action.label"
      >
        <QuickActionsButton
          :label="action.label"
          :cost="action.cost"
          @click="action.onClick"
        />
      </template>
    </template>
    <div class="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink opacity-65">
      Czekaj
    </div>
    <div class="flex gap-2">
      <QuickActionsButton
        v-for="hours in [1, 3, 6]"
        :key="hours"
        :label="`${hours}h`"
        class="flex-1 w-auto"
        @click="wait(hours)"
      />
    </div>
    <div class="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink opacity-65">
      Odpoczynek
    </div>
    <QuickActionsButton
      v-if="ui.quickActions.hasTent"
      label="Rozstaw namiot"
      cost="1× namiot"
      @click="placeTent"
    />
    <QuickActionsButton
      label="Rozbij obóz (8h)"
      @click="rest('camp')"
    />
    <QuickActionsButton
      v-if="ui.quickActions.nearTown"
      label="Odpocznij w mieście (8h)"
      @click="rest('town')"
    />
  </div>
</template>
