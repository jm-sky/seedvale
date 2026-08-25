import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Scene } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { buildConstructionCatalog } from '../assets/constructionCatalog'
import {
  COTTAGE_4X4_A,
  COTTAGE_4X4_B,
  HOME_HOUSE_DEFINITIONS,
  HOUSE_8X6_A,
  HOUSE_MODULE_M,
  pickHouseDefinition,
  TEST_HOUSE_01,
  TEST_HOUSE_02,
} from '../assets/houseDefinitionExample'
import { disposeObject3D } from '../assets/loadGltf'
import { resolvePosition } from '../world/collision'
import {
  buildAssemblyCollidersWorld,
  buildHouse,
  buildHouseCollidersWorld,
  buildHouseDoorCollidersLocal,
  buildHouseDoorJambCollidersLocal,
  buildHouseWallCollidersLocal,
  censusAssembly,
  cornerLocalPosition,
  createHouseStaticBatch,
  DOOR_1_FLAT_HINGE_OFFSET_X,
  DOOR_OPEN_ANGLE,
  fillOffsetFor,
  floorTilePositions,
  HOUSE_ASSEMBLY_SCALE,
  HOUSE_DOOR_COLLIDER_RADIUS,
  HOUSE_DOOR_JAMB_OFFSET,
  HOUSE_DOOR_JAMB_RADIUS,
  HOUSE_WALL_COLLIDER_RADIUS,
  type HouseBuildContext,
  houseDefinitionAssetIds,
  houseFootprintRadius,
  matchingWallPlacement,
  openingLocalPose,
  resolveRoofParts,
  transformHouseCollidersToWorld,
  WALL_YAW,
  wallLocalTransform,
} from './houseBuilder'

const catalog = buildConstructionCatalog()

function dummyPart(assetId: string): Object3D {
  const root = new Group()
  root.name = assetId
  const geometry = new BoxGeometry(2, 1, 0.4)
  geometry.userData.sharedGpu = true
  const material = new MeshStandardMaterial()
  material.userData.sharedGpu = true
  const mesh = new Mesh(geometry, material)
  mesh.name = `${assetId}:mesh`
  root.add(mesh)
  return root
}

function contextFor(def = TEST_HOUSE_01): HouseBuildContext {
  const templates = new Map<string, Object3D>()
  for (const id of houseDefinitionAssetIds(def)) {
    templates.set(id, dummyPart(id))
  }
  return { catalog, templates }
}

describe('house layout transforms', () => {
  const footprint = TEST_HOUSE_01.footprint

  it('footprint 4×2 generates two floor tiles, six wall modules and four corners', () => {
    const tiles = floorTilePositions(footprint, TEST_HOUSE_01.floor.tileCount)
    expect(tiles).toHaveLength(2)
    expect(tiles[0]).toEqual({ x: -1, y: 0, z: 0 })
    expect(tiles[1]).toEqual({ x: 1, y: 0, z: 0 })
    expect(TEST_HOUSE_01.walls).toHaveLength(6)
    expect(TEST_HOUSE_01.corners).toHaveLength(4)
  })

  it('wall side → transform is deterministic', () => {
    expect(wallLocalTransform(footprint, 'front', 0)).toEqual({
      x: -1, y: 0, z: -1, rotationY: WALL_YAW.front,
    })
    expect(wallLocalTransform(footprint, 'front', 1)).toEqual({
      x: 1, y: 0, z: -1, rotationY: WALL_YAW.front,
    })
    expect(wallLocalTransform(footprint, 'back', 0)).toEqual({
      x: -1, y: 0, z: 1, rotationY: WALL_YAW.back,
    })
    expect(wallLocalTransform(footprint, 'left', 0)).toEqual({
      x: -2, y: 0, z: 0, rotationY: WALL_YAW.left,
    })
    expect(wallLocalTransform(footprint, 'right', 0)).toEqual({
      x: 2, y: 0, z: 0, rotationY: WALL_YAW.right,
    })
  })

  it('corners sit on the footprint extrema', () => {
    expect(cornerLocalPosition(footprint, 'frontLeft')).toEqual({ x: -2, y: 0, z: -1 })
    expect(cornerLocalPosition(footprint, 'frontRight')).toEqual({ x: 2, y: 0, z: -1 })
    expect(cornerLocalPosition(footprint, 'backLeft')).toEqual({ x: -2, y: 0, z: 1 })
    expect(cornerLocalPosition(footprint, 'backRight')).toEqual({ x: 2, y: 0, z: 1 })
  })

  it('module size stays 2 m', () => {
    expect(HOUSE_MODULE_M).toBe(2)
    expect(footprint.width % HOUSE_MODULE_M).toBe(0)
    expect(footprint.depth % HOUSE_MODULE_M).toBe(0)
  })
})

