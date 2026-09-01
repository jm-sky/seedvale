import type { DroppedItems } from './createDroppedItems'
import type { Inventory } from './Inventory'
import type { ItemKind } from './items'

/** One item requirement for a construction step — kind + exact quantity, no
 *  tool/capability (those stay `ItemCapability` checks at the construction's
 *  own call site, e.g. `playerWell.ts`'s `WELL_STAGE_CAPABILITY`). */
export type MaterialRequirement = { kind: ItemKind, count: number }

/** Small, deterministic radius (world units) a construction site searches for
 *  usable dropped materials — plan 187 §4: bounded, no global/per-frame scan. */
export const CONSTRUCTION_MATERIAL_RADIUS = 3

/** Dropped items of `kind` within `radius` of (x, z), nearest first (ties
 *  broken by id) — deterministic consumption order across stacks. Filters by
 *  kind before computing distance so an unrelated-kind majority in
 *  `droppedItems.nodes()` costs only a `kind` compare. */
function nearbyDroppedByKind(
  droppedItems: DroppedItems,
  x: number,
  z: number,
  radius: number,
  kind: ItemKind,
): { id: string, distSq: number }[] {
  const radiusSq = radius * radius
  const out: { id: string, distSq: number }[] = []
  for (const item of droppedItems.nodes()) {
    if (item.kind !== kind) continue
    const dx = item.x - x
    const dz = item.z - z
    const distSq = dx * dx + dz * dz
    if (distSq > radiusSq) continue
    out.push({ id: item.id, distSq })
  }
  out.sort((a, b) => a.distSq - b.distSq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return out
}

/** Units of `kind` available as dropped items within `radius` of (x, z). */
export function nearbyWorldMaterialCount(
  droppedItems: DroppedItems,
  x: number,
  z: number,
  radius: number,
  kind: ItemKind,
): number {
  return nearbyDroppedByKind(droppedItems, x, z, radius, kind).length
}

/** Would `requirement` be satisfiable from `inventory` plus dropped items
 *  within `radius` of (x, z)? Read-only — pair with `consumeMaterial` to
 *  actually spend it. */
export function hasMaterial(
  inventory: Inventory,
  droppedItems: DroppedItems,
  x: number,
  z: number,
  radius: number,
  requirement: MaterialRequirement,
): boolean {
  const fromInventory = inventory.count(requirement.kind)
  if (fromInventory >= requirement.count) return true
  const fromWorld = nearbyWorldMaterialCount(droppedItems, x, z, radius, requirement.kind)
  return fromInventory + fromWorld >= requirement.count
}

/**
 * Consumes exactly `requirement.count` units of `requirement.kind` — from
 * `inventory` first, then nearby dropped items within `radius` of (x, z),
 * closest stack first — the construction-material acquisition seam shared by
 * every construction (plan 187 §4/§6). Atomic: if the combined total is
 * insufficient nothing is consumed and this returns `false`; a caller must
 * not advance construction progress in that case.
 *
 * Knows nothing about wells/houses/grates or stage timers/visuals/placement —
 * only inventory + world-item quantities.
 */
export function consumeMaterial(
  inventory: Inventory,
  droppedItems: DroppedItems,
  x: number,
  z: number,
  radius: number,
  requirement: MaterialRequirement,
): boolean {
  if (!hasMaterial(inventory, droppedItems, x, z, radius, requirement)) return false

  let remaining = requirement.count
  const fromInventory = Math.min(inventory.count(requirement.kind), remaining)
  if (fromInventory > 0) {
    inventory.remove(requirement.kind, fromInventory)
    remaining -= fromInventory
  }
  if (remaining > 0) {
    for (const entry of nearbyDroppedByKind(droppedItems, x, z, radius, requirement.kind)) {
      if (remaining <= 0) break
      droppedItems.collect(entry.id)
      remaining--
    }
  }
  return remaining === 0
}

/** A player-built object's recovery policy (plan `items-player-010` §6) — the
 *  same canonical `requirements` used to build it, plus a `recoveryRate`
 *  attached to that concrete object type (never a hard-coded rule inside a
 *  specific removal action). */
export type MaterialRecoveryPolicy = { requirements: readonly MaterialRequirement[], recoveryRate: number }

/**
 * Deterministic materials returned by removing a player-built object (plan
 * `items-player-010` §6/§7 — the generic removal/recovery seam every future
 * player-built object reuses, not a palisade-specific rule). `Math.floor`
 * per material, clamped so recovery can never exceed the original cost — no
 * randomness. Zero-count entries are omitted.
 */
export function computeMaterialRecovery(policy: MaterialRecoveryPolicy): MaterialRequirement[] {
  return policy.requirements
    .map((r) => ({ kind: r.kind, count: Math.min(r.count, Math.max(0, Math.floor(r.count * policy.recoveryRate))) }))
    .filter((r) => r.count > 0)
}

/** Would every entry in `recovered` actually fit in `inventory` right now?
 *  Pair with `applyRecovery` — always call this first so a removal that
 *  can't be received is refused before any authoritative state is touched
 *  (plan §7: atomic removal, never remove-then-fail-to-add). */
export function canReceiveRecovery(inventory: Inventory, recovered: readonly MaterialRequirement[]): boolean {
  return recovered.every((r) => inventory.canAdd(r.kind, r.count))
}

/** Adds every recovered material to `inventory` — only call after
 *  `canReceiveRecovery` returned true for the same `recovered` list, and
 *  after the authoritative world object has already been removed (plan §7's
 *  ordering: remove, then add, never the reverse, once capacity is proven). */
export function applyRecovery(inventory: Inventory, recovered: readonly MaterialRequirement[]): void {
  for (const r of recovered) inventory.add(r.kind, r.count)
}
