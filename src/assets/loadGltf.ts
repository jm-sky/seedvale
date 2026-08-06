import {
  Box3,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const loader = new GLTFLoader()
const cache = new Map<string, Promise<Group>>()

/** Load a GLB/glTF from `/public` (e.g. `/models/settlement/hut_a.glb`). Cached by URL. */
export function loadGltf(url: string): Promise<Group> {
  let pending = cache.get(url)
  if (!pending) {
    pending = loader.loadAsync(url).then((gltf) => {
      const root = gltf.scene
      root.traverse((obj) => {
        const mesh = obj as Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
        mesh.receiveShadow = true
      })
      return root
    })
    cache.set(url, pending)
  }
  return pending.then((root) => root.clone(true))
}

const _box = new Box3()
const _size = new Vector3()
const _center = new Vector3()

/**
 * Fit model so its feet sit on y=0 and height ≈ `targetHeight` (world meters).
 * Returns the same object for chaining.
 */
export function prepareProp(
  object: Object3D,
  targetHeight: number,
): Object3D {
  object.updateMatrixWorld(true)
  _box.setFromObject(object)
  _box.getSize(_size)
  if (_size.y < 1e-4) return object

  const scale = targetHeight / _size.y
  object.scale.multiplyScalar(scale)
  object.updateMatrixWorld(true)

  _box.setFromObject(object)
  _box.getCenter(_center)
  object.position.x -= _center.x
  object.position.z -= _center.z
  object.position.y -= _box.min.y
  return object
}

export function disposeObject3D(object: Object3D): void {
  object.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach((m: Material) => m.dispose())
    else (mat as Material).dispose()
  })
}
