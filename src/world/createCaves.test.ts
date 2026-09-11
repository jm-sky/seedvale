/** Plan world-terrain-019 — `createCaves()` wiring: heightfield
 *  presentation streamed through the existing controller, terrain cutouts
 *  registered with the chunk manager, and *every* spatial query (ground /
 *  floor / ceiling / occupancy / contains / interior / horizontal
 *  containment / camera) on the one heightfield — no SDF, no column index,
 *  no cave collider registration. Analytic terrain (seed `1136726869`),
 *  fake `ChunkManager`, real `THREE.Scene`. */

import * as THREE from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ChunkManager } from '../terrain/chunkManager'
import type { TerrainCutout } from '../terrain/terrainCutout'
import type { Collider } from './collision'
import { createBenchmarkWorldConfig } from '../config/worldConfig'
import { measureSlope } from '../fauna/createFauna'
import { resolveCameraBoom } from '../player/cameraBoom'
import { PLAYER_COLLISION_RADIUS, PLAYER_HEIGHT } from '../player/playerDimensions'
import { villageSizeConfig } from '../settlement/families'
import {
  type RawSampleParams,
  sampleContinentalnessAt,
  sampleHeightAt,
  sampleMountainRidgeAt,
} from '../terrain/chunkHeightmap'
import { CAVE_FLOOR_GRACE, CAVE_UNDERGROUND_MISS } from './caves/caveGroundQuery'
import * as caveHeightfieldQuery from './caves/caveHeightfieldQuery'
import { buildCaveHeightfieldRepresentation, sampleHeightfieldAt } from './caves/caveHeightfieldRepresentation'
import { CAVE_ACTIVATE_DISTANCE, CAVE_DEACTIVATE_DISTANCE } from './caves/cavePresentationLifecycle'
import { MOUTH_INTERIOR_ALONG, mouthAlong, mouthCarveDepth } from './caves/mouthCarve'
import { buildProductionCaveTopology } from './caves/productionTopology'
import { type Caves, createCaves } from './createCaves'
import { openingDirection } from './largeCaves'

vi.mock('./caves/caveHeightfieldQuery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./caves/caveHeightfieldQuery')>()
  return {
    ...actual,
    queryHeightfieldGround: vi.fn(actual.queryHeightfieldGround),
    heightfieldGroundColumn: vi.fn(actual.heightfieldGroundColumn),
    heightfieldOccupancyAt: vi.fn(actual.heightfieldOccupancyAt),
    heightfieldInteriorAt: vi.fn(actual.heightfieldInteriorAt),
    resolveHeightfieldHorizontal: vi.fn(actual.resolveHeightfieldHorizontal),
  }
})

/** The production heightfield `createCaves()` retains for this cave —
 *  rebuilt here on the same sampler so the test can compare the rendered
 *  floor with what `queryGround` hands the player. */
function productionHeightfield(caveId: string): ReturnType<typeof buildCaveHeightfieldRepresentation>['heightfield'] {
  const def = caves.definitions().find((d) => d.caveId === caveId)!
  const topology = buildProductionCaveTopology({
    seed: SEED,
    site: {
      x: def.entrance.x,
      z: def.entrance.z,
      yaw: measureSlope(def.entrance.x, def.entrance.z, 4, chunkManager.sampleBaseHeight).yaw,
      length: 12,
      variant: 0,
    },
    sampleHeight: chunkManager.sampleHeight,
    sampleBaseHeight: chunkManager.sampleBaseHeight,
  })
  if (!topology) throw new Error('production topology rejected the site')
  const walkSurfaceAt = (x: number, z: number): number =>
    chunkManager.sampleBaseHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
  return buildCaveHeightfieldRepresentation(topology, walkSurfaceAt).heightfield
}

const SEED = 1136726869

type FakeChunkManager = ChunkManager & {
  cutoutRegistrations: { ownerKey: string, cutouts: readonly TerrainCutout[] }[]
  cutoutClears: string[]
  colliderOwners: Map<string, readonly Collider[]>
  systemMods: number
}

