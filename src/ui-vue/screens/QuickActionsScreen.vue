<script setup lang="ts">
import { BedSingleIcon, BowArrow, BoxIcon, BuildingIcon, ClockIcon, FishingRod, FlameIcon, LockIcon, ScrollText, ShovelIcon, Sword, TractorIcon, TreesIcon, Zap } from 'lucide-vue-next'
import { type Component, computed, onUnmounted, ref, watch } from 'vue'
import QuickActionsGroup from '@/components/QuickActionsGroup.vue'
import type { PlacementPreviewKind } from '../../app/actions/placementPreviewActions'
import type { RestOutcome, RestVariant } from '../../ui/createQuickActions'
import type { TrapKind } from '../../world/animalTraps'
import type { CropId } from '../../world/cropLifecycle'
import { isTouchDevice } from '../../input/isTouchDevice'
import QuickActionsButton from '../components/QuickActionsButton.vue'
import SkillsHudButton from '../components/SkillsHudButton.vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { FIRE_COST_ITEMS, formatCostItems, visibleFireActions } from '../playerQuickActions'
import {
  backToQuickActionsCategories,
  closeQuickActions,
  equipPrimaryMelee,
  equipPrimaryRanged,
  isQuickActionsOpen,
  type QuickActionsCategoryId,
  selectQuickActionsCategory,
  showToast,
  toggleQuickActions,
  ui,
} from '../store'

const panel = ref<HTMLElement | null>(null)
const touchDevice = isTouchDevice()

useOverlayScreen('quick-actions', isQuickActionsOpen, closeQuickActions)
useTouchScroll(panel)

const restStatusText: Record<Exclude<RestOutcome, 'ok' | 'choose'>, string> = {
  'too-far': 'Musisz być bliżej wioski',
  'no-blanket': 'Potrzebujesz koca',
  'no-lodging': 'Nie znaleziono noclegu',
}

// "Zbuduj palenisko" moved under "Budowa" only, as a placement-preview
// action (plan `ui-input-004` §2/§3) — Pause → Akcje keeps both as instant
// actions via its own separate `ui.pauseMenu` handlers/list. "Zbuduj
// ognisko" stays in both Budowa (placement preview) and Ogień (this instant
// entry) per plan items-player-012 — same `buildSimpleFire` action/cost
// either way, just two different entry points into it.
const fireActions = computed(() =>
  visibleFireActions(ui.quickActions.fireAvailability, ui.quickActions)
    .filter((action) => action.id !== 'buildFirePit'),
)

function startPlacementPreview(kind: PlacementPreviewKind): void {
  closeQuickActions()
  ui.quickActions.onStartPlacementPreview?.(kind)
}

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
  if (result === 'ok' || result === 'choose') {
    closeQuickActions()
    return
  }
  showToast(restStatusText[result], 'error')
}

function placeTrap(kind: TrapKind): void {
  closeQuickActions()
  ui.quickActions.onPlaceTrap?.(kind)
}

function putDownContainer(): void {
  closeQuickActions()
  ui.quickActions.onPutDownContainer?.()
}

function dig(): void {
  closeQuickActions()
  ui.quickActions.onDig?.()
}

function level(): void {
  closeQuickActions()
  ui.quickActions.onLevel?.()
}

function mound(): void {
  closeQuickActions()
  ui.quickActions.onMound?.()
}

function prepareTerrain(): void {
  closeQuickActions()
  ui.quickActions.onPrepareTerrain?.()
}

function buildWell(): void {
  closeQuickActions()
  ui.quickActions.onBuildWell?.()
}

function buildGarden(): void {
  closeQuickActions()
  ui.quickActions.onBuildGarden?.()
}

function plantTree(): void {
  closeQuickActions()
  ui.quickActions.onPlantTree?.()
}

function plantCrop(cropId: CropId): void {
  closeQuickActions()
  ui.quickActions.onPlantCrop?.(cropId)
}

