import type { ItemKind } from './items'
import type { Inventory } from './Inventory'
import {
  INSTANCE_BACKED_KINDS,
  isTrapItemInstance,
  type ItemInstance,
} from './itemInstances'
import { resolveInstanceSellPrice } from './tradeCatalog'
import { trapConditionPercent } from './trapItemInstances'

export type InventoryInstanceRow = {
  id: string
  conditionPercent: number
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
    const group = buildTrapGroup(kind, inventory.getInstances(kind))
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
