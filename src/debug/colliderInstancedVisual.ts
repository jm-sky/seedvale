import {
  BoxGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  type Scene,
  Vector3,
} from 'three'
import type { Collider } from '../world/collision'

const RADIAL_SEGMENTS = 16
const DEFAULT_MAX_INSTANCES = 1024
const DEFAULT_HEIGHT = 2.4 * 10 // To be above the ground

export type ColliderInstancedVisualOptions = {
  maxInstances?: number
  color?: number
  opacity?: number
  height?: number
  namePrefix?: string
}

/**
 * Shared circle/OBB `InstancedMesh` pair for visualising `Collider[]` — one
 * translucent volume per collider, a cylinder for `circle` and a thin box for
 * `obb`. Extracted from the original `?debugColliders=1` overlay (plan
 * tools-003) so the gameplay debug view and the House Browser's read-only
 * collider preview share one rendering primitive instead of two. Purely
 * visual: never reads or writes the authoritative `Collider[]`'s source.
 */
export type ColliderInstancedVisual = {
  circleMesh: InstancedMesh
  obbMesh: InstancedMesh
  /** Rebuilds both instance sets from `colliders`. `transform`, when given,
   *  maps each collider (e.g. to apply visual-only padding) before its
   *  matrix is written — the source array/objects are never mutated. */
  setInstances: (colliders: readonly Collider[], transform?: (collider: Collider) => Collider) => void
  dispose: () => void
}

export function createColliderInstancedVisual(
  scene: Scene,
  options: ColliderInstancedVisualOptions = {},
): ColliderInstancedVisual {
  const maxInstances = options.maxInstances ?? DEFAULT_MAX_INSTANCES
  const height = options.height ?? DEFAULT_HEIGHT
  const namePrefix = options.namePrefix ?? 'collider-instanced-visual'

  const cylinderGeometry = new CylinderGeometry(1, 1, height, RADIAL_SEGMENTS)
  const boxGeometry = new BoxGeometry(1, height, 1)
  const material = new MeshBasicMaterial({
    color: options.color ?? 0xff8c1a,
    transparent: true,
    opacity: options.opacity ?? 0.3,
    depthWrite: false,
  })

  const circleMesh = new InstancedMesh(cylinderGeometry, material, maxInstances)
  circleMesh.name = `${namePrefix}-circle`
  circleMesh.count = 0
  circleMesh.renderOrder = 10
  circleMesh.frustumCulled = false
  scene.add(circleMesh)

  const obbMesh = new InstancedMesh(boxGeometry, material, maxInstances)
  obbMesh.name = `${namePrefix}-obb`
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
    circleMesh,
    obbMesh,
    setInstances(colliders, transform) {
      let circleCount = 0
      let obbCount = 0
      for (const raw of colliders) {
        const collider = transform ? transform(raw) : raw
        if (collider.type === 'circle') {
          if (circleCount >= maxInstances) continue
          _pos.set(collider.x, height / 2, collider.z)
          _scale.set(collider.radius, 1, collider.radius)
          _matrix.compose(_pos, _identityQuat, _scale)
          circleMesh.setMatrixAt(circleCount++, _matrix)
        } else {
          if (obbCount >= maxInstances) continue
          _pos.set(collider.x, 0, collider.z)
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
