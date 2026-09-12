<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { NpcAgent } from '../ai/NpcAgent'
import { nearestArchetype } from '../ai/dialogue'
import { aboutSelfLine, aboutVillageLine, currentActivityLine, goodbyeLine } from '../ai/dialogueTemplates'
import { useOverlayScreen } from './composables/useOverlayScreen'
import { acceptNpcDialogueOffer, closeNpcDialogueMenu, emitUiClick, isNpcDialogueMenuOpen, resolveNpcDialogueHelp, resolveNpcDialogueOpenTopic, selectNpcDialogueHelpAction, ui } from './store'

const BACKDROP_CLOSE_GUARD_MS = 300

type Topic = 'aboutSelf' | 'aboutVillage' | 'currentActivity' | 'goodbye' | 'help' | 'askSword' | 'requestFood' | 'requestWater' | 'aboutArea' | 'payment' | 'proposeJoin' | 'proposeJoinResult' | 'joinProposal'

/** Duration presets offered when the player proposes a voluntary expedition
 *  (plan npc-031) — presentation-only, mirrors the shape of the paid
 *  escort's own duration presets without importing anything from the Work
 *  Contract UI (voluntary joining has no economics to share with it). */
const JOIN_DURATION_OPTIONS = [
  { days: 0.5, label: 'pół dnia' },
  { days: 1, label: '1 dzień' },
  { days: 2, label: '2 dni' },
  { days: 3, label: '3 dni' },
] as const
const state = ui.npcDialogueMenu
const topic = ref<Topic | null>(null)
const openedAt = ref(0)

useOverlayScreen('npc-dialogue', isNpcDialogueMenuOpen, closeNpcDialogueMenu)

const archetype = computed(() => (state.npc ? nearestArchetype(state.npc.personality) : 'calm'))
const hasOffer = computed(() => state.helpResult?.offer != null)
const helpActions = computed(() => state.helpResult?.actions ?? [])
const isHomeTrader = computed(() => state.npc?.role === 'trader' && state.settlement?.isHome === true)
const isHomeGuard = computed(() => state.npc?.role === 'guard' && state.settlement?.isHome === true)
const swordLine = ref('')
const foodLine = ref('')
const waterLine = ref('')
const areaLine = ref('')
const paymentLine = ref('')
const joinProposeLine = ref('')
const joinProposalLine = ref('')
const discoveringArea = ref(false)

const responseText = computed(() => {
  if (!state.npc || topic.value === null) return ''
  switch (topic.value) {
    case 'aboutArea': return areaLine.value
    case 'aboutSelf': return aboutSelfLine(state.npc.displayName, state.npc.role, state.npc.familyMembers, archetype.value)
    case 'aboutVillage': return state.settlement ? aboutVillageLine(state.settlement.name, state.settlement.size, state.settlement.terrain, state.settlement.foodSourceType, state.settlement.dominantResource, archetype.value) : ''
    case 'askSword': return swordLine.value
    case 'currentActivity': return currentActivityLine(state.npc.getCurrentActivity(state.timeOfDay), archetype.value)
    case 'goodbye': return goodbyeLine(archetype.value)
    case 'help': return state.helpResult?.line ?? ''
    case 'joinProposal': return joinProposalLine.value || 'Chciałbym dołączyć do twojej wyprawy. Zabierzesz mnie?'
    case 'payment': return paymentLine.value || (
      state.paymentClaim
        ? `Za wykonaną pracę należy mi się ${state.paymentClaim.coins} monet.`
        : ''
    )
    case 'proposeJoinResult': return joinProposeLine.value
    case 'requestFood': return foodLine.value
    case 'requestWater': return waterLine.value
    default: return ''
  }
})

function resetMenu(): void {
  topic.value = null
  swordLine.value = ''
  foodLine.value = ''
  waterLine.value = ''
  areaLine.value = ''
  paymentLine.value = ''
  joinProposeLine.value = ''
  joinProposalLine.value = ''
}
function backToTopics(): void { emitUiClick(); resetMenu() }
function selectTopic(next: Topic): void {
  emitUiClick()
  if (next === 'help') resolveNpcDialogueHelp()
  topic.value = next
}

function selectHelpAction(index: number): void {
  emitUiClick()
  selectNpcDialogueHelpAction(index)
}

function askSword(): void {
  emitUiClick()
  swordLine.value = state.onAskSword?.() ?? ''
  topic.value = 'askSword'
  state.canAskSword = state.getCanAskSword?.() ?? false
}

function requestFood(): void {
  emitUiClick()
  const npc = state.npc as NpcAgent | null
  if (npc) foodLine.value = state.onRequestFood?.(npc) ?? ''
  topic.value = 'requestFood'
}

function requestWater(): void {
  emitUiClick()
  const npc = state.npc as NpcAgent | null
  if (npc) waterLine.value = state.onRequestWater?.(npc) ?? ''
  topic.value = 'requestWater'
}