function equipFishingRod(): void {
  closeQuickActions()
  ui.quickActions.onEquipFishingRod?.()
}

function cancelWorkContract(id: string): void {
  ui.quickActions.onCancelWorkContract?.(id)
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
  { label: 'Zrób górkę', cost: 'łopata', onClick: mound },
  { label: 'Zbuduj studnię', cost: 'łopata', onClick: buildWell },
  { label: 'Zbuduj grządkę', cost: 'łopata', onClick: buildGarden },
]

const terrainActions: Action[] = [
  { label: 'Przygotuj teren', cost: 'łopata', onClick: prepareTerrain },
]

// "Postaw skrzynię"/"Rozstaw namiot"/"Zbuduj ognisko"/"Zbuduj palenisko" —
// the shared placement-preview actions grouped under "Budowa" (plan
// `ui-input-004` §2/§3/§7).
const buildActions = computed<Action[]>(() => {
  const list: Action[] = []
  if (ui.quickActions.hasChest) {
    list.push({ label: 'Postaw skrzynię', cost: '1× skrzynia', onClick: () => startPlacementPreview('chest') })
  }
  if (ui.quickActions.hasTent) {
    list.push({ label: 'Rozstaw namiot', cost: '1× namiot', onClick: () => startPlacementPreview('tent') })
  }
  if (ui.quickActions.fireAvailability.buildSimpleFire.available) {
    list.push({ label: 'Zbuduj ognisko', cost: formatCostItems(FIRE_COST_ITEMS.buildSimpleFire), onClick: () => startPlacementPreview('fireSimple') })
  }
  if (ui.quickActions.fireAvailability.buildFirePit.available) {
    list.push({ label: 'Zbuduj palenisko', cost: formatCostItems(FIRE_COST_ITEMS.buildFirePit), onClick: () => startPlacementPreview('firePit') })
  }
  if (ui.quickActions.hasWoodenTorch) {
    list.push({ label: 'Postaw pochodnię', cost: '1× belka, 1× pochodnia', onClick: () => startPlacementPreview('standingTorch') })
  }
  if (ui.quickActions.hasPalisadeMaterial) {
    list.push({ label: 'Postaw segment palisady', cost: '2× belka', onClick: () => startPlacementPreview('palisade') })
  }
  if (ui.quickActions.hasBedrollMaterial) {
    list.push({ label: 'Rozłóż posłanie', cost: '3× skóra', onClick: () => startPlacementPreview('bedroll') })
  }
  if (ui.quickActions.hasPlatformMaterial) {
    list.push({ label: 'Zbuduj podest do spania', cost: '6× gałąź', onClick: () => startPlacementPreview('platform') })
  }

  list.push({ label: 'Zbuduj studnię', cost: 'łopata', onClick: buildWell })
  list.push({ label: 'Zbuduj grządkę', cost: 'łopata', onClick: buildGarden })

  // "Zleć budowę" (plan npc-014) — always available, no material cost; the
  // reward is chosen after the target is placed, not spent up front.
  list.push({ label: 'Zleć budowę', cost: '', onClick: () => startPlacementPreview('workContract') })
  return list
})

const CROP_SEED_LABEL: Record<CropId, string> = {
  carrot: 'Zasadź: marchew',
  potato: 'Zasadź: ziemniak',
  cabbage: 'Zasadź: kapustę',
}

const plantActions = computed<Action[]>(() => {
  const list: Action[] = []
  if (ui.quickActions.hasTreeSeed) {
    list.push({ label: 'Zasadź drzewo', cost: '1× nasiono drzewa', onClick: plantTree })
  }
  for (const cropId of ['carrot', 'potato', 'cabbage'] as const) {
    if (!ui.quickActions.cropSeeds[cropId]) continue
    list.push({ label: CROP_SEED_LABEL[cropId], cost: '1× nasiona', onClick: () => plantCrop(cropId) })
  }
  return list
})

