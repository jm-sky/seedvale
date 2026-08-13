<script setup lang="ts">
import { Zap } from 'lucide-vue-next'
import { onUnmounted, ref, type Ref, watch } from 'vue'
import type { LightActionResult } from '../../app/userActions'
import type { RestOutcome, RestVariant } from '../../ui/createQuickActions'
import { isTouchDevice } from '../../input/isTouchDevice'
import QuickActionsButton from '../components/QuickActionsButton.vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeQuickActions, isQuickActionsOpen, toggleQuickActions, ui } from '../store'

const panel = ref<HTMLElement | null>(null)
const touchDevice = isTouchDevice()

useOverlayScreen('quick-actions', isQuickActionsOpen, closeQuickActions)
useTouchScroll(panel)

const restStatusText: Record<Exclude<RestOutcome, 'ok'>, string> = {
  'too-far': 'Musisz być bliżej wioski',
  'no-blanket': 'Potrzebujesz koca',
}

const lightStatusText: Record<Exclude<LightActionResult, 'ok'>, string> = {
  'already-lit': 'Już płonie',
  missing: 'Brakuje surowców',
  'need-hold': 'Weź pochodnię w rękę',
}

const campfireStatus = ref('')
const firePitStatus = ref('')
const branchStatus = ref('')
const torchStatus = ref('')
const campStatus = ref('')
const townStatus = ref('')
let simpleFireTimeout = 0
let firePitTimeout = 0
let branchTimeout = 0
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

function lightBranch(): void {
  const result = ui.quickActions.onLightBranch?.() ?? 'missing'
  branchStatus.value = result === 'ok' ? 'Zapalono!' : lightStatusText[result]
  window.clearTimeout(branchTimeout)
  branchTimeout = window.setTimeout(() => { branchStatus.value = '' }, 1500)
}

function lightWoodenTorch(): void {
  const result = ui.quickActions.onLightWoodenTorch?.() ?? 'missing'
  torchStatus.value = result === 'ok' ? 'Zapalono!' : lightStatusText[result]
  window.clearTimeout(torchTimeout)
  torchTimeout = window.setTimeout(() => { torchStatus.value = '' }, 1500)
}

function wait(hours: number): void {
  closeQuickActions()
  ui.quickActions.onWait?.(hours)
}

function rest(variant: RestVariant): void {
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
  window.clearTimeout(simpleFireTimeout)
  window.clearTimeout(branchTimeout)
  window.clearTimeout(torchTimeout)
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
    label: 'Zapal gałąź',
    cost: '1x gałąź',
    onClick: lightBranch,
    status: branchStatus,
  },
  {
    label: 'Zapal pochodnię',
    cost: 'pochodnia w ręce',
    onClick: lightWoodenTorch,
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

const shovelActions: Action[] = [
  {
    label: 'Wykop dołek',
    cost: 'łopata',
    onClick: dig,
    status: null,
  },
  {
    label: 'Wyrównaj',
    cost: 'łopata',
    onClick: level,
    status: null,
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
        :status="action.status?.value"
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
      :status="campStatus"
      @click="rest('camp')"
    />
    <QuickActionsButton
      v-if="ui.quickActions.nearTown"
      label="Odpocznij w mieście (8h)"
      :status="townStatus"
      @click="rest('town')"
    />
  </div>
</template>