describe('openings and roof parts', () => {
  it('doorframe/window sit at the matching wall transform', () => {
    const doorWall = matchingWallPlacement(TEST_HOUSE_01, TEST_HOUSE_01.openings[0]!)
    const pose = wallLocalTransform(TEST_HOUSE_01.footprint, doorWall.side, doorWall.moduleIndex)
    expect(doorWall.side).toBe('front')
    expect(doorWall.moduleIndex).toBe(0)
    expect(pose).toEqual({ x: -1, y: 0, z: -1, rotationY: 0 })

    const window = TEST_HOUSE_02.openings[1]!
    const windowWall = matchingWallPlacement(TEST_HOUSE_02, window)
    const windowPose = wallLocalTransform(TEST_HOUSE_02.footprint, windowWall.side, windowWall.moduleIndex)
    expect(windowWall.side).toBe('front')
    expect(windowWall.moduleIndex).toBe(1)
    expect(windowPose).toEqual({ x: 1, y: 0, z: -1, rotationY: 0 })
  })

  it('door_1_flat gets X ≈ -0.51 m', () => {
    expect(fillOffsetFor(TEST_HOUSE_01.openings[0]!.fillAssetId).x).toBeCloseTo(DOOR_1_FLAT_HINGE_OFFSET_X)
    expect(DOOR_1_FLAT_HINGE_OFFSET_X).toBeCloseTo(-0.51)
  })

  it('roof parts use explicit transforms and do not depend on AABB snap', () => {
    const parts = resolveRoofParts(TEST_HOUSE_01, catalog)
    expect(parts.length).toBeGreaterThan(0)
    for (const part of parts) {
      expect(part.position.y).toBeCloseTo(3.12)
      expect(part.position.z).toBe(0)
      expect(part.rotationY === 0 || part.rotationY === Math.PI).toBe(true)
    }
    const xs = [...new Set(parts.map((p) => p.position.x))].sort((a, b) => a - b)
    expect(xs).toEqual([-1, 1])
  })
})

