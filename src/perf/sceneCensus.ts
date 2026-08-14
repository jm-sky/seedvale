import { InstancedMesh, Mesh, type Object3D, type Scene, SkinnedMesh } from 'three'

/** Scene-graph buckets used to attribute draw calls / triangles.
 *  Classification is by object `name` / `userData`, not GPU time. */
export const SCENE_BUCKETS = [
  'terrain',
  'grass',
  'vegetation',
  'environment',
  'settlement',
  'water',
  'npc',
  'fauna',
  'items',
  'other',
] as const

export type SceneBucket = (typeof SCENE_BUCKETS)[number]

export type BucketStats = {
  meshes: number
  instancedMeshes: number
  instances: number
  drawCalls: number
  triangles: number
}

export type SceneCensus = Record<SceneBucket, BucketStats>

export type VisibilityRestore = { object: Object3D; visible: boolean }

function emptyBucket(): BucketStats {
  return { meshes: 0, instancedMeshes: 0, instances: 0, drawCalls: 0, triangles: 0 }
}

export function emptyCensus(): SceneCensus {
  const out = {} as SceneCensus
  for (const bucket of SCENE_BUCKETS) out[bucket] = emptyBucket()
  return out
}

export function classifyObject(object: Object3D): SceneBucket {
  let node: Object3D | null = object
  while (node) {
    const n = node.name
    if (n === 'chunk') return 'terrain'
    if (n.startsWith('chunk-grass')) return 'grass'
    if (n.startsWith('chunk-vegetation')) return 'vegetation'
    if (n.startsWith('chunk-environment')) return 'environment'
    if (n === 'chunk-items' || n.startsWith('resourceDeposit:')) return 'items'
    if (n === 'chunk-water' || n === 'ocean') return 'water'
    if (n === 'settlement' || n.startsWith('house:') || n.startsWith('garden:')) return 'settlement'
    if (n === 'npc') return 'npc'
    if (n === 'fauna' || node.userData.animalKind || node.userData.faunaCapsule) return 'fauna'
    node = node.parent
  }
  return 'other'
}

function triangleCount(mesh: Mesh): number {
  const geometry = mesh.geometry
  if (!geometry) return 0
  const index = geometry.index
  const position = geometry.getAttribute('position')
  const verts = index ? index.count : (position?.count ?? 0)
  const instances = mesh instanceof InstancedMesh ? Math.max(1, mesh.count) : 1
  return (verts / 3) * instances
}

function drawCallsFor(mesh: Mesh): number {
  const material = mesh.material
  if (Array.isArray(material)) {
    const groups = mesh.geometry.groups
    return Math.max(1, groups.length || material.length)
  }
  return 1
}

function isRenderableMesh(object: Object3D): object is Mesh {
  if (!object.visible) return false
  const mesh = object as Mesh
  return mesh.isMesh === true || mesh instanceof InstancedMesh || mesh instanceof SkinnedMesh
}

/** Estimated one-pass scene submission (no shadow map, no mirror, no post). */
export function censusScene(scene: Scene): SceneCensus {
  const census = emptyCensus()
  scene.traverse((object) => {
    if (!isRenderableMesh(object)) return
    const bucket = census[classifyObject(object)]
    const instances = object instanceof InstancedMesh ? Math.max(1, object.count) : 1
    bucket.meshes += 1
    if (object instanceof InstancedMesh) {
      bucket.instancedMeshes += 1
      bucket.instances += instances
    } else {
      bucket.instances += 1
    }
    bucket.drawCalls += drawCallsFor(object)
    bucket.triangles += triangleCount(object)
  })
  return census
}

export function censusTotals(census: SceneCensus): BucketStats {
  const totals = emptyBucket()
  for (const bucket of SCENE_BUCKETS) {
    const row = census[bucket]
    totals.meshes += row.meshes
    totals.instancedMeshes += row.instancedMeshes
    totals.instances += row.instances
    totals.drawCalls += row.drawCalls
    totals.triangles += row.triangles
  }
  return totals
}

/** Hide every currently-visible mesh in `buckets`. Returns restore tokens. */
export function hideBuckets(root: Object3D, buckets: readonly SceneBucket[]): VisibilityRestore[] {
  const hide = new Set(buckets)
  const restore: VisibilityRestore[] = []
  root.traverse((object) => {
    if (!object.visible) return
    if (!isRenderableMesh(object) && object.children.length === 0) return
    if (!hide.has(classifyObject(object))) return
    restore.push({ object, visible: true })
    object.visible = false
  })
  return restore
}

export function restoreVisibility(tokens: readonly VisibilityRestore[]): void {
  for (const token of tokens) token.object.visible = token.visible
}
