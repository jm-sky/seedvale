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
import type { Collider } from '../world/collision'
import { type ConstructionCatalog } from '../assets/constructionCatalog'
import {
  HOUSE_MODULE_M,
  type HouseCornerSide,
  type HouseDefinition,
  type HouseFurnitureRole,
  type HouseInteractionPoint,
  type HouseOpening,
  type HouseRoofPart,
  type HouseVec3,
  type HouseWallPlacement,
  type HouseWallSide,
} from '../assets/houseDefinitionExampleConfig'
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
export const HOUSE_ASSEMBLY_SCALE = 1

/**
 * Verified real MegaKit wall module footprint in the XZ plane
 * (`megakitAudit.generated.json`'s `wall_plaster_straight`: dimensions
 * `[2, 3.125, 0.407]`) — local metres, pre-scale. Wall height doesn't matter
 * for 2D collision. Plan settlements-001: collision must match this real
 * footprint, not an oversized circle.
 */
export const HOUSE_WALL_LENGTH_M = HOUSE_MODULE_M
export const HOUSE_WALL_THICKNESS_M = 0.41
const WALL_HALF_WIDTH = HOUSE_WALL_LENGTH_M / 2
const WALL_HALF_DEPTH = HOUSE_WALL_THICKNESS_M / 2

/**
 * `wall_plaster_door_flat`'s real pre-cut opening — measured directly from
 * the GLB's Plaster-material vertex positions (module-local space, the same
 * space `wallLocalTransform` places modules in): no Plaster vertices exist
 * between x ≈ -0.648 and x ≈ +0.648 at any height from the floor to the
 * header. Rounded up slightly to a clean 0.65 m so the collider opening is
 * never narrower than the real cutout. This is *not* derived from the
 * `door_1_flat` leaf's own 1.118 m width (review 2026-08-25 — the leaf width
 * is not proof of the wall cutout width).
 */
export const HOUSE_DOOR_OPENING_HALF_WIDTH_M = 0.65

/**
 * `door_1_flat`'s own closed-leaf footprint (local metres, pre-scale),
 * measured from `megakitAudit.generated.json`'s `door_1_flat` entry
 * (dimensions `[1.118, 2.1, 0.121]`, min/max `x` of `-0.046`/`1.072`).
 * `CENTER_OFFSET_X` is the leaf's own geometric center relative to its mesh
 * origin (the min/max midpoint) — added on top of the existing hinge offset
 * so the collider swings from the same single pose the visual leaf uses,
 * not a second door-position calculation.
 */
const DOOR_1_FLAT_LEAF_HALF_WIDTH = 0.559
const DOOR_1_FLAT_LEAF_HALF_DEPTH = 0.061
const DOOR_1_FLAT_LEAF_CENTER_OFFSET_X = 0.513

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
  definition: HouseDefinition
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

/** Local pose of a wall module — shared by wall instantiation and openings. */
function wallModulePose(def: HouseDefinition, wall: HouseWallPlacement): HouseLocalPose {
  return addVec(wall.transform?.position, wallLocalTransform(def.footprint, wall.side, wall.moduleIndex))
}

/**
 * Local pose of an opening (door/window) — the single source of truth for the
 * door frame/fill placement, the door leaf/hinge parent, the closed-door
 * collider, and the derived door/entrance interaction points. All of these
 * must stay anchored to this same pose so the visual opening and its
 * collider cannot drift apart.
 */
export function openingLocalPose(def: HouseDefinition, opening: HouseOpening): HouseLocalPose {
  return wallModulePose(def, matchingWallPlacement(def, opening))
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
  for (const furniture of def.furniture ?? []) {
    if (isCatalogFurnitureRole(furniture.role)) ids.push(furniture.assetId)
  }
  return [...new Set(ids)]
}

/** `bed`/`table` resolve through `ConstructionCatalog` like any other house
 *  part; `chest`/`lamp` have no catalog GLB and are placed directly by
 *  `settlement/props.ts` (procedural chest visual, existing house-lighting
 *  pipeline) — see `HouseFurniturePlacement`'s doc comment. */