// Quick Actions category hierarchy (plan `ui-input-004` §3) — a presentation
// layer over the same existing action lists above; category visibility just
// mirrors each list/flag's own existing v-if condition. Selecting a category
// drills in (`ui.quickActions.category`); "Wróć" returns to this root.
const CATEGORY_LABEL: Record<QuickActionsCategoryId, string> = {
  budowa: 'Budowa',
  ogien: 'Ogień',
  lopata: 'Łopata',
  teren: 'Teren',
  pulapki: 'Pułapki',
  sadzenie: 'Sadzenie',
  wedkarstwo: 'Wędkarstwo',
  czekaj: 'Czekaj',
  skrzynia: 'Skrzynia',
  odpoczynek: 'Odpoczynek',
  zlecenia: 'Zlecenia',
}

const categories = computed(() => (
  [
    { id: 'budowa', visible: buildActions.value.length > 0, icon: BuildingIcon },
    { id: 'ogien', visible: fireActions.value.length > 0, icon: FlameIcon },
    { id: 'lopata', visible: ui.quickActions.hasDiggingTool, icon: ShovelIcon },
    { id: 'teren', visible: ui.quickActions.hasDiggingTool, icon: TractorIcon },
    { id: 'pulapki', visible: trapActions.value.length > 0, icon: LockIcon },
    { id: 'sadzenie', visible: plantActions.value.length > 0, icon: TreesIcon },
    { id: 'wedkarstwo', visible: ui.quickActions.hasFishingRod, icon: FishingRod },
    { id: 'czekaj', visible: true, icon: ClockIcon },
    { id: 'skrzynia', visible: ui.quickActions.hasCarriedContainer, icon: BoxIcon },
    { id: 'odpoczynek', visible: true, icon: BedSingleIcon },
    { id: 'zlecenia', visible: ui.quickActions.workContracts.length > 0, icon: ScrollText },
  ] as const satisfies readonly { id: QuickActionsCategoryId, visible: boolean, icon: Component }[]
).filter((c) => c.visible))
</script>

