import {
  BoxGeometry,
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
 *  orange volume per nearby `Collider` (a cylinder for a circle, a thin box
 *  for an OBB — plan settlements-001 added house wall/door OBBs), so gaps in
 *  collision coverage (e.g. a doorway missing its collider) are visible
 *  instead of only discoverable by walking into them. Purely visual: reads
 *  the same `Collider[]` the player/NPC/fauna movement code already
 *  queries, never writes to it. */
export type ColliderDebugView = {
  /** Rebuilds the instance sets from every collider near `(x, z)`. Call once
   *  per frame while the overlay is active. */
  update: (x: number, z: number, collidersNear: (x: number, z: number) => readonly Collider[]) => void
  dispose: () => void
}

/** Volume height — tall enough to read as a "wall segment" against the
 *  player's eye height without implying an exact wall height (colliders
 *  carry no Y extent of their own; this is a flat 2D shape in the sim). */
const VOLUME_HEIGHT = 2.4
const RADIAL_SEGMENTS = 16
/** Generous cap on simultaneously visible colliders of one shape — a dense
 *  settlement's 3×3-cell neighborhood query can return well over 100 (wall
 *  pieces + doors + props); silently truncate rather than resize the
 *  InstancedMesh mid-frame. */
const MAX_INSTANCES = 1024

export function createColliderDebugView(scene: Scene): ColliderDebugView {
  const cylinderGeometry = new CylinderGeometry(1, 1, VOLUME_HEIGHT, RADIAL_SEGMENTS)
  const boxGeometry = new BoxGeometry(1, VOLUME_HEIGHT, 1)
  const material = new MeshBasicMaterial({
    color: 0xff8c1a,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  })

  const circleMesh = new InstancedMesh(cylinderGeometry, material, MAX_INSTANCES)
  circleMesh.name = 'debug-collider-view-circle'
  circleMesh.count = 0
  circleMesh.renderOrder = 10
  circleMesh.frustumCulled = false
  scene.add(circleMesh)

  const obbMesh = new InstancedMesh(boxGeometry, material, MAX_INSTANCES)
  obbMesh.name = 'debug-collider-view-obb'
  obbMesh.count = 0
  obbMesh.renderOrder = 10
  obbMesh.frustumCulled = false
  scene.add(obbMesh)

  const _pos = new Vector3()
  const _quat = new Quaternion()
  const _scale = new Vector3()
  const _matrix = new Matrix4()
  const _yAxis = new Vector3(0, 1, 0)
  const _identityQuat = new Quaternion()

  return {
    update(x, z, collidersNear) {
      const colliders = collidersNear(x, z)
      let circleCount = 0
      let obbCount = 0
      for (const collider of colliders) {
        if (collider.type === 'circle') {
          if (circleCount >= MAX_INSTANCES) continue
          _pos.set(collider.x, VOLUME_HEIGHT / 2, collider.z)
          _scale.set(collider.radius, 1, collider.radius)
          _matrix.compose(_pos, _identityQuat, _scale)
          circleMesh.setMatrixAt(circleCount++, _matrix)
        } else {
          if (obbCount >= MAX_INSTANCES) continue
          _pos.set(collider.x, VOLUME_HEIGHT / 2, collider.z)
          _quat.setFromAxisAngle(_yAxis, collider.rotationY)
          _scale.set(collider.halfWidth * 2, 1, collider.halfDepth * 2)
          _matrix.compose(_pos, _quat, _scale)
          obbMesh.setMatrixAt(obbCount++, _matrix)
        }
      }
      circleMesh.count = circleCount
      circleMesh.instanceMatrix.needsUpdate = true
      obbMesh.count = obbCount
      obbMesh.instanceMatrix.needsUpdate = true
    },
    dispose() {
      circleMesh.removeFromParent()
      obbMesh.removeFromParent()
      cylinderGeometry.dispose()
      boxGeometry.dispose()
      material.dispose()
    },
  }
}
