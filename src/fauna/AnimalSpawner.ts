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

export type PreySpawner = {
  x: number
  z: number
  type: SpawnerType
  kind: AnimalKind
  respawnTime: number
  maxPreyCount: number
  timeSinceLastRespawn: number
}

/** Prey within this radius of a spawner count toward its `maxPreyCount` cap. */
export const SPAWNER_RADIUS = 12

/**
 * Ticks respawn timers and calls `onRespawn` once per spawner that's ready
 * (timer elapsed, below its live-prey cap). Pure timer/count bookkeeping —
 * actual agent creation/placement is the caller's job (needs scene + terrain).
 */
export function updateSpawners(
  spawners: PreySpawner[],
  dt: number,
  preyPositions: { kind: AnimalKind; x: number; z: number }[],
  onRespawn: (spawner: PreySpawner) => void,
): void {
  for (const spawner of spawners) {
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
