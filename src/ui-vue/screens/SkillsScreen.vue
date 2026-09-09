<script setup lang="ts">
import { computed } from 'vue'
import UiPanel from '@/components/UiPanel.vue'
import { SKILL_LABEL, type SkillId } from '../../player/PlayerSkills'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { closeSkillsScreen, emitUiClick, isSkillsScreenOpen, ui } from '../store'

useOverlayScreen('skills', isSkillsScreenOpen, closeSkillsScreen)

function toggleSneak(): void {
  emitUiClick()
  ui.skillsScreen.onToggleSneak?.()
}

function selectTargeted(id: SkillId): void {
  emitUiClick()
  ui.skillsScreen.onSelectTargetedSkill?.(id)
  closeSkillsScreen()
}

const percent = (value: number): string => `${Math.round(value * 100)}%`
const sneakLevel = computed(() => percent(ui.skillsScreen.sneakValue))
const survivalLevel = computed(() => percent(ui.skillsScreen.survivalValue))
const trapsLevel = computed(() => percent(ui.skillsScreen.trapsValue))
const defenseLevel = computed(() => percent(ui.skillsScreen.defenseValue))
const archeryLevel = computed(() => percent(ui.skillsScreen.archeryValue))
const ridingLevel = computed(() => percent(ui.skillsScreen.ridingValue))
const medicineLevel = computed(() => percent(ui.skillsScreen.medicineValue))
const repairLevel = computed(() => percent(ui.skillsScreen.repairValue))
</script>

