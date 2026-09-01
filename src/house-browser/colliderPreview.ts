import type { CircleCollider, Collider, ObbCollider } from '../world/collision'
import { createColliderInstancedVisual } from '../debug/colliderInstancedVisual'
import type { Scene } from 'three'

const PREVIEW_MAX_INSTANCES = 256

export interface ColliderPreviewConfig {
  visible: boolean
  padding: number
}

export interface ColliderPreview {
  setColliders(colliders: readonly Collider[]): void
  setVisible(visible: boolean): void
  setPadding(padding: number): void
  dispose(): void
}

/** Applies visual-only padding to one `Collider`, returning a new object —
 *  the authoritative source `Collider` is never mutated (plan tools-003 §9).
 *  `padding` is metres added to the radius/half-extents. */
export function inflateCollider(collider: CircleCollider, padding: number): CircleCollider
export function inflateCollider(collider: ObbCollider, padding: number): ObbCollider
export function inflateCollider(collider: Collider, padding: number): Collider
export function inflateCollider(collider: Collider, padding: number): Collider {
  if (collider.type === 'circle') {
    return { ...collider, radius: collider.radius + padding }
  }
  return {
    ...collider,
    halfWidth: collider.halfWidth + padding,
    halfDepth: collider.halfDepth + padding,
  }
}

/**
 * House Browser's read-only visualisation of the current house's real
 * `Collider[]` (from `buildAssemblyCollidersWorld()`), reusing the same
 * circle/OBB instanced rendering as the gameplay `?debugColliders=1` overlay
 * (`colliderInstancedVisual.ts`). Rebuilds only on collider/padding change,
 * never every frame.
 */
export function createColliderPreview(scene: Scene): ColliderPreview {
  const visual = createColliderInstancedVisual(scene, {
    maxInstances: PREVIEW_MAX_INSTANCES,
    namePrefix: 'house-browser-collider-preview',
  })
  visual.circleMesh.visible = false
  visual.obbMesh.visible = false

  let colliders: readonly Collider[] = []
  let padding = 0

  function rebuild(): void {
    visual.setInstances(colliders, (collider) => inflateCollider(collider, padding))
  }

  return {
    setColliders(next) {
      colliders = next
      rebuild()
    },
    setVisible(visible) {
      visual.circleMesh.visible = visible
      visual.obbMesh.visible = visible
    },
    setPadding(next) {
      padding = next
      rebuild()
    },
    dispose() {
      visual.dispose()
    },
  }
}