function isCatalogFurnitureRole(role: HouseFurnitureRole): boolean {
  return role === 'bed' || role === 'table'
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

function wallModuleKey(side: HouseWallSide, moduleIndex: number): string {
  return `${side}:${moduleIndex}`
}

function doorWallKeys(def: HouseDefinition): Set<string> {
  const keys = new Set<string>()
  for (const opening of def.openings) {
    if (opening.type !== 'door') continue
    const wall = matchingWallPlacement(def, opening)
    keys.add(wallModuleKey(wall.side, wall.moduleIndex))
  }
  return keys
}

/** One wall-module-sized OBB piece, offset `centerOffsetX` (module-local
 *  metres, along the wall's own local x-axis) from the module's center pose. */
function wallPieceCollider(pose: HouseLocalPose, centerOffsetX: number, halfWidth: number): Collider {
  const cos = Math.cos(pose.rotationY)
  const sin = Math.sin(pose.rotationY)
  return {
    type: 'obb',
    x: pose.x + centerOffsetX * cos,
    z: pose.z + centerOffsetX * sin,
    halfWidth,
    halfDepth: WALL_HALF_DEPTH,
    rotationY: pose.rotationY,
  }
}

/** A door wall module split into two wall pieces flanking the real opening
 *  (`HOUSE_DOOR_OPENING_HALF_WIDTH_M`) — the opening itself gets no
 *  collider. */
function doorWallPieceColliders(pose: HouseLocalPose): Collider[] {
  const pieceHalfWidth = (WALL_HALF_WIDTH - HOUSE_DOOR_OPENING_HALF_WIDTH_M) / 2
  if (pieceHalfWidth <= 0) return []
  const pieceOffset = (WALL_HALF_WIDTH + HOUSE_DOOR_OPENING_HALF_WIDTH_M) / 2
  return [
    wallPieceCollider(pose, -pieceOffset, pieceHalfWidth),
    wallPieceCollider(pose, pieceOffset, pieceHalfWidth),
  ]
}

/** Per-wall-module OBBs in the house's local frame. A door's wall module is
 *  split into two pieces around the real opening instead of being skipped
 *  entirely; a window's wall module stays a single full-length OBB (the
 *  window isn't a passage). */
export function buildHouseWallCollidersLocal(def: HouseDefinition): Collider[] {
  const doorWalls = doorWallKeys(def)
  const colliders: Collider[] = []
  for (const wall of def.walls) {
    const pose = wallModulePose(def, wall)
    if (doorWalls.has(wallModuleKey(wall.side, wall.moduleIndex))) {
      colliders.push(...doorWallPieceColliders(pose))
    } else {
      colliders.push(wallPieceCollider(pose, 0, WALL_HALF_WIDTH))
    }
  }
  return colliders
}

/** Closed-leaf OBB for one door opening — anchored to `openingLocalPose()`
 *  plus the existing hinge offset plus the leaf's own geometric center, the
 *  same single pose the visual leaf uses (not a second door-position
 *  calculation). */
function doorLeafColliderLocal(def: HouseDefinition, opening: HouseOpening): Collider {
  const pose = openingLocalPose(def, opening)
  const cos = Math.cos(pose.rotationY)
  const sin = Math.sin(pose.rotationY)
  const localOffsetX = DOOR_1_FLAT_HINGE_OFFSET_X + DOOR_1_FLAT_LEAF_CENTER_OFFSET_X
  return {
    type: 'obb',
    x: pose.x + localOffsetX * cos,
    z: pose.z + localOffsetX * sin,
    halfWidth: DOOR_1_FLAT_LEAF_HALF_WIDTH,
    halfDepth: DOOR_1_FLAT_LEAF_HALF_DEPTH,
    rotationY: pose.rotationY,
  }
}

/** Closed-leaf OBBs — one per door opening index, only while that door is closed. */
export function buildHouseDoorCollidersLocal(
  def: HouseDefinition,
  closedDoors: readonly boolean[],
): Collider[] {
  const colliders: Collider[] = []
  let doorIndex = 0
  for (const opening of def.openings) {
    if (opening.type !== 'door') continue
    if (!closedDoors[doorIndex]) {
      doorIndex++
      continue
    }
    colliders.push(doorLeafColliderLocal(def, opening))
    doorIndex++
  }
  return colliders
}

export function transformHouseCollidersToWorld(
  localColliders: readonly Collider[],
  worldX: number,
  worldZ: number,
  yaw: number,
  scale = HOUSE_ASSEMBLY_SCALE,
): Collider[] {
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  return localColliders.map((collider): Collider => {
    const lx = collider.x * scale
    const lz = collider.z * scale
    const x = worldX + lx * cos + lz * sin
    const z = worldZ - lx * sin + lz * cos

    if (collider.type === 'circle') {
      return { type: 'circle', x, z, radius: collider.radius * scale }
    }
    return {
      type: 'obb',
      x,
      z,
      halfWidth: collider.halfWidth * scale,
      halfDepth: collider.halfDepth * scale,
      rotationY: collider.rotationY + yaw,
    }
  })
}

/** Wall pieces plus optional closed-door leaf OBBs in world space. */
export function buildHouseCollidersWorld(
  def: HouseDefinition,
  worldX: number,
  worldZ: number,
  yaw: number,
  closedDoors: readonly boolean[],
  scale = HOUSE_ASSEMBLY_SCALE,
): Collider[] {
  const local = [
    ...buildHouseWallCollidersLocal(def),
    ...buildHouseDoorCollidersLocal(def, closedDoors),
  ]
  return transformHouseCollidersToWorld(local, worldX, worldZ, yaw, scale)
}

export function buildAssemblyCollidersWorld(assembly: HouseAssembly): Collider[] {
  const root = assembly.root
  return buildHouseCollidersWorld(
    assembly.definition,
    root.position.x,
    root.position.z,
    root.rotation.y,
    assembly.doors.map((door) => !door.isOpen()),
  )
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
    const pose = wallModulePose(def, wall)
    const outward = WALL_OUTWARD[wall.side]
    points.push({ kind: 'door', position: { x: pose.x, y: 0, z: pose.z } })
    points.push({
      kind: 'entrance',
      position: { x: pose.x + outward.x * 1.15, y: 0, z: pose.z + outward.z * 1.15 },
    })
  }
  return points
}

