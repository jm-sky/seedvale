<script setup lang="ts">
import { Apple, BookOpen, Package, Sword, Wheat } from 'lucide-vue-next'
import { type Component, computed, ref } from 'vue'
import InventoryScreenSection from '@/components/InventoryScreenSection.vue'
import ItemsScreenItemButton from '@/components/ItemsScreenItemButton.vue'
import { useItemCategoryLabels } from '@/composables/useItemCategoryLabels'
import { firstUpperCase } from '@/lib/firstUpperCase'
import type { EquipmentSlot } from '../../items/equipment'
import { FOOD_SOURCE_SPECIES_LABEL, foodHungerRelief, FRESHNESS_STAGE_LABEL } from '../../items/foodFreshness'
import { isToolKind } from '../../items/HeldTool'
import { ITEM_METER_LABEL, type ItemMeterKind } from '../../items/inventoryView'
import { CAPABILITY_LABEL, isMeleeToolKind, isRangedTool } from '../../items/itemCatalog'
import { type BookTier, consumeNeedNoun, ITEM_CATALOG } from '../../items/itemCatalog'
import { itemDisplayName } from '../../items/itemDisplay'
import { isArmorKind, isWeaponMaintenanceKind } from '../../items/itemInstances'
import { ITEM_DEFS, type ItemCategory, type ItemDef, type ItemKind, primaryItemCategory } from '../../items/items'
import { resolveReadBookUseView } from '../../items/itemUseView'
import { isPrimaryMeleeAssignment, isPrimaryRangedAssignment } from '../../items/primaryWeapons'
import { tradeValue } from '../../items/tradeCatalog'
import { SKILL_LABEL } from '../../player/PlayerSkills'
import { trapKindForItem } from '../../world/animalTraps'
import { useTouchScroll } from '../composables/useTouchScroll'
import { getSkillValue, openQuantityDialog, showToast, ui } from '../store'

const BOOK_TIER_LABEL: Record<BookTier, string> = {
  basic: 'podstawowy',
  intermediate: 'średniozaawansowany',
  advanced: 'zaawansowany',
}

const props = defineProps<{
  selectedItem: ItemKind | null
}>()

const emit = defineEmits<{
  'return-to-list': []
}>()

const panel = ref<HTMLElement | null>(null)
const { categoryLabel } = useItemCategoryLabels()

const CATEGORY_ICON: Record<ItemCategory, Component> = {
  weapon: Sword,
  tool: Sword,
  resource: Wheat,
  utility: Package,
  food: Apple,
  knowledge: BookOpen,
}

const item = computed<ItemDef | null>(() => props.selectedItem ? ITEM_DEFS[props.selectedItem] : null)
const displayName = computed(() => props.selectedItem ? itemDisplayName(props.selectedItem) : '')
const group = computed(() => props.selectedItem
  ? ui.inventory.groups.find((entry) => entry.kind === props.selectedItem) ?? null
  : null)
const itemCount = computed<number>(() => group.value?.count ?? ui.inventory.counts[props.selectedItem as ItemKind ?? ''] ?? 0)
const catalogEntry = computed(() => props.selectedItem ? ITEM_CATALOG[props.selectedItem] : null)
const melee = computed(() => catalogEntry.value?.melee ?? null)
const meleeSpeed = computed<string | null>(() => {
  const m = melee.value
  if (!m) return null
  const cycle = m.windUp + m.hitWindow + m.recovery
  if (cycle < 0.35) return 'szybki'
  if (cycle < 0.55) return 'średni'
  return 'wolny'
})
const ranged = computed(() => catalogEntry.value?.ranged ?? null)
/** Ammo kind(s)/current count(s) for a held-ready ranged weapon (plan
 *  items-player-024) — derived from the ranged config's own `ammoKinds` plus
 *  live inventory counts, no separate combat/ammo state. */
