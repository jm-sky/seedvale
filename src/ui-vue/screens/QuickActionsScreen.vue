<script setup lang="ts">
import { Zap } from 'lucide-vue-next'
import { computed, onUnmounted, ref, watch } from 'vue'
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

function dig(): void {
  closeQuickActions()
  ui.quickActions.onDig?.()
}

function level(): void {
  closeQuickActions()
  ui.quickActions.onLevel?.()
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
      class="pointer-events-auto fixed z-10 flex-wrap lg:flex-nowrap flex flex-col gap-2 overflow-y-auto rounded-lg p-2 backdrop-blur-xs"
      :class="touchDevice
        ? 'max-h-[calc(100dvh-120px)] w-[calc(100vw-24px)]'
        : 'max-h-[calc(100dvh-220px)] w-[min(420px,calc(100vw-40px))]'"
      :style="touchDevice
        ? 'left: 12px; right: 12px; bottom: max(20px, calc(env(safe-area-inset-bottom) + 120px)); touch-action: pan-y'
        : 'right: max(20px, env(safe-area-inset-right)); bottom: max(190px, calc(env(safe-area-inset-bottom) + 190px)); touch-action: pan-y'"
    >
      <div
        v-if="fireActions.length"
        class="grid grid-cols-2 gap-2"
      >
        <QuickActionsButton
          v-for="action in fireActions"
          :key="action.id"
          :label="action.label"
          :cost="action.cost"
          is-row-button
          @click="runFireAction(action.run)"
        />
      </div>
      <template v-if="ui.quickActions.hasShovel">
        <div class="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink opacity-65">
          Łopata
        </div>
        <div class="flex flex-wrap gap-2">
          <QuickActionsButton
            v-for="action in shovelActions"
            :key="action.label"
            :label="action.label"
            :cost="action.cost"
            is-row-button
            @click="action.onClick"
          />
        </div>
      </template>
      <template v-if="trapActions.length">
        <div class="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink opacity-65">
          Pułapki
        </div>
        <div class="flex flex-wrap gap-2">
          <QuickActionsButton
            v-for="action in trapActions"
            :key="action.label"
            :label="action.label"
            :cost="action.cost"
            is-row-button
            @click="action.onClick"
          />
        </div>
      </template>
      <div class="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink opacity-65">
        Czekaj
      </div>
      <div class="flex gap-2">
        <QuickActionsButton
          v-for="hours in [1, 3, 6]"
          :key="hours"
          :label="`${hours}h`"
          is-row-button
          @click="wait(hours)"
        />
      </div>
      <div class="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink opacity-65">
        Odpoczynek
      </div>
      <div class="flex flex-wrap gap-2">
        <QuickActionsButton
          v-if="ui.quickActions.hasTent"
          label="Rozstaw namiot"
          cost="1× namiot"
          is-row-button
          @click="placeTent"
        />
        <QuickActionsButton
          label="Rozbij obóz (8h)"
          is-row-button
          @click="rest('camp')"
        />
        <QuickActionsButton
          v-if="ui.quickActions.nearTown"
          label="Odpocznij w mieście (8h)"
          is-row-button
          @click="rest('town')"
        />
      </div>
    </div>
  </Teleport>
</template>
