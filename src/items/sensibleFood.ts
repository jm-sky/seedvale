import type { Inventory } from './Inventory'
import type { ItemKind } from './items'
import type { PlayerNeeds } from '../player/PlayerNeeds'
import { ITEM_CATALOG } from './itemCatalog'
import {
  type FoodSourceSpecies,
  foodBatchUsedFraction,
  foodHungerRelief,
  getFoodBatchFreshnessStage,
  isFoodBatchSpoiled,
} from './foodFreshness'
import { ITEM_DEFS } from './items'

/** Stable catalog iteration order for deterministic tie-breaks. */
const ITEM_KIND_ORDER: readonly ItemKind[] = (Object.keys(ITEM_DEFS) as ItemKind[]).sort()

function kindOrder(kind: ItemKind): number {
  const index = ITEM_KIND_ORDER.indexOf(kind)
  return index >= 0 ? index : ITEM_KIND_ORDER.length
}

type FoodCandidate = {
  kind: ItemKind
  usedFraction: number
  overfill: number
}

function hungerOverfill(needs: PlayerNeeds, kind: ItemKind, sourceSpecies?: FoodSourceSpecies): number {
  const missing = Math.max(0, needs.hunger.max - needs.hunger.current)
  const relief = foodHungerRelief(kind, sourceSpecies)
  return Math.max(0, relief - missing)
}

function collectCandidates(
  inventory: Inventory,
  nowDays: number,
  needs: PlayerNeeds,
  allowedKinds?: ReadonlySet<ItemKind>,
): FoodCandidate[] {
  const out: FoodCandidate[] = []
  for (const kind of ITEM_KIND_ORDER) {
    if (allowedKinds && !allowedKinds.has(kind)) continue
    const entry = ITEM_CATALOG[kind].consumable
    if (!entry || entry.need !== 'hunger') continue
    if (!inventory.holdsAny(kind)) continue
    for (const batch of inventory.getFoodBatches(kind, nowDays)) {
      if (batch.count <= 0) continue
      if (isFoodBatchSpoiled(kind, batch, nowDays)) continue
      if (getFoodBatchFreshnessStage(kind, batch, nowDays) === 'spoiled') continue
      out.push({
        kind,
        usedFraction: foodBatchUsedFraction(kind, batch, nowDays),
        overfill: hungerOverfill(needs, kind, batch.sourceSpecies),
      })
    }
  }
  return out
}

/**
 * Deterministic "eat something sensible" resolver for player quick actions.
 * Operates on authoritative inventory/catalog data only — never mutates state.
 *
 * @domain ui-input
 */
export function resolveSensibleFoodKind(
  inventory: Inventory,
  needs: PlayerNeeds,
  nowDays: number,
  allowedKinds?: ReadonlySet<ItemKind>,
): ItemKind | null {
  const candidates = collectCandidates(inventory, nowDays, needs, allowedKinds)
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    if (a.usedFraction !== b.usedFraction) return b.usedFraction - a.usedFraction
    if (a.overfill !== b.overfill) return a.overfill - b.overfill
    return kindOrder(a.kind) - kindOrder(b.kind)
  })
  return candidates[0]!.kind
}
