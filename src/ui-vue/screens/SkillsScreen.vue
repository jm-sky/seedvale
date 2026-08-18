<script setup lang="ts">
import { computed } from 'vue'
import UiPanel from '@/components/UiPanel.vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { closeSkillsScreen, emitUiClick, isSkillsScreenOpen, ui } from '../store'

useOverlayScreen('skills', isSkillsScreenOpen, closeSkillsScreen)

function toggleSneak(): void {
  emitUiClick()
  ui.skillsScreen.onToggleSneak?.()
}

const percent = (value: number): string => `${Math.round(value * 100)}%`
const sneakLevel = computed(() => percent(ui.skillsScreen.sneakValue))
const survivalLevel = computed(() => percent(ui.skillsScreen.survivalValue))
const trapsLevel = computed(() => percent(ui.skillsScreen.trapsValue))
</script>

<template>
  <div
    v-if="ui.skillsScreen.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
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
          <span class="text-sm font-medium">Skradanie się · {{ sneakLevel }}</span>
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
          <span class="text-sm font-medium">Sztuka przetrwania · {{ survivalLevel }}</span>
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

      <div class="mt-3 rounded-md border border-white/15 px-3.5 py-3">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">Pułapki · {{ trapsLevel }}</span>
          <span class="ml-3 shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-ink/70">
            Pasywne
          </span>
        </div>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-sky-400/80"
            :style="{ width: trapsLevel }"
          />
        </div>
        <ul class="mt-2 list-disc space-y-0.5 pl-4 text-xs opacity-70">
          <li>Zwierzęta rzadziej wypatrują zastawionej pułapki</li>
          <li>Poziom liczy się w chwili uzbrojenia pułapki</li>
        </ul>
        <div class="mt-1 text-[11px] opacity-50">
          Doświadczenie: {{ Math.round(ui.skillsScreen.trapsXp) }}
        </div>
      </div>

      <div class="mt-4 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </UiPanel>
  </div>
</template>
