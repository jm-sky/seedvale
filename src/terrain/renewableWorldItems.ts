import type { ItemKind } from '../items/items'

/**
 * Sparse renewable overlay for medicinal world-chunk flora (plan
 * items-player-043). Mirrors `world/grassForage.ts`: deterministic placement
 * ids stay in `computeChunkItems`; only `id → availableAtDays` overrides
 * persist. Finite chunk items keep permanent `collectedItemIds`.
 *
 * @domain items-player
 * @system world-chunk-items
 * @owns RenewableWorldItemOverrides
 */
export const RENEWABLE_WORLD_ITEM_RESPAWN_DAYS: Readonly<Partial<Record<ItemKind, number>>> = {
  mint: 1.5,
  yarrow: 2.0,
  herb: 7.0,
}

/** Max extra metres of herb discovery/pickup reach at Survival mastery
 *  (plan items-player-043) — novice stays at the base interact range. */
export const MEDICINAL_HERB_SURVIVAL_RANGE_BONUS_MAX = 1.25

/** Sparse depletion overrides — `placementId -> availableAtDays`. Absent id
 *  means available. Mutated in place; round-trips as
 *  `SaveData.renewableWorldItems`. */
export type RenewableWorldItemOverrides = Record<string, number>

export function isRenewableWorldItem(kind: ItemKind): boolean {
  return RENEWABLE_WORLD_ITEM_RESPAWN_DAYS[kind] != null
}

/** Alias for forage/skill consumers — same three medicinal flora kinds. */
export function isMedicinalForageKind(kind: ItemKind): boolean {
  return isRenewableWorldItem(kind)
}

/**
 * Bounded Survival discovery radius for medicinal herbs. Novice ≈ base;
 * mastery adds up to `MEDICINAL_HERB_SURVIVAL_RANGE_BONUS_MAX` metres.
 * Never hard-gates collection.
 */
export function medicinalHerbInteractRange(survivalValue: number, baseRange: number): number {
  const t = Number.isFinite(survivalValue) ? Math.min(1, Math.max(0, survivalValue)) : 0
  return baseRange + t * MEDICINAL_HERB_SURVIVAL_RANGE_BONUS_MAX
}

export function renewableRespawnDays(kind: ItemKind): number | null {
  return RENEWABLE_WORLD_ITEM_RESPAWN_DAYS[kind] ?? null
}

export function isRenewableWorldItemAvailable(
  overrides: RenewableWorldItemOverrides,
  id: string,
  nowDays: number,
): boolean {
  const availableAt = overrides[id]
  return availableAt === undefined || nowDays >= availableAt
}

/**
 * Marks a renewable placement unavailable until `nowDays + respawnDays(kind)`.
 * Returns false when already depleted (first collector wins).
 */
export function depleteRenewableWorldItem(
  overrides: RenewableWorldItemOverrides,
  id: string,
  kind: ItemKind,
  nowDays: number,
): boolean {
  const days = renewableRespawnDays(kind)
  if (days == null) return false
  if (!isRenewableWorldItemAvailable(overrides, id, nowDays)) return false
  overrides[id] = nowDays + days
  return true
}

/** Drops overrides that have respawned, keeping the persisted set sparse. */
export function pruneRenewableWorldItems(
  overrides: RenewableWorldItemOverrides,
  nowDays: number,
): void {
  for (const id of Object.keys(overrides)) {
    if (nowDays >= overrides[id]!) delete overrides[id]
  }
}

/** True when a placement should be visible/collectible given both permanent
 *  collection and the renewable overlay. */
export function isWorldItemPlacementAvailable(
  placement: { id: string, kind: ItemKind },
  collectedItemIds: ReadonlySet<string>,
  renewableOverrides: RenewableWorldItemOverrides,
  nowDays: number,
): boolean {
  if (collectedItemIds.has(placement.id)) return false
  if (!isRenewableWorldItem(placement.kind)) return true
  return isRenewableWorldItemAvailable(renewableOverrides, placement.id, nowDays)
}
