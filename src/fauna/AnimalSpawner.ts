import type { AnimalKind } from './AnimalAgent'
import { ordinaryHabitatCapacity } from './persistentOccupants'
import { effectiveMaxPreyCount, effectiveRespawnIntervalDays } from './wolfDenScenario'

/** `wolfDen` (plan 093 Etap E) reuses this same spawner shape — a fixed
 *  `respawnIntervalDays: Infinity` opts it out of `updateSpawners`' respawn
 *  loop below, since a den's pack is a one-time discovered threat, not an
 *  ongoing population like `rockDen`/`thicket`. It still participates in the
 *  plan-125 depletion/`Zniszcz` lifecycle: pack deaths count, and a cleared
 *  den can be burned. If plan 104 (real underground caves) later lands, the
 *  den's position/label can be re-anchored to an actual cave volume without
 *  touching the quest-facing `WOLF_DEN_ID`/`clear_wolf_den` contract in
 *  `quests.ts`/`QuestManager.ts`. */
/** `rockDen` (plan fauna-019 §8, renamed from `cave`) is the lightweight
 *  decorative `createCaveMouth()` prop/population spawner — never a real,
 *  walk-in `CaveTopology`/heightfield cave. The rename exists only to remove
 *  the naming collision with real caves (`src/world/caves/`); `spawnerId()`
 *  still derives the on-disk id segment as `cave` for save compatibility, so
 *  existing `SavedSpawnPointState` entries are not orphaned. */
export type SpawnerType = 'rockDen' | 'thicket' | 'grove' | 'wolfDen'

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
 *  `wolfDen` still never respawns (`Infinity` interval) so the quest pack
 *  stays one-shot; its pack *is* `spawnPointId`-tagged, so killing it can
 *  deplete the den and offer `[E] Zniszcz`. Quest completion stays on
 *  `WOLF_DEN_ID`/`isWolfDenCleared()`, independent of the burn. */
export type SpawnPointState = 'active' | 'depleted' | 'disabled' | 'recovering'

/** In-game days a `disabled` spawn point waits before it's even eligible to
 *  check the recovery population condition — plan asks for "14-30", this is
 *  the single v1 default (tunable later). */
export const RECOVERY_DAYS = 21
/** Minimum live same-kind animals within `SPAWNER_RADIUS` required for a
 *  `recovering` spawn point to become `active` again. */
export const MIN_RECOVERY_POPULATION = 2

/** Branches consumed by `[E] Zniszcz` on a `depleted` spawn point (plan 125 §6 /
 *  plan 137 — spent on channel complete, not on keypress). */
export const SPAWNER_DESTROY_BRANCH_COST = 4
/** Busy-channel duration for destroying a depleted spawn point (plan 137). */
export const DESTROY_SPAWNER_DURATION_SEC = 5
/** Empty habitat (`nearby === 0`) waits this many times longer than a
 *  replacement spawn (plan 139) — colonizing a vacant site is slower than
 *  filling one loss in an already-living group. */
export const EMPTY_HABITAT_RESPAWN_MULTIPLIER = 2

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
  /** Game-days between respawns while `active` and below `maxPreyCount`
   *  (plan 139). `Infinity` opts out (`wolfDen`). */
  respawnIntervalDays: number
  /** Configured population cap for this spawn point — both the live-nearby
   *  respawn gate (unchanged) and the `>50%` depletion reference population
   *  (plan 125). */
  maxPreyCount: number
  /** Accumulated game-days since the last respawn (or since a slot opened).
   *  Held at 0 while the live-nearby count is at cap so a vacancy starts a
   *  full interval instead of firing on the next frame. */
  daysSinceLastRespawn: number
  state: SpawnPointState
  /** Animals bound to this spawn point (`AnimalAgent.spawnPointId`) that
   *  have died since the current `active` cycle started — reset to 0 when
   *  the point recovers back to `active`. */
  deathsThisCycle: number
  /** `elapsedDays` at the moment `Zniszcz` disabled this point, or `null`
   *  while not disabled/recovering. */
  disabledAtDay: number | null
  /** Normalized den pressure `0..1` (plan quests-progression-007) — only
   *  meaningful on `wolfDen`; stays `0` elsewhere. */
  pressure: number
  /** When true, predator-human scoring treats humans as more attractive prey
   *  (plan quests-progression-007) — authoritative on the spawner, not on
   *  individual wolves. */
  humanTaste: boolean
  /** When false, `disabled` never enters the generic recovery path (permanent
   *  destruction for the quest wolf den). Ordinary caves/thickets stay `true`. */
  canRecover: boolean
  /** Last `elapsedDays` when a settlement-directed trip opportunity was
   *  consumed for this den, or `null` before the first trip. */
  lastSettlementTripOpportunityDay: number | null
}

/** Animals of the spawner's `kind` within this radius count toward its
 *  `maxPreyCount` cap (respawn) and the recovery population check. */
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

/** Interval in game-days until the next spawn at the current live-nearby
 *  count — empty sites use `EMPTY_HABITAT_RESPAWN_MULTIPLIER`. */
export function respawnIntervalDaysFor(intervalDays: number, nearbyCount: number): number {
  return nearbyCount === 0 ? intervalDays * EMPTY_HABITAT_RESPAWN_MULTIPLIER : intervalDays
}

