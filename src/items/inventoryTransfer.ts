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

/** Moves every stack, instance and freshness batch out of `source` into
 *  `destination` — the "whole-inventory ownership handoff" seam (plan
 *  npc-036), composed only from `transferInventoryCount`/
 *  `transferInventoryInstance` above so freshness/instance semantics never
 *  diverge from a single-kind transfer. Enumerates `source`'s own current
 *  contents once up front, so it is unaffected by `destination` gaining
 *  weight-derived capacity mid-move. Returns false as soon as one kind/
 *  instance fails to fit — expected to be unreachable for an `Infinity`-
 *  capacity destination (a freshly created corpse/handoff inventory), but a
 *  failure still leaves already-moved rows on `destination`, not rolled
 *  back, since a real capacity-limited destination has no lossless "put it
 *  all back" contract to offer beyond what each individual transfer already
 *  guarantees for its own kind/instance. */
export function transferAllInventoryContents(
  source: Inventory,
  destination: Inventory,
  nowDays = 0,
): boolean {
  if (source === destination) return true
  for (const [kind, amount] of Object.entries(source.toJSON()) as [ItemKind, number][]) {
    if (amount <= 0) continue
    if (!transferInventoryCount(source, destination, kind, amount, nowDays)) return false
  }
  for (const row of source.instancesToJSON()) {
    if (!transferInventoryInstance(source, destination, row.id)) return false
  }
  return true
}
