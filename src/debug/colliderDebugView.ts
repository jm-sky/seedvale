import {
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  Vector3,
} from 'three'
import type { Collider } from '../world/collision'

/** `?debugColliders=1` overlay (`debug/debugMode.ts`) — one translucent
 *  orange cylinder per nearby `Collider`, so gaps in circle-collision
 *  coverage (e.g. a doorway missing its jamb collider) are visible instead
 *  of only discoverable by walking into them. Purely visual: reads the same
 *  `Collider[]` the player/NPC/fauna movement code already queries, never
 *  writes to it. */
export type ColliderDebugView = {
  /** Rebuilds the instance set from every collider near `(x, z)`. Call once
   *  per frame while the overlay is active. */
  update: (x: number, z: number, collidersNear: (x: number, z: number) => readonly Collider[]) => void
  dispose: () => void
}

/** Cylinder height — tall enough to read as a "wall segment" against the
 *  player's eye height without implying an exact wall height (colliders
 *  carry no Y extent of their own; this is a flat 2D circle in the sim). */
const CYLINDER_HEIGHT = 2.4
const RADIAL_SEGMENTS = 16
/** Generous cap on simultaneously visible colliders — a dense settlement's
 *  3×3-cell neighborhood query can return well over 100 (wall modules +
 *  jambs + doors + props); silently truncate rather than resize the
 *  InstancedMesh mid-frame. */
const MAX_INSTANCES = 1024

export function createColliderDebugView(scene: Scene): ColliderDebugView {
  const geometry = new CylinderGeometry(1, 1, CYLINDER_HEIGHT, RADIAL_SEGMENTS)
  const material = new MeshBasicMaterial({
    color: 0xff8c1a,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  })
  const mesh = new InstancedMesh(geometry, material, MAX_INSTANCES)
  mesh.name = 'debug-collider-view'
  mesh.count = 0
  mesh.renderOrder = 10
  mesh.frustumCulled = false
  scene.add(mesh)

  const _pos = new Vector3()
  const _quat = new Quaternion()
  const _scale = new Vector3()
  const _matrix = new Matrix4()

  return {
    update(x, z, collidersNear) {
      const colliders = collidersNear(x, z)
      const count = Math.min(colliders.length, MAX_INSTANCES)
      for (let i = 0; i < count; i++) {
        const collider = colliders[i]!
        _pos.set(collider.x, CYLINDER_HEIGHT / 2, collider.z)
        _scale.set(collider.radius, 1, collider.radius)
        _matrix.compose(_pos, _quat, _scale)
        mesh.setMatrixAt(i, _matrix)
      }
      mesh.count = count
      mesh.instanceMatrix.needsUpdate = true
    },
    dispose() {
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  }
}