function fakeChunkManager(): FakeChunkManager {
  const config = createBenchmarkWorldConfig({ seed: SEED, terrainResolution: 65, loadRadius: 4 })
  const t = config.terrain
  const params: RawSampleParams = {
    seed: config.seed,
    heightScale: t.heightScale,
    waterLevel: t.waterLevel,
    noiseScale: t.noiseScale,
    detailAmplitude: t.detailAmplitude,
    hillsScale: t.hillsScale,
    hillsAmplitude: t.hillsAmplitude,
    hillsFbm: t.hillsFbm,
    fbm: t.fbm,
    biome: t.biome,
    region: t.region,
  }
  const fake = {
    cutoutRegistrations: [] as { ownerKey: string, cutouts: readonly TerrainCutout[] }[],
    cutoutClears: [] as string[],
    colliderOwners: new Map<string, readonly Collider[]>(),
    systemMods: 0,
    waterLevel: t.waterLevel,
    sampleHeight: (x: number, z: number) => sampleHeightAt(x, z, params),
    sampleBaseHeight: (x: number, z: number) => sampleHeightAt(x, z, params),
    sampleContinentalness: (x: number, z: number) => sampleContinentalnessAt(x, z, params),
    sampleMountainRidge: (x: number, z: number) => sampleMountainRidgeAt(x, z, params),
    roadCorridorsNear: () => [],
    modifyTerrain: (_x: number, _z: number, _r: number, _d: number, source: 'player' | 'system') => {
      if (source === 'system') fake.systemMods++
      return true
    },
    registerTerrainCutouts: (ownerKey: string, cutouts: readonly TerrainCutout[]) => {
      fake.cutoutRegistrations.push({ ownerKey, cutouts })
    },
    clearTerrainCutouts: (ownerKey: string) => { fake.cutoutClears.push(ownerKey) },
    registerColliders: (ownerKey: string, colliders: readonly Collider[]) => {
      fake.colliderOwners.set(ownerKey, colliders)
    },
    clearColliders: (ownerKey: string) => { fake.colliderOwners.delete(ownerKey) },
  }
  return fake as unknown as FakeChunkManager
}

let scene: THREE.Scene
let chunkManager: FakeChunkManager
let caves: Caves

beforeAll(() => {
  scene = new THREE.Scene()
  chunkManager = fakeChunkManager()
  caves = createCaves(scene, chunkManager, SEED, villageSizeConfig('MD').footprintRadius, 0.45)
})

function caveGroup(caveId: string): THREE.Object3D | undefined {
  return scene.children.find((o) => o.name === `cave:${caveId}`)
}

