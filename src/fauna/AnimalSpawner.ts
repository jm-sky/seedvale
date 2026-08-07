import type { AnimalKind } from './AnimalAgent'

export type SpawnerType = 'cave' | 'thicket' | 'grove'

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
