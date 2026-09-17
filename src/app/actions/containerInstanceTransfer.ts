import type { ItemInstance } from '../../items/itemInstances'

/** Minimal shape both `WorldGeneratedContainers` and `PlacedContainers`
 *  satisfy — the two exact-instance transfer primitives this module makes
 *  atomic. */
export type InstanceContainerStore = {
  withdrawInstance: (containerId: string, instanceId: string) => ItemInstance | null
  depositInstance: (containerId: string, instance: ItemInstance) => boolean
}

/** Minimal shape of the destination — `Inventory.addInstance`. */
export type InstanceDestination = {
  addInstance: (instance: ItemInstance) => boolean
}

/**
 * Rollback-safe move of one exact item instance from `store`'s `containerId`
 * entry into `destination` (plan quests-progression-056). Withdraws first,
 * then adds; if the add fails, the same instance is deposited back into the
 * source before returning, so a failed transfer never emits any side effect
 * and never loses the item. Returns the moved instance on success, `null` if
 * nothing moved.
 *
 * A failed rollback (the source rejecting the exact instance it just gave
 * up) is an invariant violation, not a recoverable UI state — it throws
 * rather than silently losing the item.
 *
 * @domain items-player
 */
export function withdrawInstanceRollbackSafe(
  store: InstanceContainerStore,
  containerId: string,
  instanceId: string,
  destination: InstanceDestination,
): ItemInstance | null {
  const withdrawn = store.withdrawInstance(containerId, instanceId)
  if (!withdrawn) return null
  if (destination.addInstance(withdrawn)) return withdrawn
  if (!store.depositInstance(containerId, withdrawn)) {
    throw new Error(
      `withdrawInstanceRollbackSafe: failed to roll back instance ${instanceId} to container ${containerId}`,
    )
  }
  return null
}
