<script setup lang="ts">
import { ref } from 'vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import { ITEM_DEFS, type ItemKind } from '../../items/items'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeHouseholdTransferScreen, isHouseholdTransferScreenOpen, openQuantityDialog, ui } from '../store'

useOverlayScreen('householdTransferScreen', isHouseholdTransferScreenOpen, closeHouseholdTransferScreen)

const playerPanel = ref<HTMLElement | null>(null)
useTouchScroll(playerPanel)

function deposit(kind: ItemKind, count: number): void {
  if (count <= 1) { ui.householdTransferScreen.onDeposit?.(kind, count); return }
  openQuantityDialog(`Przekaż: ${ITEM_DEFS[kind].label}`, count, (amount) => ui.householdTransferScreen.onDeposit?.(kind, amount))
}
</script>

<template>
  <div
    v-if="ui.householdTransferScreen.open"
    class="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px] max-md:items-stretch max-md:p-2"
    @click.self="closeHouseholdTransferScreen"
  >
    <UiPanel
      class="flex h-[min(560px,calc(100dvh-32px))] w-[min(520px,calc(100vw-32px))] max-w-lg flex-col !overflow-hidden !p-5 max-md:h-[calc(100dvh-16px)] max-md:max-h-none max-md:w-full max-md:!p-3"
    >
      <div class="mb-3 flex shrink-0 items-baseline justify-between gap-2 max-md:mb-2">
        <h2 class="text-base font-semibold capitalize tracking-wide max-md:text-sm">
          {{ ui.householdTransferScreen.label }}
        </h2>
        <button
          type="button"
          class="text-[12px] opacity-75 rounded-md px-2 py-1 border border-white/10 max-md:px-1.5 max-md:py-0.5 max-md:text-[11px]"
          @click="closeHouseholdTransferScreen"
        >
          Zamknij
        </button>
      </div>

      <div class="mb-3 shrink-0 rounded-md bg-white/5 px-3 py-2 text-[13px] leading-relaxed max-md:text-xs">
        <p>Drewno: {{ ui.householdTransferScreen.household.wood }}</p>
        <p>Jedzenie: {{ ui.householdTransferScreen.household.food }}</p>
        <p>Woda: {{ ui.householdTransferScreen.household.water }}</p>
      </div>

      <section class="flex min-h-0 flex-1 flex-col">
        <h3 class="mb-2 shrink-0 text-[12px] font-semibold uppercase tracking-wide opacity-70 max-md:mb-1.5 max-md:text-[11px]">
          Przekaż z ekwipunku
        </h3>
        <div
          ref="playerPanel"
          class="flex flex-col gap-1.5 overflow-y-auto md:min-h-0 md:flex-1"
          style="touch-action: pan-y"
        >
          <div
            v-if="ui.householdTransferScreen.playerGroups.length === 0"
            class="text-[12px] opacity-60 max-md:text-[11px]"
          >
            Nie masz jedzenia ani drewna do przekazania.
          </div>
          <div
            v-for="group in ui.householdTransferScreen.playerGroups"
            :key="group.kind"
            class="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 max-md:px-2 max-md:py-1.5"
          >
            <span class="min-w-0 flex-1 truncate text-sm max-md:text-[13px]">
              {{ ITEM_DEFS[group.kind].label }} ×{{ group.count }}
            </span>
            <UiButton
              v-if="group.instances.length === 0"
              class="min-h-11 shrink-0 px-2.5 py-1 text-xs max-md:min-h-9"
              @click="deposit(group.kind, group.count)"
            >
              Przekaż →
            </UiButton>
          </div>
        </div>
      </section>

      <div class="mt-3 shrink-0 text-[11px] opacity-60 max-md:mt-2 max-md:text-[10px]">
        Esc — zamknij
      </div>
    </UiPanel>
  </div>
</template>