<template>
  <div
    v-if="!touchDevice"
    class="pointer-events-none fixed z-8 flex flex-col items-center gap-2"
    style="right: max(20px, env(safe-area-inset-right)); bottom: max(20px, env(safe-area-inset-bottom))"
  >
    <SkillsHudButton />
    <button
      v-if="ui.hud.primaryRangedLabel"
      type="button"
      class="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-black/40 text-ink hover:bg-black/60"
      :aria-label="`Broń dystansowa: ${ui.hud.primaryRangedLabel}`"
      @click="equipPrimaryRanged"
    >
      <BowArrow :size="20" />
    </button>
    <button
      v-if="ui.hud.primaryMeleeLabel"
      type="button"
      class="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-black/40 text-ink hover:bg-black/60"
      :aria-label="`Broń biała: ${ui.hud.primaryMeleeLabel}`"
      @click="equipPrimaryMelee"
    >
      <Sword :size="20" />
    </button>
    <button
      type="button"
      class="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-black/40 text-ink hover:bg-black/60"
      aria-label="Szybkie działania"
      @click="toggleQuickActions"
    >
      <Zap :size="22" />
    </button>
  </div>
  <div
    v-if="ui.quickActions.open"
    ref="panel"
    class="border border-white/20 pointer-events-auto fixed z-9 flex flex-col flex-nowrap content-start gap-2 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg p-2 backdrop-blur-xs"
    :class="touchDevice ? '' : 'max-h-[calc(100dvh-220px)] w-[min(420px,calc(100vw-40px))]'"
    :style="touchDevice
      ? {
        top: 'max(12px, env(safe-area-inset-top))',
        left: 'max(12px, env(safe-area-inset-left))',
        right: 'max(12px, env(safe-area-inset-right))',
        bottom: 'max(12px, calc(env(safe-area-inset-bottom) + 100px))',
        touchAction: 'pan-y',
      }
      : {
        top: 'max(12px, env(safe-area-inset-top))',
        bottom: 'max(168px, calc(env(safe-area-inset-bottom) + 148px))',
        right: 'max(20px, env(safe-area-inset-right))',
        touchAction: 'pan-y',
      }"
    @click.stop
  >
    <!-- Root: category picker (plan `ui-input-004` §3). -->
    <QuickActionsGroup v-if="!ui.quickActions.category">
      <QuickActionsButton
        v-for="category in categories"
        :key="category.id"
        :label="CATEGORY_LABEL[category.id]"
        :icon="category.icon"
        @click="selectQuickActionsCategory(category.id)"
      />
    </QuickActionsGroup>

    <!-- Drilled-in: one category's actions + an unambiguous way back
         (implementation notes §6/mobile touch-scroll unaffected). -->
    <template v-else>
      <QuickActionsGroup>
        <QuickActionsButton
          label="← Wróć"
          @click="backToQuickActionsCategories"
        />
      </QuickActionsGroup>

      <QuickActionsGroup
        v-if="ui.quickActions.category === 'budowa'"
        label="Budowa"
      >
        <QuickActionsButton
          v-for="action in buildActions"
          :key="action.label"
          :label="action.label"
          :cost="action.cost"
          @click="action.onClick"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="ui.quickActions.category === 'ogien'"
        label="Ogień"
      >
        <QuickActionsButton
          v-for="action in fireActions"
          :key="action.id"
          :label="action.label"
          :cost="action.cost"
          :disabled="!action.available"
          @click="runFireAction(action.run)"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="ui.quickActions.category === 'lopata'"
        label="Łopata"
      >
        <QuickActionsButton
          v-for="action in shovelActions"
          :key="action.label"
          :label="action.label"
          :cost="action.cost"
          @click="action.onClick"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="ui.quickActions.category === 'teren'"
        label="Teren"
      >
        <QuickActionsButton
          v-for="action in terrainActions"
          :key="action.label"
          :label="action.label"
          :cost="action.cost"
          @click="action.onClick"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="ui.quickActions.category === 'pulapki'"
        label="Pułapki"
      >
        <QuickActionsButton
          v-for="action in trapActions"
          :key="action.label"
          :label="action.label"
          :cost="action.cost"
          @click="action.onClick"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="ui.quickActions.category === 'sadzenie'"
        label="Sadzenie"
      >
        <QuickActionsButton
          v-for="action in plantActions"
          :key="action.label"
          :label="action.label"
          :cost="action.cost"
          @click="action.onClick"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="ui.quickActions.category === 'wedkarstwo'"
        label="Wędkarstwo"
      >
        <QuickActionsButton
          label="Łów ryby"
          @click="equipFishingRod"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="ui.quickActions.category === 'czekaj'"
        label="Czekaj"
      >
        <QuickActionsButton
          v-for="hours in [1, 2, 4, 6]"
          :key="hours"
          :label="`${hours}h`"
          @click="wait(hours)"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="ui.quickActions.category === 'skrzynia'"
        label="Skrzynia"
      >
        <QuickActionsButton
          label="Odłóż skrzynię"
          @click="putDownContainer"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="ui.quickActions.category === 'odpoczynek'"
        label="Odpoczynek"
      >
        <QuickActionsButton
          label="Rozbij obóz (8h)"
          @click="rest('camp')"
        />
        <QuickActionsButton
          v-if="ui.quickActions.nearTown"
          label="Nocuj w mieście"
          @click="rest('town')"
        />
      </QuickActionsGroup>
      <QuickActionsGroup
        v-if="ui.quickActions.category === 'zlecenia'"
        label="Zlecenia"
      >
        <QuickActionsButton
          v-for="contract in ui.quickActions.workContracts"
          :key="contract.id"
          :label="contract.label"
          :cost="contract.cost"
          @click="cancelWorkContract(contract.id)"
        />
      </QuickActionsGroup>
    </template>
  </div>
</template>
