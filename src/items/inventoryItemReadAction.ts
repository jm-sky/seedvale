import type { ItemKind } from './items'
import { ITEM_CATALOG } from './itemCatalog'

export type InventoryItemReadAction = {
  label: 'Czytaj' | 'Odczytaj'
}

/**
 * Player-facing inventory read action driven by existing catalog metadata.
 * Books keep `Czytaj`; treasure maps use `Odczytaj`. Both still go through
 * the same `ui.inventory.onRead` seam.
 *
 * @domain items-player
 */
export function inventoryItemReadAction(kind: ItemKind): InventoryItemReadAction | null {
  const entry = ITEM_CATALOG[kind]
  if (entry.book) return { label: 'Czytaj' }
  if (entry.treasureMap) return { label: 'Odczytaj' }
  return null
}
