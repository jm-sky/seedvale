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

/** Fine-grained settlement shadow-content kinds (diagnostic only).
 *  Classification uses existing object `name` / `userData.settlementShadowKind`. */
export const SETTLEMENT_CONTENT_KINDS = [
  'houseStatic',
  'houseInteractive',
  'fence',
  'storage',
  'storageGoods',
  'workplace',
  'landmark',
  'fireLight',
  'decor',
  'other',
] as const

export type SettlementContentKind = (typeof SETTLEMENT_CONTENT_KINDS)[number]

export type SettlementShadowCensus = Record<SettlementContentKind, BucketStats>

/** Create-time / name-derived tag read by {@link classifySettlementContent}. */
export const SETTLEMENT_SHADOW_KIND_USERDATA = 'settlementShadowKind'

export type VisibilityRestore = { object: Object3D; visible: boolean }

function emptyBucket(): BucketStats {
  return { meshes: 0, instancedMeshes: 0, instances: 0, drawCalls: 0, triangles: 0 }
}

export function emptyCensus(): SceneCensus {
  const out = {} as SceneCensus
  for (const bucket of SCENE_BUCKETS) out[bucket] = emptyBucket()
  return out
}

export function emptySettlementShadowCensus(): SettlementShadowCensus {
  const out = {} as SettlementShadowCensus
  for (const kind of SETTLEMENT_CONTENT_KINDS) out[kind] = emptyBucket()
  return out
}

const SETTLEMENT_KIND_SET = new Set<string>(SETTLEMENT_CONTENT_KINDS)

function kindFromUserData(node: Object3D): SettlementContentKind | null {
  const raw = node.userData[SETTLEMENT_SHADOW_KIND_USERDATA]
  if (typeof raw === 'string' && SETTLEMENT_KIND_SET.has(raw)) {
    return raw as SettlementContentKind
  }
  return null
}

function kindFromName(name: string): SettlementContentKind | null {
  if (
    name === 'house-static'
    || name === 'house-static-batch'
    || name.startsWith('house-static:')
    || name.startsWith('house-static-batch:')
  ) {
    return 'houseStatic'
  }
  if (name === 'house-interactive' || name === 'door' || name === 'doorLeaf' || name === 'hingePivot') {
    return 'houseInteractive'
  }
  if (
    name === 'settlement-palisade'
    || name.startsWith('settlement-palisade-')
    || name === 'settlement-pasture-fence'
    || name.startsWith('settlement-pasture-fence-')
    || name === 'settlement-paddock-fence'
    || name.startsWith('settlement-paddock-fence-')
  ) {
    return 'fence'
  }
  if (
    name === 'settlement-barrels'
    || name.startsWith('settlement-barrels-')
    || name === 'settlement-household-barrels'
    || name.startsWith('settlement-household-barrels-')
    || name === 'settlement-household-storage'
    || name.startsWith('settlement-household-storage-')
    || name === 'settlement-hay'
    || name.startsWith('settlement-hay-')
    || name === 'settlement-paddock-hay'
    || name.startsWith('settlement-paddock-hay-')
    || name === 'settlement-household-troughs'
    || name.startsWith('settlement-household-troughs-')
    || name === 'settlement-pasture-troughs'
    || name.startsWith('settlement-pasture-troughs-')
    || name === 'settlement-paddock-troughs'
    || name.startsWith('settlement-paddock-troughs-')
  ) {
    return 'storage'
  }
  if (name.startsWith('garden:')) return 'landmark'
  if (
    name === 'settlement-bushes'
    || name.startsWith('settlement-bushes-')
    || name === 'settlement-plaza-cobble'
    || name.startsWith('settlement-plaza-cobble-')
    || name === 'settlement-plaza-paving'
  ) {
    return 'decor'
  }
  return null
}

/**
 * Settlement-only content kind for shadow diagnostics. Prefers
 * `userData.settlementShadowKind`, then known create-time / instanced names.
 * Returns `other` when the mesh is under settlement but unmatched.
 *
 * @domain world-terrain
 */
export function classifySettlementContent(object: Object3D): SettlementContentKind {
  let node: Object3D | null = object
  while (node) {
    const tagged = kindFromUserData(node)
    if (tagged) return tagged
    const fromName = kindFromName(node.name)
    if (fromName) return fromName
    node = node.parent
  }
  return 'other'
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

function accumulateInto(
  bucket: BucketStats,
  mesh: Mesh,
): void {
  const instances = mesh instanceof InstancedMesh ? Math.max(1, mesh.count) : 1
  bucket.meshes += 1
  if (mesh instanceof InstancedMesh) {
    bucket.instancedMeshes += 1
    bucket.instances += instances
  } else {
    bucket.instances += 1
  }
  bucket.drawCalls += drawCallsFor(mesh)
  bucket.triangles += triangleCount(mesh)
}

function accumulateMesh(census: SceneCensus, mesh: Mesh): void {
  accumulateInto(census[classifyObject(mesh)], mesh)
}

/** Estimated one-pass scene submission (no shadow map, no mirror, no post). */
export function censusScene(scene: Scene): SceneCensus {
  const census = emptyCensus()
  scene.traverse((object) => {
    if (!isRenderableMesh(object)) return
    accumulateMesh(census, object)
  })
  return census
}

/**
 * Upper-bound estimate of content that participates in the shadow map:
 * visible renderable meshes with `castShadow === true`, classified into the
 * same buckets as {@link censusScene}. Content estimate only — not GPU time.
 *
 * @domain world-terrain
 */
export function censusShadowCasters(scene: Scene): SceneCensus {
  const census = emptyCensus()
  scene.traverse((object) => {
    if (!isRenderableMesh(object)) return
    if (!object.castShadow) return
    accumulateMesh(census, object)
  })
  return census
}

/**
 * Settlement-only shadow-caster breakdown by content kind. Only counts
 * visible `castShadow` meshes whose top-level scene bucket is `settlement`.
 *
 * @domain world-terrain
 */
export function censusSettlementShadowCasters(scene: Scene): SettlementShadowCensus {
  const census = emptySettlementShadowCensus()
  scene.traverse((object) => {
    if (!isRenderableMesh(object)) return
    if (!object.castShadow) return
    if (classifyObject(object) !== 'settlement') return
    accumulateInto(census[classifySettlementContent(object)], object)
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