async function askAboutArea(): Promise<void> {
  if (discoveringArea.value) return
  emitUiClick()
  discoveringArea.value = true
  try {
    areaLine.value = await state.onAskAboutArea?.() ?? ''
    topic.value = 'aboutArea'
  } finally {
    discoveringArea.value = false
  }
}

function payWage(): void {
  emitUiClick()
  paymentLine.value = state.onPayWage?.() ?? ''
  topic.value = 'payment'
}

function deferWage(): void {
  emitUiClick()
  resetMenu()
}

function openProposeJoin(): void {
  emitUiClick()
  topic.value = 'proposeJoin'
}

function proposeJoin(days: number): void {
  emitUiClick()
  joinProposeLine.value = state.onProposeJoin?.(days) ?? ''
  topic.value = 'proposeJoinResult'
}

function acceptJoinProposal(): void {
  emitUiClick()
  joinProposalLine.value = state.onRespondToJoinProposal?.(true) ?? ''
}

function declineJoinProposal(): void {
  emitUiClick()
  joinProposalLine.value = state.onRespondToJoinProposal?.(false) ?? ''
}

function openTrade(): void {
  emitUiClick()
  state.onOpenTrade?.()
}

function giveItem(): void {
  emitUiClick()
  state.onGiveItem?.()
}

function accept(): void {
  emitUiClick(); acceptNpcDialogueOffer()
  topic.value = null
}

function close(): void {
  emitUiClick(); closeNpcDialogueMenu()
  topic.value = null
}

function closeFromBackdrop(): void {
  if (performance.now() - openedAt.value < BACKDROP_CLOSE_GUARD_MS) return
  close()
}

watch(() => state.open, (open) => {
  if (!open) return

  openedAt.value = performance.now()
  resetMenu()
  const initialTopic = resolveNpcDialogueOpenTopic()
  if (initialTopic) topic.value = initialTopic
})
</script>

<template>
  <div
    v-if="state.open"
    class="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeFromBackdrop"
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
          v-if="isHomeTrader"
          type="button"
          class="cursor-pointer rounded-md bg-white/10 px-3 py-2 text-left text-sm font-medium hover:bg-white/20"
          @click="openTrade"
        >
          Handel
        </button>
        <button
          v-if="isHomeGuard && state.canAskSword"
          type="button"
          class="cursor-pointer rounded-md bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
          @click="askSword"
        >
          Poproś o miecz
        </button>
        <button
          v-if="isHomeGuard"
          type="button"
          class="cursor-pointer rounded-md bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
          :disabled="discoveringArea"
          @click="askAboutArea"
        >
          Opowiedz mi coś o okolicy.
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
          @click="giveItem"
        >
          Daj przedmiot
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
          @click="requestFood"
        >
          Poproś o jedzenie
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
          @click="requestWater"
        >
          Poproś o wodę
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
          @click="openProposeJoin"
        >
          Zaproponuj udział w wyprawie
        </button>
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
        v-else-if="topic === 'proposeJoin'"
        class="flex flex-col gap-2"
      >
        <p class="text-sm leading-relaxed opacity-90">
          Na jak długo chcesz zaproponować wspólną wyprawę?
        </p>
        <button
          v-for="opt in JOIN_DURATION_OPTIONS"
          :key="opt.days"
          type="button"
          class="cursor-pointer rounded-md bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
          @click="proposeJoin(opt.days)"
        >
          {{ opt.label }}
        </button>
        <button
          type="button"
          class="cursor-pointer self-start rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          @click="backToTopics"
        >
          Wróć
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
          v-if="topic === 'payment' && !paymentLine && state.paymentClaim"
          class="flex gap-2"
        >
          <button
            type="button"
            class="flex-1 cursor-pointer rounded-md bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20"
            @click="payWage"
          >
            Zapłać {{ state.paymentClaim.coins }}
          </button>
          <button
            type="button"
            class="flex-1 cursor-pointer rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            @click="deferWage"
          >
            Jeszcze nie
          </button>
        </div>
        <div
          v-else-if="topic === 'joinProposal' && !joinProposalLine && state.joinProposal"
          class="flex gap-2"
        >
          <button
            type="button"
            class="flex-1 cursor-pointer rounded-md bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20"
            @click="acceptJoinProposal"
          >
            Weź go ze sobą
          </button>
          <button
            type="button"
            class="flex-1 cursor-pointer rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            @click="declineJoinProposal"
          >
            Nie tym razem
          </button>
        </div>
        <div
          v-else-if="topic === 'help' && hasOffer"
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
        <div
          v-else-if="topic === 'help' && helpActions.length"
          class="flex flex-col gap-2"
        >
          <button
            v-for="(action, index) in helpActions"
            :key="index"
            type="button"
            class="cursor-pointer rounded-md bg-white/10 px-3 py-2 text-left text-sm font-medium hover:bg-white/20"
            @click="selectHelpAction(index)"
          >
            {{ action.label }}
          </button>
          <button
            type="button"
            class="cursor-pointer self-start rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            @click="backToTopics"
          >
            Wróć
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
          @click="backToTopics"
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
