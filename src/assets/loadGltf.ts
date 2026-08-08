import {
  type AnimationClip,
  Box3,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'

const loader = new GLTFLoader()

type CachedGltf = {
  root: Group
  animations: AnimationClip[]
}

const cache = new Map<string, Promise<CachedGltf>>()

export type GltfAsset = {
  root: Group
  animations: AnimationClip[]
  /** Skinned-safe clone of the prepared root. */
  clone: () => Group
}

function loadCached(url: string): Promise<CachedGltf> {
  let pending = cache.get(url)
  if (!pending) {
    pending = loader.loadAsync(url).then((gltf) => {
      const root = gltf.scene
      root.traverse((obj) => {
        const mesh = obj as Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
        mesh.receiveShadow = true
        // Every clone (SkeletonUtils.clone / Object3D.clone(true)) shares this
        // geometry/material BY REFERENCE with this cached root — flagging it
        // here, on the geometry/material object itself, survives cloning no
        // matter how faithfully each clone path copies `userData` on the mesh.
        // `disposeObject3D` checks this and skips freeing it.
        mesh.geometry.userData.sharedGpu = true
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((m: Material) => { m.userData.sharedGpu = true })
        else (mat as Material).userData.sharedGpu = true
      })
      return { root, animations: gltf.animations ?? [] }
    })
    cache.set(url, pending)
  }
  return pending
}

/** Load a GLB/glTF from `/public` (e.g. `/models/settlement/hut_a.glb`). Cached by URL. */
export function loadGltf(url: string): Promise<Group> {
  return loadCached(url).then((asset) => cloneSkinned(asset.root) as Group)
}

/** Load GLB with animation clips (shared); clones use SkeletonUtils. */
export async function loadGltfAsset(url: string): Promise<GltfAsset> {
  const asset = await loadCached(url)
  return {
    root: asset.root,
    animations: asset.animations,
    clone: () => cloneSkinned(asset.root) as Group,
  }
}

/** Alias for NPC code: `{ scene, animations }` with a skinned-safe scene clone. */
export async function loadGltfAnimated(
  url: string,
): Promise<{ scene: Group, animations: AnimationClip[] }> {
  const asset = await loadGltfAsset(url)
  return { scene: asset.clone(), animations: asset.animations }
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

/** Frees geometry/material GPU resources for everything under `object` — but
 *  never for resources shared with the GLTF loader cache (see `loadCached`'s
 *  `sharedGpu` flag): those live for the app's lifetime, and freeing them here
 *  would just force a shader recompile + buffer re-upload next time any other
 *  clone of the same asset is used. */
export function disposeObject3D(object: Object3D): void {
  object.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    if (!mesh.geometry.userData.sharedGpu) mesh.geometry.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) {
      mat.forEach((m: Material) => { if (!m.userData.sharedGpu) m.dispose() })
    } else if (!(mat as Material).userData.sharedGpu) {
      (mat as Material).dispose()
    }
  })
}
