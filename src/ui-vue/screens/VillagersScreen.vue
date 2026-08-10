<script setup lang="ts">
import { ChevronLeft, ChevronRight, Fish, Mars, Sprout, Venus, Wheat } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { Role, Trait } from '../../ai/characters'
import type { NpcAgent } from '../../ai/NpcAgent'
import type { FamilyRelation } from '../../settlement/families'
import type { FoodSourceType } from '../../settlement/settlementGenerator'
import { nearestArchetype, type Personality } from '../../ai/dialogue'
import { needLabel } from '../../ai/Needs'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeVillagers, isVillagersOpen, setVillagersPage, ui, VILLAGERS_PAGE_SIZE } from '../store'

const ROLE_LABEL: Record<Role, string> = {
  woodcutter: 'Drwal',
  farmer: 'Rolnik',
  guard: 'Strażnik',
  trader: 'Kupiec',
  miner: 'Górnik',
  fisher: 'Rybak',
}

const PERSONALITY_LABEL: Record<Personality, string> = {
  cheerful: 'Wesoły',
  calm: 'Spokojny',
  grumpy: 'Zrzędliwy',
  curious: 'Ciekawski',
}

const TRAIT_LABEL: Record<Trait, string> = {
  fast_worker: 'Szybki w pracy',
  energetic: 'Energiczny',
  night_owl: 'Nocny Marek',
  sociable: 'Towarzyski',
}

/** Empty for `single` — a lone resident isn't part of a couple/family unit. */
const RELATION_LABEL: Record<FamilyRelation, string> = {
  husband: 'mąż',
  wife: 'żona',
  child: 'dziecko',
  single: '',
}

const FOOD_SOURCE_LABEL: Record<FoodSourceType, string> = {
  field: 'Pola',
  fishing: 'Rybołówstwo',
  foraging: 'Zbieractwo',
  garden: 'Ogród',
}
const FOOD_SOURCE_ICON: Record<FoodSourceType, typeof Wheat> = {
  field: Wheat,
  fishing: Fish,
  foraging: Sprout,
  garden: Sprout,
}

const state = ui.villagers
useOverlayScreen('villagers', isVillagersOpen, closeVillagers)

const panel = ref<HTMLElement | null>(null)
useTouchScroll(panel)

const showSettlement = computed(() => new Set(state.entries.map((e) => e.settlementName)).size > 1)
const totalPages = computed(() => Math.max(1, Math.ceil(state.entries.length / VILLAGERS_PAGE_SIZE)))
const pageEntries = computed(() =>
  state.entries.slice(state.page * VILLAGERS_PAGE_SIZE, (state.page + 1) * VILLAGERS_PAGE_SIZE),
)

function hpPercent(npc: NpcAgent): number {
  return Math.round((npc.health.currentHp / npc.health.maxHp) * 100)
}

function prevPage(): void {
  if (state.page > 0) setVillagersPage(state.page - 1)
}

function nextPage(): void {
  if (state.page < totalPages.value - 1) setVillagersPage(state.page + 1)
}
</script>

<template>
  <div
    v-if="state.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeVillagers"
  >
    <div
      ref="panel"
      class="max-h-[calc(100dvh-32px)] w-full max-w-3xl overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style="touch-action: pan-y"
    >
      <h1 class="mb-3 text-lg font-semibold tracking-wide">
        Mieszkańcy
      </h1>

      <div
        v-if="state.entries.length === 0"
        class="opacity-70"
      >
        Brak mieszkańców.
      </div>

      <div
        v-for="{ npc, settlementName, foodSourceType } in pageEntries"
        :key="npc.name + settlementName"
        class="mb-2 rounded-md bg-white/5 p-3"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="flex items-center gap-1 font-medium">
            {{ npc.displayName }}
            <Venus
              v-if="npc.gender === 'female'"
              :size="14"
            />
            <Mars
              v-else
              :size="14"
            />
          </span>
          <span class="text-xs opacity-70">{{ ROLE_LABEL[npc.role] }}</span>
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-1 text-xs opacity-80">
          <span>{{ PERSONALITY_LABEL[nearestArchetype(npc.personality)] }}</span>
          <span>· {{ needLabel(npc.getActiveNeed()) }}</span>
          <span v-if="RELATION_LABEL[npc.relation]">· {{ RELATION_LABEL[npc.relation] }}</span>
          <span
            v-if="showSettlement"
            class="ml-1 flex items-center gap-1"
          >
            · {{ settlementName }}
            <component
              :is="FOOD_SOURCE_ICON[foodSourceType]"
              :size="12"
            />
            {{ FOOD_SOURCE_LABEL[foodSourceType] }}
          </span>
        </div>
        <div
          class="mt-2 h-1.5 overflow-hidden rounded-full bg-black/40"
          :title="`${npc.health.currentHp}/${npc.health.maxHp} HP`"
        >
          <div
            class="h-full bg-emerald-500"
            :style="{ width: hpPercent(npc) + '%' }"
          />
        </div>
        <div class="mt-2 flex flex-wrap gap-1">
          <span
            v-if="npc.traits.length === 0"
            class="rounded bg-white/5 px-1.5 py-0.5 text-[11px] opacity-60"
          >brak cech</span>
          <span
            v-for="t in npc.traits"
            :key="t"
            class="rounded bg-white/10 px-1.5 py-0.5 text-[11px]"
          >{{ TRAIT_LABEL[t] }}</span>
        </div>
      </div>

      <div
        v-if="totalPages > 1"
        class="mt-2 flex items-center justify-center gap-3 text-sm"
      >
        <button
          type="button"
          class="cursor-pointer rounded-md bg-white/5 p-1.5 disabled:cursor-default disabled:opacity-30"
          :disabled="state.page === 0"
          @click="prevPage"
        >
          <ChevronLeft :size="16" />
        </button>
        <span class="opacity-70">{{ state.page + 1 }} / {{ totalPages }}</span>
        <button
          type="button"
          class="cursor-pointer rounded-md bg-white/5 p-1.5 disabled:cursor-default disabled:opacity-30"
          :disabled="state.page >= totalPages - 1"
          @click="nextPage"
        >
          <ChevronRight :size="16" />
        </button>
      </div>

      <div class="mt-3 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </div>
  </div>
</template>