/**
 * Ticks respawn timers in **game-days** and calls `onRespawn` for each
 * `active` spawner that's ready (timer elapsed, below its live same-kind
 * cap). A large `dayDelta` (time-skip) may spawn more than once, always
 * capped at ordinary capacity (`maxPreyCount` minus reserved persistent
 * slots — plan fauna-018). Pure timer/count bookkeeping — actual agent
 * creation is the caller's job. `depleted`/`disabled`/`recovering` spawners
 * never respawn (plan 125 §2/§3); `Infinity` intervals are skipped (plan
 * 139). Nearby count is by `kind` (prey *or* predator) so a wolf cave is
 * capped by living wolves, not an empty prey filter. Persistent occupants
 * must be excluded from `animalPositions` by the caller; reserved slots
 * still occupy capacity while the resident is away, a corpse, or tombstoned.
 */
export function updateSpawners(
  spawners: PreySpawner[],
  dayDelta: number,
  animalPositions: { kind: AnimalKind; x: number; z: number }[],
  onRespawn: (spawner: PreySpawner) => void,
  reservedPersistentSlots?: ReadonlyMap<string, number>,
): void {
  if (dayDelta <= 0) return
  for (const spawner of spawners) {
    if (spawner.state !== 'active') continue
    const respawnIntervalDays = effectiveRespawnIntervalDays(spawner)
    if (!Number.isFinite(respawnIntervalDays) || respawnIntervalDays <= 0) continue
    spawner.daysSinceLastRespawn += dayDelta

    const cap = ordinaryHabitatCapacity(
      effectiveMaxPreyCount(spawner),
      reservedPersistentSlots?.get(spawner.id) ?? 0,
    )
    let nearby = animalPositions.filter(
      (p) =>
        p.kind === spawner.kind &&
        Math.hypot(p.x - spawner.x, p.z - spawner.z) < SPAWNER_RADIUS,
    ).length
    if (nearby >= cap) {
      spawner.daysSinceLastRespawn = 0
      continue
    }

    while (nearby < cap) {
      const interval = respawnIntervalDaysFor(respawnIntervalDays, nearby)
      if (spawner.daysSinceLastRespawn < interval) break
      spawner.daysSinceLastRespawn -= interval
      onRespawn(spawner)
      nearby++
    }
    if (nearby >= cap) spawner.daysSinceLastRespawn = 0
  }
}

/**
 * Low-frequency (call at most once per in-game day, see `createFauna.ts`)
 * recovery check for one `disabled`/`recovering` spawn point (plan 125 §8):
 * once `RECOVERY_DAYS` have elapsed since `disabledAtDay`, the point moves to
 * `recovering` and waits there until at least `MIN_RECOVERY_POPULATION`
 * live same-kind animals are within `SPAWNER_RADIUS`, then becomes `active`
 * again with its cycle counters reset. No-op for any other state (including
 * `active`/`depleted`). `wolfDen` can sit in `disabled`/`recovering` after
 * a burn; it still will not respawn (`Infinity` interval) if it returns
 * to `active`.
 */
export function tickSpawnPointRecovery(
  spawner: PreySpawner,
  nowDays: number,
  nearbySameKindCount: number,
): void {
  if (spawner.canRecover === false) return
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

/** Minimal spawn-point lifecycle fields that need to survive a save/reload
 *  (`docs/plans/LOOSE-ENDS.md` 2026-08-16) — deliberately excludes
 *  position/type/kind (deterministic from the seed/settlement) and
 *  `daysSinceLastRespawn` (a short-lived timer that's fine to reset; a
 *  restored `active` point simply starts its respawn count from 0 again). */
export type SavedSpawnPointState = {
  state: SpawnPointState
  deathsThisCycle: number
  disabledAtDay: number | null
  pressure?: number
  humanTaste?: boolean
  canRecover?: boolean
  lastSettlementTripOpportunityDay?: number | null
}

/** Pure snapshot for `SaveData` — pairs with `restoreSpawnPointState`. */
export function snapshotSpawnPointState(spawner: PreySpawner): SavedSpawnPointState {
  return {
    state: spawner.state,
    deathsThisCycle: spawner.deathsThisCycle,
    disabledAtDay: spawner.disabledAtDay,
    pressure: spawner.pressure,
    humanTaste: spawner.humanTaste,
    canRecover: spawner.canRecover,
    lastSettlementTripOpportunityDay: spawner.lastSettlementTripOpportunityDay,
  }
}

/** Applies a saved snapshot onto a freshly constructed `PreySpawner` (same
 *  deterministic `id`, position, type, kind as before) — a no-op when there
 *  is nothing saved for this spawn point (fresh world, or a spawn point that
 *  didn't exist in an older save). */
export function restoreSpawnPointState(spawner: PreySpawner, saved: SavedSpawnPointState | undefined): void {
  if (!saved) return
  spawner.state = saved.state
  spawner.deathsThisCycle = saved.deathsThisCycle
  spawner.disabledAtDay = saved.disabledAtDay
  if (saved.pressure !== undefined) spawner.pressure = saved.pressure
  if (saved.humanTaste !== undefined) spawner.humanTaste = saved.humanTaste
  if (saved.canRecover !== undefined) spawner.canRecover = saved.canRecover
  if (saved.lastSettlementTripOpportunityDay !== undefined) {
    spawner.lastSettlementTripOpportunityDay = saved.lastSettlementTripOpportunityDay
  }
}

/** Default scenario fields for a freshly constructed habitat spawner. */
export function defaultSpawnPointScenarioFields(type: SpawnerType): Pick<
  PreySpawner,
  'pressure' | 'humanTaste' | 'canRecover' | 'lastSettlementTripOpportunityDay'
> {
  return {
    pressure: 0,
    humanTaste: false,
    canRecover: type !== 'wolfDen',
    lastSettlementTripOpportunityDay: null,
  }
}
