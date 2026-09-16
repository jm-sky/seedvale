<script setup lang="ts">
import { Flag, Hammer, HandHelping, Handshake, Scale, Star } from 'lucide-vue-next'
import { computed } from 'vue'
import UiPanel from '@/components/UiPanel.vue'
import type { ModifierCategory } from '../../shared/effectivePhysicalAttributes'
import type { PhysicalAttributeId } from '../../shared/PhysicalAttributes'
import { EQUIPMENT_SLOT_LABEL } from '../../items/equipment'
import { SKILL_LABEL } from '../../player/PlayerSkills'
import CharacterModifierBadge from '../components/CharacterModifierBadge.vue'
import CharacterSection from '../components/CharacterSection.vue'
import CharacterSettlementSelect from '../components/CharacterSettlementSelect.vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { reputationPresentation } from '../reputationPresentation'
import { closeCharacterScreen, isCharacterScreenOpen, ui } from '../store'

useOverlayScreen('character', isCharacterScreenOpen, closeCharacterScreen)

/** Below this ratio a stat reads as critical — same 20% used by the fauna/NPC
 *  label bars this screen's colors are borrowed from (index.html). */
const CRITICAL_RATIO = 0.2

type StatRow = { key: string, label: string, current: number, max: number, color: string }

const ATTRIBUTE_LABEL: Record<PhysicalAttributeId, string> = {
  agility: 'Zręczność',
  endurance: 'Wytrzymałość',
  perception: 'Percepcja',
  strength: 'Siła',
}

const CONDITION_SECTION_LABEL: Record<ModifierCategory, string> = {
  effect: 'Efekty',
  fatigue: 'Zmęczenie',
  illness: 'Choroby',
  injury: 'Urazy',
}

const CONDITION_CATEGORY_ORDER: readonly ModifierCategory[] = [
  'illness',
  'injury',
  'fatigue',
  'effect',
]

const rows = computed<StatRow[]>(() => {
  const c = ui.characterScreen
  return [
    { key: 'hp', label: 'Zdrowie', current: c.hp.current, max: c.hp.max, color: '#e05555' },
    { key: 'stamina', label: 'Kondycja', current: c.stamina.current, max: c.stamina.max, color: '#e0c040' },
    { key: 'vigor', label: 'Wigor', current: c.vigor.current, max: c.vigor.max, color: '#5cbfa8' },
    { key: 'hunger', label: 'Głód', current: c.hunger.current, max: c.hunger.max, color: '#d4893a' },
    { key: 'thirst', label: 'Pragnienie', current: c.thirst.current, max: c.thirst.max, color: '#4a9fd8' },
  ]
})

