import type { Inventory } from './Inventory'
import type { ItemKind } from './items'
import {
  type FoodSourceSpecies,
  type FreshnessStage,
  getFoodBatchFreshnessStage,
} from './foodFreshness'
import {
  INSTANCE_BACKED_KINDS,
  isLiquidContainerInstance,
  isTentItemInstance,
  isTrapItemInstance,
  isWeaponItemInstance,
  type ItemInstance,
  type LiquidContainerItemInstance,
} from './itemInstances'
import { type ItemUseView, resolveConsumeUseView } from './itemUseView'
import { liquidContainerCapacity } from './liquidContainer'
import { resolveInstanceSellPrice } from './tradeCatalog'
import { trapConditionPercent } from './trapItemInstances'
import { weaponDurabilityPercent, weaponSharpnessPercent } from './weaponMaintenance'

/** What an instance row's `conditionPercent` actually measures — the UI must
 *  never render a bare `%` without knowing which of these it is (plan
 *  items-player-024). `sharpnessPercent` stays its own field (only weapons
 *  carry it independently of `conditionPercent`/durability). */
export type ItemMeterKind = 'condition' | 'durability' | 'fill'

/** Player-facing label for `ItemMeterKind` — shared by every screen that
 *  renders an instance/group meter so "Stan"/"Napełnienie" wording can't
 *  drift between Inventory, Container and Merchant presentations. */
export const ITEM_METER_LABEL: Record<ItemMeterKind, string> = {
  condition: 'Stan',
  durability: 'Stan',
  fill: 'Napełnienie',
}

export type InventoryInstanceRow = {
  id: string
  /** What `conditionPercent` means for this row — see `ItemMeterKind`. */
  meterKind: ItemMeterKind
  /** Trap/tent: overall condition. Weapon: durability. Liquid container: fill. */
  conditionPercent: number
  /** Weapon instances only — sharpness is shown/sharpened independently of
   *  `conditionPercent` (durability). */
  sharpnessPercent: number | null
  sellPrice: number
}

export type InventoryGroupView = {
  kind: ItemKind
  count: number
  /** `uniform` = one condition label; `mixed` = multiple conditions; `null` = count-only stackable. */
  condition: 'uniform' | 'mixed' | null
  /** Set when `condition === 'uniform'` — e.g. 100 for full durability traps. */
  uniformConditionPercent: number | null
  /** What `uniformConditionPercent`/each row's `conditionPercent` means — null
   *  for a count-only stackable group (no instances, no meter at all). */
  meterKind: ItemMeterKind | null
  instances: readonly InventoryInstanceRow[]
  /** FIFO perishable batch at `nowDays` — presentation only (plan items-player-002). */
  freshnessStage?: FreshnessStage
  sourceSpecies?: FoodSourceSpecies
  /** "Zjedz"/"Wypij" availability (plan items-player-024) — null when `kind`
   *  has no `ITEM_CATALOG[kind].consumable` entry at all. Presentation only;
   *  `survivalActions.ts`'s `consumeItem()` re-validates at execution time. */
  consumeUse: ItemUseView | null
}

function buildTrapGroup(kind: ItemKind, instances: readonly ItemInstance[]): InventoryGroupView | null {
  const traps = instances.filter(isTrapItemInstance)
  if (traps.length === 0) return null
  const rows: InventoryInstanceRow[] = traps.map((inst) => ({
    id: inst.id,
    meterKind: 'condition',
    conditionPercent: trapConditionPercent(inst),
    sharpnessPercent: null,
    sellPrice: resolveInstanceSellPrice(inst) ?? 0,
  }))
  const percents = rows.map((r) => r.conditionPercent)
  const allSame = percents.every((p) => p === percents[0])
  return {
    kind,
    count: rows.length,
    condition: allSame ? 'uniform' : 'mixed',
    uniformConditionPercent: allSame ? percents[0]! : null,
    meterKind: 'condition',
    instances: rows,
    consumeUse: null,
  }
}

/** Plan 161 — mirrors `buildTrapGroup`; `conditionPercent` carries durability,
 *  `sharpnessPercent` sharpness, so "uniform" only collapses when both match. */
function buildWeaponGroup(kind: ItemKind, instances: readonly ItemInstance[]): InventoryGroupView | null {
  const weapons = instances.filter(isWeaponItemInstance)
  if (weapons.length === 0) return null
  const rows: InventoryInstanceRow[] = weapons.map((inst) => ({
    id: inst.id,
    meterKind: 'durability',
    conditionPercent: weaponDurabilityPercent(inst),
    sharpnessPercent: weaponSharpnessPercent(inst),
    sellPrice: resolveInstanceSellPrice(inst) ?? 0,
  }))
  const first = rows[0]!
  const allSame = rows.every((r) => r.conditionPercent === first.conditionPercent && r.sharpnessPercent === first.sharpnessPercent)
  return {
    kind,
    count: rows.length,
    condition: allSame ? 'uniform' : 'mixed',
    uniformConditionPercent: allSame ? first.conditionPercent : null,
    meterKind: 'durability',
    instances: rows,
    consumeUse: null,
  }
}