describe('buildHouse(TEST_HOUSE_01)', () => {
  it('resolves every assetId through ConstructionCatalog (no second registry)', () => {
    for (const id of houseDefinitionAssetIds(TEST_HOUSE_01)) {
      expect(catalog.byAssetId.has(id), id).toBe(true)
    }
    const assembly = buildHouse(TEST_HOUSE_01, contextFor())
    expect(assembly.definitionId).toBe('test-house-01')
    assembly.dispose()
  })

  it('puts the door leaf under a hinge pivot and animates only that pivot', () => {
    const assembly = buildHouse(TEST_HOUSE_01, contextFor())
    expect(assembly.doors).toHaveLength(1)
    const door = assembly.doors[0]!
    expect(door.hinge.name).toBe('hingePivot')
    expect(door.leaf.parent).toBe(door.hinge)
    expect(door.hinge.position.x).toBeCloseTo(DOOR_1_FLAT_HINGE_OFFSET_X)

    const rootYaw = assembly.root.rotation.y
    const wallYaw = door.hinge.parent!.rotation.y
    door.setOpen(true)
    door.update(10)
    expect(door.hinge.rotation.y).toBeCloseTo(DOOR_OPEN_ANGLE)
    expect(assembly.root.rotation.y).toBe(rootYaw)
    expect(door.hinge.parent!.rotation.y).toBe(wallYaw)
    expect(door.leaf.rotation.y).toBe(0)
    assembly.dispose()
  })

  it('instances repeated static parts instead of one Mesh per element', () => {
    const assembly = buildHouse(TEST_HOUSE_01, contextFor())
    const partCount = (
      TEST_HOUSE_01.floor.tileCount
      + TEST_HOUSE_01.walls.length
      + TEST_HOUSE_01.corners.length
      + resolveRoofParts(TEST_HOUSE_01, catalog).length
      + TEST_HOUSE_01.openings.filter((o) => o.frameAssetId).length
    )
    expect(assembly.census.staticInstancedMeshes).toBeGreaterThan(0)
    expect(assembly.census.renderables).toBeLessThan(partCount)
    expect(assembly.census.staticInstances).toBeGreaterThanOrEqual(partCount)
    expect(assembly.census.interactiveMeshes).toBeGreaterThan(0)
    assembly.dispose()
  })

  it('dispose does not free sharedGpu geometry/materials from the template cache', () => {
    const ctx = contextFor()
    const assembly = buildHouse(TEST_HOUSE_01, ctx)
    const spies: ReturnType<typeof vi.spyOn>[] = []
    for (const template of ctx.templates.values()) {
      template.traverse((node) => {
        const mesh = node as Mesh
        if (!mesh.isMesh) return
        spies.push(vi.spyOn(mesh.geometry, 'dispose'))
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((m) => spies.push(vi.spyOn(m, 'dispose')))
        else spies.push(vi.spyOn(mat, 'dispose'))
      })
    }
    assembly.dispose()
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

describe('house static batch', () => {
  it('merges identical static parts from several houses into fewer InstancedMeshes', () => {
    const ctx = contextFor()
    const a = buildHouse(TEST_HOUSE_01, ctx)
    const b = buildHouse(TEST_HOUSE_01, ctx)
    a.root.position.set(10, 0, 0)
    b.root.position.set(-10, 0, 0)
    const scene = new Scene()
    scene.add(a.root)
    scene.add(b.root)

    const perHouseRenderables = a.census.renderables + b.census.renderables
    const batch = createHouseStaticBatch()
    scene.add(batch.group)
    batch.ingest(a)
    batch.ingest(b)
    batch.commit()

    const after = censusAssembly(batch.group, a.interactiveGroup)
    const interactive = a.census.interactiveMeshes + b.census.interactiveMeshes
    expect(after.staticInstancedMeshes).toBeGreaterThan(0)
    expect(after.staticInstancedMeshes + interactive).toBeLessThan(perHouseRenderables)
    expect(a.staticGroup.children).toHaveLength(0)
    expect(b.staticGroup.children).toHaveLength(0)

    const inst = batch.group.children[0] as InstancedMesh
    const instSpy = vi.spyOn(inst, 'dispose')
    disposeObject3D(scene)
    expect(instSpy).toHaveBeenCalled()
    a.dispose()
    b.dispose()
  })
})

describe('house colliders', () => {
  it('skips doorway wall modules but keeps straight walls and windows', () => {
    const walls = buildHouseWallCollidersLocal(TEST_HOUSE_01)
    const doorWall = matchingWallPlacement(TEST_HOUSE_01, TEST_HOUSE_01.openings[0]!)
    const doorPose = wallLocalTransform(TEST_HOUSE_01.footprint, doorWall.side, doorWall.moduleIndex)
    expect(walls.some((c) => c.x === doorPose.x && c.z === doorPose.z)).toBe(false)
    expect(walls.length).toBe(TEST_HOUSE_01.walls.length - 1)
    expect(walls.every((c) => c.radius === HOUSE_WALL_COLLIDER_RADIUS)).toBe(true)

    const withWindow = buildHouseWallCollidersLocal(TEST_HOUSE_02)
    const windowWall = matchingWallPlacement(TEST_HOUSE_02, TEST_HOUSE_02.openings[1]!)
    const windowPose = wallLocalTransform(TEST_HOUSE_02.footprint, windowWall.side, windowWall.moduleIndex)
    expect(withWindow.some((c) => c.x === windowPose.x && c.z === windowPose.z)).toBe(true)
  })

  it('adds a doorway disk only while the door is closed', () => {
    expect(buildHouseDoorCollidersLocal(TEST_HOUSE_01, [false])).toHaveLength(0)
    const closed = buildHouseDoorCollidersLocal(TEST_HOUSE_01, [true])
    expect(closed).toHaveLength(1)
    expect(closed[0]!.radius).toBe(HOUSE_DOOR_COLLIDER_RADIUS)
    const doorPose = openingLocalPose(TEST_HOUSE_01, TEST_HOUSE_01.openings[0]!)
    expect(closed[0]).toMatchObject({ x: doorPose.x, z: doorPose.z })
  })

  it('door collider stays anchored to the same opening pose as the visual door leaf', () => {
    // Regression for the door_1_flat hinge offset drifting away from its
    // collider: both the door root (hinge parent) and the closed-door
    // collider must come from `openingLocalPose`, not two independent
    // wall-center computations that could diverge.
    const assembly = buildHouse(TEST_HOUSE_01, contextFor())
    const door = assembly.doors[0]!
    const doorRoot = door.hinge.parent!
    const opening = TEST_HOUSE_01.openings[0]!
    const pose = openingLocalPose(TEST_HOUSE_01, opening)

    expect(doorRoot.position.x).toBeCloseTo(pose.x)
    expect(doorRoot.position.z).toBeCloseTo(pose.z)
    expect(door.hinge.position.x).toBeCloseTo(DOOR_1_FLAT_HINGE_OFFSET_X)

    const closed = buildHouseDoorCollidersLocal(TEST_HOUSE_01, [true])[0]!
    expect(closed.x).toBeCloseTo(doorRoot.position.x)
    expect(closed.z).toBeCloseTo(doorRoot.position.z)
    assembly.dispose()
  })

  it('door jambs flank the opening and stay present whether the door is open or closed', () => {
    const jambs = buildHouseDoorJambCollidersLocal(TEST_HOUSE_01)
    expect(jambs).toHaveLength(2)
    const pose = openingLocalPose(TEST_HOUSE_01, TEST_HOUSE_01.openings[0]!)
    const xs = jambs.map((j) => j.x).sort((a, b) => a - b)
    expect(xs).toEqual([pose.x - HOUSE_DOOR_JAMB_OFFSET, pose.x + HOUSE_DOOR_JAMB_OFFSET])
    expect(jambs.every((j) => j.z === pose.z)).toBe(true)
    expect(jambs.every((j) => j.radius === HOUSE_DOOR_JAMB_RADIUS)).toBe(true)

    const closedTotal = buildHouseCollidersWorld(TEST_HOUSE_01, 0, 0, 0, [true])
    const openTotal = buildHouseCollidersWorld(TEST_HOUSE_01, 0, 0, 0, [false])
    // Only the closed-door leaf disk should differ between open/closed — the
    // jambs are frame, not leaf, and stay regardless of door state.
    expect(closedTotal.length).toBe(openTotal.length + 1)
  })

  it('closing the collider gap beside a door: a point beside the doorway is no longer walkable (regression)', () => {
    // Before the jamb fix, a door's whole 2 m wall module had zero wall
    // collider (skipped so the frame/leaf render there) and the closed-door
    // disk only covered ~0.45 m around the center — leaving ~0.55 m of
    // completely open space on each side, wide enough for the player
    // (radius 0.35 m) to walk in beside the door instead of through it.
    const world = buildHouseCollidersWorld(TEST_HOUSE_01, 0, 0, 0, [true])
    const jamb = buildHouseDoorJambCollidersLocal(TEST_HOUSE_01)[0]!
    const playerRadius = 0.35
    const resolved = resolvePosition(jamb.x, jamb.z, playerRadius, world)
    const pushedDistance = Math.hypot(resolved.x - jamb.x, resolved.z - jamb.z)
    expect(pushedDistance).toBeCloseTo(jamb.radius + playerRadius)
  })

  it('the doorway itself stays walkable — jambs must not seal off the whole opening (regression)', () => {
    // A first pass at the jamb fix sized offset/radius by summing raw radii
    // (ignoring the player's own collision radius, which `resolvePosition`
    // adds to every collider it tests against). That accidentally sealed the
    // entire ~1 m doorway shut — a point standing right at the opening's
    // center got pushed out by both jambs at once. This guards the actual
    // walkable corridor width, not just "some point near the door is
    // blocked" (the previous test).
    const playerRadius = 0.35
    const pose = openingLocalPose(TEST_HOUSE_01, TEST_HOUSE_01.openings[0]!)
    const openWorld = buildHouseCollidersWorld(TEST_HOUSE_01, 0, 0, 0, [false])
    // Real door_1_flat leaf is 1.118 m wide — walking in through the center
    // of the opening must not be pushed away by the frame/jambs.
    const center = resolvePosition(pose.x, pose.z, playerRadius, openWorld)
    expect(center.x).toBeCloseTo(pose.x)
    expect(center.z).toBeCloseTo(pose.z)
    // Roughly the leaf's own half-width off-center (still inside the
    // opening) must also stay clear.
    const offCenter = resolvePosition(pose.x + 0.4, pose.z, playerRadius, openWorld)
    expect(offCenter.x).toBeCloseTo(pose.x + 0.4)
    expect(offCenter.z).toBeCloseTo(pose.z)
  })

  it('transforms local colliders with house yaw and assembly scale', () => {
    const local = [{ x: 1, z: 0, radius: 1 }]
    const world = transformHouseCollidersToWorld(local, 10, 20, Math.PI / 2, HOUSE_ASSEMBLY_SCALE)
    expect(world[0]!.x).toBeCloseTo(10)
    expect(world[0]!.z).toBeCloseTo(20 + 1)
    expect(world[0]!.radius).toBeCloseTo(1)
  })

  it('buildAssemblyCollidersWorld omits the doorway when the door is open', () => {
    const assembly = buildHouse(TEST_HOUSE_01, contextFor())
    assembly.root.position.set(5, 0, 5)
    assembly.root.rotation.y = 0
    const closedCount = buildAssemblyCollidersWorld(assembly).length
    assembly.doors[0]!.setOpen(true)
    const openCount = buildAssemblyCollidersWorld(assembly).length
    expect(openCount).toBe(closedCount - 1)
    assembly.dispose()
  })

  it('buildHouseCollidersWorld covers cottage perimeter without a centre disk', () => {
    const closed = buildHouseCollidersWorld(COTTAGE_4X4_A, 0, 0, 0, [true])
    expect(closed.some((c) => c.x === 0 && c.z === 0)).toBe(false)
    expect(closed.length).toBeGreaterThan(COTTAGE_4X4_A.walls.length - 1)
    const open = buildHouseCollidersWorld(COTTAGE_4X4_A, 0, 0, 0, [false])
    expect(open.length).toBe(closed.length - 1)
  })
})

describe('houseFootprintRadius', () => {
  it('derives a collider radius from the 4×2 footprint', () => {
    const radius = houseFootprintRadius(TEST_HOUSE_01)
    expect(radius).toBeGreaterThan(2)
    expect(radius).toBeLessThan(4)
  })

  it('gives medium farmsteads a clearly larger radius than a 4×4 cottage', () => {
    const cottage = houseFootprintRadius(COTTAGE_4X4_A)
    const farm = houseFootprintRadius(HOUSE_8X6_A)
    expect(cottage).toBeGreaterThan(3)
    expect(farm).toBeGreaterThan(cottage)
    expect(farm).toBeGreaterThan(5)
  })
})

describe('village house definitions', () => {
  it('builds a 4×4 cottage and an 8×6 farmstead from the catalog', () => {
    const cottage = buildHouse(COTTAGE_4X4_A, contextFor(COTTAGE_4X4_A))
    const farm = buildHouse(HOUSE_8X6_A, contextFor(HOUSE_8X6_A))
    expect(cottage.definitionId).toBe('cottage-4x4-a')
    expect(farm.definitionId).toBe('house-8x6-a')
    expect(farm.census.staticInstances).toBeGreaterThan(cottage.census.staticInstances)
    cottage.dispose()
    farm.dispose()
  })

  it('places triangular gable infill on the two non-slope sides', () => {
    const parts = COTTAGE_4X4_A.roof.parts ?? []
    expect(parts).toHaveLength(3)
    const gables = parts.filter((p) => p.position.z !== 0)
    expect(gables).toHaveLength(2)
    const zs = gables.map((p) => p.position.z).sort((a, b) => a - b)
    expect(zs).toEqual([-2, 2])
    expect(gables.map((p) => p.rotationY).sort()).toEqual([0, Math.PI])
  })

  it('keeps the assembled house at native MegaKit scale', () => {
    const assembly = buildHouse(TEST_HOUSE_01, contextFor())
    expect(HOUSE_ASSEMBLY_SCALE).toBe(1)
    expect(assembly.root.scale.x).toBeCloseTo(HOUSE_ASSEMBLY_SCALE)
    expect(assembly.root.scale.y).toBeCloseTo(HOUSE_ASSEMBLY_SCALE)
    expect(assembly.root.scale.z).toBeCloseTo(HOUSE_ASSEMBLY_SCALE)
    assembly.dispose()
  })

  it('pickHouseDefinition keeps outposts on cottages and mixes farmsteads into large villages', () => {
    for (let i = 0; i < 8; i++) {
      const def = pickHouseDefinition('OUTPOST', i, 7)
      expect(def.sizeClass).toBe('cottage')
      expect(def.footprint.width * def.footprint.depth).toBeLessThanOrEqual(24)
    }
    const large = Array.from({ length: 12 }, (_, i) => pickHouseDefinition('LG', i, 99))
    expect(large.some((d) => d.sizeClass === 'house')).toBe(true)
    expect(large.some((d) => d.footprint.width >= 6)).toBe(true)
  })

  it('plan 169 — bed/table furniture resolve through the real ConstructionCatalog', () => {
    const bed = COTTAGE_4X4_A.furniture!.find((f) => f.role === 'bed')!
    const table = COTTAGE_4X4_A.furniture!.find((f) => f.role === 'table')!
    expect(catalog.byAssetId.has(bed.assetId)).toBe(true)
    expect(catalog.byAssetId.has(table.assetId)).toBe(true)
  })

  it('plan 169 — furnished cottage exposes sleep/storage interaction points', () => {
    const assembly = buildHouse(COTTAGE_4X4_A, contextFor(COTTAGE_4X4_A))
    const sleep = assembly.interactionPoints.find((p) => p.kind === 'sleep')
    const storage = assembly.interactionPoints.find((p) => p.kind === 'storage')
    expect(sleep).toBeDefined()
    expect(storage).toBeDefined()
    // Door/entrance derivation still runs alongside furniture points.
    expect(assembly.interactionPoints.some((p) => p.kind === 'door')).toBe(true)
    expect(assembly.interactionPoints.some((p) => p.kind === 'entrance')).toBe(true)

    const bed = COTTAGE_4X4_A.furniture!.find((f) => f.role === 'bed')!
    const localFacing = bed.interactionPoints!.find((p) => p.kind === 'sleep')!.facing!
    expect(sleep!.facing).toBeCloseTo(bed.rotationY + localFacing)
    assembly.dispose()
  })

  it('plan 169 — every village house definition assembles with sleep/storage points', () => {
    for (const def of HOME_HOUSE_DEFINITIONS) {
      const assembly = buildHouse(def, contextFor(def))
      expect(assembly.interactionPoints.some((p) => p.kind === 'sleep'), def.id).toBe(true)
      expect(assembly.interactionPoints.some((p) => p.kind === 'storage'), def.id).toBe(true)
      assembly.dispose()
    }
  })

  it('plan 169 — COTTAGE_4X4_B is COTTAGE_4X4_A\'s furniture mirrored across X (opposite-side door)', () => {
    const bedA = COTTAGE_4X4_A.furniture!.find((f) => f.role === 'bed')!
    const bedB = COTTAGE_4X4_B.furniture!.find((f) => f.role === 'bed')!
    expect(bedB.position.x).toBeCloseTo(-bedA.position.x)
    expect(bedB.position.z).toBeCloseTo(bedA.position.z)

    const chestA = COTTAGE_4X4_A.furniture!.find((f) => f.role === 'chest')!
    const chestB = COTTAGE_4X4_B.furniture!.find((f) => f.role === 'chest')!
    expect(chestB.position.x).toBeCloseTo(-chestA.position.x)
    expect(chestB.rotationY).toBeCloseTo(-chestA.rotationY)
  })

  it('village homes mix plaster, woodgrid and brick wall kits', () => {
    const walls = new Set(
      HOME_HOUSE_DEFINITIONS.flatMap((def) => def.walls.map((w) => w.assetId)),
    )
    expect([...walls].some((id) => id.includes('wall_plaster_straight'))).toBe(true)
    expect([...walls].some((id) => id.includes('wall_plaster_woodgrid'))).toBe(true)
    expect([...walls].some((id) => id.includes('wall_brick_straight'))).toBe(true)
    expect(HOME_HOUSE_DEFINITIONS.some((def) => (def.decorations ?? []).some((d) => d.assetId.includes('chimney')))).toBe(true)
  })
})
