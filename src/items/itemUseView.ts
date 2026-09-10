import type { Inventory } from './Inventory'
import type { ItemKind } from './items'
import { getFoodBatchFreshnessStage } from './foodFreshness'
import { consumeVerbLabel, ITEM_CATALOG, type ItemCatalogEntry } from './itemCatalog'
import { isLiquidContainerInstance, isLiquidContainerKind } from './itemInstances'
import { canDrinkFromLiquidContainer } from './liquidContainer'

/**
 * Read-only item-use presentation (plan items-player-024) — describes an
 * inventory action already implemented in app/domain layer (consume, read,
 * place, equip, drop) so a screen can show *why* an action is currently
 * impossible instead of only finding out from a toast after the click.
 * Derived only; the app-layer callback it fronts always re-validates live
 * state at execution time (`survivalActions.ts`'s `consumeItem()`, etc.).
 *
 * @domain items-player
 */
export type ItemUseView = {
  id: string
  label: string
  enabled: boolean
  reasonLabel: string
}

/**
 * "Zjedz"/"Wypij" availability — null when `kind` isn't consumable at all
 * (no button to show). Mirrors `survivalActions.ts`'s `consumeItem()`:
 * a liquid container needs a drinkable instance, food must not have reached
 * the `spoiled` freshness stage.
 */
export function resolveConsumeUseView(inventory: Inventory, kind: ItemKind, nowDays: number): ItemUseView | null {
  const entry = ITEM_CATALOG[kind].consumable
  if (!entry) return null
  const label = consumeVerbLabel(entry.need)
  if (isLiquidContainerKind(kind)) {
    const hasDrinkable = inventory.getInstances(kind)
      .filter(isLiquidContainerInstance)
      .some((inst) => canDrinkFromLiquidContainer(inst))
    return { id: 'consume', label, enabled: hasDrinkable, reasonLabel: hasDrinkable ? '' : 'Pusty' }
  }
  const fifo = inventory.fifoFoodBatch(kind, nowDays)
  const spoiled = fifo != null && getFoodBatchFreshnessStage(kind, fifo, nowDays) === 'spoiled'
  return { id: 'consume', label, enabled: !spoiled, reasonLabel: spoiled ? 'Zepsute' : '' }
}

/**
 * "Czytaj" availability for a skill book — null when `kind` isn't a book.
 * Mirrors `readBook()`'s own outcomes (`too_low`/`known` never change state,
 * so this only clarifies *why* upfront rather than blocking a harmless
 * no-op click).
 */
export function resolveReadBookUseView(book: NonNullable<ItemCatalogEntry['book']>, currentSkillValue: number): ItemUseView {
  if (currentSkillValue < book.requiredSkillValue) {
    return { id: 'read', label: 'Czytaj', enabled: false, reasonLabel: 'Zbyt trudna' }
  }
  if (currentSkillValue >= book.targetSkillValue) {
    return { id: 'read', label: 'Czytaj', enabled: false, reasonLabel: 'Znana wiedza' }
  }
  return { id: 'read', label: 'Czytaj', enabled: true, reasonLabel: '' }
}
