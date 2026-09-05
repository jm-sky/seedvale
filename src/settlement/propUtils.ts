import * as THREE from 'three'
import { loadGltf, prepareProp, preparePropFitMax } from '../assets/loadGltf'

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

export type TerrainSampler = (x: number, z: number) => number

/** Local surface sample for terrain-aware procedural composition (plan 173)
 *  — ground height plus a normalized world-space normal from a small
 *  central-difference stencil. Distinct from `evaluateGroundPlacement()`'s
 *  slope-rejection contract in `items/tentPlacement.ts`: this is for
 *  adapting individual elements *within* an already-accepted landmark
 *  (stone-circle stones, cemetery graves), not for deciding whether a
 *  placement is allowed at all. */
export type LocalTerrainSample = {
  height: number
  normal: THREE.Vector3
}

const TILT_UP = new THREE.Vector3(0, 1, 0)

export function sampleLocalTerrain(
  sampleHeight: TerrainSampler,
  x: number,
  z: number,
  step = 0.4,
): LocalTerrainSample {
  const height = sampleHeight(x, z)
  const hL = sampleHeight(x - step, z)
  const hR = sampleHeight(x + step, z)
  const hD = sampleHeight(x, z - step)
  const hU = sampleHeight(x, z + step)
  const normal = new THREE.Vector3(hL - hR, 2 * step, hD - hU).normalize()
  return { height, normal }
}

/** Tilts `mesh` toward a terrain `normal`, clamped to `maxTiltRad` so a
 *  visually minor slope can't produce an obviously artificial lean (plan 173
 *  implementation notes, "Terrain orientation"). Applied as a world-space
 *  rotation on top of whatever yaw the caller already set on `mesh.rotation.y`
 *  — a no-op when the terrain is already flat or the clamp is 0. */
export function applyTerrainTilt(mesh: THREE.Object3D, normal: THREE.Vector3, maxTiltRad: number): void {
  if (maxTiltRad <= 0) return
  const tilt = TILT_UP.angleTo(normal)
  if (tilt < 1e-4) return
  const axis = new THREE.Vector3().crossVectors(TILT_UP, normal)
  if (axis.lengthSq() < 1e-8) return
  axis.normalize()
  const clamped = Math.min(tilt, maxTiltRad)
  mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, clamped))
}

/** Rotates a local `(x, z)` offset around Y by `rotationY` — same convention
 *  as `Object3D.rotation.y`. A landmark's individual elements need to know
 *  their true world position to sample terrain correctly, so the overall
 *  yaw must be baked into each element's offset before sampling rather than
 *  left as a parent-group transform applied afterward (plan 173). */
export function rotateOffsetY(x: number, z: number, rotationY: number): { x: number, z: number } {
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)
  return { x: x * cos + z * sin, z: -x * sin + z * cos }
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

/** Forces every mesh under `object` to skip the shadow pass, overriding
 *  `loadGltf.ts`'s `SMALL_MESH_SHADOW_THRESHOLD` bbox-diagonal heuristic —
 *  needed for props whose *authored* (pre-fit) geometry is large enough to
 *  read as shadow-casting even though the in-game (post-fit) prop is a small,
 *  decorative reed/lily/seaweed clump (plan world-terrain-010's "reeds, lily
 *  pads and seaweed cast no shadows by default" hard constraint). */
function disableCastShadow(object: THREE.Object3D): THREE.Object3D {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh) mesh.castShadow = false
  })
  return object
}

export async function loadPropOrFallback(
  url: string,
  targetHeight: number,
  fallback: () => THREE.Object3D,
  /** `'height'` (default) fits the model's Y extent — right for anything
   *  authored taller than wide. `'max'` fits the longest bbox axis instead
   *  (`preparePropFitMax`) — right for flat/wide props like a lily pad, where
   *  height-fitting would inflate a near-zero Y extent absurdly. */
  fit: 'height' | 'max' = 'height',
  /** See {@link disableCastShadow}. */
  noShadow = false,
): Promise<THREE.Object3D> {
  try {
    const model = await loadGltf(url)
    if (fit === 'max') preparePropFitMax(model, targetHeight)
    else prepareProp(model, targetHeight)
    if (noShadow) disableCastShadow(model)
    return model
  } catch (err) {
    console.warn(`[settlement] failed to load ${url}, using fallback`, err)
    return fallback()
  }
}

export async function loadPropTemplates(
  specs: ReadonlyArray<{ url: string, height: number }>,
  fallback: () => THREE.Object3D,
  fit: 'height' | 'max' = 'height',
  noShadow = false,
): Promise<THREE.Object3D[]> {
  return Promise.all(
    specs.map((spec) => loadPropOrFallback(spec.url, spec.height, fallback, fit, noShadow)),
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
