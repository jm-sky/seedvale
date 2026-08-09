<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { nearestArchetype } from '../ai/dialogue'
import { aboutSelfLine, aboutVillageLine, currentActivityLine, goodbyeLine } from '../ai/dialogueTemplates'
import { useOverlayScreen } from './composables/useOverlayScreen'
import { acceptNpcDialogueOffer, closeNpcDialogueMenu, isNpcDialogueMenuOpen, ui } from './store'

type Topic = 'aboutSelf' | 'aboutVillage' | 'currentActivity' | 'goodbye' | 'help'
const state = ui.npcDialogueMenu
const topic = ref<Topic | null>(null)
useOverlayScreen('npc-dialogue', isNpcDialogueMenuOpen, closeNpcDialogueMenu)
const archetype = computed(() => (state.npc ? nearestArchetype(state.npc.personality) : 'calm'))
const hasOffer = computed(() => state.helpResult?.offer != null)
const responseText = computed(() => {
  if (!state.npc || topic.value === null) return ''
  switch (topic.value) {
    case 'aboutSelf': return aboutSelfLine(state.npc.displayName, state.npc.role, state.npc.familyMembers, archetype.value)
    case 'aboutVillage': return state.settlement ? aboutVillageLine(state.settlement.name, state.settlement.size, state.settlement.terrain, state.settlement.foodSourceType, state.settlement.dominantResource, archetype.value) : ''
    case 'currentActivity': return currentActivityLine(state.npc.getCurrentActivity(state.timeOfDay), archetype.value)
    case 'goodbye': return goodbyeLine(archetype.value)
    case 'help': return state.helpResult?.line ?? ''
    default: return ''
  }
})
function openMenu(): void { topic.value = null }
function selectTopic(next: Topic): void { topic.value = next }
function accept(): void { acceptNpcDialogueOffer(); topic.value = null }
function close(): void { closeNpcDialogueMenu(); topic.value = null }
watch(() => state.open, (open) => { if (open) openMenu() })
</script>

<template>
  <div
    v-if="state.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="close"
  >
    <div
      class="max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-32px))] overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style="touch-action: pan-y"
    >
      <h2 class="mb-3 text-base font-semibold tracking-wide">
        {{ state.npc?.displayName }}
      </h2>
      <div
        v-if="topic === null"
        class="flex flex-col gap-2"
      >
        <button
          v-for="item in ([['help', 'Może w czymś ci pomóc?'], ['aboutSelf', 'Powiedz coś o sobie.'], ['currentActivity', 'Co teraz robisz?'], ['aboutVillage', 'Powiedz coś o wiosce.'], ['goodbye', 'Nic, miłego dnia!']] as const)"
          :key="item[0]"
          type="button"
          class="cursor-pointer rounded-md bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
          @click="selectTopic(item[0])"
        >
          {{ item[1] }}
        </button>
      </div>
      <div
        v-else
        class="flex flex-col gap-3"
      >
        <p class="text-sm leading-relaxed opacity-90">
          {{ responseText }}
        </p>
        <div
          v-if="topic === 'help' && hasOffer"
          class="flex gap-2"
        >
          <button
            type="button"
            class="flex-1 cursor-pointer rounded-md bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20"
            @click="accept"
          >
            Przyjmij
          </button>
          <button
            type="button"
            class="flex-1 cursor-pointer rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            @click="close"
          >
            Odmów
          </button>
        </div>
        <button
          v-else-if="topic === 'goodbye'"
          type="button"
          class="cursor-pointer rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          @click="close"
        >
          Zamknij
        </button>
        <button
          v-else
          type="button"
          class="cursor-pointer self-start rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          @click="openMenu"
        >
          Wróć
        </button>
      </div>
      <div class="mt-3 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </div>
  </div>
</template>
