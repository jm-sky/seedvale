import {
  Inventory,
  type InventoryContentsSnapshot,
  inventoryFromContents,
  snapshotInventoryContents,
} from '../items/Inventory'

/**
 * World-owned inventories of already-extracted goods waiting at a remote
 * resource site (plan settlements-npcs-021).
 *
 * Keyed by existing `NaturalResource.id`. Independent of the streamed
 * `ResourceDeposits` render instance and of `ResourceDepletionState`
 * (remaining unmined hits). Empty sites are not persisted.
 *
 * @domain settlements-npcs
 */
export type ResourceSiteInventories = {
  get: (resourceId: string) => Inventory | undefined
  getOrCreate: (resourceId: string) => Inventory
  /** Non-empty sites only — bounded candidate discovery for transport. */
  entries: () => ReadonlyArray<readonly [string, Inventory]>
  serialize: () => Record<string, InventoryContentsSnapshot>
}

/**
 * Restores from a sparse snapshot. Missing/empty input yields an empty store.
 *
 * @domain settlements-npcs
 */
export function createResourceSiteInventories(
  initial: Record<string, InventoryContentsSnapshot> = {},
): ResourceSiteInventories {
  const byId = new Map<string, Inventory>()
  for (const [resourceId, snapshot] of Object.entries(initial)) {
    const inventory = inventoryFromContents(snapshot, Infinity, Infinity)
    if (!inventory.isEmpty()) byId.set(resourceId, inventory)
  }

  return {
    get: (resourceId) => byId.get(resourceId),
    getOrCreate(resourceId) {
      let inventory = byId.get(resourceId)
      if (!inventory) {
        inventory = new Inventory({}, Infinity, undefined, undefined, Infinity)
        byId.set(resourceId, inventory)
      }
      return inventory
    },
    entries() {
      const out: Array<readonly [string, Inventory]> = []
      for (const [resourceId, inventory] of byId) {
        if (!inventory.isEmpty()) out.push([resourceId, inventory])
      }
      return out
    },
    serialize() {
      const out: Record<string, InventoryContentsSnapshot> = {}
      for (const [resourceId, inventory] of byId) {
        if (inventory.isEmpty()) continue
        out[resourceId] = snapshotInventoryContents(inventory)
      }
      return out
    },
  }
}
