import type { Inventory } from './Inventory'
import { ITEM_CATALOG } from './itemCatalog'
import {
  createItemInstanceId,
  type LiquidContainerItemInstance,
  type LiquidContainerKind,
  type LiquidContent,
} from './itemInstances'

/**
 * Domain operations for the shared liquid-container model (plan
 * items-player-001 §7/§8) — waterskins and buckets today, a future barrel
 * later. Pure functions over `LiquidContainerItemInstance`; callers apply the
 * result via `Inventory.updateInstance()` (same pattern as
 * `weaponMaintenance.ts`'s `sharpenWeapon`), so the mutation boundary stays
 * `Inventory`'s, not a second per-item store.
 */

/** One drink action's worth of liquid — shared by every container kind. */
export const LIQUID_DRINK_PORTION_LITRES = 1

/** Water/milk density used only to add held-liquid mass to `Inventory
 *  .totalWeight()` — both are close enough to 1 kg/l that a single flat
 *  constant is not worth a per-content table. */
export const LIQUID_DENSITY_KG_PER_LITRE = 1

export function liquidContainerCapacity(kind: LiquidContainerKind): number {
  return ITEM_CATALOG[kind].container?.capacityLiters ?? 0
}

/** A fresh, empty instance — the merchant/quest/world-pickup acquisition
 *  boundary (`items/trade.ts`'s `createAcquiredInstance`) creates these, never
 *  a pre-filled one. */
export function createLiquidContainerInstance(kind: LiquidContainerKind): LiquidContainerItemInstance {
  return { id: createItemInstanceId(), kind, liquid: null, amountLitres: 0 }
}

export function canFillLiquidContainer(instance: LiquidContainerItemInstance, content: LiquidContent): boolean {
  const container = ITEM_CATALOG[instance.kind].container
  if (!container || !container.allowedContents.includes(content)) return false
  if (instance.liquid && instance.liquid !== content) return false
  return instance.amountLitres < liquidContainerCapacity(instance.kind)
}

/** Tops `instance` up to full — the "instant fill" behaviour carried over
 *  from plan 106's well/lake `[R]` waterskin fill. Null when filling isn't
 *  allowed (wrong/mixed content, already full, or not a container kind). */
export function fillLiquidContainer(
  instance: LiquidContainerItemInstance,
  content: LiquidContent,
): LiquidContainerItemInstance | null {
  if (!canFillLiquidContainer(instance, content)) return null
  return { ...instance, liquid: content, amountLitres: liquidContainerCapacity(instance.kind) }
}

export function canDrinkFromLiquidContainer(
  instance: LiquidContainerItemInstance,
  litres = LIQUID_DRINK_PORTION_LITRES,
): boolean {
  return instance.liquid !== null && instance.amountLitres >= litres
}

/** Consumes one drink portion. Null when there isn't enough held. The
 *  instance itself is never removed — an emptied container stays a held,
 *  reusable item (plan §2.1/§3.1's "pusty bukłak pozostaje tym samym
 *  przedmiotem"). */
export function drinkFromLiquidContainer(
  instance: LiquidContainerItemInstance,
  litres = LIQUID_DRINK_PORTION_LITRES,
): LiquidContainerItemInstance | null {
  if (!canDrinkFromLiquidContainer(instance, litres)) return null
  const remaining = instance.amountLitres - litres
  return remaining <= 0 ? { ...instance, liquid: null, amountLitres: 0 } : { ...instance, amountLitres: remaining }
}

/** Manually dumps `instance`'s content (plan §8's "empty" action) — same end
 *  state as drinking it dry, explicit entry point for a future interaction. */
export function emptyLiquidContainer(instance: LiquidContainerItemInstance): LiquidContainerItemInstance {
  return { ...instance, liquid: null, amountLitres: 0 }
}

/** The sized kind a legacy `waterskin_empty`/`waterskin_full` (plan 106,
 *  kept in `ItemKind` only so an old save's counts still parse) becomes — plan-106 waterskins had no
 *  size concept, so `waterskin_medium` (5 l) is the closest "generic"
 *  stand-in, same spirit as `migrateWeaponCountsToInstances`' "no recoverable
 *  condition, assume a reasonable default" choice. */
const LEGACY_WATERSKIN_TARGET_KIND: LiquidContainerKind = 'waterskin_medium'

/** Runtime, in-memory migration for saves predating plan items-player-001 —
 *  every legacy `waterskin_empty`/`waterskin_full` count becomes a fresh
 *  `waterskin_medium` instance (empty or full of water respectively).
 *  Idempotent: a fresh game or an already-migrated save has zero count for
 *  these kinds, so this is a no-op. Weight-neutral relative to the old
 *  waterskin_full weight (plan 106 baked ~1 kg of water into its static
 *  `ITEM_DEFS.weight`; the new instance now carries that as real liquid mass
 *  via `Inventory.totalWeight()`'s liquid-container branch instead). */
export function migrateLegacyWaterskinsToInstances(inventory: Inventory): void {
  const emptyCount = inventory.count('waterskin_empty')
  const fullCount = inventory.count('waterskin_full')
  if (emptyCount > 0) {
    inventory.remove('waterskin_empty', emptyCount)
    for (let i = 0; i < emptyCount; i++) {
      inventory.addInstance(createLiquidContainerInstance(LEGACY_WATERSKIN_TARGET_KIND))
    }
  }
  if (fullCount > 0) {
    inventory.remove('waterskin_full', fullCount)
    for (let i = 0; i < fullCount; i++) {
      const filled = fillLiquidContainer(createLiquidContainerInstance(LEGACY_WATERSKIN_TARGET_KIND), 'water')!
      inventory.addInstance(filled)
    }
  }
}