const ammoText = computed<string | null>(() => {
  const r = ranged.value
  if (!r) return null
  return r.ammoKinds
    .map((kind) => `${ITEM_DEFS[kind].label}: ${ui.inventory.counts[kind] ?? 0}`)
    .join(' · ')
})
const armor = computed(() => catalogEntry.value?.armor ?? null)
const isArmorItem = computed(() => props.selectedItem != null && isArmorKind(props.selectedItem))
const equippedInstanceIdSet = computed(() => new Set(Object.values(ui.inventory.equippedSlots)))
function isArmorInstanceEquipped(id: string): boolean {
  return equippedInstanceIdSet.value.has(id)
}
const anyArmorEquipped = computed(() =>
  isArmorItem.value
  && (group.value?.instances.some((row) => isArmorInstanceEquipped(row.id)) ?? false),
)
const representativeArmorRow = computed(() => group.value?.instances[0] ?? null)
const percentDelta = (multiplier: number): string => {
  const delta = Math.round((multiplier - 1) * 100)
  return delta === 0 ? '±0%' : `${delta > 0 ? '+' : ''}${delta}%`
}
const consumable = computed(() => catalogEntry.value?.consumable ?? null)
/** "Zjedz"/"Wypij" availability (plan items-player-024) — null when `kind`
 *  isn't consumable; otherwise reflects spoiled food / an empty liquid
 *  container before the player ever clicks. */
const consumeUse = computed(() => group.value?.consumeUse ?? null)
const consumableRelief = computed(() => {
  if (!consumable.value || !props.selectedItem) return 0
  return foodHungerRelief(props.selectedItem, group.value?.sourceSpecies)
})
const freshnessLabel = computed(() => {
  const stage = group.value?.freshnessStage
  return stage ? FRESHNESS_STAGE_LABEL[stage] : null
})
const sourceSpeciesLabel = computed(() => {
  const species = group.value?.sourceSpecies
  return species ? FOOD_SOURCE_SPECIES_LABEL[species] : null
})
const book = computed(() => catalogEntry.value?.book ?? null)
const treasureMap = computed(() => catalogEntry.value?.treasureMap ?? null)
/** Live current value of the book's skill — `ui.skillsScreen` is pushed
 *  explicitly by `readBookItem` right after a successful read (plan
 *  items-player-016), so this stays fresh even while the inventory modal
 *  freezes the normal per-frame push. */
const bookSkillValue = computed<number | null>(() => book.value ? getSkillValue(book.value.skill) : null)
/** "Czytaj" availability (plan items-player-024) — null when `kind` isn't a
 *  book; disabled with a reason for "too advanced"/"already known" before
 *  the player clicks (`readBook()` itself is always a safe no-op either
 *  way, so this is purely upfront clarity, not a hard block). */
const readUse = computed(() => {
  const b = book.value
  const value = bookSkillValue.value
  return b && value != null ? resolveReadBookUseView(b, value) : null
})
const bookStateLabel = computed(() => readUse.value ? (readUse.value.reasonLabel || 'Możesz się nauczyć') : null)
const itemValue = computed<number>(() => item.value ? tradeValue(item.value.kind) : 0)
const itemCategoryText = computed(() => item.value ? item.value.categories.map((cat) => categoryLabel[cat]).join(' · ') : '')
const itemCategoryIcon = computed(() => item.value ? CATEGORY_ICON[primaryItemCategory(item.value)] : Sword)
const imageUrl = computed<string | null>(() => null)

const instanceRows = computed(() => {
  if (!group.value || group.value.instances.length === 0) return []
  const buckets = new Map<string, {
    count: number
    ids: string[]
    sellPrice: number
    meterKind: ItemMeterKind
    conditionPercent: number
    sharpnessPercent: number | null
    qualityLabel: string | null
    effectiveWeightKg: number | null
    protectionPercent: number | null
    staminaPenaltyLabel: string | null
    movementPenaltyLabel: string | null
    recoveryPenaltyLabel: string | null
    slotLabel: string | null
  }>()
  for (const row of group.value.instances) {
    const key = row.quality
      ? `quality:${row.quality}`
      : `${row.conditionPercent}:${row.sharpnessPercent ?? ''}`
    const existing = buckets.get(key)
    if (existing) {
      existing.count++
      existing.ids.push(row.id)
    } else {
      buckets.set(key, {
        count: 1,
        ids: [row.id],
        sellPrice: row.sellPrice,
        meterKind: row.meterKind,
        conditionPercent: row.conditionPercent,
        sharpnessPercent: row.sharpnessPercent,
        qualityLabel: row.qualityLabel ?? null,
        effectiveWeightKg: row.effectiveWeightKg ?? null,
        protectionPercent: row.protectionPercent ?? null,
        staminaPenaltyLabel: row.staminaPenaltyLabel ?? null,
        movementPenaltyLabel: row.movementPenaltyLabel ?? null,
        recoveryPenaltyLabel: row.recoveryPenaltyLabel ?? null,
        slotLabel: row.slotLabel ?? null,
      })
    }
  }
  return [...buckets.values()].sort((a, b) => {
    if (a.qualityLabel && b.qualityLabel) return a.qualityLabel.localeCompare(b.qualityLabel)
    return b.conditionPercent - a.conditionPercent
  })
})

