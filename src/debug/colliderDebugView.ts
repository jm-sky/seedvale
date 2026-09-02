import type { Collider } from '../world/collision'
import { createColliderInstancedVisual } from './colliderInstancedVisual'
import type { Scene } from 'three'

/** `?debugColliders=1` overlay (`debug/debugMode.ts`) — one translucent
 *  orange volume per nearby `Collider` (a cylinder for a circle, a thin box
 *  for an OBB — plan settlements-001 added the OBB for house walls/doors), so
 *  gaps in collision coverage (e.g. a doorway missing its collider) are
 *  visible instead of only discoverable by walking into them. Purely
 *  visual: reads the same `Collider[]` the player/NPC/fauna movement code
 *  already queries, never writes to it. The instanced rendering itself lives
 *  in `colliderInstancedVisual.ts`, shared with the House Browser's
 *  `ColliderPreview` (plan tools-003). */
export type ColliderDebugView = {
  /** Rebuilds the instance sets from every collider near `(x, z)`. Call once
   *  per frame while the overlay is active. */
  update: (x: number, z: number, collidersNear: (x: number, z: number) => readonly Collider[]) => void
  dispose: () => void
}

export function createColliderDebugView(scene: Scene): ColliderDebugView {
  const visual = createColliderInstancedVisual(scene, { namePrefix: 'debug-collider-view' })

  return {
    update(x, z, collidersNear) {
      visual.setInstances(collidersNear(x, z))
    },
    dispose() {
      visual.dispose()
    },
  }
}
