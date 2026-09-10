<script setup lang="ts">
import { computed, ref } from 'vue'
import ItemsScreenItemButton from '@/components/ItemsScreenItemButton.vue'
import { useItemCategoryLabels } from '@/composables/useItemCategoryLabels'
import { isToolKind } from '../../items/HeldTool'
import { type InventoryInstanceRow, ITEM_METER_LABEL } from '../../items/inventoryView'
import { isMeleeToolKind, isRangedTool, ITEM_CATALOG } from '../../items/itemCatalog'
import { itemDisplayName } from '../../items/itemDisplay'
import { isWeaponMaintenanceKind } from '../../items/itemInstances'
import { hasItemCategory, ITEM_DEFS, type ItemCategory, type ItemKind, primaryItemCategory } from '../../items/items'
import { isPrimaryMeleeAssignment, isPrimaryRangedAssignment } from '../../items/primaryWeapons'
import { trapKindForItem } from '../../world/animalTraps'
import { useTouchScroll } from '../composables/useTouchScroll'
import { openQuantityDialog, ui } from '../store'

const panel = ref<HTMLElement | null>(null)

const { categoryLabel } = useItemCategoryLabels()

type CategoryFilter = 'all' | ItemCategory
type SortMode = 'category' | 'name' | 'qty'

const CATEGORY_ORDER: readonly ItemCategory[] = ['weapon', 'tool', 'knowledge', 'food', 'utility', 'resource']
const SORT_LABEL: Record<SortMode, string> = { category: 'Kategoria', name: 'Nazwa', qty: 'Ilość' }

const filter = ref<CategoryFilter>('all')
const sortMode = ref<SortMode>('category')

const allItems = computed(() => ui.inventory.groups.map((group) => ({
  kind: group.kind,
  def: ITEM_DEFS[group.kind],
  displayName: itemDisplayName(group.kind),
  count: group.count,
  condition: group.condition,
  uniformConditionPercent: group.uniformConditionPercent,
  meterKind: group.meterKind,
  instances: group.instances,
  consumeUse: group.consumeUse,
  book: ITEM_CATALOG[group.kind].book ?? null,
})))

const availableCategories = computed(() => CATEGORY_ORDER.filter((cat) => allItems.value.some((item) => hasItemCategory(item.def, cat))))

const items = computed(() => {
  const filtered = filter.value === 'all'
    ? allItems.value
    : allItems.value.filter((item) => hasItemCategory(item.def, filter.value as ItemCategory))
  const sorted = [...filtered]
  if (sortMode.value === 'name') sorted.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pl'))
  else if (sortMode.value === 'qty') sorted.sort((a, b) => b.count - a.count)
  else sorted.sort((a, b) => CATEGORY_ORDER.indexOf(primaryItemCategory(a.def)) - CATEGORY_ORDER.indexOf(primaryItemCategory(b.def)) || a.displayName.localeCompare(b.displayName, 'pl'))
  return sorted
})

function categoryLabels(def: (typeof allItems.value)[number]['def']): string {
  return def.categories.map((cat) => categoryLabel[cat]).join(' · ')
}

function conditionLabel(item: (typeof allItems.value)[number]): string | null {
  if (!item.meterKind) return null
  if (item.condition === 'mixed') return `${ITEM_METER_LABEL[item.meterKind]}: różne stany`
  if (item.condition === 'uniform' && item.uniformConditionPercent != null) {
    return `${ITEM_METER_LABEL[item.meterKind]} ${item.uniformConditionPercent}%`
  }
  return null
}

const emit = defineEmits<{
  'select-item': [item: ItemKind],
}>()

useTouchScroll(panel)

function formatWeight(kg: number): string { return `${kg.toFixed(1)} kg` }
/** "Wyrzuć" (plan items-player-024) — a single unit drops immediately; a
 *  stack of more than one opens the shared quantity dialog first. */