/** Player-facing gameplay uses of this item (plan items-player-024) —
 *  `ITEM_CATALOG[kind].capabilities` stays the only source of truth; this
 *  only maps it to the same wording the merchant capability filter uses. */
const capabilityLabels = computed<string[]>(() => (catalogEntry.value?.capabilities ?? []).map((cap) => CAPABILITY_LABEL[cap]))

const whetstoneCount = computed<number>(() => ui.inventory.counts.whetstone ?? 0)
const merchantOpen = computed(() => ui.merchant.open)
const isPrimaryMelee = computed(() => props.selectedItem != null
  && ui.inventory.primaryMelee?.kind === props.selectedItem)
const isPrimaryRanged = computed(() => props.selectedItem != null
  && ui.inventory.primaryRanged?.kind === props.selectedItem)
const showSetPrimaryMelee = computed(() =>
  props.selectedItem != null
  && isMeleeToolKind(props.selectedItem)
  && !isWeaponMaintenanceKind(props.selectedItem)
  && !isPrimaryMelee.value)
const showSetPrimaryRanged = computed(() =>
  props.selectedItem != null
  && isRangedTool(props.selectedItem)
  && !isWeaponMaintenanceKind(props.selectedItem)
  && !isPrimaryRanged.value)

useTouchScroll(panel)

function formatWeight(kg: number): string { return `${kg.toFixed(1)} kg` }
/** "Wyrzuć" (plan items-player-024) — a single unit drops immediately; a
 *  stack of more than one opens the shared quantity dialog first. */
function onDrop(kind: ItemKind): void {
  const count = itemCount.value
  if (count <= 1) { ui.inventory.onDrop?.(kind, count); return }
  openQuantityDialog(`Wyrzuć: ${displayName.value}`, count, (amount) => ui.inventory.onDrop?.(kind, amount))
}
function onEquip(kind: ItemKind, instanceId?: string): void { ui.inventory.onEquip?.(kind, instanceId) }
function onUnequip(): void { ui.inventory.onUnequip?.() }
function onEquipArmor(instanceId: string): void { ui.inventory.onEquipArmor?.(instanceId) }
function onUnequipArmor(slot?: EquipmentSlot): void { ui.inventory.onUnequipArmor?.(slot) }
function isInstanceHeld(id: string): boolean {
  return ui.inventory.heldTool === props.selectedItem && ui.inventory.heldInstanceId === id
}
function onConsume(kind: ItemKind): void { ui.inventory.onConsume?.(kind) }
function onRead(kind: ItemKind): void { ui.inventory.onRead?.(kind) }
function percent(value: number): string { return `${Math.round(value * 100)}%` }
function onPlaceTrap(kind: ItemKind): void {
  const trapKind = trapKindForItem(kind)
  if (trapKind) ui.inventory.onPlaceTrap?.(trapKind)
}
function onPlaceContainer(): void { ui.inventory.onPlaceContainer?.() }
function onPlaceTent(): void { ui.inventory.onPlaceTent?.() }

function sellInstance(id: string): void {
  const result = ui.inventory.onSellInstances?.([id]) ?? 'invalid_offer'
  if (result === 'ok') return
  if (result === 'invalid_offer') showToast('Nie masz tego przedmiotu.', 'error')
  else if (result === 'full') showToast('Ekwipunek jest za ciężki.', 'error')
  else if (result === 'not_sold') showToast('Kupiec tego nie kupi.', 'error')
}

function sharpenInstance(id: string): void {
  const result = ui.inventory.onSharpen?.(id) ?? 'invalid'
  if (result === 'ok') return
  if (result === 'no_whetstone') showToast('Brak osełki.', 'error')
  else if (result === 'already_max') showToast('Ostrość jest już maksymalna.', 'error')
  else showToast('Nie można naostrzyć tej broni.', 'error')
}

