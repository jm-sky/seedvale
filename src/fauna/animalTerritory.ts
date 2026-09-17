import type { SpawnerType, SpawnPointState } from './AnimalSpawner'

/**
 * @domain fauna
 * @role Pure territorial/den-defense eligibility + distance falloff (plan
 *  fauna-034 §4/§7) — answers "how strongly should this predator defend its
 *  existing habitat against this human", never *who* to attack/flee (that
 *  stays `predatorHumanDecision.ts`'s job, composed via
 *  `PredatorHumanDecisionInput.territorialDefense`) and never *where* the
 *  den is (that stays `AnimalSpawner`/`createFauna.ts`'s existing spawner
 *  identity — this module never mutates or looks up a spawner itself).
 */

/** Declarative per-species territorial capability (`AnimalDef.territorial`)
 *  — presence of this field IS the den-defense capability, same "no
 *  separate boolean, no per-species branch" convention as `AnimalDef.mount`/
 *  `production`/`diet`. A species opts a spawner *type* in explicitly:
 *  a generic ring-spawn/home point must never become a defended den just
 *  because its name contains "Den" (plan fauna-034 non-goal). */
export type TerritorialConfig = {
  defendedSpawnerTypes: readonly SpawnerType[]
  /** Distance (m) from the habitat center at which defense strength falls
   *  to exactly 0. */
  radius: number
}

/** Narrow read-only view of the managed spawner an agent's `spawnPointId`
 *  currently resolves to (`createFauna.ts`'s own `spawnerById` map) — never
 *  the full `PreySpawner`, so this module can't reach into lifecycle/quest
 *  fields it has no business reading. */
export type AnimalHabitatContext = {
  id: string
  type: SpawnerType
  x: number
  z: number
  state: SpawnPointState
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/**
 * 0..1 den-defense strength for one human position against one resolved
 * habitat — 1 at/near the habitat center, falling off continuously to
 * exactly 0 at `config.radius` and beyond (important for regression tests
 * proving ordinary predator-human behaviour outside the radius is
 * unchanged). Returns 0 whenever this isn't actually a defended den right
 * now — missing config, missing/unresolved habitat, an inactive spawner, or
 * a spawner type this species doesn't defend — so callers never need a
 * second eligibility check.
 *
 * Strength is based on the *human's* distance to the habitat, not the
 * animal's — a predator may be a little away from its den and still react
 * to a human entering the defended area (plan fauna-034 §7).
 */
export function territorialDefenseStrength(
  config: TerritorialConfig | undefined,
  habitat: AnimalHabitatContext | undefined,
  humanX: number,
  humanZ: number,
): number {
  if (!config || !habitat) return 0
  if (habitat.state !== 'active') return 0
  if (!config.defendedSpawnerTypes.includes(habitat.type)) return 0
  const dist = Math.hypot(humanX - habitat.x, humanZ - habitat.z)
  if (dist >= config.radius) return 0
  return clamp01(1 - dist / config.radius)
}
