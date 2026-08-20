import type { ItemKind } from '../items/items'

/** Plan 159 §9-10 — minimal fishing. Deliberately no fish agents, population
 *  or migration: a "spot" is never a persisted world object, just a
 *  deterministic grid cell derived from where the player cast — cheap,
 *  stream-independent identity for the one thing that *does* need to persist
 *  (bait). */

/** World-unit grid cell size used to derive a stable spot id from a cast
 *  position — coarse enough that re-casting a couple steps away still counts
 *  as "the same spot" for bait purposes. */
const SPOT_GRID_SIZE = 4

export function fishingSpotId(x: number, z: number): string {
  const cx = Math.round(x / SPOT_GRID_SIZE)
  const cz = Math.round(z / SPOT_GRID_SIZE)
  return `fishspot:${cx}:${cz}`
}

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function hash01(a: number, b: number, salt: number): number {
  let h = Math.imul(a ^ salt, 2654435761) ^ Math.imul(b + 0x9e3779b9, 1597334677)
  h ^= h >>> 15
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

const FISHING_ROLL_SALT = 0x51524a4c

/** Deterministic dice for one `(spot, attempt)` cast — same convention as
 *  `world/animalTraps.ts`'s `trapDetectionRoll`. */
export function fishingCatchRoll(spotId: string, attempt: number): number {
  return hash01(hashString(spotId), attempt, FISHING_ROLL_SALT)
}

export const FISHING_BASE_CATCH_CHANCE = 0.4
export const FISHING_BAIT_BONUS = 0.25
export const FISHING_MAX_CATCH_CHANCE = 0.85

export function fishingCatchChance(hasActiveBait: boolean): number {
  const chance = FISHING_BASE_CATCH_CHANCE + (hasActiveBait ? FISHING_BAIT_BONUS : 0)
  return Math.min(FISHING_MAX_CATCH_CHANCE, chance)
}

export function rollFishingCatch(spotId: string, attempt: number, hasActiveBait: boolean): boolean {
  return fishingCatchRoll(spotId, attempt) < fishingCatchChance(hasActiveBait)
}

export const FISHING_CAST_DURATION_SEC = 4

/** Persistent per-spot bait effect (plan 159 §10) — belongs to the spot's
 *  simulation state, not to any `Object3D`; survives stream-out/in because it
 *  is never tied to a chunk-loaded object in the first place, just a flat
 *  `spotId → state` map owned at the app level. */
export type FishingBaitState = {
  kind: ItemKind
  appliedAtDays: number
  expiresAtDays: number
  strength: number
}

export const FISHING_BAIT_DURATION_DAYS = 3
export const FISHING_BAIT_BASE_STRENGTH = 1
export const FISHING_BAIT_MAX_STRENGTH = 2

export function isBaitActive(bait: FishingBaitState | null | undefined, nowDays: number): boolean {
  return bait != null && nowDays < bait.expiresAtDays
}

/** Applying bait always refreshes the expiry; re-applying the *same* kind
 *  while it's still active also strengthens it (capped) — a fresh kind resets
 *  to base strength instead of stacking with the old one's leftover potency. */
export function applyFishingBait(
  existing: FishingBaitState | null | undefined,
  kind: ItemKind,
  nowDays: number,
): FishingBaitState {
  const strength = existing && existing.kind === kind && isBaitActive(existing, nowDays)
    ? Math.min(FISHING_BAIT_MAX_STRENGTH, existing.strength + 1)
    : FISHING_BAIT_BASE_STRENGTH
  return {
    kind,
    appliedAtDays: nowDays,
    expiresAtDays: nowDays + FISHING_BAIT_DURATION_DAYS,
    strength,
  }
}
