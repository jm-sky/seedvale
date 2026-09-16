import { MeshStandardMaterial as MeshStandardMaterialCtor } from 'three'
import {
  FALLEN_LOG_SPECS,
  ROCK_CLUSTER_SPECS,
  ROCK_SPECS,
  TREE_SPECS,
} from '../settlement/propSpecs'
import { isFoliageMaterial } from './foliageWind'
import type { Material, Mesh, Object3D } from 'three'

export type NaturalMaterialProfile = 'rock' | 'wood'

/** Cap authored metallic response on nature rocks/logs (GLB preflight). */
export const NATURAL_MATERIAL_METALNESS_MAX = 0.08

/** Floor for overly glossy rock materials without flattening typical `0.5` values. */
export const NATURAL_MATERIAL_ROUGHNESS_MIN_ROCK = 0.45

/** Floor for log/trunk materials; authored `0.5` bark stays unchanged. */
export const NATURAL_MATERIAL_ROUGHNESS_MIN_WOOD = 0.5

const LEAVES_NAME_RE = /leaves/i

const ROCK_URLS = new Set<string>([
  ...ROCK_SPECS.map((s) => s.url),
  ...ROCK_CLUSTER_SPECS.map((s) => s.url),
])

const WOOD_URLS = new Set<string>([
  ...TREE_SPECS.map((s) => s.url),
  ...FALLEN_LOG_SPECS.map((s) => s.url),
])

/**
 * Explicit allow-list profile for in-plan nature GLBs (world-terrain-036).
 * @domain world-terrain
 */
export function naturalMaterialProfileForUrl(url: string): NaturalMaterialProfile | null {
  if (ROCK_URLS.has(url)) return 'rock'
  if (WOOD_URLS.has(url)) return 'wood'
  return null
}

function isWoodProfileTarget(mat: Material): boolean {
  if (isFoliageMaterial(mat)) return false
  if (LEAVES_NAME_RE.test(mat.name ?? '')) return false
  return true
}

function shouldTuneMaterial(mat: Material, profile: NaturalMaterialProfile): boolean {
  if (profile === 'rock') return true
  return isWoodProfileTarget(mat)
}

/**
 * Conservative PBR scalar correction on a shared GLB material (no maps/colors/alpha).
 * @domain world-terrain
 */
export function tuneNaturalMaterial(mat: Material, profile: NaturalMaterialProfile): void {
  if (!(mat instanceof MeshStandardMaterialCtor)) return
  if (!shouldTuneMaterial(mat, profile)) return

  const roughnessMin =
    profile === 'rock'
      ? NATURAL_MATERIAL_ROUGHNESS_MIN_ROCK
      : NATURAL_MATERIAL_ROUGHNESS_MIN_WOOD

  const nextMetalness = Math.min(mat.metalness, NATURAL_MATERIAL_METALNESS_MAX)
  const nextRoughness = Math.max(mat.roughness, roughnessMin)

  if (nextMetalness === mat.metalness && nextRoughness === mat.roughness) return

  mat.metalness = nextMetalness
  mat.roughness = nextRoughness
  mat.userData.naturalMaterialResponseProfile = profile
}

function collectMeshMaterials(root: Object3D): Material[] {
  const seen = new Set<Material>()
  const out: Material[] = []
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    const mat = mesh.material
    const list = Array.isArray(mat) ? mat : [mat]
    for (const m of list) {
      if (seen.has(m)) continue
      seen.add(m)
      out.push(m)
    }
  })
  return out
}

/** Apply profile once per unique material under `root` (shared GPU cache root). */
export function applyNaturalMaterialResponseOnObject(
  root: Object3D,
  profile: NaturalMaterialProfile,
): void {
  for (const mat of collectMeshMaterials(root)) {
    tuneNaturalMaterial(mat, profile)
  }
}

/**
 * Opt-in natural material tuning for cached GLB roots (`loadGltf.ts`).
 * @domain world-terrain
 */
export function applyNaturalMaterialResponseForUrl(url: string, root: Object3D): void {
  const profile = naturalMaterialProfileForUrl(url)
  if (!profile) return
  applyNaturalMaterialResponseOnObject(root, profile)
}
