import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Scene } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { HouseDefinition } from '../assets/houseDefinitionExampleConfig'
import { buildConstructionCatalog } from '../assets/constructionCatalog'
import {
  COTTAGE_4X4_A,
  COTTAGE_4X4_B,
  COTTAGE_6X4_A,
  COTTAGE_6X4_B,
  HOME_HOUSE_DEFINITIONS,
  HOUSE_6X6_A,
  HOUSE_6X6_B,
  HOUSE_8X6_A,
  HOUSE_8X6_B,
  pickHouseDefinition,
  TEST_HOUSE_01,
  TEST_HOUSE_02,
} from '../assets/houseDefinitionExample'
import { HOUSE_MODULE_M } from '../assets/houseDefinitionExampleConfig'
import { disposeObject3D } from '../assets/loadGltf'
import { type Collider, colliderContainsPoint, resolvePosition } from '../world/collision'
import {
  buildAssemblyCollidersWorld,
  buildHouse,
  buildHouseCollidersWorld,
  buildHouseDoorCollidersLocal,
  buildHouseWallCollidersLocal,
  censusAssembly,
  cornerLocalPosition,
  createHouseStaticBatch,
  DOOR_1_FLAT_HINGE_OFFSET_X,
  DOOR_OPEN_ANGLE,
  fillOffsetFor,
  floorTilePositions,
  HOUSE_ASSEMBLY_SCALE,
  HOUSE_DOOR_OPENING_HALF_WIDTH_M,
  HOUSE_WALL_LENGTH_M,
  HOUSE_WALL_THICKNESS_M,
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
  it('represents a normal (non-door) wall module as a single OBB matching the real 2.00×0.41 m footprint', () => {
    // TEST_HOUSE_02's window wall stays a full wall collider (windows aren't
    // a passage) — use it as a normal-wall reference pose via the same
    // `openingLocalPose` the builder itself uses.
    const walls = buildHouseWallCollidersLocal(TEST_HOUSE_02)
    const windowPose = openingLocalPose(TEST_HOUSE_02, TEST_HOUSE_02.openings[1]!)
    const wall = walls.find((c) => Math.abs(c.x - windowPose.x) < 1e-6 && Math.abs(c.z - windowPose.z) < 1e-6)
    if (!wall) throw new Error('expected a wall collider at the window pose')
    if (wall.type !== 'obb') throw new Error('unreachable')
    expect(wall.halfWidth).toBeCloseTo(HOUSE_WALL_LENGTH_M / 2)
    expect(wall.halfDepth).toBeCloseTo(HOUSE_WALL_THICKNESS_M / 2)
    expect(wall.rotationY).toBe(windowPose.rotationY)
  })

  it('splits a door wall module into two OBB wall pieces around the real opening, not a full module', () => {
    const walls = buildHouseWallCollidersLocal(TEST_HOUSE_01)
    // 6 wall modules total, 1 is the door module split into 2 pieces.
    expect(walls).toHaveLength(TEST_HOUSE_01.walls.length + 1)
    expect(walls.every((c) => c.type === 'obb')).toBe(true)

    const pose = openingLocalPose(TEST_HOUSE_01, TEST_HOUSE_01.openings[0]!)
    // No wall collider covers the opening's own center.
    expect(walls.some((c) => colliderContainsPoint(c, pose.x, pose.z))).toBe(false)
    // Both flanking pieces exist, on either side of the opening, same yaw/depth.
    const doorPieces = walls.filter((c) => c.type === 'obb' && Math.abs(c.z - pose.z) < 1e-6 && c.rotationY === pose.rotationY && c.x !== pose.x)
    const flanking = doorPieces.filter((c) => Math.abs(Math.abs(c.x - pose.x) - (HOUSE_WALL_LENGTH_M / 2 + HOUSE_DOOR_OPENING_HALF_WIDTH_M) / 2) < 1e-6)
    expect(flanking).toHaveLength(2)
  })

  it('leaves a window wall module as one full OBB, not split', () => {
    const withWindow = buildHouseWallCollidersLocal(TEST_HOUSE_02)
    const windowPose = openingLocalPose(TEST_HOUSE_02, TEST_HOUSE_02.openings[1]!)
    const atWindow = withWindow.filter((c) => Math.abs(c.x - windowPose.x) < 1e-6 && Math.abs(c.z - windowPose.z) < 1e-6)
    expect(atWindow).toHaveLength(1)
  })

  it('adds a closed-leaf OBB only while the door is closed, sized to the real door_1_flat leaf', () => {
    expect(buildHouseDoorCollidersLocal(TEST_HOUSE_01, [false])).toHaveLength(0)
    const closed = buildHouseDoorCollidersLocal(TEST_HOUSE_01, [true])
    expect(closed).toHaveLength(1)
    const leaf = closed[0]!
    expect(leaf.type).toBe('obb')
    if (leaf.type !== 'obb') throw new Error('unreachable')
    expect(leaf.halfWidth).toBeLessThan(HOUSE_DOOR_OPENING_HALF_WIDTH_M) // leaf narrower than the opening (frame clearance)
    expect(leaf.halfDepth).toBeLessThan(HOUSE_WALL_THICKNESS_M / 2)
    const doorPose = openingLocalPose(TEST_HOUSE_01, TEST_HOUSE_01.openings[0]!)
    // Leaf swings closed centered on the opening (hinge offset + the leaf's
    // own geometric center cancel out to ≈0), not at some other position.
    expect(leaf.x).toBeCloseTo(doorPose.x, 1)
    expect(leaf.z).toBeCloseTo(doorPose.z, 1)
  })

  it('door leaf collider stays anchored to the same opening pose as the visual door leaf', () => {
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
    expect(closed.x).toBeCloseTo(doorRoot.position.x, 1)
    expect(closed.z).toBeCloseTo(doorRoot.position.z, 1)
    assembly.dispose()
  })

  it('no jamb-circle workaround remains: only wall/door OBBs, no leftover small circles', () => {
    const world = buildHouseCollidersWorld(TEST_HOUSE_01, 0, 0, 0, [true])
    expect(world.every((c) => c.type === 'obb')).toBe(true)
  })

  it('closing the collider gap beside a door: a point beside the doorway (in the flanking wall piece) is blocked', () => {
    // Before this fix, a door's whole 2 m wall module had zero wall collider
    // (skipped so the frame/leaf render there) — a player could walk in
    // beside the door instead of through it. The flanking wall piece alone
    // (door open, no leaf) must now block that gap.
    const openWorld = buildHouseCollidersWorld(TEST_HOUSE_01, 0, 0, 0, [false])
    const pose = openingLocalPose(TEST_HOUSE_01, TEST_HOUSE_01.openings[0]!)
    const pieceOffset = (HOUSE_WALL_LENGTH_M / 2 + HOUSE_DOOR_OPENING_HALF_WIDTH_M) / 2
    const besideDoor = {
      x: pose.x + pieceOffset * Math.cos(pose.rotationY),
      z: pose.z + pieceOffset * Math.sin(pose.rotationY),
    }
    const playerRadius = 0.35
    const resolved = resolvePosition(besideDoor.x, besideDoor.z, playerRadius, openWorld)
    const pushedDistance = Math.hypot(resolved.x - besideDoor.x, resolved.z - besideDoor.z)
    expect(pushedDistance).toBeGreaterThan(0.3)
  })

  it('the doorway itself stays walkable — the real ~1.30 m opening must not be blocked', () => {
    const playerRadius = 0.35
    const pose = openingLocalPose(TEST_HOUSE_01, TEST_HOUSE_01.openings[0]!)
    const openWorld = buildHouseCollidersWorld(TEST_HOUSE_01, 0, 0, 0, [false])
    const center = resolvePosition(pose.x, pose.z, playerRadius, openWorld)
    expect(center.x).toBeCloseTo(pose.x)
    expect(center.z).toBeCloseTo(pose.z)
    // Off-center but still inside the real opening: a player-radius disk
    // centered here (0.25 m off) stays within the 0.65 m opening half-width
    // with margin to spare (0.25 + 0.35 = 0.6 < 0.65).
    const offCenter = resolvePosition(pose.x + 0.25, pose.z, playerRadius, openWorld)
    expect(offCenter.x).toBeCloseTo(pose.x + 0.25)
    expect(offCenter.z).toBeCloseTo(pose.z)
  })

  it('transforms an OBB with house yaw and assembly scale', () => {
    const local: Collider[] = [{ type: 'obb', x: 1, z: 0, halfWidth: 1, halfDepth: 0.2, rotationY: 0 }]
    const world = transformHouseCollidersToWorld(local, 10, 20, Math.PI / 2, HOUSE_ASSEMBLY_SCALE)
    const obb = world[0]!
    expect(obb.type).toBe('obb')
    if (obb.type !== 'obb') throw new Error('unreachable')
    expect(obb.x).toBeCloseTo(10)
    expect(obb.z).toBeCloseTo(19)
    expect(obb.halfWidth).toBeCloseTo(1)
    expect(obb.halfDepth).toBeCloseTo(0.2)
    expect(obb.rotationY).toBeCloseTo(Math.PI / 2)
  })

  it('transforms a circle collider with house yaw and assembly scale (unchanged semantics)', () => {
    const local: Collider[] = [{ type: 'circle', x: 1, z: 0, radius: 1 }]
    const world = transformHouseCollidersToWorld(local, 10, 20, Math.PI / 2, HOUSE_ASSEMBLY_SCALE)
    const circle = world[0]!
    expect(circle.type).toBe('circle')
    if (circle.type !== 'circle') throw new Error('unreachable')
    expect(circle.x).toBeCloseTo(10)
    expect(circle.z).toBeCloseTo(19)
    expect(circle.radius).toBeCloseTo(1)
  })

  it('buildAssemblyCollidersWorld drops the closed-door leaf when the door is open', () => {
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

  it('adjacent wall pieces overlap at the exact footprint corner — no gap needing a corner collider', () => {
    // Plan settlements-001 §4: don't add a corner collider unless a real gap
    // is proven. Each wall OBB spans its full nominal module length flush to
    // the shared corner coordinate, and the two perpendicular walls' 0.41 m
    // thickness bands overlap right at that corner, so a point just inside
    // the wall thickness on either side of the corner is always covered by
    // at least one wall piece. (The true diagonal exterior nook just past
    // the corner — outside both walls' thickness — is legitimately open
    // yard, not a leak into the interior; full visual confirmation is a
    // browser-verification step, not something this point-sample proves on
    // its own.)
    for (const def of [TEST_HOUSE_01, COTTAGE_4X4_A, HOUSE_6X6_A]) {
      const halfW = def.footprint.width / 2
      const halfD = def.footprint.depth / 2
      const world = buildHouseCollidersWorld(def, 0, 0, 0, [false])
      // 0.1 m in from the corner along the front wall's outer face, and
      // symmetrically along the right wall's outer face — both must be
      // covered by a wall collider (front wall covers the first, right wall
      // the second), confirming the two walls' coverage is flush to the
      // shared corner with no seam.
      expect(world.some((c) => colliderContainsPoint(c, halfW - 0.1, -halfD - 0.1))).toBe(true)
      expect(world.some((c) => colliderContainsPoint(c, halfW + 0.1, -halfD + 0.1))).toBe(true)
    }
  })
})

describe('real doorway corridor regression', () => {
  // Plan settlements-001: the original bug was never the door offset — it
  // was that the whole collision geometry didn't match the real footprint.
  // These check an actual player-sized (radius 0.35 m) traversal through the
  // real opening, not just isolated collider math, across several house
  // footprints and door positions (start/middle/end of the front wall).
  const playerRadius = 0.35

  function doorPoseAndAxes(def: HouseDefinition) {
    const opening = def.openings.find((o) => o.type === 'door')!
    const pose = openingLocalPose(def, opening)
    const outward = { x: Math.sin(pose.rotationY), z: -Math.cos(pose.rotationY) }
    const tangent = { x: Math.cos(pose.rotationY), z: Math.sin(pose.rotationY) }
    return { pose, outward, tangent }
  }

  const houses: readonly [string, HouseDefinition][] = [
    ['TEST_HOUSE_01 (4×2, door start)', TEST_HOUSE_01],
    ['COTTAGE_4X4_A (door start)', COTTAGE_4X4_A],
    ['COTTAGE_4X4_B (door middle)', COTTAGE_4X4_B],
    ['COTTAGE_6X4_A (door middle)', COTTAGE_6X4_A],
    ['COTTAGE_6X4_B (door start)', COTTAGE_6X4_B],
    ['HOUSE_6X6_A (door middle)', HOUSE_6X6_A],
    ['HOUSE_6X6_B (door start)', HOUSE_6X6_B],
    ['HOUSE_8X6_A (door near-start)', HOUSE_8X6_A],
    ['HOUSE_8X6_B (door middle)', HOUSE_8X6_B],
  ]

  for (const [label, def] of houses) {
    it(`${label}: outside → through the opening → inside is walkable, open door`, () => {
      const { pose, outward } = doorPoseAndAxes(def)
      const world = buildHouseCollidersWorld(def, 0, 0, 0, [false])
      for (const step of [-0.5, 0, 0.5]) {
        const p = { x: pose.x + outward.x * step, z: pose.z + outward.z * step }
        const resolved = resolvePosition(p.x, p.z, playerRadius, world)
        expect(resolved.x, `step ${step} x`).toBeCloseTo(p.x, 3)
        expect(resolved.z, `step ${step} z`).toBeCloseTo(p.z, 3)
      }
    })

    it(`${label}: closed door blocks the opening, open door doesn't`, () => {
      const { pose } = doorPoseAndAxes(def)
      const closedWorld = buildHouseCollidersWorld(def, 0, 0, 0, [true])
      const closedResolved = resolvePosition(pose.x, pose.z, playerRadius, closedWorld)
      expect(Math.hypot(closedResolved.x - pose.x, closedResolved.z - pose.z)).toBeGreaterThan(0.1)

      const openWorld = buildHouseCollidersWorld(def, 0, 0, 0, [false])
      const openResolved = resolvePosition(pose.x, pose.z, playerRadius, openWorld)
      expect(openResolved.x).toBeCloseTo(pose.x, 3)
      expect(openResolved.z).toBeCloseTo(pose.z, 3)
    })

    it(`${label}: the wall beside the opening blocks passage — no gap from a skipped door module`, () => {
      const { pose, tangent } = doorPoseAndAxes(def)
      const pieceOffset = (HOUSE_WALL_LENGTH_M / 2 + HOUSE_DOOR_OPENING_HALF_WIDTH_M) / 2
      const besideDoor = { x: pose.x + tangent.x * pieceOffset, z: pose.z + tangent.z * pieceOffset }
      const world = buildHouseCollidersWorld(def, 0, 0, 0, [false])
      const resolved = resolvePosition(besideDoor.x, besideDoor.z, playerRadius, world)
      expect(Math.hypot(resolved.x - besideDoor.x, resolved.z - besideDoor.z)).toBeGreaterThan(0.3)
    })
  }
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
