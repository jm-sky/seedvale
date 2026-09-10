<script setup lang="ts">
import { computed } from 'vue'
import UiPanel from '@/components/UiPanel.vue'
import { listActionablePlayerSkills } from '../../interaction/targetedSkillAction'
import { SKILL_LABEL, SKILL_USE, type SkillId } from '../../player/PlayerSkills'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { closeSkillsScreen, emitUiClick, getSkillValue, getSkillXp, isSkillsScreenOpen, ui } from '../store'

useOverlayScreen('skills', isSkillsScreenOpen, closeSkillsScreen)

const actionableSkills = listActionablePlayerSkills()

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

type SkillAccent = {
  bar: string
  selectedBorder: string
  selectedBg: string
  bullets: readonly string[]
  description?: string
}

const SKILL_ACCENT: Record<SkillId, SkillAccent> = {
  sneak: {
    bar: 'bg-emerald-400/80',
    selectedBorder: 'border-emerald-400/50 bg-emerald-400/15',
    selectedBg: 'bg-emerald-400 text-black',
    bullets: [],
    description: 'Wolniejszy ruch, trudniej Cię zauważyć zwierzętom. Rozwija się, gdy faktycznie się skradasz.',
  },
  survival: {
    bar: 'bg-amber-400/80',
    selectedBorder: '',
    selectedBg: '',
    bullets: [
      'Szybsze rozpalanie ogniska',
      'Szybsze rozstawianie namiotu',
      'Lepszy odpoczynek na samym kocu',
      'Bardziej sycące pieczone mięso',
    ],
  },
  traps: {
    bar: 'bg-sky-400/80',
    selectedBorder: 'border-sky-400/50 bg-sky-400/15',
    selectedBg: 'bg-sky-400 text-black',
    bullets: [
      'Zwierzęta rzadziej wypatrują zastawionej pułapki',
      'Poziom liczy się w chwili uzbrojenia pułapki',
      'Użyj na pułapce, aby ją sprawdzić',
    ],
  },
  defense: {
    bar: 'bg-rose-400/80',
    selectedBorder: '',
    selectedBg: '',
    bullets: [
      'Lepsza szansa na blok trzymanym przedmiotem',
      'Skuteczniejsza częściowa redukcja obrażeń',
    ],
  },
  archery: {
    bar: 'bg-lime-400/80',
    selectedBorder: '',
    selectedBg: '',
    bullets: ['Celniejsze strzały z łuku'],
  },
  riding: {
    bar: 'bg-violet-400/80',
    selectedBorder: '',
    selectedBg: '',
    bullets: [
      'Mniejsze ryzyko upadku z wierzchowca',
      'Mniejsze obrażenia przy upadku',
    ],
  },
  medicine: {
    bar: 'bg-teal-400/80',
    selectedBorder: 'border-teal-400/50 bg-teal-400/15',
    selectedBg: 'bg-teal-400 text-black',
    bullets: ['Leczenie ran i dolegliwości'],
  },
  repair: {
    bar: 'bg-orange-400/80',
    selectedBorder: 'border-orange-400/50 bg-orange-400/15',
    selectedBg: 'bg-orange-400 text-black',
    bullets: ['Naprawa narzędzi, pułapek i konstrukcji'],
  },
}

const cards = computed(() => actionableSkills.map((id) => ({
  id,
  use: SKILL_USE[id],
  label: SKILL_LABEL[id],
  level: percent(getSkillValue(id)),
  xp: Math.round(getSkillXp(id)),
  accent: SKILL_ACCENT[id],
  sneakActive: id === 'sneak' && ui.skillsScreen.sneakActive,
  selected: ui.skillsScreen.selectedSkill === id,
})))
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
        v-for="card in cards"
        :key="card.id"
        type="button"
        class="mt-3 w-full cursor-pointer rounded-md border px-3.5 py-3 text-left transition-colors first:mt-0"
        :class="card.use === 'stance'
          ? (card.sneakActive ? card.accent.selectedBorder : 'border-white/15 bg-transparent hover:bg-white/10')
          : (card.selected ? card.accent.selectedBorder : 'border-white/15 bg-transparent hover:bg-white/10')"
        @click="card.use === 'stance' ? toggleSneak() : selectTargeted(card.id)"
      >
        <span class="flex items-center justify-between">
          <span class="text-sm font-medium">{{ card.label }} · {{ card.level }}</span>
          <span
            class="ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide"
            :class="card.use === 'stance'
              ? (card.sneakActive ? card.accent.selectedBg : 'bg-white/15 text-ink/70')
              : (card.selected ? card.accent.selectedBg : 'bg-white/15 text-ink/70')"
          >
            <template v-if="card.use === 'stance'">
              {{ card.sneakActive ? 'Aktywne' : 'Wyłączone' }}
            </template>
            <template v-else>
              {{ card.selected ? 'Wybrane' : 'Użyj' }}
            </template>
          </span>
        </span>
        <span class="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <span
            class="block h-full rounded-full"
            :class="card.accent.bar"
            :style="{ width: card.level }"
          />
        </span>
        <span
          v-if="card.accent.description"
          class="mt-2 block text-xs opacity-70"
        >
          {{ card.accent.description }}
        </span>
        <ul
          v-else
          class="mt-2 list-disc space-y-0.5 pl-4 text-xs opacity-70"
        >
          <li
            v-for="bullet in card.accent.bullets"
            :key="bullet"
          >
            {{ bullet }}
          </li>
        </ul>
        <span class="mt-1 block text-[11px] opacity-50">
          Doświadczenie: {{ card.xp }}
        </span>
      </button>

      <div class="mt-4 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </UiPanel>
  </div>
</template>
