<script setup lang="ts">
import { ref } from 'vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import { ITEM_METER_LABEL } from '../../items/inventoryView'
import { ITEM_DEFS, type ItemKind } from '../../items/items'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeNpcGiveItemScreen, isNpcGiveItemScreenOpen, openQuantityDialog, ui } from '../store'

useOverlayScreen('npcGiveItemScreen', isNpcGiveItemScreenOpen, closeNpcGiveItemScreen)

const playerPanel = ref<HTMLElement | null>(null)
useTouchScroll(playerPanel)

function give(kind: ItemKind, count: number): void {
  if (count <= 1) {
    ui.npcGiveItemScreen.onGive?.(kind, count)
    return
  }
  openQuantityDialog(`Daj: ${ITEM_DEFS[kind].label}`, count, (amount) => {
    ui.npcGiveItemScreen.onGive?.(kind, amount)
  })
}

function giveInstance(id: string): void {
  ui.npcGiveItemScreen.onGiveInstance?.(id)
}

function instanceLabel(kind: ItemKind, conditionPercent: number, meterKind: string | null, sharpnessPercent: number | null): string {
  const base = ITEM_DEFS[kind].label
  if (meterKind == null) return base
  const meter = `${ITEM_METER_LABEL[meterKind as 'condition' | 'durability' | 'fill']} ${conditionPercent}%`
  if (sharpnessPercent != null) return `${base} · ${meter} · Ostrość ${sharpnessPercent}%`
  return `${base} · ${meter}`
}
</script>

<template>
  <div
    v-if="ui.npcGiveItemScreen.open"
    class="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px] max-md:items-stretch max-md:p-2"
    @click.self="closeNpcGiveItemScreen"
  >
    <UiPanel
      class="flex h-[min(560px,calc(100dvh-32px))] w-[min(520px,calc(100vw-32px))] max-w-lg flex-col !overflow-hidden !p-5 max-md:h-[calc(100dvh-16px)] max-md:max-h-none max-md:w-full max-md:!p-3"
    >
      <div class="mb-3 flex shrink-0 items-baseline justify-between gap-2 max-md:mb-2">
        <h2 class="text-base font-semibold tracking-wide max-md:text-sm">
          Daj przedmiot — {{ ui.npcGiveItemScreen.npcName }}
        </h2>
        <button
          type="button"
          class="text-[12px] opacity-75 rounded-md px-2 py-1 border border-white/10 max-md:px-1.5 max-md:py-0.5 max-md:text-[11px]"
          @click="closeNpcGiveItemScreen"
        >
          Zamknij
        </button>
      </div>

      <section class="flex min-h-0 flex-1 flex-col">
        <h3 class="mb-2 shrink-0 text-[12px] font-semibold uppercase tracking-wide opacity-70 max-md:mb-1.5 max-md:text-[11px]">
          Twój ekwipunek
        </h3>
        <div
          ref="playerPanel"
          class="flex flex-col gap-1.5 overflow-y-auto md:min-h-0 md:flex-1"
          style="touch-action: pan-y"
        >
          <div
            v-if="ui.npcGiveItemScreen.playerGroups.length === 0"
            class="text-[12px] opacity-60 max-md:text-[11px]"
          >
            Ekwipunek jest pusty.
          </div>
          <div
            v-for="group in ui.npcGiveItemScreen.playerGroups"
            :key="group.kind"
            class="flex flex-col gap-1.5 rounded-md bg-white/5 px-3 py-2 max-md:px-2 max-md:py-1.5"
          >
            <template v-if="group.instances.length > 0">
              <div
                v-for="row in group.instances"
                :key="row.id"
                class="flex items-center gap-2"
              >
                <span class="min-w-0 flex-1 truncate text-sm max-md:text-[13px]">
                  {{ instanceLabel(group.kind, row.conditionPercent, row.meterKind, row.sharpnessPercent) }}
                </span>
                <UiButton
                  class="min-h-11 shrink-0 px-2.5 py-1 text-xs max-md:min-h-9"
                  @click="giveInstance(row.id)"
                >
                  Daj →
                </UiButton>
              </div>
            </template>
            <div
              v-else
              class="flex items-center gap-2"
            >
              <span class="min-w-0 flex-1 truncate text-sm max-md:text-[13px]">
                {{ ITEM_DEFS[group.kind].label }} ×{{ group.count }}
              </span>
              <UiButton
                class="min-h-11 shrink-0 px-2.5 py-1 text-xs max-md:min-h-9"
                @click="give(group.kind, group.count)"
              >
                Daj →
              </UiButton>
            </div>
          </div>
        </div>
      </section>

      <div class="mt-3 shrink-0 text-[11px] opacity-60 max-md:mt-2 max-md:text-[10px]">
        Esc — zamknij · przedmioty zostają własnością NPC
      </div>
    </UiPanel>
  </div>
</template>