/** Percent-full reading for a liquid container's fill level. */
function liquidFillPercent(instance: LiquidContainerItemInstance): number {
  const capacity = liquidContainerCapacity(instance.kind)
  if (capacity <= 0) return 0
  return Math.round((instance.amountLitres / capacity) * 100)
}

/** Plan items-player-001 — mirrors `buildTrapGroup`; `conditionPercent` reads
 *  as fill percentage (`sharpnessPercent` stays null, not applicable). */
function buildLiquidContainerGroup(kind: ItemKind, instances: readonly ItemInstance[], inventory: Inventory, nowDays: number): InventoryGroupView | null {
  const containers = instances.filter(isLiquidContainerInstance)
  if (containers.length === 0) return null
  const rows: InventoryInstanceRow[] = containers.map((inst) => ({
    id: inst.id,
    meterKind: 'fill',
    conditionPercent: liquidFillPercent(inst),
    sharpnessPercent: null,
    sellPrice: resolveInstanceSellPrice(inst) ?? 0,
  }))
  const percents = rows.map((r) => r.conditionPercent)
  const allSame = percents.every((p) => p === percents[0])
  return {
    kind,
    count: rows.length,
    condition: allSame ? 'uniform' : 'mixed',
    uniformConditionPercent: allSame ? percents[0]! : null,
    meterKind: 'fill',
    instances: rows,
    consumeUse: resolveConsumeUseView(inventory, kind, nowDays),
  }
}

/** Plan items-player-024 — packed tents are instance-backed (0..100
 *  condition, `itemInstances.ts`'s `TentItemInstance`) but had no builder, so
 *  an owned tent silently disappeared from `[I]` even though
 *  `inventoryCountsForUi()` already counted it. Mirrors `buildTrapGroup`. */
function buildTentGroup(kind: ItemKind, instances: readonly ItemInstance[]): InventoryGroupView | null {
  const tents = instances.filter(isTentItemInstance)
  if (tents.length === 0) return null
  const rows: InventoryInstanceRow[] = tents.map((inst) => ({
    id: inst.id,
    meterKind: 'condition',
    conditionPercent: Math.round(inst.condition),
    sharpnessPercent: null,
    sellPrice: resolveInstanceSellPrice(inst) ?? 0,
  }))
  const percents = rows.map((r) => r.conditionPercent)
  const allSame = percents.every((p) => p === percents[0])
  return {
    kind,
    count: rows.length,
    condition: allSame ? 'uniform' : 'mixed',
    uniformConditionPercent: allSame ? percents[0]! : null,
    meterKind: 'condition',
    instances: rows,
    consumeUse: null,
  }
}

/** Derived presentation for inventory UI — not persisted. */
export function buildInventoryGroups(inventory: Inventory, nowDays = 0): InventoryGroupView[] {
  const groups: InventoryGroupView[] = []

  for (const kind of INSTANCE_BACKED_KINDS) {
    const instances = inventory.getInstances(kind)
    const group = buildTrapGroup(kind, instances)
      ?? buildWeaponGroup(kind, instances)
      ?? buildLiquidContainerGroup(kind, instances, inventory, nowDays)
      ?? buildTentGroup(kind, instances)
    if (group) groups.push(group)
  }

  for (const [kind, count] of Object.entries(inventory.toJSON()) as [ItemKind, number][]) {
    if (count > 0 && !INSTANCE_BACKED_KINDS.has(kind)) {
      const fifo = inventory.fifoFoodBatch(kind, nowDays)
      const group: InventoryGroupView = {
        kind,
        count,
        condition: null,
        uniformConditionPercent: null,
        meterKind: null,
        instances: [],
        consumeUse: resolveConsumeUseView(inventory, kind, nowDays),
      }
      if (fifo) {
        group.freshnessStage = getFoodBatchFreshnessStage(kind, fifo, nowDays)
        if (fifo.sourceSpecies) group.sourceSpecies = fifo.sourceSpecies
      }
      groups.push(group)
    }
  }

  return groups
}

export function inventoryCountsForUi(inventory: Inventory): Partial<Record<ItemKind, number>> {
  const counts: Partial<Record<ItemKind, number>> = { ...inventory.toJSON() }
  for (const kind of INSTANCE_BACKED_KINDS) {
    const n = inventory.countInstances(kind)
    if (n > 0) counts[kind] = n
    else delete counts[kind]
  }
  return counts
}
