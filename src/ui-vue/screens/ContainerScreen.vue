<script setup lang="ts">
import { ref } from 'vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import { ITEM_DEFS, type ItemKind } from '../../items/items'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeContainerScreen, isContainerScreenOpen, ui } from '../store'

useOverlayScreen('containerScreen', isContainerScreenOpen, closeContainerScreen)

const containerPanel = ref<HTMLElement | null>(null)
const playerPanel = ref<HTMLElement | null>(null)
useTouchScroll(containerPanel)
useTouchScroll(playerPanel)

function deposit(kind: ItemKind, count: number): void {
  ui.containerScreen.onDeposit?.(kind, count)
}
function withdraw(kind: ItemKind, count: number): void {
  ui.containerScreen.onWithdraw?.(kind, count)
}
function depositInstance(id: string): void {
  ui.containerScreen.onDepositInstance?.(id)
}
function withdrawInstance(id: string): void {
  ui.containerScreen.onWithdrawInstance?.(id)
}
</script>

<template>
  <div
    v-if="ui.containerScreen.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px] max-md:items-stretch max-md:p-2"
    @click.self="closeContainerScreen"
  >
    <UiPanel
      class="flex h-[min(680px,calc(100dvh-32px))] w-[min(880px,calc(100vw-32px))] max-w-4xl flex-col !overflow-hidden !p-5 max-md:h-[calc(100dvh-16px)] max-md:max-h-none max-md:w-full max-md:!p-3"
    >
      <div class="mb-3 flex shrink-0 items-baseline justify-between gap-2 max-md:mb-2">
        <h2 class="text-base font-semibold capitalize tracking-wide max-md:text-sm">
          {{ ui.containerScreen.label }}
        </h2>
        <div class="flex flex-row items-center gap-3 max-md:gap-2">
          <p class="text-[13px] opacity-75 max-md:text-xs">
            Pojemność: {{ ui.containerScreen.containerMaxSizeUnits }}
          </p>
          <button
            type="button"
            class="text-[12px] opacity-75 rounded-md px-2 py-1 border border-white/10 max-md:px-1.5 max-md:py-0.5 max-md:text-[11px]"
            @click="closeContainerScreen"
          >
            Zamknij
          </button>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
        <section class="flex min-w-0 flex-col md:min-h-0">
          <h3 class="mb-2 shrink-0 text-[12px] font-semibold uppercase tracking-wide opacity-70 max-md:mb-1.5 max-md:text-[11px]">
            W skrzyni
          </h3>
          <div
            ref="containerPanel"
            class="flex flex-col gap-1.5 overflow-y-auto md:min-h-0 md:flex-1"
            style="touch-action: pan-y"
          >
            <div
              v-if="ui.containerScreen.containerGroups.length === 0"
              class="text-[12px] opacity-60 max-md:text-[11px]"
            >
              Skrzynia jest pusta.
            </div>
            <div
              v-for="group in ui.containerScreen.containerGroups"
              :key="group.kind"
              class="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 max-md:px-2 max-md:py-1.5"
            >
              <span class="min-w-0 flex-1 truncate text-sm max-md:text-[13px]">
                {{ ITEM_DEFS[group.kind].label }} ×{{ group.count }}
              </span>
              <template v-if="group.instances.length > 0">
                <UiButton
                  v-for="row in group.instances"
                  :key="row.id"
                  class="min-h-11 shrink-0 px-2.5 py-1 text-xs max-md:min-h-9"
                  @click="withdrawInstance(row.id)"
                >
                  ← Zabierz
                </UiButton>
              </template>
              <UiButton
                v-else
                class="min-h-11 shrink-0 px-2.5 py-1 text-xs max-md:min-h-9"
                @click="withdraw(group.kind, group.count)"
              >
                ← Zabierz
              </UiButton>
            </div>
          </div>
        </section>

        <section class="flex min-w-0 flex-col md:min-h-0">
          <h3 class="mb-2 shrink-0 text-[12px] font-semibold uppercase tracking-wide opacity-70 max-md:mb-1.5 max-md:text-[11px]">
            U gracza
          </h3>
          <div
            ref="playerPanel"
            class="flex flex-col gap-1.5 overflow-y-auto md:min-h-0 md:flex-1"
            style="touch-action: pan-y"
          >
            <div
              v-if="ui.containerScreen.playerGroups.length === 0"
              class="text-[12px] opacity-60 max-md:text-[11px]"
            >
              Ekwipunek jest pusty.
            </div>
            <div
              v-for="group in ui.containerScreen.playerGroups"
              :key="group.kind"
              class="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 max-md:px-2 max-md:py-1.5"
            >
              <span class="min-w-0 flex-1 truncate text-sm max-md:text-[13px]">
                {{ ITEM_DEFS[group.kind].label }} ×{{ group.count }}
              </span>
              <template v-if="group.instances.length > 0">
                <UiButton
                  v-for="row in group.instances"
                  :key="row.id"
                  class="min-h-11 shrink-0 px-2.5 py-1 text-xs max-md:min-h-9"
                  @click="depositInstance(row.id)"
                >
                  Włóż →
                </UiButton>
              </template>
              <UiButton
                v-else
                class="min-h-11 shrink-0 px-2.5 py-1 text-xs max-md:min-h-9"
                @click="deposit(group.kind, group.count)"
              >
                Włóż →
              </UiButton>
            </div>
          </div>
        </section>
      </div>

      <div class="mt-3 shrink-0 text-[11px] opacity-60 max-md:mt-2 max-md:text-[10px]">
        Esc — zamknij
      </div>
    </UiPanel>
  </div>
</template>
