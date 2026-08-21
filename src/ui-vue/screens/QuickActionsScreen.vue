<script setup lang="ts">
import { Zap } from 'lucide-vue-next'
import { computed, onUnmounted, ref, watch } from 'vue'
import QuickActionsGroup from '@/components/QuickActionsGroup.vue'
import type { RestOutcome, RestVariant } from '../../ui/createQuickActions'
import type { TrapKind } from '../../world/animalTraps'
import { isTouchDevice } from '../../input/isTouchDevice'
import QuickActionsButton from '../components/QuickActionsButton.vue'
import SkillsHudButton from '../components/SkillsHudButton.vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { visibleFireActions } from '../playerQuickActions'
import { closeQuickActions, isQuickActionsOpen, showToast, toggleQuickActions, ui } from '../store'

const panel = ref<HTMLElement | null>(null)
const touchDevice = isTouchDevice()

useOverlayScreen('quick-actions', isQuickActionsOpen, closeQuickActions)
useTouchScroll(panel)

const restStatusText: Record<Exclude<RestOutcome, 'ok'>, string> = {
  'too-far': 'Musisz być bliżej wioski',
  'no-blanket': 'Potrzebujesz koca',
}

const fireActions = computed(() => visibleFireActions(ui.quickActions.fireAvailability, ui.quickActions))

function runFireAction(run: () => { ok: boolean; toast: string; kind: 'info' | 'error' }): void {
  const result = run()
  showToast(result.toast, result.kind)
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

function placeTrap(kind: TrapKind): void {
  closeQuickActions()
  ui.quickActions.onPlaceTrap?.(kind)
}

function putDownContainer(): void {
  closeQuickActions()
  ui.quickActions.onPutDownContainer?.()
}

function dig(): void {
  closeQuickActions()
  ui.quickActions.onDig?.()
}

function level(): void {
  closeQuickActions()
  ui.quickActions.onLevel?.()
}

function buildWell(): void {
  closeQuickActions()
  ui.quickActions.onBuildWell?.()
}

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

const trapActions = computed<Action[]>(() => {
  const list: Action[] = []
  if (ui.quickActions.traps.simple) {
    list.push({ label: 'Zastaw prostą pułapkę', cost: '1× prosta pułapka', onClick: () => placeTrap('simple') })
  }
  if (ui.quickActions.traps.good) {
    list.push({ label: 'Zastaw dobrą pułapkę', cost: '1× dobra pułapka', onClick: () => placeTrap('good') })
  }
  return list
})

const shovelActions: Action[] = [
  { label: 'Wykop dołek', cost: 'łopata', onClick: dig },
  { label: 'Wyrównaj', cost: 'łopata', onClick: level },
  { label: 'Zbuduj studnię', cost: 'łopata', onClick: buildWell },
]
</script>

<template>
  <div
    v-if="!touchDevice"
    class="pointer-events-none fixed z-8 flex flex-col items-center gap-2"
    style="right: max(20px, env(safe-area-inset-right)); bottom: max(20px, env(safe-area-inset-bottom))"
  >
    <SkillsHudButton />
    <button
      type="button"
      class="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-black/40 text-ink hover:bg-black/60"
      aria-label="Szybkie działania"
      @click="toggleQuickActions"
    >
      <Zap :size="22" />
    </button>
  </div>
  <Teleport to="body">
    <div
      v-if="ui.quickActions.open"
      ref="panel"
      class="border border-white/20 pointer-events-auto fixed z-10 flex flex-col flex-wrap lg:flex-nowrap content-start gap-2 overflow-y-auto rounded-lg p-2 backdrop-blur-xs"
      :class="touchDevice ? '' : 'max-h-[calc(100dvh-220px)] w-[min(420px,calc(100vw-40px))]'"
      :style="touchDevice
        ? {
          top: 'max(12px, env(safe-area-inset-top))',
          left: 'max(12px, env(safe-area-inset-left))',
          right: 'max(12px, env(safe-area-inset-right))',
          bottom: 'max(12px, calc(env(safe-area-inset-bottom) + 100px))',
          touchAction: 'pan-y',
        }
        : {
          top: 'max(12px, env(safe-area-inset-top))',
          bottom: 'max(168px, calc(env(safe-area-inset-bottom) + 148px))',
          right: 'max(20px, env(safe-area-inset-right))',
          touchAction: 'pan-y',
        }"
    >
      <QuickActionsGroup
        v-if="fireActions.length"
        label="Ogień"
      >
        <QuickActionsButton
          v-for="action in fireActions"
          :key="action.id"
          :label="action.label"
          :cost="action.cost"
          @click="runFireAction(action.run)"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="ui.quickActions.hasShovel"
        label="Łopata"
      >
        <QuickActionsButton
          v-for="action in shovelActions"
          :key="action.label"
          :label="action.label"
          :cost="action.cost"
          @click="action.onClick"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="trapActions.length"
        label="Pułapki"
      >
        <QuickActionsButton
          v-for="action in trapActions"
          :key="action.label"
          :label="action.label"
          :cost="action.cost"
          @click="action.onClick"
        />
      </QuickActionsGroup>
      <QuickActionsGroup label="Czekaj">
        <QuickActionsButton
          v-for="hours in [1, 2, 4, 6]"
          :key="hours"
          :label="`${hours}h`"
          @click="wait(hours)"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="ui.quickActions.hasCarriedContainer"
        label="Skrzynia"
      >
        <QuickActionsButton
          label="Odłóż skrzynię"
          @click="putDownContainer"
        />
      </QuickActionsGroup>
      <QuickActionsGroup label="Odpoczynek">
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
      </QuickActionsGroup>
    </div>
  </Teleport>
</template>
