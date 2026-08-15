import type { AnimalKind } from './AnimalAgent'

/**
 * Pure herd/juvenile tuning + leader selection (plan 118). No Three.js/DOM —
 * `AnimalAgent` reads these tables and calls `pickHerdLeader()` from its own
 * `pickWanderTarget()`; this module owns no per-instance state.
 */

export type HerdTightness = 'tight' | 'loose'

/** Species that form v1 herds — matches the plan's cohesion table. Wolf is
 *  explicitly out of scope (predator pack behaviour, not this plan). Species
 *  absent from this map behave exactly as before (solitary). */
export const HERD_SPECIES: Partial<Record<AnimalKind, HerdTightness>> = {
  deer: 'tight',
  stag: 'tight',
  boar: 'tight',
  rabbit: 'loose',
}

/** Multiplier applied to a juvenile's `mesh.scale` at spawn, and inverted
 *  once it matures back to `adult` (see `AnimalAgent.update()`). Large
 *  species (deer/stag) land 30-50% down; boar/rabbit land 20-30% down —
 *  both bucket choices are explicit product decisions (boar deliberately in
 *  the small bucket despite its "tight" cohesion tier), not derived from
 *  `modelHeight`. */
export const JUVENILE_SCALE_FACTOR: Partial<Record<AnimalKind, number>> = {
  deer: 0.6,
  stag: 0.6,
  boar: 0.72,
  rabbit: 0.75,
}

/** Chance to add a 1st / 2nd juvenile to a freshly spawned herd, rolled
 *  independently. Kept well below 1 so juveniles stay visibly rarer than
 *  adults, per species (species not listed here never spawn juveniles). */
export const JUVENILE_SPAWN_CHANCE: Partial<Record<AnimalKind, { first: number, second: number }>> = {
  deer: { first: 0.5, second: 0.15 },
  stag: { first: 0.35, second: 0.1 },
  boar: { first: 0.4, second: 0.15 },
  rabbit: { first: 0.3, second: 0.1 },
}

/** [min, max] distance (world units) from a herd's spawn anchor at which its
 *  other members are placed — spawn-time only, mirrors the `wolfDen` pack
 *  clustering pattern in `createFauna.ts`. */
export const HERD_CLUSTER_RADIUS: Record<HerdTightness, readonly [number, number]> = {
  tight: [1, 5],
  loose: [1, 8],
}

/** [min, max] distance (world units) from the live herd leader at which a
 *  follower's wander target is chosen (`AnimalAgent.pickWanderTarget()`). */
export const HERD_FOLLOW_RADIUS: Record<HerdTightness, readonly [number, number]> = {
  tight: [1.5, 4],
  loose: [3, 7],
}

/** [min, max] distance (world units) from a live mother at which a
 *  juvenile's wander target is chosen — tighter than herd cohesion
 *  ("utrzymuje niewielki dystans od matki"). */
export const MOTHER_FOLLOW_RADIUS: readonly [number, number] = [1, 3]

/** Seconds a juvenile spends aging before it matures into an adult.
 *  Anchored against `dayNight.ts`'s default `dayLengthSec` (480) — roughly
 *  1.25 in-game days, long enough to visibly read as "young" for a while,
 *  short enough that most play sessions see a maturity transition. */
export const JUVENILE_MATURITY_SECONDS = 600

/** Minimal structural shape `pickHerdLeader` needs — matches `AnimalAgent`
 *  without importing it, so this stays a pure/testable module. */
export type HerdMemberLike = {
  animalId: string
  herdId?: string
  isDead(): boolean
}

/**
 * Deterministic leader pick for one herd: the alive member with the
 * lexicographically smallest `animalId`. Every follower computing this
 * independently agrees on the same individual, and a dead "leader" is
 * simply excluded — reassignment on death falls out for free, with no
 * stored leader field or reassignment bookkeeping anywhere.
 */
export function pickHerdLeader<T extends HerdMemberLike>(
  candidates: readonly T[],
  herdId: string,
): T | null {
  let leader: T | null = null
  for (const c of candidates) {
    if (c.herdId !== herdId || c.isDead()) continue
    if (!leader || c.animalId < leader.animalId) leader = c
  }
  return leader
}
