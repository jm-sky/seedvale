/** B3 entrance-transition regression after the 2026-09-09 manual playtest
 *  on seed `1136726869` (Grota Czarnego Kamienia / Grota Mroczna).
 *
 *  Surface → approach → mouth → interior must be continuous: no premature
 *  cave floor, no occupancy-derived door on the SDF front shell, camera and
 *  cave-interior state agree. Pure/analytic: no `ChunkManager`, no browser.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import type { CaveTopology } from './caveTopology'
import { createBenchmarkWorldConfig } from '../../config/worldConfig'
import { measureSlope } from '../../fauna/createFauna'
import {
  CAMERA_DISTANCE_DEFAULT,
} from '../../input/MouseLook'
import {
  CAMERA_GROUND_CLEARANCE,
  resolveCameraBoom,
} from '../../player/cameraBoom'
import { PLAYER_COLLISION_RADIUS, PLAYER_HEIGHT, rockCeilingMaxY } from '../../player/PlayerController'
import { STEP_DOWN_MAX } from '../../player/verticalMotion'
import { type RawSampleParams, sampleHeightAt } from '../../terrain/chunkHeightmap'
import { colliderActiveAtY, resolvePosition } from '../collision'
import { type LargeCaveSite, openingDirection } from '../largeCaves'
import { makeCaveId } from './caveIdentity'
import { buildCaveSdfColliders, caveMouthColliderFilter, mouthWalkCorridorAlong } from './caveSdfColliders'
import { buildCaveSdfRepresentation, type CaveSdfSpatialRepresentation } from './caveSdfField'
import {
  applyCaveInteriorHysteresis,
  buildCaveSdfColumnIndex,
  type CaveSdfColumnIndex,
  columnIntervalsAt,
  isCaveInteriorAt,
  occupancyContains,
  occupancyIntervalAt,
  queryColumnIndex,
} from './caveSdfQuery'
import { clipTrianglesInFrontOfMouth } from './clipBelowSurface'
import {
  deriveMouthGeometry,
  inMouthAperture,
  mouthAlong,
  mouthCarveDepth,
  mouthCarveDiscs,
  mouthLateral,
} from './mouthCarve'
import { buildProductionCaveTopology } from './productionTopology'
import { buildSdfCaveMesh } from './sdfCaveMesh'

const REPRO_SEED = 1136726869

const GROTA_MROCZNA = {
  caveId: 'cave:7fd14c30',
  x: 316.00823859384826,
  z: 109.77792295821729,
}

const GROTA_CZARNEGO_KAMIENIA = {
  caveId: 'cave:0e3cce97',
  x: 135.84259216988767,
  z: -17.813611096688362,
}

function surfaceSampler(seed: number): (x: number, z: number) => number {
  const config = createBenchmarkWorldConfig({ seed, terrainResolution: 193, loadRadius: 4 })
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
  return (x, z) => sampleHeightAt(x, z, params)
}

function siteFromEntrance(x: number, z: number, surfaceHeightAt: (x: number, z: number) => number): LargeCaveSite {
  return {
    x,
    z,
    yaw: measureSlope(x, z, 4, surfaceHeightAt).yaw,
    length: 12,
    variant: 0,
  }
}

type BuiltCave = {
  topology: CaveTopology
  sdf: CaveSdfSpatialRepresentation
  index: CaveSdfColumnIndex
  colliders: ReturnType<typeof buildCaveSdfColliders>
  surfaceHeightAt: (x: number, z: number) => number
}

function buildReproCave(x: number, z: number): BuiltCave {
  const surfaceHeightAt = surfaceSampler(REPRO_SEED)
  const site = siteFromEntrance(x, z, surfaceHeightAt)
  const topology = buildProductionCaveTopology({
    seed: REPRO_SEED,
    site,
    sampleHeight: surfaceHeightAt,
    sampleBaseHeight: surfaceHeightAt,
  })
  if (!topology) throw new Error(`production topology rejected site (${x}, ${z})`)
  const sdf = buildCaveSdfRepresentation(topology)
  const index = buildCaveSdfColumnIndex(sdf, topology, surfaceHeightAt)
  return {
    topology,
    sdf,
    index,
    colliders: buildCaveSdfColliders(index, surfaceHeightAt, sdf, caveMouthColliderFilter(topology)),
    surfaceHeightAt,
  }
}

function approachPoint(cave: BuiltCave, along: number): { x: number, z: number, carvedY: number } {
  const { entrance } = cave.topology
  const out = openingDirection(entrance.yaw)
  const x = entrance.x + out.dx * along
  const z = entrance.z + out.dz * along
  const surfaceY = cave.surfaceHeightAt(x, z)
  const carvedY = surfaceY - mouthCarveDepth(x, z, entrance)
  return { x, z, carvedY }
}

function interiorStanding(cave: BuiltCave): { x: number, y: number, z: number } {
  const chamber = cave.topology.nodes.find((n) => n.id === 'chamber') ?? cave.topology.nodes[cave.topology.nodes.length - 1]!
  const hit = queryColumnIndex(cave.index, chamber.position.x, chamber.position.y + 1, chamber.position.z)
  if (!hit) throw new Error('chamber is not queryGround space')
  return { x: chamber.position.x, y: hit.floorY + 1.1, z: chamber.position.z }
}

const CAVES = [
  { name: 'Grota Czarnego Kamienia', pin: GROTA_CZARNEGO_KAMIENIA },
  { name: 'Grota Mroczna', pin: GROTA_MROCZNA },
]

describe('B3 entrance regression: seed 1136726869', () => {
  const built = new Map<string, BuiltCave>()

  beforeAll(() => {
    for (const cave of CAVES) {
      const result = buildReproCave(cave.pin.x, cave.pin.z)
      expect(makeCaveId(REPRO_SEED, siteFromEntrance(cave.pin.x, cave.pin.z, result.surfaceHeightAt))).toBe(cave.pin.caveId)
      built.set(cave.name, result)
    }
  })

  for (const { name } of CAVES) {
    describe(name, () => {
      it('surface/approach walking height keeps surface ground, not cave floor', () => {
        const cave = built.get(name)!
        const { x, z, carvedY } = approachPoint(cave, 3.2)
        expect(mouthAlong(x, z, cave.topology.entrance)).toBeGreaterThan(0.5)
        expect(mouthCarveDepth(x, z, cave.topology.entrance)).toBeGreaterThan(0.15)
        const hit = queryColumnIndex(cave.index, x, carvedY, z)
        expect(hit).not.toBeNull()
        expect(hit!.floorY).toBeGreaterThan(carvedY - STEP_DOWN_MAX)
        expect(hit!.floorY).toBeLessThan(carvedY + 0.35)
        expect(isCaveInteriorAt(cave.index, cave.topology.entrance, x, carvedY, z)).toBe(false)
      })

      it('does not premature-sink: cave floor is not more than a step below the carved recess', () => {
        const cave = built.get(name)!
        const { x, z, carvedY } = approachPoint(cave, 2.2)
        const hit = queryColumnIndex(cave.index, x, carvedY, z)
        expect(hit).not.toBeNull()
        expect(carvedY - hit!.floorY).toBeLessThanOrEqual(STEP_DOWN_MAX)
      })

      it('after entering, cave ground takes over at interior Y', () => {
        const cave = built.get(name)!
        const standing = interiorStanding(cave)
        const hit = queryColumnIndex(cave.index, standing.x, standing.y, standing.z)
        expect(hit).not.toBeNull()
        expect(hit!.floorY).toBeLessThan(cave.surfaceHeightAt(standing.x, standing.z) - 1)
        expect(isCaveInteriorAt(cave.index, cave.topology.entrance, standing.x, standing.y, standing.z)).toBe(true)
      })

      it('leaving through the mouth returns surface ground at surface Y', () => {
        const cave = built.get(name)!
        const { x, z } = approachPoint(cave, 8)
        const surfaceY = cave.surfaceHeightAt(x, z)
        expect(mouthCarveDepth(x, z, cave.topology.entrance)).toBe(0)
        expect(queryColumnIndex(cave.index, x, surfaceY, z)).toBeNull()
        expect(isCaveInteriorAt(cave.index, cave.topology.entrance, x, surfaceY, z)).toBe(false)
      })

      it('occupancy-derived colliders do not seal the portal', () => {
        const cave = built.get(name)!
        const { x, z, carvedY } = approachPoint(cave, 2.2)
        const active = cave.colliders.filter((c) => colliderActiveAtY(c, carvedY))
        const resolved = resolvePosition(x, z, PLAYER_COLLISION_RADIUS, active)
        expect(Math.hypot(resolved.x - x, resolved.z - z)).toBeLessThan(0.05)
      })

      it('camera stays in occupancy when the player is interior, not on the terrain', () => {
        const cave = built.get(name)!
        const standing = interiorStanding(cave)
        const surfaceY = cave.surfaceHeightAt(standing.x, standing.z)
        const occupancyAt = (x: number, y: number, z: number) => occupancyIntervalAt(cave.index, x, y, z)
        expect(occupancyAt(standing.x, standing.y, standing.z)).not.toBeNull()
        const result = resolveCameraBoom({
          originX: standing.x,
          originY: standing.y,
          originZ: standing.z,
          camX: standing.x + 8,
          camY: standing.y + 2,
          camZ: standing.z + 8,
          sampleHeight: cave.surfaceHeightAt,
          colliders: [],
          occupancyAt,
        })
        expect(result.y).toBeLessThan(surfaceY)
        expect(result.y).not.toBeCloseTo(surfaceY + CAMERA_GROUND_CLEARANCE, 0)
      })

      it('camera does not tunnel the ceiling/overburden from interior', () => {
        const cave = built.get(name)!
        const standing = interiorStanding(cave)
        const hit = occupancyIntervalAt(cave.index, standing.x, standing.y, standing.z)!
        const surfaceY = cave.surfaceHeightAt(standing.x, standing.z)
        const result = resolveCameraBoom({
          originX: standing.x,
          originY: standing.y,
          originZ: standing.z,
          camX: standing.x,
          camY: surfaceY + 10,
          camZ: standing.z + 0.5,
          sampleHeight: cave.surfaceHeightAt,
          colliders: [],
          occupancyAt: (x, y, z) => occupancyIntervalAt(cave.index, x, y, z),
        })
        expect(result.t).toBeLessThan(1)
        expect(result.y).toBeLessThan(surfaceY)
        expect(result.y).toBeLessThan(hit.ceilingY + CAMERA_GROUND_CLEARANCE + 0.5)
      })

      it('a real mouth exit switches the boom back to surface behaviour', () => {
        const cave = built.get(name)!
        const { entrance } = cave.topology
        const out = openingDirection(entrance.yaw)
        const originY = entrance.y + 1.1
        const result = resolveCameraBoom({
          originX: entrance.x,
          originY,
          originZ: entrance.z,
          camX: entrance.x + out.dx * 12,
          camY: originY + 1,
          camZ: entrance.z + out.dz * 12,
          sampleHeight: cave.surfaceHeightAt,
          colliders: [],
          occupancyAt: (x, y, z) => occupancyIntervalAt(cave.index, x, y, z),
        })
        expect(result.t).toBeGreaterThan(0.2)
        expect(Math.hypot(result.x - entrance.x, result.z - entrance.z)).toBeGreaterThan(1)
      })
    })
  }

  it('cave-interior state does not flicker on a single boundary sample', () => {
    const cave = built.get('Grota Czarnego Kamienia')!
    const standing = interiorStanding(cave)
    expect(isCaveInteriorAt(cave.index, cave.topology.entrance, standing.x, standing.y, standing.z)).toBe(true)
    const flicker = applyCaveInteriorHysteresis(false, true, true)
    expect(flicker.interior).toBe(true)
    const left = applyCaveInteriorHysteresis(false, false, true)
    expect(left.interior).toBe(false)
  })
})

describe('B3 entrance contracts: seed 1136726869 path / lateral / geometry', () => {
  let czarny: BuiltCave
  let mroczna: BuiltCave

  beforeAll(() => {
    czarny = buildReproCave(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z)
    mroczna = buildReproCave(GROTA_MROCZNA.x, GROTA_MROCZNA.z)
  })

  function xzAt(cave: BuiltCave, along: number, lateral = 0): { x: number, z: number } {
    const { entrance } = cave.topology
    const out = openingDirection(entrance.yaw)
    return {
      x: entrance.x + out.dx * along - out.dz * lateral,
      z: entrance.z + out.dz * along + out.dx * lateral,
    }
  }

  it('Czarny Kamień: in front of the entrance at surface Y is not cave ground', () => {
    const { x, z } = xzAt(czarny, 8)
    const surfaceY = czarny.surfaceHeightAt(x, z)
    expect(mouthCarveDepth(x, z, czarny.topology.entrance)).toBe(0)
    expect(queryColumnIndex(czarny.index, x, surfaceY, z)).toBeNull()
    expect(isCaveInteriorAt(czarny.index, czarny.topology.entrance, x, surfaceY, z)).toBe(false)
  })

  it('Czarny Kamień: beside the mouth disc at surface Y is not cave ground', () => {
    for (const lateral of [-2.5, 2.5]) {
      const { x, z } = xzAt(czarny, 0, lateral)
      const surfaceY = czarny.surfaceHeightAt(x, z)
      expect(Math.abs(mouthLateral(x, z, czarny.topology.entrance))).toBeGreaterThan(2)
      expect(queryColumnIndex(czarny.index, x, surfaceY, z)).toBeNull()
      expect(isCaveInteriorAt(czarny.index, czarny.topology.entrance, x, surfaceY, z)).toBe(false)
    }
  })

  it('Czarny Kamień: opposite-hill samples have no cave ownership', () => {
    for (const along of [6, 8]) {
      for (const lateral of [-4, -2, 0, 2, 4]) {
        const { x, z } = xzAt(czarny, along, lateral)
        const surfaceY = czarny.surfaceHeightAt(x, z)
        expect(queryColumnIndex(czarny.index, x, surfaceY, z), `along=${along} lat=${lateral} surface`).toBeNull()
        expect(queryColumnIndex(czarny.index, x, surfaceY - 2, z), `along=${along} lat=${lateral} buried`).toBeNull()
        expect(isCaveInteriorAt(czarny.index, czarny.topology.entrance, x, surfaceY - 2, z)).toBe(false)
      }
    }
  })

  it('Czarny Kamień: approach portal is open sky and does not clamp below its floor', () => {
    const { x, z, carvedY } = approachPoint(czarny, 2.4)
    const hit = queryColumnIndex(czarny.index, x, carvedY, z)
    expect(hit).not.toBeNull()
    expect(hit!.openSky).toBe(true)
    expect(rockCeilingMaxY(hit!.openSky ? null : hit!.ceilingY, hit!.floorY)).toBeUndefined()
    expect(hit!.ceilingY - PLAYER_HEIGHT).toBeLessThan(hit!.floorY)
  })

  it('Czarny Kamień: mouth and descending columns are a single walkable interval', () => {
    let prevFloor: number | null = null
    for (let along = 0; along >= -20; along -= 0.4) {
      const { x, z } = xzAt(czarny, along)
      const intervals = columnIntervalsAt(czarny.index, x, z)
      expect(intervals.length, `along=${along} stacked`).toBeLessThanOrEqual(1)
      expect(intervals.length, `along=${along} empty`).toBeGreaterThan(0)
      const floor = intervals[0]!.floorY
      if (prevFloor !== null) {
        expect(Math.abs(floor - prevFloor), `along=${along} floor jump`).toBeLessThan(1.1)
      }
      prevFloor = floor
      const standingY = floor + 1.1
      const hit = queryColumnIndex(czarny.index, x, standingY, z)
      expect(hit).not.toBeNull()
      expect(occupancyContains(czarny.index, x, standingY, z)).toBe(true)
      if (along < -0.5) {
        expect(isCaveInteriorAt(czarny.index, czarny.topology.entrance, x, standingY, z)).toBe(true)
        expect(hit!.openSky, `interior along=${along} must not be tagged openSky`).toBeFalsy()
        expect(hit!.ceilingY - PLAYER_HEIGHT).toBeGreaterThan(hit!.floorY)
      }
    }
  })

  it('Czarny Kamień: descending passage 3.5–12 m has no surface ownership or floor holes', () => {
    let prevFloor: number | null = null
    let prevCeiling: number | null = null
    for (let along = -3.5; along >= -12; along -= 0.25) {
      const { x, z } = xzAt(czarny, along)
      const surfaceY = czarny.surfaceHeightAt(x, z)
      const intervals = columnIntervalsAt(czarny.index, x, z)
      expect(intervals.length, `along=${along} stacked`).toBe(1)
      const floor = intervals[0]!.floorY
      const ceiling = intervals[0]!.ceilingY
      expect(floor).toBeLessThan(surfaceY - 1)
      if (prevFloor !== null) {
        expect(Math.abs(floor - prevFloor), `along=${along} floor delta`).toBeLessThan(0.45)
      }
      if (prevCeiling !== null) {
        expect(Math.abs(ceiling - prevCeiling), `along=${along} ceiling delta`).toBeLessThan(0.6)
      }
      prevFloor = floor
      prevCeiling = ceiling
      const standingY = floor + 1.1
      const hit = queryColumnIndex(czarny.index, x, standingY, z)
      expect(hit).not.toBeNull()
      expect(hit!.openSky).toBeFalsy()
      expect(occupancyContains(czarny.index, x, standingY, z)).toBe(true)
      expect(isCaveInteriorAt(czarny.index, czarny.topology.entrance, x, standingY, z)).toBe(true)
      expect(hit!.ceilingY - PLAYER_HEIGHT).toBeGreaterThan(hit!.floorY)
    }
  })

  it('Czarny Kamień: boom from 5 m inside toward the mouth stays in occupancy', () => {
    const { x, z } = xzAt(czarny, -5)
    const intervals = columnIntervalsAt(czarny.index, x, z)
    const floorY = intervals[0]!.floorY
    const originY = floorY + 1.1
    const out = openingDirection(czarny.topology.entrance.yaw)
    const result = resolveCameraBoom({
      originX: x,
      originY,
      originZ: z,
      camX: x + out.dx * CAMERA_DISTANCE_DEFAULT,
      camY: originY + 1,
      camZ: z + out.dz * CAMERA_DISTANCE_DEFAULT,
      sampleHeight: czarny.surfaceHeightAt,
      colliders: [],
      occupancyAt: (qx, qy, qz) => occupancyIntervalAt(czarny.index, qx, qy, qz),
    })
    const camAlong = mouthAlong(result.x, result.z, czarny.topology.entrance)
    const camSurface = czarny.surfaceHeightAt(result.x, result.z)
    const camOcc = occupancyIntervalAt(czarny.index, result.x, result.y, result.z)
    expect(camOcc).not.toBeNull()
    expect(camOcc!.openSky).toBeFalsy()
    expect(camAlong).toBeLessThan(-1)
    expect(result.y).toBeLessThan(camSurface - 0.5)
    expect(result.t).toBeLessThan(1)
  })

  it('Czarny Kamień: stable interior is cave ground + interior occupancy', () => {
    const standing = interiorStanding(czarny)
    const hit = queryColumnIndex(czarny.index, standing.x, standing.y, standing.z)
    expect(hit).not.toBeNull()
    expect(hit!.floorY).toBeLessThan(czarny.surfaceHeightAt(standing.x, standing.z) - 4)
    expect(occupancyContains(czarny.index, standing.x, standing.y, standing.z)).toBe(true)
    expect(isCaveInteriorAt(czarny.index, czarny.topology.entrance, standing.x, standing.y, standing.z)).toBe(true)
  })

  it('Czarny Kamień and Grota Mroczna: portal walking strip is passable', () => {
    for (const cave of [czarny, mroczna]) {
      for (const along of [2.2, 0.4, 0, -0.4, -1.2]) {
        const { x, z } = xzAt(cave, along)
        const intervals = columnIntervalsAt(cave.index, x, z)
        const y = (intervals[0]?.floorY ?? cave.topology.entrance.y) + 0.35
        const active = cave.colliders.filter((c) => colliderActiveAtY(c, y))
        const resolved = resolvePosition(x, z, PLAYER_COLLISION_RADIUS, active)
        expect(
          Math.hypot(resolved.x - x, resolved.z - z),
          `${cave.topology.caveId} along=${along} y=${y.toFixed(2)}`,
        ).toBeLessThan(0.05)
      }
    }
  })

  it('Czarny Kamień: player-sized path from transition through the mouth is unblocked at feet Y', () => {
    const inner = mouthWalkCorridorAlong(czarny.topology)
    expect(inner).toBeLessThan(-4)
    for (let along = inner; along <= 2.2; along += 0.2) {
      const { x, z } = xzAt(czarny, along)
      const intervals = columnIntervalsAt(czarny.index, x, z)
      const floor = intervals[0]?.floorY ?? czarny.topology.entrance.y
      const y = floor + 0.02
      const active = czarny.colliders.filter((c) => colliderActiveAtY(c, y))
      const resolved = resolvePosition(x, z, PLAYER_COLLISION_RADIUS, active)
      expect(
        Math.hypot(resolved.x - x, resolved.z - z),
        `along=${along.toFixed(2)} y=${y.toFixed(2)}`,
      ).toBeLessThan(0.05)
    }
  })

  it('SDF aperture is void and hood/sides are rock before meshing', () => {
    const { entrance } = czarny.topology
    const { sdf } = czarny
    const mouth = deriveMouthGeometry(entrance)
    const out = openingDirection(entrance.yaw)
    const at = (along: number, lateral: number, y: number) => {
      const x = entrance.x + out.dx * along - out.dz * lateral
      const z = entrance.z + out.dz * along + out.dx * lateral
      return sdf.sample(x, y, z)
    }
    const midY = entrance.y + entrance.height * 0.5
    expect(at(0.25, 0, midY)).toBeLessThan(0)
    expect(at(0.4, 0, mouth.lintelY + 0.12)).toBeGreaterThan(0)
    expect(at(0.25, 2.05, midY)).toBeGreaterThan(0)
    expect(at(0.25, -2.05, midY)).toBeGreaterThan(0)
    expect(at(-1.0, 0, midY)).toBeLessThan(0)
  })

  it('mouth aperture clip drops doorway-cap triangles and keeps hood/sides', () => {
    const builtMesh = buildSdfCaveMesh(czarny.topology, undefined, czarny.surfaceHeightAt, czarny.sdf)
    const pos = builtMesh.geometry.getAttribute('position')
    const idx = builtMesh.geometry.getIndex()
    expect(pos).toBeTruthy()
    expect(idx).toBeTruthy()
    const positions: number[] = []
    for (let i = 0; i < pos!.count * 3; i++) positions.push(pos!.array[i]!)
    const indices: number[] = []
    for (let i = 0; i < idx!.count; i++) indices.push(idx!.array[i]!)
    const { entrance } = czarny.topology
    const mouth = deriveMouthGeometry(entrance)
    let apertureOutward = 0
    let hoodOrSide = 0
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const a = indices[i]!
      const b = indices[i + 1]!
      const c = indices[i + 2]!
      const cx = (positions[a * 3]! + positions[b * 3]! + positions[c * 3]!) / 3
      const cy = (positions[a * 3 + 1]! + positions[b * 3 + 1]! + positions[c * 3 + 1]!) / 3
      const cz = (positions[a * 3 + 2]! + positions[b * 3 + 2]! + positions[c * 3 + 2]!) / 3
      const along = mouthAlong(cx, cz, entrance)
      const lateral = mouthLateral(cx, cz, entrance)
      if (inMouthAperture(along, lateral, cy, mouth)) apertureOutward += 1
      if (along > 0.2 && (cy > mouth.lintelY - 0.08 || Math.abs(lateral) >= mouth.apertureHalfWidth - 0.08)) {
        hoodOrSide += 1
      }
    }
    expect(apertureOutward).toBe(0)
    expect(hoodOrSide).toBeGreaterThan(0)
    const unclipped = buildSdfCaveMesh(czarny.topology, undefined, undefined, czarny.sdf)
    const clippedAgain = clipTrianglesInFrontOfMouth(
      [...unclipped.geometry.getAttribute('position')!.array],
      [...(unclipped.geometry.getIndex()?.array ?? [])],
      entrance,
    )
    expect(clippedAgain.indices.length).toBeGreaterThan(0)
  })

  it('terrain carve stays B3-stable and the mesh frame meets the carved shell', () => {
    const { entrance } = czarny.topology
    const mouth = deriveMouthGeometry(entrance)
    const discs = mouthCarveDiscs(entrance)
    expect(discs.some((d) => Math.abs(d.radius - mouth.approachRadius) < 1e-9)).toBe(true)
    expect(mouth.approachRadius).toBe(3.2)

    const { x: farX, z: farZ } = xzAt(czarny, 8)
    expect(mouthCarveDepth(farX, farZ, entrance)).toBe(0)

    const builtMesh = buildSdfCaveMesh(czarny.topology, undefined, czarny.surfaceHeightAt, czarny.sdf)
    const pos = builtMesh.geometry.getAttribute('position')!
    const idx = builtMesh.geometry.getIndex()!
    let maxFrameAlong = -Infinity
    let minVertexAboveTerrain = Infinity
    for (let i = 0; i + 2 < idx.count; i += 3) {
      const a = idx.array[i]!
      const b = idx.array[i + 1]!
      const c = idx.array[i + 2]!
      const cx = (pos.array[a * 3]! + pos.array[b * 3]! + pos.array[c * 3]!) / 3
      const cy = (pos.array[a * 3 + 1]! + pos.array[b * 3 + 1]! + pos.array[c * 3 + 1]!) / 3
      const cz = (pos.array[a * 3 + 2]! + pos.array[b * 3 + 2]! + pos.array[c * 3 + 2]!) / 3
      const along = mouthAlong(cx, cz, entrance)
      const lateral = mouthLateral(cx, cz, entrance)
      if (along > 0.15 && (cy > mouth.lintelY - 0.1 || Math.abs(lateral) >= mouth.apertureHalfWidth - 0.08)) {
        maxFrameAlong = Math.max(maxFrameAlong, along)
      }
    }
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v)
      const y = pos.getY(v)
      const z = pos.getZ(v)
      minVertexAboveTerrain = Math.min(minVertexAboveTerrain, czarny.surfaceHeightAt(x, z) - y)
    }
    expect(maxFrameAlong).toBeGreaterThan(0.35)
    expect(maxFrameAlong).toBeGreaterThan(mouth.apertureOutward * 0.35)
    expect(minVertexAboveTerrain).toBeGreaterThanOrEqual(-1e-6)
  })
})
