import type { Inventory } from './Inventory'
import type { ItemKind } from './items'
import {
  INSTANCE_BACKED_KINDS,
  isLiquidContainerInstance,
  isTrapItemInstance,
  isWeaponItemInstance,
  type ItemInstance,
  type LiquidContainerItemInstance,
} from './itemInstances'
import { liquidContainerCapacity } from './liquidContainer'
import { resolveInstanceSellPrice } from './tradeCatalog'
import { trapConditionPercent } from './trapItemInstances'
import { weaponDurabilityPercent, weaponSharpnessPercent } from './weaponMaintenance'

export type InventoryInstanceRow = {
  id: string
  /** Trap: overall condition. Weapon: durability — see `sharpnessPercent`. */
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
  instances: readonly InventoryInstanceRow[]
}

function buildTrapGroup(kind: ItemKind, instances: readonly ItemInstance[]): InventoryGroupView | null {
  const traps = instances.filter(isTrapItemInstance)
  if (traps.length === 0) return null
  const rows: InventoryInstanceRow[] = traps.map((inst) => ({
    id: inst.id,
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
    instances: rows,
  }
}

/** Plan 161 — mirrors `buildTrapGroup`; `conditionPercent` carries durability,
 *  `sharpnessPercent` sharpness, so "uniform" only collapses when both match. */
function buildWeaponGroup(kind: ItemKind, instances: readonly ItemInstance[]): InventoryGroupView | null {
  const weapons = instances.filter(isWeaponItemInstance)
  if (weapons.length === 0) return null
  const rows: InventoryInstanceRow[] = weapons.map((inst) => ({
    id: inst.id,
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
    instances: rows,
  }
}

/** Percent-full reading used as a liquid container's `conditionPercent` — the
 *  closest existing UI concept ("stan X%") to "how full is it", so
 *  waterskins/buckets get a visible fill indicator for free through the same
 *  instance-grouping UI traps/weapons already use, no new UI needed. */
function liquidFillPercent(instance: LiquidContainerItemInstance): number {
  const capacity = liquidContainerCapacity(instance.kind)
  if (capacity <= 0) return 0
  return Math.round((instance.amountLitres / capacity) * 100)
}

/** Plan items-player-001 — mirrors `buildTrapGroup`; `conditionPercent` reads
 *  as fill percentage (`sharpnessPercent` stays null, not applicable). */
function buildLiquidContainerGroup(kind: ItemKind, instances: readonly ItemInstance[]): InventoryGroupView | null {
  const containers = instances.filter(isLiquidContainerInstance)
  if (containers.length === 0) return null
  const rows: InventoryInstanceRow[] = containers.map((inst) => ({
    id: inst.id,
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
    instances: rows,
  }
}

/** Derived presentation for inventory UI — not persisted. */
export function buildInventoryGroups(inventory: Inventory): InventoryGroupView[] {
  const groups: InventoryGroupView[] = []

  for (const kind of INSTANCE_BACKED_KINDS) {
    const instances = inventory.getInstances(kind)
    const group = buildTrapGroup(kind, instances) ?? buildWeaponGroup(kind, instances) ?? buildLiquidContainerGroup(kind, instances)
    if (group) groups.push(group)
  }

  for (const [kind, count] of Object.entries(inventory.toJSON()) as [ItemKind, number][]) {
    if (count > 0 && !INSTANCE_BACKED_KINDS.has(kind)) {
      groups.push({
        kind,
        count,
        condition: null,
        uniformConditionPercent: null,
        instances: [],
      })
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
