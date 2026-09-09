import type { Inventory } from './Inventory'
import type { ItemKind } from './items'

/**
 * All-or-nothing ownership moves between two generic `Inventory`s (plan
 * settlements-npcs-026). Destination capacity is checked before the source
 * is mutated; a failed add rolls the source back. Not NPC-specific — any
 * authoritative owner can reuse these.
 *
 * @domain items-player
 * @system inventory
 */

/** Moves `n` stacked units of `kind` from `source` to `destination`.
 *  Perishable food keeps FIFO freshness via `removeWithFreshness` /
 *  `addWithFreshness` at `nowDays`. Returns false and leaves both
 *  inventories unchanged when the source is short or the destination
 *  cannot accept the load. */
export function transferInventoryCount(
  source: Inventory,
  destination: Inventory,
  kind: ItemKind,
  n: number,
  nowDays = 0,
): boolean {
  if (n <= 0) return n === 0
  if (source === destination) return source.has(kind, n)
  if (!source.has(kind, n)) return false
  if (!destination.canAdd(kind, n)) return false
  const batches = source.removeWithFreshness(kind, n, nowDays)
  if (!batches) return false
  if (destination.addWithFreshness(kind, n, batches, nowDays)) return true
  source.addWithFreshness(kind, n, batches, nowDays)
  return false
}

/** Moves one item instance by id. Returns false and leaves both inventories
 *  unchanged when the instance is missing, already on the destination, or
 *  does not fit. */
export function transferInventoryInstance(
  source: Inventory,
  destination: Inventory,
  instanceId: string,
): boolean {
  if (source === destination) return source.getInstance(instanceId) != null
  const instance = source.getInstance(instanceId)
  if (!instance) return false
  if (destination.getInstance(instanceId)) return false
  if (!destination.canAddInstance(instance)) return false
  if (!source.removeInstance(instanceId)) return false
  if (destination.addInstance(instance)) return true
  source.addInstance(instance)
  return false
}
