import {
  type BufferGeometry,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three'
import { type ConstructionCatalog } from '../assets/constructionCatalog'
import {
  HOUSE_MODULE_M,
  type HouseCornerSide,
  type HouseDefinition,
  type HouseInteractionPoint,
  type HouseOpening,
  type HouseRoofPart,
  type HouseVec3,
  type HouseWallPlacement,
  type HouseWallSide,
} from '../assets/houseDefinitionExample'
import { disposeObject3D, loadGltf } from '../assets/loadGltf'

/**
 * House assembly layer over `ConstructionCatalog` (plan 111). Settlement still
 * owns placement, households and NPC Places — this module only builds the
 * visual house from catalog parts, splits static/interactive, and exposes a
 * door hinge controller. It does not know `SettlementsManager`.
 *
 * Known offsets from review 011 — do not infer these from AABB:
 * - `doorframe_flat_wooddark` / `window_wide_flat1`: identity on the matching wall
 * - `door_1_flat`: x ≈ -0.51 m (hinge origin → centred opening)
 */

export const DOOR_1_FLAT_HINGE_OFFSET_X = -0.51
export const DOOR_OPEN_ANGLE = Math.PI / 2
export const DOOR_ANIM_SPEED = 4
/** Uniform world scale on the assembled house — native MegaKit metres × this. */
export const HOUSE_ASSEMBLY_SCALE = 1.1

const Y_AXIS = new Vector3(0, 1, 0)
const _pos = new Vector3()
const _quat = new Quaternion()
const _scale = new Vector3(1, 1, 1)
const _local = new Matrix4()
const _world = new Matrix4()

export const WALL_YAW: Record<HouseWallSide, number> = {
  back: Math.PI,
  front: 0,
  left: -Math.PI / 2,
  right: Math.PI / 2,
}

const WALL_OUTWARD: Record<HouseWallSide, { x: number, z: number }> = {
  back: { x: 0, z: 1 },
  front: { x: 0, z: -1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
}

const CORNER_SIGN: Record<HouseCornerSide, { x: number, z: number }> = {
  backLeft: { x: -1, z: 1 },
  backRight: { x: 1, z: 1 },
  frontLeft: { x: -1, z: -1 },
  frontRight: { x: 1, z: -1 },
}

export type HouseLocalPose = {
  x: number
  y: number
  z: number
  rotationY: number
}

export type HousePartPrimitive = {
  geometry: BufferGeometry
  material: Material | Material[]
  localMatrix: Matrix4
  castShadow: boolean
  receiveShadow: boolean
}

export type HouseBuildContext = {
  catalog: ConstructionCatalog
  /** Prepared part roots keyed by construction `assetId`. Geometry is shared. */
  templates: ReadonlyMap<string, Object3D>
}

export type HouseDoor = {
  hinge: Object3D
  leaf: Object3D
  setOpen: (open: boolean) => void
  toggle: () => void
  isOpen: () => boolean
  update: (dt: number) => void
}

export type HouseAssemblyCensus = {
  staticMeshes: number
  staticInstancedMeshes: number
  staticInstances: number
  interactiveMeshes: number
  renderables: number
}

export type HouseAssembly = {
  definitionId: string
  root: Group
  staticGroup: Group
  interactiveGroup: Group
  doors: HouseDoor[]
  interactionPoints: HouseInteractionPoint[]
  census: HouseAssemblyCensus
  update: (dt: number) => void
  dispose: () => void
}

export type HouseStaticBatch = {
  group: Group
  ingest: (assembly: HouseAssembly) => void
  commit: () => void
}

type StaticSpec = {
  assetId: string
  pose: HouseLocalPose
}

function composePose(pose: HouseLocalPose): Matrix4 {
  _pos.set(pose.x, pose.y, pose.z)
  _quat.setFromAxisAngle(Y_AXIS, pose.rotationY)
  return new Matrix4().compose(_pos, _quat, _scale)
}

function applyPose(object: Object3D, pose: HouseLocalPose): void {
  object.position.set(pose.x, pose.y, pose.z)
  object.rotation.set(0, pose.rotationY, 0)
}

function addVec(a: HouseVec3 | undefined, b: HouseLocalPose): HouseLocalPose {
  if (!a) return b
  return {
    x: b.x + (a.x ?? 0),
    y: b.y + (a.y ?? 0),
    z: b.z + (a.z ?? 0),
    rotationY: b.rotationY,
  }
}

export function wallLocalTransform(
  footprint: { width: number, depth: number },
  side: HouseWallSide,
  moduleIndex: number,
  module = HOUSE_MODULE_M,
): HouseLocalPose {
  const halfW = footprint.width / 2
  const halfD = footprint.depth / 2
  const along = (moduleIndex + 0.5) * module
  switch (side) {
    case 'back':
      return { x: -halfW + along, y: 0, z: halfD, rotationY: WALL_YAW.back }
    case 'front':
      return { x: -halfW + along, y: 0, z: -halfD, rotationY: WALL_YAW.front }
    case 'left':
      return { x: -halfW, y: 0, z: -halfD + along, rotationY: WALL_YAW.left }
    case 'right':
      return { x: halfW, y: 0, z: -halfD + along, rotationY: WALL_YAW.right }
  }
}

export function cornerLocalPosition(
  footprint: { width: number, depth: number },
  side: HouseCornerSide,
): HouseVec3 {
  const sign = CORNER_SIGN[side]
  return {
    x: sign.x * footprint.width / 2,
    y: 0,
    z: sign.z * footprint.depth / 2,
  }
}

export function floorTilePositions(
  footprint: { width: number, depth: number },
  tileCount: number,
  module = HOUSE_MODULE_M,
): HouseVec3[] {
  const cols = Math.max(1, Math.round(footprint.width / module))
  const rows = Math.max(1, Math.round(footprint.depth / module))
  const out: HouseVec3[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (out.length >= tileCount) return out
      out.push({
        x: -footprint.width / 2 + (col + 0.5) * module,
        y: 0,
        z: -footprint.depth / 2 + (row + 0.5) * module,
      })
    }
  }
  return out
}

export function houseFootprintRadius(def: HouseDefinition): number {
  if (def.footprintRadius != null) return def.footprintRadius
  return (0.5 * Math.hypot(def.footprint.width, def.footprint.depth) + 0.45) * HOUSE_ASSEMBLY_SCALE
}

export function matchingWallPlacement(def: HouseDefinition, opening: HouseOpening): HouseWallPlacement {
  const matches = def.walls.filter((wall) => (
    wall.assetId === opening.wallAssetId
    && (opening.side == null || wall.side === opening.side)
    && (opening.moduleIndex == null || wall.moduleIndex === opening.moduleIndex)
  ))
  const wall = matches[0]
  if (!wall) {
    throw new Error(`HouseBuilder: no wall matching opening ${opening.wallAssetId}`)
  }
  return wall
}

function wallTopY(def: HouseDefinition, catalog: ConstructionCatalog): number {
  let top = 0
  for (const wall of def.walls) {
    const part = catalog.byAssetId.get(wall.assetId)
    if (part && part.dimensions.y > top) top = part.dimensions.y
  }
  return top > 0 ? top : 3.12
}

export function resolveRoofParts(def: HouseDefinition, catalog: ConstructionCatalog): HouseRoofPart[] {
  if (def.roof.parts && def.roof.parts.length > 0) return [...def.roof.parts]
  const assetId = def.roof.assetId
  const segmentCount = def.roof.segmentCount ?? 0
  if (!assetId || segmentCount <= 0) return []
  const y = wallTopY(def, catalog)
  const parts: HouseRoofPart[] = []
  for (let i = 0; i < segmentCount; i++) {
    const x = -def.footprint.width / 2 + (i + 0.5) * HOUSE_MODULE_M
    const position = { x, y, z: 0 }
    parts.push({ assetId, position, rotationY: 0 })
    parts.push({ assetId, position: { ...position }, rotationY: Math.PI })
  }
  return parts
}

export function houseDefinitionAssetIds(def: HouseDefinition): string[] {
  const ids = [def.floor.assetId]
  for (const wall of def.walls) ids.push(wall.assetId)
  for (const corner of def.corners) ids.push(corner.assetId)
  for (const opening of def.openings) {
    ids.push(opening.wallAssetId)
    if (opening.frameAssetId) ids.push(opening.frameAssetId)
    ids.push(opening.fillAssetId)
  }
  for (const part of def.roof.parts ?? []) ids.push(part.assetId)
  if (def.roof.assetId) ids.push(def.roof.assetId)
  for (const deco of def.decorations ?? []) ids.push(deco.assetId)
  return [...new Set(ids)]
}

export async function loadHousePartTemplates(
  catalog: ConstructionCatalog,
  assetIds: readonly string[],
  load: (url: string) => Promise<Object3D> = loadGltf,
): Promise<Map<string, Object3D>> {
  const unique = [...new Set(assetIds)]
  const entries = await Promise.all(unique.map(async (assetId) => {
    const part = catalog.byAssetId.get(assetId)
    if (!part) throw new Error(`HouseBuilder: unknown assetId ${assetId}`)
    const root = await load(part.url)
    return [assetId, root] as const
  }))
  return new Map(entries)
}

/** Review 011 known fill offsets. Window insert is identity (absent here). */
export function fillOffsetFor(assetId: string, explicit?: Partial<HouseVec3>): HouseVec3 {
  if (explicit) {
    return { x: explicit.x ?? 0, y: explicit.y ?? 0, z: explicit.z ?? 0 }
  }
  if (assetId.endsWith('/door_1_flat') || assetId.endsWith(':door_1_flat')) {
    return { x: DOOR_1_FLAT_HINGE_OFFSET_X, y: 0, z: 0 }
  }
  return { x: 0, y: 0, z: 0 }
}

function requireTemplate(ctx: HouseBuildContext, assetId: string): Object3D {
  const template = ctx.templates.get(assetId)
  if (!template) throw new Error(`HouseBuilder: missing template ${assetId}`)
  return template
}

function requirePart(ctx: HouseBuildContext, assetId: string) {
  const part = ctx.catalog.byAssetId.get(assetId)
  if (!part) throw new Error(`HouseBuilder: asset not in ConstructionCatalog: ${assetId}`)
  return part
}

function flattenPart(root: Object3D): HousePartPrimitive[] {
  const primitives: HousePartPrimitive[] = []
  const walk = (node: Object3D, parentMatrix: Matrix4): void => {
    const isRoot = node === root
    node.updateMatrix()
    const localMatrix = isRoot
      ? parentMatrix.clone()
      : parentMatrix.clone().multiply(node.matrix)
    const mesh = node as Mesh
    if (mesh.isMesh) {
      primitives.push({
        geometry: mesh.geometry,
        material: mesh.material,
        localMatrix,
        castShadow: mesh.castShadow,
        receiveShadow: mesh.receiveShadow,
      })
    }
    for (const child of node.children) walk(child, localMatrix)
  }
  walk(root, new Matrix4())
  return primitives
}

function countMeshes(object: Object3D): number {
  let n = 0
  object.traverse((node) => {
    const mesh = node as Mesh
    if (mesh.isMesh && !(mesh as InstancedMesh).isInstancedMesh) n++
  })
  return n
}

export function censusAssembly(staticGroup: Object3D, interactiveGroup: Object3D): HouseAssemblyCensus {
  let staticMeshes = 0
  let staticInstancedMeshes = 0
  let staticInstances = 0
  staticGroup.traverse((node) => {
    const inst = node as InstancedMesh
    if (inst.isInstancedMesh) {
      staticInstancedMeshes++
      staticInstances += inst.count
      return
    }
    const mesh = node as Mesh
    if (mesh.isMesh) staticMeshes++
  })
  const interactiveMeshes = countMeshes(interactiveGroup)
  return {
    staticMeshes,
    staticInstancedMeshes,
    staticInstances,
    interactiveMeshes,
    renderables: staticMeshes + staticInstancedMeshes + interactiveMeshes,
  }
}

function instantiateStatics(
  parent: Group,
  specs: readonly StaticSpec[],
  ctx: HouseBuildContext,
): void {
  const byAsset = new Map<string, StaticSpec[]>()
  for (const spec of specs) {
    const bucket = byAsset.get(spec.assetId)
    if (bucket) bucket.push(spec)
    else byAsset.set(spec.assetId, [spec])
  }

  for (const [assetId, group] of byAsset) {
    const template = requireTemplate(ctx, assetId)
    const primitives = flattenPart(template)
    const poseMatrices = group.map((spec) => composePose(spec.pose))
    for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex++) {
      const primitive = primitives[primitiveIndex]!
      const mesh = new InstancedMesh(primitive.geometry, primitive.material, poseMatrices.length)
      mesh.castShadow = primitive.castShadow
      mesh.receiveShadow = primitive.receiveShadow
      mesh.name = `house-static:${assetId}:${primitiveIndex}`
      mesh.userData.assetId = assetId
      for (let i = 0; i < poseMatrices.length; i++) {
        _local.multiplyMatrices(poseMatrices[i]!, primitive.localMatrix)
        mesh.setMatrixAt(i, _local)
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      parent.add(mesh)
    }
  }
}

function createDoorController(hinge: Object3D, leaf: Object3D): HouseDoor {
  let current = 0
  let target = 0
  let open = false
  return {
    hinge,
    leaf,
    setOpen(next) {
      open = next
      target = next ? DOOR_OPEN_ANGLE : 0
    },
    toggle() {
      this.setOpen(!open)
    },
    isOpen: () => open,
    update(dt) {
      const delta = target - current
      if (Math.abs(delta) < 1e-4) {
        current = target
        hinge.rotation.y = current
        return
      }
      const step = Math.sign(delta) * Math.min(Math.abs(delta), DOOR_ANIM_SPEED * Math.max(0, dt))
      current += step
      hinge.rotation.y = current
    },
  }
}

function derivedInteractionPoints(
  def: HouseDefinition,
  authored: readonly HouseInteractionPoint[] | undefined,
): HouseInteractionPoint[] {
  if (authored && authored.length > 0) return [...authored]
  const points: HouseInteractionPoint[] = []
  for (const opening of def.openings) {
    if (opening.type !== 'door') continue
    const wall = matchingWallPlacement(def, opening)
    const pose = addVec(wall.transform?.position, wallLocalTransform(def.footprint, wall.side, wall.moduleIndex))
    const outward = WALL_OUTWARD[wall.side]
    points.push({ kind: 'door', position: { x: pose.x, y: 0, z: pose.z } })
    points.push({
      kind: 'entrance',
      position: { x: pose.x + outward.x * 1.15, y: 0, z: pose.z + outward.z * 1.15 },
    })
  }
  return points
}

export function buildHouse(def: HouseDefinition, ctx: HouseBuildContext): HouseAssembly {
  for (const assetId of houseDefinitionAssetIds(def)) requirePart(ctx, assetId)

  const root = new Group()
  root.name = `house:${def.id}`
  if (def.transform?.position) {
    root.position.set(def.transform.position.x, def.transform.position.y, def.transform.position.z)
  }
  if (def.transform?.rotationY) root.rotation.y = def.transform.rotationY

  const staticGroup = new Group()
  staticGroup.name = 'house-static'
  const interactiveGroup = new Group()
  interactiveGroup.name = 'house-interactive'
  root.add(staticGroup)
  root.add(interactiveGroup)

  const staticSpecs: StaticSpec[] = []

  for (const tile of floorTilePositions(def.footprint, def.floor.tileCount)) {
    staticSpecs.push({ assetId: def.floor.assetId, pose: { x: tile.x, y: tile.y, z: tile.z, rotationY: 0 } })
  }

  for (const wall of def.walls) {
    const pose = addVec(wall.transform?.position, wallLocalTransform(def.footprint, wall.side, wall.moduleIndex))
    if (wall.transform?.rotationY) pose.rotationY += wall.transform.rotationY
    staticSpecs.push({ assetId: wall.assetId, pose })
  }

  for (const corner of def.corners) {
    const pos = cornerLocalPosition(def.footprint, corner.side)
    staticSpecs.push({ assetId: corner.assetId, pose: { x: pos.x, y: pos.y, z: pos.z, rotationY: 0 } })
  }

  for (const part of resolveRoofParts(def, ctx.catalog)) {
    staticSpecs.push({
      assetId: part.assetId,
      pose: {
        x: part.position.x,
        y: part.position.y,
        z: part.position.z,
        rotationY: part.rotationY ?? 0,
      },
    })
  }

  for (const deco of def.decorations ?? []) {
    staticSpecs.push({
      assetId: deco.assetId,
      pose: {
        x: deco.position.x,
        y: deco.position.y,
        z: deco.position.z,
        rotationY: deco.rotationY ?? 0,
      },
    })
  }

  const doors: HouseDoor[] = []

  for (const opening of def.openings) {
    const wall = matchingWallPlacement(def, opening)
    const pose = addVec(wall.transform?.position, wallLocalTransform(def.footprint, wall.side, wall.moduleIndex))
    if (opening.frameAssetId) {
      staticSpecs.push({ assetId: opening.frameAssetId, pose: { ...pose } })
    }
    if (opening.type === 'window') {
      staticSpecs.push({ assetId: opening.fillAssetId, pose: { ...pose } })
      continue
    }

    const offset = fillOffsetFor(opening.fillAssetId, opening.fillOffset)
    const doorRoot = new Group()
    doorRoot.name = 'door'
    applyPose(doorRoot, pose)
    const hinge = new Group()
    hinge.name = 'hingePivot'
    hinge.position.set(offset.x, offset.y, offset.z)
    const leaf = requireTemplate(ctx, opening.fillAssetId).clone(true)
    leaf.name = 'doorLeaf'
    hinge.add(leaf)
    doorRoot.add(hinge)
    interactiveGroup.add(doorRoot)
    doors.push(createDoorController(hinge, leaf))
  }

  instantiateStatics(staticGroup, staticSpecs, ctx)
  root.scale.setScalar(HOUSE_ASSEMBLY_SCALE)

  const interactionPoints = derivedInteractionPoints(def, def.interactionPoints)
  const census = censusAssembly(staticGroup, interactiveGroup)

  return {
    definitionId: def.id,
    root,
    staticGroup,
    interactiveGroup,
    doors,
    interactionPoints,
    census,
    update(dt) {
      for (const door of doors) door.update(dt)
    },
    dispose() {
      root.removeFromParent()
      disposeObject3D(root)
    },
  }
}

function materialKey(material: Material | Material[]): string {
  if (Array.isArray(material)) return material.map((m) => m.uuid).join(',')
  return material.uuid
}

/**
 * Settlement-owned static batch. Call `ingest` after each house is parented and
 * placed, then `commit` once. Per-house static InstancedMeshes are moved into
 * fewer settlement-level buckets (same geometry+material). Interactive doors
 * stay on the house. Lifecycle: the batch group is a child of the settlement
 * group, so `disposeSettlementGroup` frees instance buffers without touching
 * shared GLB cache resources.
 */
export function createHouseStaticBatch(): HouseStaticBatch {
  const group = new Group()
  group.name = 'house-static-batch'
  type Bucket = {
    geometry: BufferGeometry
    material: Material | Material[]
    castShadow: boolean
    receiveShadow: boolean
    matrices: Matrix4[]
  }
  const buckets = new Map<string, Bucket>()

  return {
    group,
    ingest(assembly) {
      assembly.root.updateMatrixWorld(true)
      const toRemove: InstancedMesh[] = []
      assembly.staticGroup.traverse((node) => {
        const inst = node as InstancedMesh
        if (!inst.isInstancedMesh) return
        const key = `${inst.geometry.uuid}:${materialKey(inst.material)}`
        let bucket = buckets.get(key)
        if (!bucket) {
          bucket = {
            geometry: inst.geometry,
            material: inst.material,
            castShadow: inst.castShadow,
            receiveShadow: inst.receiveShadow,
            matrices: [],
          }
          buckets.set(key, bucket)
        }
        for (let i = 0; i < inst.count; i++) {
          inst.getMatrixAt(i, _local)
          _world.multiplyMatrices(inst.matrixWorld, _local)
          bucket.matrices.push(_world.clone())
        }
        toRemove.push(inst)
      })
      for (const inst of toRemove) {
        inst.removeFromParent()
        inst.dispose()
      }
    },
    commit() {
      let i = 0
      for (const bucket of buckets.values()) {
        const mesh = new InstancedMesh(bucket.geometry, bucket.material, bucket.matrices.length)
        mesh.castShadow = bucket.castShadow
        mesh.receiveShadow = bucket.receiveShadow
        mesh.name = `house-static-batch:${i++}`
        for (let k = 0; k < bucket.matrices.length; k++) {
          mesh.setMatrixAt(k, bucket.matrices[k]!)
        }
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
        group.add(mesh)
      }
    },
  }
}