function setPrimaryMelee(kind: ItemKind, instanceId: string | null = null): void {
  ui.inventory.onSetPrimaryMelee?.(kind, instanceId)
}

function setPrimaryRanged(kind: ItemKind, instanceId: string | null = null): void {
  ui.inventory.onSetPrimaryRanged?.(kind, instanceId)
}

function isInstancePrimaryMelee(id: string): boolean {
  return props.selectedItem != null && isPrimaryMeleeAssignment(props.selectedItem, id, ui.inventory.primaryMelee)
}

function isInstancePrimaryRanged(id: string): boolean {
  return props.selectedItem != null && isPrimaryRangedAssignment(props.selectedItem, id, ui.inventory.primaryRanged)
}
</script>

<template>
  <div
    v-if="ui.inventory.open && item"
    ref="panel"
    class="max-h-[calc(100dvh-32px)] w-full max-w-2xl overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
    style="touch-action: pan-y"
  >
    <div class="flex flex-row items-center justify-between gap-2">
      <h1 class="mb-2 text-xl font-semibold tracking-wide">
        {{ firstUpperCase(displayName) }}
      </h1>
      <button
        type="button"
        class="cursor-pointer rounded-md border border-white/20 bg-transparent px-2.5 py-1 text-xs hover:bg-white/10"
        @click="emit('return-to-list')"
      >
        Powrót
      </button>
    </div>

    <div class="my-4 h-px border-white/20 border-b" />

    <div class="my-4 flex h-28 items-center justify-center rounded-md bg-white/5">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="item.label"
        class="h-full w-full rounded-md object-cover"
      >
      <component
        :is="itemCategoryIcon"
        v-else
        :size="40"
        class="opacity-40"
      />
    </div>

    <div class="my-2">
      {{ item.description ?? `To jest... ${item.label}.` }}
    </div>

    <div class="my-4 h-px border-white/20 border-b" />

    <div class="grid grid-cols-2 gap-2 my-2">
      <InventoryScreenSection
        label="Kategoria"
        :value="itemCategoryText"
      />

      <InventoryScreenSection
        label="Ilość"
        :value="`×${itemCount}`"
      />

      <InventoryScreenSection
        label="Waga"
        :value="formatWeight(representativeArmorRow?.effectiveWeightKg ?? item.weight)"
      />

      <InventoryScreenSection
        label="Wartość"
        :value="`${itemValue} monet`"
      />

      <InventoryScreenSection
        v-if="melee"
        label="Obrażenia"
        :value="melee.damage.toString()"
      />

      <InventoryScreenSection
        v-if="melee"
        label="Zasięg"
        :value="`${melee.range.toFixed(1)} m`"
      />

      <InventoryScreenSection
        v-if="meleeSpeed"
        label="Szybkość ataku"
        :value="meleeSpeed"
      />

      <InventoryScreenSection
        v-if="ranged"
        label="Obrażenia"
        :value="ranged.damage.toString()"
      />

      <InventoryScreenSection
        v-if="ranged"
        label="Zasięg"
        :value="`${ranged.range.toFixed(1)} m`"
      />

      <InventoryScreenSection
        v-if="ammoText"
        label="Amunicja"
        :value="ammoText"
      />

      <InventoryScreenSection
        v-if="consumable"
        label="Efekt"
        :value="`+${consumableRelief} ${consumeNeedNoun(consumable.need)}`"
      />

      <InventoryScreenSection
        v-if="freshnessLabel"
        label="Świeżość"
        :value="freshnessLabel"
      />

      <InventoryScreenSection
        v-if="sourceSpeciesLabel"
        label="Źródło"
        :value="sourceSpeciesLabel"
      />

      <InventoryScreenSection
        v-if="book"
        label="Umiejętność"
        :value="`${SKILL_LABEL[book.skill]} · ${BOOK_TIER_LABEL[book.tier]}`"
      />

      <InventoryScreenSection
        v-if="book"
        label="Wymagane"
        :value="percent(book.requiredSkillValue)"
      />

      <InventoryScreenSection
        v-if="book && bookSkillValue != null"
        label="Twój poziom"
        :value="percent(bookSkillValue)"
      />

      <InventoryScreenSection
        v-if="book"
        label="Nauka do"
        :value="percent(book.targetSkillValue)"
      />

      <InventoryScreenSection
        v-if="book && bookStateLabel"
        label="Stan"
        :value="bookStateLabel"
      />

      <InventoryScreenSection
        v-if="isPrimaryMelee"
        label="Skrót"
        value="Podstawowa broń biała"
      />

      <InventoryScreenSection
        v-if="isPrimaryRanged"
        label="Skrót"
        value="Podstawowa broń dystansowa"
      />

      <InventoryScreenSection
        v-if="capabilityLabels.length > 0"
        label="Zastosowania"
        :value="capabilityLabels.join(' · ')"
      />

      <InventoryScreenSection
        v-if="representativeArmorRow?.slotLabel"
        label="Slot"
        :value="representativeArmorRow.slotLabel"
      />

      <InventoryScreenSection
        v-if="representativeArmorRow?.qualityLabel && instanceRows.length <= 1"
        label="Jakość"
        :value="representativeArmorRow.qualityLabel"
      />

      <InventoryScreenSection
        v-if="armor"
        label="Ochrona"
        :value="`${representativeArmorRow?.protectionPercent ?? Math.round(armor.damageReduction * 100)}%`"
      />

      <InventoryScreenSection
        v-if="armor"
        label="Wysiłek ataku"
        :value="representativeArmorRow?.staminaPenaltyLabel ?? percentDelta(armor.staminaCostMultiplier ?? 1)"
      />

      <InventoryScreenSection
        v-if="armor"
        label="Tempo ataku"
        :value="representativeArmorRow?.recoveryPenaltyLabel ?? percentDelta(armor.meleeRecoveryMultiplier ?? 1)"
      />

      <InventoryScreenSection
        v-if="armor"
        label="Ruch"
        :value="representativeArmorRow?.movementPenaltyLabel ?? percentDelta(armor.movementSpeedMultiplier ?? 1)"
      />

      <InventoryScreenSection
        v-if="anyArmorEquipped"
        label="Stan"
        value="Założona"
      />
    </div>

    <div
      v-if="instanceRows.length > 0"
      class="my-4"
    >
      <div class="mb-2 text-sm font-semibold">
        Lista
      </div>
      <div class="flex flex-col gap-2">
        <div
          v-for="row in instanceRows"
          :key="row.qualityLabel ? `quality:${row.qualityLabel}` : `${row.conditionPercent}:${row.sharpnessPercent}`"
          class="flex flex-row items-center justify-between gap-2 rounded-md bg-white/5 px-3 py-2 text-sm"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ row.count }}×</span>
            <span
              v-if="row.qualityLabel"
              class="rounded-full bg-white/10 -my-1 px-2.5 py-1 text-sm"
            >
              {{ row.qualityLabel }}
            </span>
            <span
              v-else
              class="rounded-full bg-white/10 -my-1 px-2.5 py-1 text-sm"
            >
              {{ ITEM_METER_LABEL[row.meterKind] }} {{ row.conditionPercent }}%
            </span>
            <span
              v-if="row.sharpnessPercent !== null"
              class="rounded-full bg-white/10 -my-1 px-2.5 py-1 text-sm"
            >
              Ostrość {{ row.sharpnessPercent }}%
            </span>
            <span
              v-if="row.effectiveWeightKg != null"
              class="rounded-full bg-white/10 -my-1 px-2.5 py-1 text-sm"
            >
              {{ formatWeight(row.effectiveWeightKg) }}
            </span>
          </div>
          <div
            v-for="(id, index) in row.ids"
            :key="id"
            class="flex flex-wrap items-center justify-between gap-2"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span
                v-if="row.ids.length > 1"
                class="text-[11px] opacity-60"
              >
                #{{ index + 1 }}
              </span>
              <span
                v-if="melee && isWeaponMaintenanceKind(item.kind) && isInstancePrimaryMelee(id)"
                class="rounded-full bg-primary/30 px-2 py-0.5 text-[11px] font-medium"
              >
                Podstawowa
              </span>
              <span
                v-if="ranged && isWeaponMaintenanceKind(item.kind) && isInstancePrimaryRanged(id)"
                class="rounded-full bg-primary/30 px-2 py-0.5 text-[11px] font-medium"
              >
                Podstawowa
              </span>
              <span
                v-if="isArmorItem && isArmorInstanceEquipped(id)"
                class="rounded-full bg-primary/30 px-2 py-0.5 text-[11px] font-medium"
              >
                Założona
              </span>
            </div>
            <div class="flex flex-wrap gap-2">
              <ItemsScreenItemButton
                v-if="isToolKind(item.kind) && !isInstanceHeld(id)"
                class="min-h-0 py-1"
                label="Weź"
                @click="onEquip(item.kind, id)"
              />
              <ItemsScreenItemButton
                v-if="isArmorItem && !isArmorInstanceEquipped(id)"
                class="min-h-0 py-1"
                label="Załóż"
                @click="onEquipArmor(id)"
              />
              <ItemsScreenItemButton
                v-if="isArmorItem && isArmorInstanceEquipped(id)"
                class="min-h-0 py-1"
                label="Zdejmij"
                @click="onUnequipArmor(armor?.slot)"
              />
              <ItemsScreenItemButton
                v-if="isToolKind(item.kind) && isInstanceHeld(id)"
                class="min-h-0 py-1"
                label="Odłóż"
                @click="onUnequip"
              />
              <ItemsScreenItemButton
                v-if="melee && isWeaponMaintenanceKind(item.kind) && !isInstancePrimaryMelee(id)"
                class="min-h-0 py-1"
                label="Ustaw podstawową"
                @click="setPrimaryMelee(item.kind, id)"
              />
              <ItemsScreenItemButton
                v-if="ranged && isWeaponMaintenanceKind(item.kind) && !isInstancePrimaryRanged(id)"
                class="min-h-0 py-1"
                label="Ustaw podstawową"
                @click="setPrimaryRanged(item.kind, id)"
              />
              <ItemsScreenItemButton
                v-if="row.sharpnessPercent !== null && row.sharpnessPercent < 100"
                class="min-h-0 py-1"
                :label="`Naostrz (${whetstoneCount})`"
                :disabled="whetstoneCount === 0"
                @click="sharpenInstance(id)"
              />
              <ItemsScreenItemButton
                v-if="merchantOpen"
                class="min-h-0 py-1"
                :label="`Sprzedaj (${row.sellPrice})`"
                @click="sellInstance(id)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="my-4 h-px border-white/20 border-b" />

    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mx-auto max-w-md">
      <ItemsScreenItemButton
        v-if="consumeUse"
        :label="consumeUse.reasonLabel ? `${consumeUse.label} — ${consumeUse.reasonLabel}` : consumeUse.label"
        :disabled="!consumeUse.enabled"
        @click="onConsume(item.kind)"
      />
      <ItemsScreenItemButton
        v-if="readUse"
        :label="readUse.reasonLabel ? `${readUse.label} — ${readUse.reasonLabel}` : readUse.label"
        :disabled="!readUse.enabled"
        @click="onRead(item.kind)"
      />
      <ItemsScreenItemButton
        v-if="treasureMap"
        label="Odczytaj"
        @click="onRead(item.kind)"
      />
      <ItemsScreenItemButton
        v-if="trapKindForItem(item.kind)"
        label="Zastaw"
        @click="onPlaceTrap(item.kind)"
      />
      <ItemsScreenItemButton
        v-if="item.kind === 'chest'"
        label="Postaw"
        @click="onPlaceContainer"
      />
      <ItemsScreenItemButton
        v-if="item.kind === 'tent'"
        label="Rozstaw"
        @click="onPlaceTent"
      />
      <ItemsScreenItemButton
        v-if="showSetPrimaryMelee"
        label="Ustaw jako podstawową broń białą"
        @click="setPrimaryMelee(item.kind)"
      />
      <ItemsScreenItemButton
        v-if="showSetPrimaryRanged"
        label="Ustaw jako podstawową broń dystansową"
        @click="setPrimaryRanged(item.kind)"
      />
      <ItemsScreenItemButton
        v-if="isToolKind(item.kind) && !isWeaponMaintenanceKind(item.kind) && ui.inventory.heldTool !== item.kind"
        label="Weź"
        @click="onEquip(item.kind)"
      />
      <ItemsScreenItemButton
        v-if="!isWeaponMaintenanceKind(item.kind) && ui.inventory.heldTool === item.kind"
        label="Odłóż"
        @click="onUnequip"
      />
      <ItemsScreenItemButton
        label="Wyrzuć"
        destructive
        @click="onDrop(item.kind)"
      />
    </div>
  </div>
</template>
