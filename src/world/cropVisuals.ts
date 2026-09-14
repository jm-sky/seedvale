import * as THREE from 'three'
import type { CropDefinition, CropGrowthStage, CropId, CropPlacement } from './cropLifecycle'
import { createItemMesh, type ItemKind } from '../items/items'
import { createSeededRandom } from './parseSeed'
import { CROP_PLANT_FOOTPRINT_RADIUS, isPlantedCropId } from './plantedCrops'

/** Hard presentation budget per planted placement. Distinct from logical
 *  plant count and from `yieldCount` — a dense species may show fewer
 *  instances than it logically contains. */
export const CROP_VISUAL_INSTANCE_BUDGET: Record<CropId, number> = {
  carrot: 6,
  potato: 4,
  cabbage: 3,
}

/** Extra uniform scale applied when a placement shows more than one plant,
 *  so the cluster stays inside the shared planting footprint. */
const CROP_VISUAL_CLUSTER_SCALE: Record<CropId, number> = {
  carrot: 0.85,
  potato: 0.8,
  cabbage: 0.7,
}

/** Wild/natural placements stay a scattered find, not a sown cluster. */
const WILD_CROP_RENDERED_COUNT = 1

/** Keep visual plants slightly inside the logical footprint so the cluster
 *  does not read as overlapping a neighbour placement. */
const VISUAL_LAYOUT_RADIUS = CROP_PLANT_FOOTPRINT_RADIUS * 0.85

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const _dummy = new THREE.Object3D()
const _instanceMatrix = new THREE.Matrix4()

export type CropVisualTransform = {
  dx: number
  dz: number
  yaw: number
  scale: number
}

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function visualSeed(placement: CropPlacement): number {
  return hashString(`${placement.id}:${placement.cropId}`)
}

/**
 * How many visual instances one placement may show. Planted sowing units
 * use the species budget capped by logical population; wild crops stay at
 * one instance so procedural density is unchanged.
 *
 * @domain world
 */
export function resolveCropRenderedCount(placement: CropPlacement, def: CropDefinition): number {
  if (!isPlantedCropId(placement.id)) return WILD_CROP_RENDERED_COUNT
  return Math.max(1, Math.min(CROP_VISUAL_INSTANCE_BUDGET[def.id], def.logicalPlantsPerSowingUnit))
}

/**
 * Pure, deterministic layout for one `CropPlacement`. Offsets are keyed from
 * placement identity + species, so stage changes, chunk reload and save/load
 * keep the same spatial cluster. Does not mutate simulation state.
 *
 * @domain world
 */
export function resolveCropVisualLayout(
  placement: CropPlacement,
  def: CropDefinition,
): CropVisualTransform[] {
  const count = resolveCropRenderedCount(placement, def)
  const random = createSeededRandom(visualSeed(placement))
  if (count <= 1) {
    return [{ dx: 0, dz: 0, yaw: random() * Math.PI * 2, scale: 1 }]
  }

  const clusterScale = CROP_VISUAL_CLUSTER_SCALE[def.id]
  const out: CropVisualTransform[] = []
  for (let i = 0; i < count; i++) {
    const radius = VISUAL_LAYOUT_RADIUS * Math.sqrt((i + 0.5) / count)
    const angle = i * GOLDEN_ANGLE
    out.push({
      dx: Math.cos(angle) * radius,
      dz: Math.sin(angle) * radius,
      yaw: random() * Math.PI * 2,
      scale: clusterScale,
    })
  }
  return out
}

/** Minimal stage visual (plan 172 §4) — reuses each crop's existing pickup
 *  mesh (`items.ts`'s `createItemMesh`) instead of authoring per-stage GLBs:
 *  `young` is a small pale sprout stand-in, `mature` is the normal pickup
 *  shape, `spoiled` is the same shape darkened. Callers that need a cluster
 *  go through `createCropPlacementVisual` rather than cloning this N times. */
export function createCropStageMesh(harvestItem: ItemKind, stage: CropGrowthStage): THREE.Object3D {
  const mesh = createItemMesh(harvestItem)

  if (stage === 'young') {
    mesh.scale.multiplyScalar(0.45)
    tintMaterials(mesh, 0x8fbf5a, 0.35)
    return mesh
  }
  if (stage === 'spoiled') {
    tintMaterials(mesh, 0x2a2118, 0.6)
    mesh.rotation.z += 0.35
    return mesh
  }
  return mesh
}

/**
 * One interactable `CropPlacement` as a bounded, instanced visual cluster.
 * `userData.cropId` stays on the group (placement identity), never on each
 * biological plant.
 *
 * @domain world
 */
export function createCropPlacementVisual(
  placement: CropPlacement,
  def: CropDefinition,
  stage: CropGrowthStage,
  sampleHeight: (x: number, z: number) => number,
): THREE.Object3D {
  const layout = resolveCropVisualLayout(placement, def)
  const template = createCropStageMesh(def.harvestItem, stage)
  template.updateMatrixWorld(true)

  const root = new THREE.Group()
  root.userData.cropId = placement.id
  root.userData.cropDefId = placement.cropId
  root.userData.cropStage = stage

  const meshes: THREE.Mesh[] = []
  template.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh)
  })

  for (const mesh of meshes) {
    const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, layout.length)
    instanced.castShadow = mesh.castShadow
    instanced.receiveShadow = mesh.receiveShadow
    for (let i = 0; i < layout.length; i++) {
      const transform = layout[i]!
      const wx = placement.x + transform.dx
      const wz = placement.z + transform.dz
      _dummy.position.set(wx, sampleHeight(wx, wz), wz)
      _dummy.rotation.set(0, transform.yaw, 0)
      _dummy.scale.setScalar(transform.scale)
      _dummy.updateMatrix()
      _instanceMatrix.multiplyMatrices(_dummy.matrix, mesh.matrixWorld)
      instanced.setMatrixAt(i, _instanceMatrix)
    }
    instanced.instanceMatrix.needsUpdate = true
    instanced.computeBoundingSphere()
    root.add(instanced)
  }

  return root
}

function tintMaterials(root: THREE.Object3D, color: number, amount: number): void {
  const tint = new THREE.Color(color)
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.lerp(tint, amount)
      }
    }
  })
}