function onDrop(kind: ItemKind, count: number): void {
  if (count <= 1) { ui.inventory.onDrop?.(kind, count); return }
  openQuantityDialog(`Wyrzuć: ${itemDisplayName(kind)}`, count, (amount) => ui.inventory.onDrop?.(kind, amount))
}
function onEquip(kind: ItemKind): void { ui.inventory.onEquip?.(kind) }
function onUnequip(): void { ui.inventory.onUnequip?.() }
function onConsume(kind: ItemKind): void { ui.inventory.onConsume?.(kind) }
function onRead(kind: ItemKind): void { ui.inventory.onRead?.(kind) }
function onPlaceTrap(kind: ItemKind): void {
  const trapKind = trapKindForItem(kind)
  if (trapKind) ui.inventory.onPlaceTrap?.(trapKind)
}
function onPlaceContainer(): void { ui.inventory.onPlaceContainer?.() }
function onPlaceTent(): void { ui.inventory.onPlaceTent?.() }

function resolvePrimaryInstanceId(kind: ItemKind, instances: readonly InventoryInstanceRow[]): string | null {
  if (!isWeaponMaintenanceKind(kind)) return null
  return instances[0]?.id ?? null
}

function isPrimaryMeleeItem(kind: ItemKind): boolean {
  const choice = ui.inventory.primaryMelee
  if (!choice || choice.kind !== kind) return false
  if (isWeaponMaintenanceKind(kind)) return true
  return isPrimaryMeleeAssignment(kind, null, choice)
}

function isPrimaryRangedItem(kind: ItemKind): boolean {
  const choice = ui.inventory.primaryRanged
  if (!choice || choice.kind !== kind) return false
  if (isWeaponMaintenanceKind(kind)) return true
  return isPrimaryRangedAssignment(kind, null, choice)
}

function canSetPrimaryMelee(kind: ItemKind): boolean {
  return isMeleeToolKind(kind) && !isPrimaryMeleeItem(kind)
}

function canSetPrimaryRanged(kind: ItemKind): boolean {
  return isRangedTool(kind) && !isPrimaryRangedItem(kind)
}

function setPrimaryMelee(kind: ItemKind, instances: readonly InventoryInstanceRow[]): void {
  ui.inventory.onSetPrimaryMelee?.(kind, resolvePrimaryInstanceId(kind, instances))
}

function setPrimaryRanged(kind: ItemKind, instances: readonly InventoryInstanceRow[]): void {
  ui.inventory.onSetPrimaryRanged?.(kind, resolvePrimaryInstanceId(kind, instances))
}
</script>