/**
 * Plan 169 — furniture-relative interaction points (bed `'sleep'`, chest
 * `'storage'`), transformed from furniture-local into house-local space by
 * the same rotate-then-translate convention `wallLocalTransform`/
 * `cornerLocalPosition` use. Always appended alongside door/entrance points
 * (authored or derived) — a house does not need an authored
 * `interactionPoints` array just to get furniture points.
 */
function furnitureInteractionPoints(def: HouseDefinition): HouseInteractionPoint[] {
  const points: HouseInteractionPoint[] = []
  for (const furniture of def.furniture ?? []) {
    if (!furniture.interactionPoints) continue
    const cos = Math.cos(furniture.rotationY)
    const sin = Math.sin(furniture.rotationY)
    for (const local of furniture.interactionPoints) {
      const lx = local.position.x
      const lz = local.position.z
      points.push({
        kind: local.kind,
        position: {
          x: furniture.position.x + lx * cos - lz * sin,
          y: furniture.position.y + local.position.y,
          z: furniture.position.z + lx * sin + lz * cos,
        },
        ...(local.facing != null ? { facing: furniture.rotationY + local.facing } : {}),
      })
    }
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

  for (const furniture of def.furniture ?? []) {
    if (!isCatalogFurnitureRole(furniture.role)) continue
    staticSpecs.push({
      assetId: furniture.assetId,
      pose: {
        x: furniture.position.x,
        y: furniture.position.y,
        z: furniture.position.z,
        rotationY: furniture.rotationY,
      },
    })
  }

  const doors: HouseDoor[] = []

  for (const opening of def.openings) {
    const pose = openingLocalPose(def, opening)
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

  const interactionPoints = [
    ...derivedInteractionPoints(def, def.interactionPoints),
    ...furnitureInteractionPoints(def),
  ]
  const census = censusAssembly(staticGroup, interactiveGroup)

  return {
    definition: def,
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
