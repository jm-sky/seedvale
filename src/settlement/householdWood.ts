import type { Inventory } from '../items/Inventory'
import { fuelValue } from '../items/itemFuel'
import type { ItemKind } from '../items/items'

/**
 * Household wood item semantics (plan settlements-npcs-034) — concrete
 * `branch` / `beam` in `Household.items` are the only authoritative store;
 * branch-equivalent aggregates are derived via catalog fuel values.
 *
 * @domain settlements-npcs
 */

export const HOUSEHOLD_WOOD_ITEM_KINDS = ['branch', 'beam'] as const satisfies readonly ItemKind[]

export type HouseholdWoodItemKind = (typeof HOUSEHOLD_WOOD_ITEM_KINDS)[number]

/** Catalog-driven wood contribution per inventory item. */
export function householdWoodItemValue(kind: ItemKind): number | null {
  if (kind !== 'branch' && kind !== 'beam') return null
  return fuelValue(kind)
}

export function householdWoodCountFromItems(items: Inventory): number {
  let total = 0
  for (const kind of HOUSEHOLD_WOOD_ITEM_KINDS) {
    const value = householdWoodItemValue(kind)
    if (value != null) total += items.count(kind) * value
  }
  return total
}

export type HouseholdWoodItemBatch = { kind: HouseholdWoodItemKind, count: number }

/**
 * Deterministic whole-item claim selector — prefer `branch` before `beam`.
 * Only removes items that keep `woodCount >= target` after each removal.
 * Stops when `maxValue` branch-equivalent units are selected or no legal item remains.
 */
export function selectClaimableWoodItems(
  items: Inventory,
  target: number,
  maxValue: number,
): HouseholdWoodItemBatch[] {
  if (maxValue <= 0) return []
  let branches = items.count('branch')
  let beams = items.count('beam')
  let current = branches + beams * 2
  const out: HouseholdWoodItemBatch[] = []
  let budget = maxValue
  let branchClaim = 0
  for (let i = 0; i < branches && budget > 0; i++) {
    if (current - 1 < target) break
    branchClaim += 1
    current -= 1
    budget -= 1
  }
  if (branchClaim > 0) out.push({ kind: 'branch', count: branchClaim })
  let beamClaim = 0
  for (let i = 0; i < beams && budget >= 2; i++) {
    if (current - 2 < target) break
    beamClaim += 1
    current -= 2
    budget -= 2
  }
  if (beamClaim > 0) out.push({ kind: 'beam', count: beamClaim })
  return out
}

/** Claimable surplus in branch-equivalent units (whole items only). */
export function claimableWoodSurplusValue(items: Inventory, target: number): number {
  return selectClaimableWoodItems(items, target, householdWoodCountFromItems(items)).reduce(
    (sum, batch) => sum + batch.count * (householdWoodItemValue(batch.kind) ?? 0),
    0,
  )
}

export function applyWoodItemBatch(items: Inventory, batch: readonly HouseholdWoodItemBatch[], sign: 1 | -1): void {
  for (const { kind, count } of batch) {
    if (count <= 0) continue
    if (sign === 1) items.add(kind, count)
    else items.remove(kind, count)
  }
}
