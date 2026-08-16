import type { AnimalKind } from './AnimalAgent'

/** `wolfDen` (plan 093 Etap E) reuses this same spawner shape — a fixed
 *  `respawnTime: Infinity` opts it out of `updateSpawners`' respawn loop
 *  below, since a den's pack is a one-time discovered threat, not an
 *  ongoing population like `cave`/`thicket` prey. If plan 104 (real
 *  underground caves) later lands, the den's position/label can be
 *  re-anchored to an actual cave volume without touching the quest-facing
 *  `WOLF_DEN_ID`/`clear_wolf_den` contract in `quests.ts`/`QuestManager.ts`. */
export type SpawnerType = 'cave' | 'thicket' | 'grove' | 'wolfDen'

/** Single wolf den's stable identity — one per settlement today (mirrors
 *  the existing one-cave/one-thicket-per-settlement reality), so a plain
 *  constant is enough; a real per-den registry can replace this if/when
 *  multiple dens are ever needed. */
export const WOLF_DEN_ID = 'wolf-den'

/** Local habitat lifecycle of a spawn point (plan 125) — generic across every
 *  species/spawner type, no per-species flags.
 *
 *  ```text
 *  active → (>50% of maxPreyCount dies this cycle) → depleted
 *         → (player "Zniszcz", 4 branches) → disabled
 *         → (RECOVERY_DAYS elapsed) → recovering
 *         → (>=MIN_RECOVERY_POPULATION of the same kind nearby) → active
 *  ```
 *
 *  `wolfDen` never receives a `spawnPointId`-tagged animal (see
 *  `createFauna.ts`), so it never accumulates `deathsThisCycle` and stays
 *  `active` forever — its one-time pack lifecycle is owned by
 *  `WOLF_DEN_ID`/`isWolfDenCleared()` instead. */
export type SpawnPointState = 'active' | 'depleted' | 'disabled' | 'recovering'

/** In-game days a `disabled` spawn point waits before it's even eligible to
 *  check the recovery population condition — plan asks for "14-30", this is
 *  the single v1 default (tunable later). */
export const RECOVERY_DAYS = 21
/** Minimum live same-kind animals within `SPAWNER_RADIUS` required for a
 *  `recovering` spawn point to become `active` again. */
export const MIN_RECOVERY_POPULATION = 2

export type PreySpawner = {
  /** Stable identity (plan 125) — deterministic from settlement + spawner
   *  type (one cave/thicket/wolfDen per settlement today), not a runtime
   *  counter. Lets `AnimalAgent.spawnPointId` and save data reference this
   *  spawn point across rebuilds. */
  id: string
  x: number
  z: number
  type: SpawnerType
  kind: AnimalKind
  respawnTime: number
  /** Configured population cap for this spawn point — both the live-nearby
   *  respawn gate (unchanged) and the `>50%` depletion reference population
   *  (plan 125). */
  maxPreyCount: number
  timeSinceLastRespawn: number
  state: SpawnPointState
  /** Animals bound to this spawn point (`AnimalAgent.spawnPointId`) that
   *  have died since the current `active` cycle started — reset to 0 when
   *  the point recovers back to `active`. */
  deathsThisCycle: number
  /** `elapsedDays` at the moment `Zniszcz` disabled this point, or `null`
   *  while not disabled/recovering. */
  disabledAtDay: number | null
}

/** Prey within this radius of a spawner count toward its `maxPreyCount` cap
 *  (respawn) and the recovery population check. */
export const SPAWNER_RADIUS = 12

/** `>50%` of `maxPreyCount` deaths this cycle, expressed as an integer death
 *  count: for `limit = 3` that's 2 deaths, for `limit = 6` that's 4 — the
 *  smallest integer strictly greater than half the limit. Pure/exported so
 *  the rounding rule is unit-tested once instead of re-derived at call sites. */
export function depletionThreshold(maxPreyCount: number): number {
  return Math.floor(maxPreyCount / 2) + 1
}

/** Whether a spawn point's current `deathsThisCycle` crosses the `>50%`
 *  reference-population threshold (plan 125 §4). */
export function shouldDeplete(deathsThisCycle: number, maxPreyCount: number): boolean {
  return deathsThisCycle >= depletionThreshold(maxPreyCount)
}

/**
 * Ticks respawn timers and calls `onRespawn` once per `active` spawner
 * that's ready (timer elapsed, below its live-prey cap). Pure timer/count
 * bookkeeping — actual agent creation/placement is the caller's job (needs
 * scene + terrain). `depleted`/`disabled`/`recovering` spawners never
 * respawn (plan 125 §2/§3).
 */
export function updateSpawners(
  spawners: PreySpawner[],
  dt: number,
  preyPositions: { kind: AnimalKind; x: number; z: number }[],
  onRespawn: (spawner: PreySpawner) => void,
): void {
  for (const spawner of spawners) {
    if (spawner.state !== 'active') continue
    spawner.timeSinceLastRespawn += dt
    if (spawner.timeSinceLastRespawn < spawner.respawnTime) continue
    const nearby = preyPositions.filter(
      (p) =>
        p.kind === spawner.kind &&
        Math.hypot(p.x - spawner.x, p.z - spawner.z) < SPAWNER_RADIUS,
    ).length
    if (nearby >= spawner.maxPreyCount) continue
    spawner.timeSinceLastRespawn = 0
    onRespawn(spawner)
  }
}

/**
 * Low-frequency (call at most once per in-game day, see `createFauna.ts`)
 * recovery check for one `disabled`/`recovering` spawn point (plan 125 §8):
 * once `RECOVERY_DAYS` have elapsed since `disabledAtDay`, the point moves to
 * `recovering` and waits there until at least `MIN_RECOVERY_POPULATION`
 * live same-kind animals are within `SPAWNER_RADIUS`, then becomes `active`
 * again with its cycle counters reset. No-op for any other state (including
 * `active`/`depleted`, and effectively `wolfDen`, which never leaves `active`).
 */
export function tickSpawnPointRecovery(
  spawner: PreySpawner,
  nowDays: number,
  nearbySameKindCount: number,
): void {
  if (spawner.state === 'disabled') {
    if (spawner.disabledAtDay == null || nowDays - spawner.disabledAtDay < RECOVERY_DAYS) return
    spawner.state = 'recovering'
  }
  if (spawner.state !== 'recovering') return
  if (nearbySameKindCount < MIN_RECOVERY_POPULATION) return
  spawner.state = 'active'
  spawner.deathsThisCycle = 0
  spawner.disabledAtDay = null
}
