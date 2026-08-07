import type { ItemKind } from './items'

export type ItemSpawnPoint = {
  id: string
  x: number
  z: number
  kind: ItemKind
  respawnTime: number
  timeSinceCollected: number
  collected: boolean
}

/** Pure timer bookkeeping — ticks `timeSinceCollected` for collected points and
 *  flips them back to available once `respawnTime` elapses. Mesh spawn/despawn
 *  is the caller's job (needs scene access), same split as `fauna/AnimalSpawner.ts`. */
export function updateItemSpawnPoints(points: ItemSpawnPoint[], dt: number): void {
  for (const p of points) {
    if (!p.collected) continue
    p.timeSinceCollected += dt
    if (p.timeSinceCollected >= p.respawnTime) {
      p.collected = false
      p.timeSinceCollected = 0
    }
  }
}