<template>
  <div
    ref="panel"
    class="max-h-[calc(100dvh-32px)] w-full max-w-3xl overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
    style="touch-action: pan-y"
  >
    <h1 class="mb-2 text-lg font-semibold tracking-wide">
      Ekwipunek
    </h1>
    <div class="mb-3 text-[13px] opacity-75">
      Waga: {{ formatWeight(ui.inventory.totalWeight) }} / {{ formatWeight(ui.inventory.maxWeight) }}
      · Pojemność: {{ ui.inventory.totalSize }} / {{ ui.inventory.maxSize }}
      <span
        v-if="ui.inventory.heldTool"
        class="ml-2 opacity-90"
      >
        · w ręce: {{ ITEM_DEFS[ui.inventory.heldTool].label }}
      </span>
    </div>
    <div
      v-if="availableCategories.length > 1"
      class="mb-3 flex items-center gap-2"
    >
      <div class="flex flex-1 min-w-0 gap-1 overflow-x-auto">
        <button
          type="button"
          class="shrink-0 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wide cursor-pointer"
          :class="filter === 'all' ? 'bg-primary/40 text-ink' : 'bg-white/5 opacity-70 hover:opacity-100'"
          @click="filter = 'all'"
        >
          Wszystko
        </button>
        <button
          v-for="cat in availableCategories"
          :key="cat"
          type="button"
          class="shrink-0 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wide cursor-pointer"
          :class="filter === cat ? 'bg-primary/40 text-ink' : 'bg-white/5 opacity-70 hover:opacity-100'"
          @click="filter = cat"
        >
          {{ categoryLabel[cat] }}
        </button>
      </div>
      <select
        v-model="sortMode"
        class="shrink-0 rounded-md bg-white/5 px-2 py-1 text-[11px] uppercase tracking-wide"
      >
        <option
          v-for="(label, mode) in SORT_LABEL"
          :key="mode"
          :value="mode"
        >
          {{ label }}
        </option>
      </select>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
      <div
        v-if="items.length === 0"
        class="text-[13px] opacity-60"
      >
        {{ allItems.length === 0 ? 'Ekwipunek jest pusty.' : 'Brak przedmiotów w tej kategorii.' }}
      </div>
      <div
        v-for="item in items"
        :key="item.kind"
        class="flex flex-col gap-1 rounded-md bg-white/5 p-3 border"
        :class="ui.inventory.heldTool === item.kind ? 'border-primary/50' : 'border-transparent'"
      >
        <button
          type="button"
          class="cursor-pointer flex items-baseline justify-between hover:text-primary"
          @click="emit('select-item', item.kind)"
        >
          <span class="text-sm font-semibold flex flex-wrap items-center gap-1.5">
            <span>{{ item.count }} × {{ item.displayName }}</span>
            <span
              v-if="conditionLabel(item)"
              class="text-[11px] font-normal opacity-70"
            >{{ conditionLabel(item) }}</span>
            <span
              v-if="isPrimaryMeleeItem(item.kind)"
              class="rounded-full bg-primary/30 px-2 py-0.5 text-[10px] font-medium"
            >
              Podstawowa
            </span>
            <span
              v-if="isPrimaryRangedItem(item.kind)"
              class="rounded-full bg-primary/30 px-2 py-0.5 text-[10px] font-medium"
            >
              Podstawowa
            </span>
          </span>
          <span class="text-[11px] uppercase tracking-wide opacity-60">
            {{ categoryLabels(item.def) }}
          </span>
        </button>
        <div class="text-xs opacity-70">
          {{ formatWeight(item.def.weight) }} szt. · {{ formatWeight(item.def.weight * item.count) }} razem
        </div>
        <div class="mt-1 -mb-1 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center justify-start gap-2">
            <ItemsScreenItemButton
              v-if="item.consumeUse"
              class="min-h-0 py-1"
              :label="item.consumeUse.reasonLabel ? `${item.consumeUse.label} — ${item.consumeUse.reasonLabel}` : item.consumeUse.label"
              :disabled="!item.consumeUse.enabled"
              @click="onConsume(item.kind)"
            />
            <ItemsScreenItemButton
              v-if="item.book"
              class="min-h-0 py-1"
              label="Czytaj"
              @click="onRead(item.kind)"
            />
            <ItemsScreenItemButton
              v-if="trapKindForItem(item.kind)"
              class="min-h-0 py-1"
              label="Zastaw"
              @click="onPlaceTrap(item.kind)"
            />
            <ItemsScreenItemButton
              v-if="item.kind === 'chest'"
              class="min-h-0 py-1"
              label="Postaw"
              @click="onPlaceContainer"
            />
            <ItemsScreenItemButton
              v-if="item.kind === 'tent'"
              class="min-h-0 py-1"
              label="Rozstaw"
              @click="onPlaceTent"
            />
            <ItemsScreenItemButton
              v-if="isToolKind(item.kind) && ui.inventory.heldTool !== item.kind"
              class="min-h-0 py-1"
              label="Weź"
              @click="onEquip(item.kind)"
            />
            <ItemsScreenItemButton
              v-if="ui.inventory.heldTool === item.kind"
              class="min-h-0 py-1"
              label="Odłóż"
              @click="onUnequip"
            />
            <ItemsScreenItemButton
              v-if="canSetPrimaryMelee(item.kind)"
              class="min-h-0 py-1"
              label="Ustaw podstawową"
              @click="setPrimaryMelee(item.kind, item.instances)"
            />
            <ItemsScreenItemButton
              v-if="canSetPrimaryRanged(item.kind)"
              class="min-h-0 py-1"
              label="Ustaw podstawową"
              @click="setPrimaryRanged(item.kind, item.instances)"
            />
          </div>
          <div class="flex items-center justify-end gap-2">
            <ItemsScreenItemButton
              class="min-h-0 py-1"
              label="Wyrzuć"
              destructive
              @click="onDrop(item.kind, item.count)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
