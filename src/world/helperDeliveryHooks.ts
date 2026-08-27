import type { ItemKind } from '../items/items'
import type { PlacedContainers } from './createPlacedContainers'

/**
 * Narrow view over `PlacedContainers` for NPC helper resource delivery (plan
 * 167) — mirrors `SettlementFoodSourceHooks`/`SettlementMiningHooks`'s shape:
 * just the domain operations a helper assignment needs, not the whole
 * `PlacedContainers` API (pickup/carry/UI screens stay player-only concerns).
 */
export type HelperDeliveryHooks = {
  /** World position of a target container, or `undefined` when the id is
   *  unknown (picked up by the player, or never existed after a rebuild) —
   *  the assignment simply has no valid target this tick, no special
   *  handling required by the caller beyond falling through like any other
   *  unavailable candidate. */
  findTarget: (containerId: string) => { x: number, z: number } | undefined
  /** Whether the container currently has room for at least one more unit of
   *  `kind` — a read-only check for candidate generation, re-validated for
   *  real by `deposit` at actual transfer time. */
  hasRoom: (containerId: string, kind: ItemKind) => boolean
  /** Atomic transfer into the container, capacity-checked (plan 164) —
   *  returns the amount actually accepted; a partial/zero accept leaves the
   *  remainder with the caller. */
  deposit: (containerId: string, kind: ItemKind, amount: number, acquiredAtDays?: number) => number
}

export function createHelperDeliveryHooks(containers: PlacedContainers): HelperDeliveryHooks {
  return {
    findTarget: (containerId) => {
      const entry = containers.find(containerId)
      return entry ? { x: entry.x, z: entry.z } : undefined
    },
    hasRoom: (containerId, kind) => {
      const entry = containers.find(containerId)
      return entry ? entry.contents.canAdd(kind, 1) : false
    },
    deposit: (containerId, kind, amount, acquiredAtDays) => containers.deposit(containerId, kind, amount, acquiredAtDays),
  }
}