describe('createCaves (world-terrain-019 B)', () => {
  it('accepts at least one cave on the repro seed and registers one terrain cutout per cave', () => {
    const defs = caves.definitions()
    expect(defs.length).toBeGreaterThan(0)
    expect(chunkManager.systemMods).toBeGreaterThan(0) // mouth carve recess still applied
    expect(chunkManager.cutoutRegistrations).toHaveLength(1)
    const { ownerKey, cutouts } = chunkManager.cutoutRegistrations[0]!
    expect(ownerKey).toBe('caves')
    expect(cutouts.map((c) => c.id).sort()).toEqual(defs.map((d) => `cave:${d.caveId}`).sort())
    for (const def of defs) {
      const cutout = cutouts.find((c) => c.id === `cave:${def.caveId}`)!
      // The hole is at the mouth, bounded, and closed away from it.
      expect(cutout.openingAt(def.entrance.x, def.entrance.z)).toBeGreaterThan(0)
      expect(cutout.bounds.maxX - cutout.bounds.minX).toBeLessThan(20)
      expect(cutout.openingAt(def.entrance.x + 40, def.entrance.z + 40)).toBeLessThanOrEqual(0)
      expect(cutout.surfaceYAt).toBeDefined()
    }
  })

  it('streams the heightfield presentation in/out through the 55/80 m controller and disposes it', () => {
    const def = caves.definitions()[0]!
    const { x, z } = def.entrance
    expect(caveGroup(def.caveId)).toBeUndefined()

    caves.update(x, z)
    const group = caveGroup(def.caveId)
    expect(group).toBeDefined()
    const names = group!.children.map((c) => c.name)
    expect(names).toContain(`cave-interior:${def.caveId}`)
    expect(names).toContain('cave-mouth-mask')
    expect(names).toContain('cave-mouth-rocks')
    const interior = group!.children.find((c) => c.name === `cave-interior:${def.caveId}`) as THREE.Mesh
    expect(interior.geometry.getAttribute('position').count).toBeGreaterThan(1000)
    expect(interior.geometry.getAttribute('normal')).toBeDefined()
    expect((interior.material as THREE.MeshStandardMaterial).side).toBe(THREE.FrontSide)
    // No cave colliders: containment is a heightfield query.
    expect(chunkManager.colliderOwners.size).toBe(0)
    let stats = caves.peekStreamingDebug()
    expect(stats.activePresentations).toBe(1)
    expect(stats.queuedJobs).toBe(0)

    // Inside the hysteresis band: stays.
    caves.update(def.bounds.maxX + (CAVE_ACTIVATE_DISTANCE + CAVE_DEACTIVATE_DISTANCE) / 2, z)
    expect(caveGroup(def.caveId)).toBe(group)

    // Past 80 m from the cave bounds: removed, disposed, colliders cleared.
    const disposeSpy = vi.spyOn(interior.geometry, 'dispose')
    const farX = def.bounds.maxX + CAVE_DEACTIVATE_DISTANCE + 5
    caves.update(farX, z)
    expect(caveGroup(def.caveId)).toBeUndefined()
    expect(disposeSpy).toHaveBeenCalled()
    stats = caves.peekStreamingDebug()
    expect(stats.activePresentations).toBe(0)

    // Back: a fresh group, same shared material instance.
    caves.update(x, z)
    const again = caveGroup(def.caveId)
    expect(again).toBeDefined()
    expect(again).not.toBe(group)
    const interior2 = again!.children.find((c) => c.name === `cave-interior:${def.caveId}`) as THREE.Mesh
    expect(interior2.material).toBe(interior.material)
    expect((interior2.material as THREE.Material).userData.sharedGpu).toBe(true)
  })

  it('every spatial query reads the heightfield and nothing registers cave colliders', () => {
    const def = caves.definitions()[0]!
    const { x, z } = def.entrance
    const queryHeightfieldGround = vi.mocked(caveHeightfieldQuery.queryHeightfieldGround)
    const heightfieldGroundColumn = vi.mocked(caveHeightfieldQuery.heightfieldGroundColumn)
    const heightfieldOccupancyAt = vi.mocked(caveHeightfieldQuery.heightfieldOccupancyAt)
    const heightfieldInteriorAt = vi.mocked(caveHeightfieldQuery.heightfieldInteriorAt)
    const resolveHeightfieldHorizontal = vi.mocked(caveHeightfieldQuery.resolveHeightfieldHorizontal)
    for (const spy of [queryHeightfieldGround, heightfieldGroundColumn, heightfieldOccupancyAt, heightfieldInteriorAt, resolveHeightfieldHorizontal]) {
      spy.mockClear()
    }

    const y = chunkManager.sampleBaseHeight(x, z) - 1
    caves.queryGround(x, y, z)
    expect(queryHeightfieldGround).toHaveBeenCalled()
    caves.sampleFloor(x, z)
    caves.sampleCeiling(x, z)
    expect(heightfieldGroundColumn).toHaveBeenCalled()
    caves.occupancyAt(x, y, z)
    expect(heightfieldOccupancyAt).toHaveBeenCalledTimes(1)
    caves.contains(x, y, z)
    expect(heightfieldOccupancyAt).toHaveBeenCalledTimes(2)
    caves.queryInterior(x, y, z)
    expect(heightfieldInteriorAt).toHaveBeenCalled()
    caves.resolveHorizontal(x, z, y, PLAYER_COLLISION_RADIUS, PLAYER_HEIGHT)
    expect(resolveHeightfieldHorizontal).toHaveBeenCalledWith(
      expect.anything(),
      x,
      z,
      y,
      PLAYER_COLLISION_RADIUS,
      caveHeightfieldQuery.heightfieldStandingClearance(PLAYER_HEIGHT),
    )
    caves.update(x, z)
    expect(chunkManager.colliderOwners.size).toBe(0)
  })

  it('queryGround hands the player exactly the rendered heightfield floor along the cave', () => {
    const def = caves.definitions()[0]!
    const field = productionHeightfield(def.caveId)
    // Walk the cave's XZ bounds on a coarse grid; wherever the heightfield
    // carries a closed-ceiling void, a player standing on that floor gets
    // that floor back — no SDF floor, no offset.
    let checked = 0
    for (let z = field.bounds.minZ; z <= field.bounds.maxZ; z += 1) {
      for (let x = field.bounds.minX; x <= field.bounds.maxX; x += 1) {
        const sample = sampleHeightfieldAt(field, x, z)
        if (sample.outsideGrid || sample.gap < 1.5 || sample.openSky) continue
        const hit = caves.queryGround(x, sample.floorY, z)
        expect(hit).not.toBeNull()
        expect(hit!.floorY).toBe(sample.floorY)
        expect(hit!.ceilingY).toBeLessThanOrEqual(sample.ceilY)
        expect(hit!.openSky).toBe(false)
        expect(caves.sampleFloor(x, z)).toBe(sample.floorY)
        expect(caves.sampleCeiling(x, z)).toBe(hit!.ceilingY)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('is Y-aware on the production cave: hillside above the tunnel is not cave ground, grace below the floor is', () => {
    const def = caves.definitions()[0]!
    const field = productionHeightfield(def.caveId)
    let deep: { x: number, z: number, floorY: number, ceilY: number } | null = null
    for (let z = field.bounds.minZ; z <= field.bounds.maxZ && !deep; z += 0.5) {
      for (let x = field.bounds.minX; x <= field.bounds.maxX; x += 0.5) {
        const sample = sampleHeightfieldAt(field, x, z)
        if (sample.outsideGrid || sample.gap < 2 || sample.openSky) continue
        if (chunkManager.sampleBaseHeight(x, z) - sample.ceilY < 2) continue
        deep = { x, z, floorY: sample.floorY, ceilY: sample.ceilY }
        break
      }
    }
    expect(deep).not.toBeNull()
    const { x, z, floorY, ceilY } = deep!
    const surfaceY = chunkManager.sampleBaseHeight(x, z)
    // Fresh state for this sequence: a surface-level miss releases any
    // remembered hit from earlier tests.
    expect(caves.queryGround(x, surfaceY, z)).toBeNull()
    expect(caves.queryGround(x, surfaceY + 1, z)).toBeNull()
    expect(caves.queryGround(x, ceilY + 0.2, z)).toBeNull()
    expect(caves.queryGround(x, floorY - CAVE_FLOOR_GRACE + 0.1, z)?.floorY).toBe(floorY)
    // One underground miss (probe pushed into rock beside the tunnel) keeps
    // the last cave floor instead of snapping to the hillside overhead.
    expect(surfaceY - floorY).toBeGreaterThan(CAVE_UNDERGROUND_MISS)
    const outsideX = field.bounds.minX - 5
    const kept = caves.queryGround(outsideX, floorY, z)
    expect(kept?.floorY).toBe(floorY)
    expect(caves.peekGroundQueryDebug().source).toBe('hysteresis')
    expect(caves.peekGroundQueryDebug().caveId).toBe(def.caveId)
    // Surface-level miss: released, and the debug cave identity goes with it.
    expect(caves.queryGround(outsideX, chunkManager.sampleBaseHeight(outsideX, z), z)).toBeNull()
    expect(caves.peekGroundQueryDebug().source).toBe('surface')
    expect(caves.peekGroundQueryDebug().caveId).toBeNull()
  })

  it('strict occupancy / contains / interior agree with the heightfield along the production cave', () => {
    const def = caves.definitions()[0]!
    const field = productionHeightfield(def.caveId)
    let closed = 0
    let mouth = 0
    for (let z = field.bounds.minZ; z <= field.bounds.maxZ; z += 1) {
      for (let x = field.bounds.minX; x <= field.bounds.maxX; x += 1) {
        const sample = sampleHeightfieldAt(field, x, z)
        const surfaceY = chunkManager.sampleBaseHeight(x, z)
        if (sample.outsideGrid || sample.gap < 1.5) {
          // Rock / outside: never occupied, at any Y.
          expect(caves.occupancyAt(x, surfaceY - 3, z)).toBeNull()
          expect(caves.contains(x, surfaceY, z)).toBe(false)
          continue
        }
        const mid = sample.floorY + Math.min(1, sample.gap * 0.5)
        const occ = caves.occupancyAt(x, mid, z)
        expect(occ).not.toBeNull()
        expect(occ!.floorY).toBe(sample.floorY)
        expect(caves.contains(x, mid, z)).toBe(true)
        // Below the floor (past the occupancy slack) is rock.
        expect(caves.occupancyAt(x, sample.floorY - 0.5, z)).toBeNull()
        if (sample.openSky) {
          expect(occ!.openSky).toBe(true)
          mouth++
        } else {
          expect(occ!.openSky).toBeUndefined()
          // Surface entity above the tunnel is not in the cave.
          expect(caves.occupancyAt(x, surfaceY, z)).toBeNull()
          expect(caves.contains(x, surfaceY + 0.5, z)).toBe(false)
          // Above the closed ceiling is rock overburden.
          expect(caves.occupancyAt(x, occ!.ceilingY + 0.2, z)).toBeNull()
          closed++
        }
      }
    }
    expect(closed).toBeGreaterThan(50)
    expect(mouth).toBeGreaterThan(0)
  })

  it('interior is strict occupancy inside the mouth plane, with two-sample confirmation, and the approach is not interior', () => {
    const def = caves.definitions()[0]!
    const field = productionHeightfield(def.caveId)
    const out = openingDirection(def.entrance.yaw)
    // Deep interior sample: closed ceiling, well inside the mouth plane.
    let deep: { x: number, y: number, z: number } | null = null
    for (let along = -4; along >= -14 && !deep; along -= 0.5) {
      const x = def.entrance.x + out.dx * along
      const z = def.entrance.z + out.dz * along
      const sample = sampleHeightfieldAt(field, x, z)
      if (sample.outsideGrid || sample.gap < 2 || sample.openSky) continue
      deep = { x, y: sample.floorY + 0.3, z }
    }
    expect(deep).not.toBeNull()
    // Approach pit sample: open sky outward of the mouth plane.
    const ax = def.entrance.x + out.dx * 1.5
    const az = def.entrance.z + out.dz * 1.5
    const ay = chunkManager.sampleBaseHeight(ax, az) - mouthCarveDepth(ax, az, def.entrance) + 0.2
    expect(mouthAlong(ax, az, def.entrance)).toBeGreaterThan(MOUTH_INTERIOR_ALONG)

    // Fresh state: two exterior samples, then two interior samples.
    caves.dispose()
    caves = createCaves(scene, chunkManager, SEED, villageSizeConfig('MD').footprintRadius, 0.45)
    expect(caves.queryInterior(ax, ay, az)).toBe(false)
    expect(caves.queryInterior(ax, ay, az)).toBe(false)
    // A single interior sample does not flip the confirmed state.
    expect(caves.queryInterior(deep!.x, deep!.y, deep!.z)).toBe(false)
    expect(caves.queryInterior(deep!.x, deep!.y, deep!.z)).toBe(true)
    // A single boundary flicker back to the approach keeps interior.
    expect(caves.queryInterior(ax, ay, az)).toBe(true)
    expect(caves.queryInterior(ax, ay, az)).toBe(false)
    // Stateless occupancy sees the approach as open-sky void the whole time.
    expect(caves.occupancyAt(ax, ay, az)?.openSky).toBe(true)
  })

  it('horizontal containment keeps a player inside the production cave and leaves the hillside alone', () => {
    const def = caves.definitions()[0]!
    const field = productionHeightfield(def.caveId)
    const minGap = caveHeightfieldQuery.heightfieldStandingClearance(PLAYER_HEIGHT)
    let checked = 0
    for (let z = field.bounds.minZ; z <= field.bounds.maxZ; z += 1) {
      for (let x = field.bounds.minX; x <= field.bounds.maxX; x += 1) {
        const sample = sampleHeightfieldAt(field, x, z)
        const surfaceY = chunkManager.sampleBaseHeight(x, z)
        // Hillside above (or beside) the cave: identity.
        const outdoors = caves.resolveHorizontal(x, z, surfaceY, PLAYER_COLLISION_RADIUS, PLAYER_HEIGHT)
        expect(outdoors.x).toBe(x)
        expect(outdoors.z).toBe(z)
        if (sample.outsideGrid || sample.gap <= 0 || sample.openSky) continue
        // Any column a capsule could plausibly be pushed into (it holds at
        // least a crouch of void) resolves toward more clearance, ends in a
        // column that can hold a standing player, and stays local.
        const y = sample.floorY + 0.05
        const resolved = caves.resolveHorizontal(x, z, y, PLAYER_COLLISION_RADIUS, PLAYER_HEIGHT)
        const after = sampleHeightfieldAt(field, resolved.x, resolved.z)
        expect(after.gap).toBeGreaterThanOrEqual(sample.gap - 1e-6)
        expect(Math.hypot(resolved.x - x, resolved.z - z)).toBeLessThan(4)
        if (sample.gap >= 1) expect(after.gap).toBeGreaterThanOrEqual(minGap - 0.25)
        if (sample.gap >= minGap) {
          expect(resolved.x).toBe(x)
          expect(resolved.z).toBe(z)
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('camera boom from the interior stays in heightfield occupancy without any cave collider', () => {
    const def = caves.definitions()[0]!
    const field = productionHeightfield(def.caveId)
    const out = openingDirection(def.entrance.yaw)
    let origin: { x: number, y: number, z: number } | null = null
    for (let along = -5; along >= -14 && !origin; along -= 0.5) {
      const x = def.entrance.x + out.dx * along
      const z = def.entrance.z + out.dz * along
      const sample = sampleHeightfieldAt(field, x, z)
      if (sample.outsideGrid || sample.gap < 2.2 || sample.openSky) continue
      origin = { x, y: sample.floorY + 1.6, z }
    }
    expect(origin).not.toBeNull()
    const distance = 6
    const pitch = 0.28
    for (const yaw of [def.entrance.yaw, def.entrance.yaw + Math.PI, def.entrance.yaw + Math.PI / 2, def.entrance.yaw - Math.PI / 2]) {
      const cosPitch = Math.cos(pitch)
      const boom = resolveCameraBoom({
        originX: origin!.x,
        originY: origin!.y,
        originZ: origin!.z,
        camX: origin!.x + Math.sin(yaw) * cosPitch * distance,
        camY: origin!.y + Math.sin(pitch) * distance,
        camZ: origin!.z + Math.cos(yaw) * cosPitch * distance,
        sampleHeight: chunkManager.sampleHeight,
        colliders: [],
        occupancyAt: caves.occupancyAt,
      })
      // Never on the overburden above the cave; always inside cave void
      // (below the ceiling, above the floor, off the walls).
      expect(boom.y).toBeLessThan(chunkManager.sampleBaseHeight(boom.x, boom.z) - 0.5)
      expect(caves.occupancyAt(boom.x, boom.y, boom.z)).not.toBeNull()
    }
  })

  it('dispose clears presentation and the terrain cutout registration', () => {
    const def = caves.definitions()[0]!
    caves.update(def.entrance.x, def.entrance.z)
    expect(caveGroup(def.caveId)).toBeDefined()
    caves.dispose()
    expect(caveGroup(def.caveId)).toBeUndefined()
    expect(chunkManager.colliderOwners.size).toBe(0)
    expect(chunkManager.cutoutClears).toContain('caves')
    expect(caves.peekStreamingDebug().queuedJobs).toBe(0)
  })
})