<template>
  <div
    v-if="ui.skillsScreen.open"
    class="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeSkillsScreen"
  >
    <UiPanel>
      <h1 class="mb-4 text-lg font-semibold tracking-wide">
        Umiejętności
      </h1>

      <button
        type="button"
        class="w-full cursor-pointer rounded-md border px-3.5 py-3 text-left transition-colors"
        :class="ui.skillsScreen.sneakActive
          ? 'border-emerald-400/50 bg-emerald-400/15'
          : 'border-white/15 bg-transparent hover:bg-white/10'"
        @click="toggleSneak"
      >
        <span class="flex items-center justify-between">
          <span class="text-sm font-medium">{{ SKILL_LABEL.sneak }} · {{ sneakLevel }}</span>
          <span
            class="ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide"
            :class="ui.skillsScreen.sneakActive ? 'bg-emerald-400 text-black' : 'bg-white/15 text-ink/70'"
          >
            {{ ui.skillsScreen.sneakActive ? 'Aktywne' : 'Wyłączone' }}
          </span>
        </span>
        <span class="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <span
            class="block h-full rounded-full bg-emerald-400/80"
            :style="{ width: sneakLevel }"
          />
        </span>
        <span class="mt-2 block text-xs opacity-70">
          Wolniejszy ruch, trudniej Cię zauważyć zwierzętom. Rozwija się, gdy faktycznie się skradasz.
        </span>
        <span class="mt-1 block text-[11px] opacity-50">
          Doświadczenie: {{ Math.round(ui.skillsScreen.sneakXp) }}
        </span>
      </button>

      <div class="mt-3 rounded-md border border-white/15 px-3.5 py-3">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">{{ SKILL_LABEL.survival }} · {{ survivalLevel }}</span>
          <span class="ml-3 shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-ink/70">
            Pasywne
          </span>
        </div>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-amber-400/80"
            :style="{ width: survivalLevel }"
          />
        </div>
        <ul class="mt-2 list-disc space-y-0.5 pl-4 text-xs opacity-70">
          <li>Szybsze rozpalanie ogniska</li>
          <li>Szybsze rozstawianie namiotu</li>
          <li>Lepszy odpoczynek na samym kocu</li>
          <li>Bardziej sycące pieczone mięso</li>
        </ul>
        <div class="mt-1 text-[11px] opacity-50">
          Doświadczenie: {{ Math.round(ui.skillsScreen.survivalXp) }}
        </div>
      </div>

      <button
        type="button"
        class="mt-3 w-full cursor-pointer rounded-md border px-3.5 py-3 text-left transition-colors"
        :class="ui.skillsScreen.selectedSkill === 'traps'
          ? 'border-sky-400/50 bg-sky-400/15'
          : 'border-white/15 bg-transparent hover:bg-white/10'"
        @click="selectTargeted('traps')"
      >
        <span class="flex items-center justify-between">
          <span class="text-sm font-medium">{{ SKILL_LABEL.traps }} · {{ trapsLevel }}</span>
          <span
            class="ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide"
            :class="ui.skillsScreen.selectedSkill === 'traps' ? 'bg-sky-400 text-black' : 'bg-white/15 text-ink/70'"
          >
            {{ ui.skillsScreen.selectedSkill === 'traps' ? 'Wybrane' : 'Użyj' }}
          </span>
        </span>
        <span class="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <span
            class="block h-full rounded-full bg-sky-400/80"
            :style="{ width: trapsLevel }"
          />
        </span>
        <ul class="mt-2 list-disc space-y-0.5 pl-4 text-xs opacity-70">
          <li>Zwierzęta rzadziej wypatrują zastawionej pułapki</li>
          <li>Poziom liczy się w chwili uzbrojenia pułapki</li>
          <li>Użyj na pułapce, aby ją sprawdzić</li>
        </ul>
        <span class="mt-1 block text-[11px] opacity-50">
          Doświadczenie: {{ Math.round(ui.skillsScreen.trapsXp) }}
        </span>
      </button>

      <div class="mt-3 rounded-md border border-white/15 px-3.5 py-3">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">{{ SKILL_LABEL.defense }} · {{ defenseLevel }}</span>
          <span class="ml-3 shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-ink/70">
            Pasywne
          </span>
        </div>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-rose-400/80"
            :style="{ width: defenseLevel }"
          />
        </div>
        <ul class="mt-2 list-disc space-y-0.5 pl-4 text-xs opacity-70">
          <li>Lepsza szansa na blok trzymanym przedmiotem</li>
          <li>Skuteczniejsza częściowa redukcja obrażeń</li>
        </ul>
        <div class="mt-1 text-[11px] opacity-50">
          Doświadczenie: {{ Math.round(ui.skillsScreen.defenseXp) }}
        </div>
      </div>

      <div class="mt-3 rounded-md border border-white/15 px-3.5 py-3">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">{{ SKILL_LABEL.archery }} · {{ archeryLevel }}</span>
          <span class="ml-3 shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-ink/70">
            Pasywne
          </span>
        </div>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-lime-400/80"
            :style="{ width: archeryLevel }"
          />
        </div>
        <ul class="mt-2 list-disc space-y-0.5 pl-4 text-xs opacity-70">
          <li>Celniejsze strzały z łuku</li>
        </ul>
        <div class="mt-1 text-[11px] opacity-50">
          Doświadczenie: {{ Math.round(ui.skillsScreen.archeryXp) }}
        </div>
      </div>

      <div class="mt-3 rounded-md border border-white/15 px-3.5 py-3">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">{{ SKILL_LABEL.riding }} · {{ ridingLevel }}</span>
          <span class="ml-3 shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-ink/70">
            Pasywne
          </span>
        </div>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-violet-400/80"
            :style="{ width: ridingLevel }"
          />
        </div>
        <ul class="mt-2 list-disc space-y-0.5 pl-4 text-xs opacity-70">
          <li>Mniejsze ryzyko upadku z wierzchowca</li>
          <li>Mniejsze obrażenia przy upadku</li>
        </ul>
        <div class="mt-1 text-[11px] opacity-50">
          Doświadczenie: {{ Math.round(ui.skillsScreen.ridingXp) }}
        </div>
      </div>

      <button
        type="button"
        class="mt-3 w-full cursor-pointer rounded-md border px-3.5 py-3 text-left transition-colors"
        :class="ui.skillsScreen.selectedSkill === 'medicine'
          ? 'border-teal-400/50 bg-teal-400/15'
          : 'border-white/15 bg-transparent hover:bg-white/10'"
        @click="selectTargeted('medicine')"
      >
        <span class="flex items-center justify-between">
          <span class="text-sm font-medium">{{ SKILL_LABEL.medicine }} · {{ medicineLevel }}</span>
          <span
            class="ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide"
            :class="ui.skillsScreen.selectedSkill === 'medicine' ? 'bg-teal-400 text-black' : 'bg-white/15 text-ink/70'"
          >
            {{ ui.skillsScreen.selectedSkill === 'medicine' ? 'Wybrane' : 'Użyj' }}
          </span>
        </span>
        <span class="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <span
            class="block h-full rounded-full bg-teal-400/80"
            :style="{ width: medicineLevel }"
          />
        </span>
        <ul class="mt-2 list-disc space-y-0.5 pl-4 text-xs opacity-70">
          <li>Leczenie ran i dolegliwości</li>
        </ul>
        <span class="mt-1 block text-[11px] opacity-50">
          Doświadczenie: {{ Math.round(ui.skillsScreen.medicineXp) }}
        </span>
      </button>

      <button
        type="button"
        class="mt-3 w-full cursor-pointer rounded-md border px-3.5 py-3 text-left transition-colors"
        :class="ui.skillsScreen.selectedSkill === 'repair'
          ? 'border-orange-400/50 bg-orange-400/15'
          : 'border-white/15 bg-transparent hover:bg-white/10'"
        @click="selectTargeted('repair')"
      >
        <span class="flex items-center justify-between">
          <span class="text-sm font-medium">{{ SKILL_LABEL.repair }} · {{ repairLevel }}</span>
          <span
            class="ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide"
            :class="ui.skillsScreen.selectedSkill === 'repair' ? 'bg-orange-400 text-black' : 'bg-white/15 text-ink/70'"
          >
            {{ ui.skillsScreen.selectedSkill === 'repair' ? 'Wybrane' : 'Użyj' }}
          </span>
        </span>
        <span class="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <span
            class="block h-full rounded-full bg-orange-400/80"
            :style="{ width: repairLevel }"
          />
        </span>
        <ul class="mt-2 list-disc space-y-0.5 pl-4 text-xs opacity-70">
          <li>Naprawa narzędzi, pułapek i konstrukcji</li>
        </ul>
        <span class="mt-1 block text-[11px] opacity-50">
          Doświadczenie: {{ Math.round(ui.skillsScreen.repairXp) }}
        </span>
      </button>

      <div class="mt-4 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </UiPanel>
  </div>
</template>