const conditionGroups = computed(() => {
  const conditions = ui.characterScreen.presentation.conditions
  return CONDITION_CATEGORY_ORDER
    .map((category) => ({
      category,
      label: CONDITION_SECTION_LABEL[category],
      items: conditions.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0)
})

function ratio(row: StatRow): number { return row.max > 0 ? row.current / row.max : 0 }
function isCritical(row: StatRow): boolean { return ratio(row) <= CRITICAL_RATIO }

function formatSignedDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`
}

function formatConditionEffects(effects: readonly { id: PhysicalAttributeId, delta: number }[]): string {
  return effects
    .map((effect) => `${ATTRIBUTE_LABEL[effect.id]} ${formatSignedDelta(effect.delta)}`)
    .join(' · ')
}

const equipment = computed(() => ui.characterScreen.presentation.equipment)

function formatEquipmentPercent(fraction: number): string {
  const percent = Math.round(fraction * 100)
  if (percent === 0) return '0%'
  return percent > 0 ? `+${percent}%` : `−${Math.abs(percent)}%`
}

function formatDamageReduction(fraction: number): string {
  const percent = Math.round(fraction * 100)
  return `${percent}%`
}

function formatEquippedSlot(itemLabel: string | null, qualityLabel: string | null): string {
  if (!itemLabel) return '—'
  return qualityLabel ? `${itemLabel} · ${qualityLabel}` : itemLabel
}

/** Five reputation dimensions (plan quests-progression-001 §14) — each is
 *  its own `-100..100` value, deliberately never averaged into one score. */
const REPUTATION_ROWS = [
  { key: 'trust', label: 'Zaufanie', icon: Handshake, grammar: 'neuter' },
  { key: 'competence', label: 'Kompetencja', icon: Hammer, grammar: 'feminine' },
  { key: 'benevolence', label: 'Życzliwość', icon: HandHelping, grammar: 'feminine' },
  { key: 'courage', label: 'Odwaga', icon: Flag, grammar: 'feminine' },
  { key: 'integrity', label: 'Uczciwość', icon: Scale, grammar: 'feminine' },
] as const

const reputationRows = computed(() => {
  const rep = ui.characterScreen.reputation.selected?.reputation
  if (!rep) return []
  return REPUTATION_ROWS.map((row) => {
    const value = rep[row.key]
    const presentation = reputationPresentation(value, row.grammar)
    return {
      ...row,
      value,
      levelLabel: presentation.label,
      toneClass: presentation.toneClass,
    }
  })
})

function onSelectSettlement(settlementId: string): void {
  ui.characterScreen.onSelectSettlement?.(settlementId)
}
</script>

<template>
  <div
    v-if="ui.characterScreen.open"
    class="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeCharacterScreen"
  >
    <UiPanel class="max-w-3xl md:max-w-4xl">
      <h1 class="mb-4 text-lg font-semibold tracking-wide">
        Postać
      </h1>

      <div class="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
        <CharacterSection title="Stan">
          <div class="flex flex-col gap-3">
            <div
              v-for="row in rows"
              :key="row.key"
            >
              <div class="mb-1 flex items-baseline justify-between text-sm">
                <span :class="isCritical(row) ? 'font-semibold text-red-400' : ''">
                  {{ row.label }}
                  <span
                    v-if="isCritical(row)"
                    class="ml-1 text-[11px] font-normal uppercase tracking-wide"
                  >
                    krytyczne
                  </span>
                </span>
                <span class="text-xs opacity-70">{{ Math.round(row.current) }} / {{ Math.round(row.max) }}</span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-black/45">
                <div
                  class="h-full rounded-full transition-[width]"
                  :style="{ width: `${Math.round(ratio(row) * 100)}%`, background: isCritical(row) ? '#e05555' : row.color }"
                />
              </div>
            </div>
          </div>
        </CharacterSection>

        <CharacterSection title="Atrybuty">
          <div class="flex flex-col gap-2">
            <div
              v-for="row in ui.characterScreen.presentation.attributes"
              :key="row.id"
              class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"
            >
              <span>{{ ATTRIBUTE_LABEL[row.id] }}</span>
              <div class="flex min-w-0 flex-wrap items-baseline justify-end gap-1.5">
                <span class="text-xs opacity-70">{{ row.effective }} / {{ row.base }}</span>
                <CharacterModifierBadge
                  v-for="badge in row.modifiers"
                  :key="badge.category"
                  :category="badge.category"
                  :delta="badge.delta"
                />
              </div>
            </div>
          </div>
        </CharacterSection>

        <CharacterSection title="Umiejętności">
          <div class="flex flex-col gap-1.5">
            <div
              v-for="row in ui.characterScreen.presentation.skills"
              :key="row.id"
              class="flex items-baseline justify-between gap-3 text-sm"
            >
              <span>{{ SKILL_LABEL[row.id] }}</span>
              <span class="text-xs opacity-70">{{ row.value }}</span>
            </div>
          </div>
        </CharacterSection>

        <CharacterSection title="Pancerz">
          <div class="flex flex-col gap-2 text-sm">
            <div class="flex items-baseline justify-between gap-3">
              <span>Redukcja obrażeń</span>
              <span class="text-xs opacity-70">{{ formatDamageReduction(equipment.damageReduction) }}</span>
            </div>
            <div class="flex items-baseline justify-between gap-3">
              <span>Koszt kondycji ataku</span>
              <span class="text-xs opacity-70">{{ formatEquipmentPercent(equipment.attackStaminaDelta) }}</span>
            </div>
            <div class="flex items-baseline justify-between gap-3">
              <span>Odnowienie ataku</span>
              <span class="text-xs opacity-70">{{ formatEquipmentPercent(equipment.meleeRecoveryDelta) }}</span>
            </div>
            <div class="flex items-baseline justify-between gap-3">
              <span>Prędkość ruchu</span>
              <span class="text-xs opacity-70">{{ formatEquipmentPercent(equipment.movementSpeedDelta) }}</span>
            </div>
            <div class="flex items-baseline justify-between gap-3">
              <span>Koszt sprintu</span>
              <span class="text-xs opacity-70">{{ formatEquipmentPercent(equipment.sprintStaminaDelta) }}</span>
            </div>
            <div class="mt-2 border-t border-white/10 pt-2">
              <div class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-80">
                Wyposażone
              </div>
              <div
                v-for="row in equipment.slots"
                :key="row.slot"
                class="flex items-baseline justify-between gap-3 text-xs"
              >
                <span class="opacity-80">{{ EQUIPMENT_SLOT_LABEL[row.slot] }}</span>
                <span class="text-right opacity-70">{{ formatEquippedSlot(row.itemLabel, row.qualityLabel) }}</span>
              </div>
            </div>
          </div>
        </CharacterSection>

        <CharacterSection title="Stan zdrowia">
          <div
            v-if="conditionGroups.length === 0"
            class="text-xs opacity-60"
          >
            Brak aktywnych efektów
          </div>
          <div
            v-else
            class="flex flex-col gap-3"
          >
            <div
              v-for="group in conditionGroups"
              :key="group.category"
            >
              <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-80">
                {{ group.label }}
              </h3>
              <div
                v-for="item in group.items"
                :key="item.sourceId"
                class="text-sm"
              >
                <div>
                  {{ item.label }}<span
                    v-if="item.severityLabel"
                    class="opacity-80"
                  > — {{ item.severityLabel }}</span>
                </div>
                <div class="text-xs opacity-70">
                  {{ formatConditionEffects(item.effects) }}
                </div>
              </div>
            </div>
          </div>
        </CharacterSection>

        <CharacterSection
          class="md:col-span-2"
          title="Reputacja"
        >
          <div
            v-if="ui.characterScreen.reputation.settlements.length > 0"
            class="flex flex-col gap-2"
          >
            <CharacterSettlementSelect
              :options="ui.characterScreen.reputation.settlements"
              :selected-settlement-id="ui.characterScreen.reputation.selectedSettlementId"
              @select="onSelectSettlement"
            />
            <template v-if="ui.characterScreen.reputation.selected">
              <div
                v-for="row in reputationRows"
                :key="row.key"
                class="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs"
              >
                <span class="inline-flex min-w-0 items-center gap-1.5 opacity-80">
                  <component
                    :is="row.icon"
                    class="size-3.5 shrink-0 opacity-70"
                    aria-hidden="true"
                  />
                  {{ row.label }}
                </span>
                <span class="inline-flex shrink-0 items-center gap-2">
                  <span
                    :class="row.toneClass"
                    class="shrink-0"
                  >{{ row.levelLabel }}</span>
                  <span class="shrink-0 opacity-70">{{ row.value }}</span>
                </span>
              </div>
              <div class="mt-1 flex items-center justify-between text-xs">
                <span class="inline-flex items-center gap-1.5 opacity-80">
                  <Star
                    class="size-3.5 shrink-0 opacity-70"
                    aria-hidden="true"
                  />
                  Rozpoznawalność
                </span>
                <span class="opacity-70">{{ ui.characterScreen.reputation.selected.renown }}</span>
              </div>
            </template>
          </div>
          <div
            v-else
            class="text-xs opacity-60"
          >
            Brak lokalnej reputacji
          </div>

          <div
            v-if="ui.characterScreen.badges.length > 0"
            class="mt-3 border-t border-white/10 pt-3"
          >
            <div class="mb-2 text-sm">
              Znany z
            </div>
            <div class="flex flex-col gap-1.5">
              <div
                v-for="badge in ui.characterScreen.badges"
                :key="badge.id"
                class="text-xs"
                :title="badge.description"
              >
                <span class="mr-1">{{ badge.icon }}</span>
                <span class="opacity-90">{{ badge.label }}</span>
              </div>
            </div>
          </div>
        </CharacterSection>
      </div>

      <div class="mt-4 text-[11px] opacity-60">
        C / Esc — zamknij
      </div>
    </UiPanel>
  </div>
</template>
