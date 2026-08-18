import * as THREE from 'three'
import { loadGltf, prepareProp } from '../assets/loadGltf'

/**
 * Recolor a cloned prop without mutating shared GLTF materials
 * (`loadGltf` marks cache materials `sharedGpu`). Clones each material,
 * clears the shared flag so `disposeObject3D` can free the tint instance,
 * then applies `hex`.
 */
export function tintPropMaterials(root: THREE.Object3D, hex: number): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const apply = (mat: THREE.Material): THREE.Material => {
      const next = mat.clone()
      next.userData = { ...next.userData, sharedGpu: false }
      const colored = next as THREE.Material & { color?: THREE.Color }
      if (colored.color) colored.color.setHex(hex)
      return next
    }
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(apply)
    } else {
      mesh.material = apply(mesh.material)
    }
  })
}

export function placeOnGround(
  mesh: THREE.Object3D,
  x: number,
  z: number,
  sampleHeight: (x: number, z: number) => number,
  yOffset = 0,
): void {
  // Preserve local offsets from prepareProp (foot / center).
  const ox = mesh.position.x
  const oy = mesh.position.y
  const oz = mesh.position.z
  mesh.position.set(
    x + ox,
    sampleHeight(x, z) + yOffset + oy,
    z + oz,
  )
}

export async function loadPropOrFallback(
  url: string,
  targetHeight: number,
  fallback: () => THREE.Object3D,
): Promise<THREE.Object3D> {
  try {
    const model = await loadGltf(url)
    prepareProp(model, targetHeight)
    return model
  } catch (err) {
    console.warn(`[settlement] failed to load ${url}, using fallback`, err)
    return fallback()
  }
}

export async function loadPropTemplates(
  specs: ReadonlyArray<{ url: string, height: number }>,
  fallback: () => THREE.Object3D,
): Promise<THREE.Object3D[]> {
  return Promise.all(
    specs.map((spec) => loadPropOrFallback(spec.url, spec.height, fallback)),
  )
}

export function cloneProp(
  templates: THREE.Object3D[],
  index: number,
  scale: number,
): THREE.Object3D {
  const src = templates[index % templates.length]!
  const prop = src.clone(true)
  prop.scale.multiplyScalar(scale)
  prop.rotation.y = Math.random() * Math.PI * 2
  return prop
}

/** Like `cloneProp`, but yaw comes from the caller (seeded / placement) —
 *  avoids `Math.random()` so chunk reload and ore piles stay deterministic. */
export function clonePropWithYaw(
  templates: THREE.Object3D[],
  index: number,
  scale: number,
  rotationY: number,
): THREE.Object3D {
  const src = templates[index % templates.length]!
  const prop = src.clone(true)
  prop.scale.multiplyScalar(scale)
  prop.rotation.y = rotationY
  return prop
}
