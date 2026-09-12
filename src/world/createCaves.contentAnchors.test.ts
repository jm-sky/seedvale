/** Plan world-terrain-020 Stage B — `createCaves()` owns the content-anchor
 *  seam: adventure caves expose the required roles against their retained
 *  heightfield; natural caves expose none; availability does not wait on
 *  presentation streaming. */

import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ChunkManager } from '../terrain/chunkManager'
import type { TerrainCutout } from '../terrain/terrainCutout'
import type { Collider } from './collision'
import { createBenchmarkWorldConfig } from '../config/worldConfig'
import { villageSizeConfig } from '../settlement/families'
import {
  type RawSampleParams,
  sampleContinentalnessAt,
  sampleHeightAt,
  sampleMountainRidgeAt,
} from '../terrain/chunkHeightmap'
import { orderHomeAdventureCandidates } from './caves/caveArchetype'
import { CAVE_CONTENT_PLACEMENT } from './caves/caveContentAnchors'
import { buildCaveHeightfieldRepresentation, sampleHeightfieldAt } from './caves/caveHeightfieldRepresentation'
import { mouthCarveDepth } from './caves/mouthCarve'
import { buildProductionCaveTopology } from './caves/productionTopology'
import { type Caves, createCaves } from './createCaves'
import { pickLargeCaveSites } from './largeCaves'

const SEED = 1136726869
const HOME_RADIUS = villageSizeConfig('MD').footprintRadius
const COAST_THRESHOLD = 0.45

function terrainParams(): RawSampleParams {
  const config = createBenchmarkWorldConfig({ seed: SEED, terrainResolution: 65, loadRadius: 4 })
  const t = config.terrain
  return {
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
}

function fakeChunkManager(): ChunkManager {
  const params = terrainParams()
  const fake = {
    waterLevel: params.waterLevel,
    sampleHeight: (x: number, z: number) => sampleHeightAt(x, z, params),
    sampleBaseHeight: (x: number, z: number) => sampleHeightAt(x, z, params),
    sampleContinentalness: (x: number, z: number) => sampleContinentalnessAt(x, z, params),
    sampleMountainRidge: (x: number, z: number) => sampleMountainRidgeAt(x, z, params),
    roadCorridorsNear: () => [],
    modifyTerrain: () => true,
    registerTerrainCutouts: (_ownerKey: string, _cutouts: readonly TerrainCutout[]) => {},
    clearTerrainCutouts: () => {},
    registerColliders: (_ownerKey: string, _colliders: readonly Collider[]) => {},
    clearColliders: () => {},
  }
  return fake as unknown as ChunkManager
}

let caves: Caves
let scene: THREE.Scene
let chunkManager: ChunkManager

beforeAll(() => {
  scene = new THREE.Scene()
  chunkManager = fakeChunkManager()
  caves = createCaves(scene, chunkManager, SEED, HOME_RADIUS, COAST_THRESHOLD)
})

describe('createCaves content anchors (plan world-terrain-020 Stage B)', () => {
  it('exposes the required adventure anchors without waiting on streaming', () => {
    expect(caves.peekStreamingDebug().activePresentations).toBe(0)
    const adventureIds = caves.definitions()
      .map((d) => d.caveId)
      .filter((id) => caves.archetypeOf(id) === 'adventure')
    expect(adventureIds.length).toBeGreaterThanOrEqual(1)
    for (const caveId of adventureIds) {
      const anchors = caves.contentAnchorsOf(caveId)
      const roles = anchors.map((a) => a.role)
      expect(roles.filter((r) => r === 'sideTreasure')).toHaveLength(1)
      expect(roles.filter((r) => r === 'finalTreasure')).toHaveLength(1)
      expect(roles.filter((r) => r === 'wagon')).toHaveLength(1)
      expect(anchors.every((a) => a.caveId === caveId)).toBe(true)
    }
  })

  it('gives every natural cave an empty adventure content list', () => {
    const naturalIds = caves.definitions()
      .map((d) => d.caveId)
      .filter((id) => caves.archetypeOf(id) === 'natural')
    expect(naturalIds.length).toBeGreaterThan(0)
    for (const caveId of naturalIds) {
      expect(caves.contentAnchorsOf(caveId)).toEqual([])
    }
    expect(caves.contentAnchorsOf('cave:deadbeef')).toEqual([])
  })

  it('gives dungeon caves no adventure content anchors', () => {
    for (const def of caves.definitions()) {
      if (caves.archetypeOf(def.caveId) !== 'dungeon') continue
      expect(caves.contentAnchorsOf(def.caveId)).toEqual([])
    }
  })

  it('lists every per-cave anchor exactly once on the world API', () => {
    const combined = caves.definitions().flatMap((d) => caves.contentAnchorsOf(d.caveId))
    expect(caves.contentAnchors()).toEqual(combined)
    expect(new Set(combined.map((a) => a.id)).size).toBe(combined.length)
  })

  it('resolves Y on the cave heightfield, not the surface terrain sampler', () => {
    const villages = [{ x: 0, z: 0, radius: Math.max(HOME_RADIUS, villageSizeConfig('MD').footprintRadius) }]
    const sites = pickLargeCaveSites({
      seed: SEED,
      sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
      sampleContinentalness: (x, z) => chunkManager.sampleContinentalness(x, z),
      sampleMountainRidge: (x, z) => chunkManager.sampleMountainRidge(x, z),
      waterLevel: chunkManager.waterLevel,
      coastThreshold: COAST_THRESHOLD,
      roadsNear: () => [],
      villages,
    })
    const order = orderHomeAdventureCandidates(SEED, sites)
    for (const def of caves.definitions()) {
      if (caves.archetypeOf(def.caveId) !== 'adventure') continue
      const candidate = order.find((c) => c.caveId === def.caveId)!
      const topology = buildProductionCaveTopology({
        seed: SEED,
        site: candidate.site,
        archetype: 'adventure',
        sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
        sampleBaseHeight: (x, z) => chunkManager.sampleBaseHeight(x, z),
      })!
      const walkSurfaceAt = (x: number, z: number): number =>
        chunkManager.sampleBaseHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
      const heightfield = buildCaveHeightfieldRepresentation(topology, walkSurfaceAt).heightfield
      for (const anchor of caves.contentAnchorsOf(def.caveId)) {
        const sample = sampleHeightfieldAt(heightfield, anchor.x, anchor.z)
        expect(anchor.y).toBeCloseTo(sample.floorY, 5)
        expect(sample.gap).toBeGreaterThan(0)
        expect(anchor.y).toBeLessThan(chunkManager.sampleHeight(anchor.x, anchor.z) - 0.5)
        expect(sample.gap).toBeGreaterThanOrEqual(CAVE_CONTENT_PLACEMENT[anchor.role].minGap * 0.85)
      }
    }
  })

  it('does not grow or shrink anchors when presentation streams in', () => {
    const before = caves.contentAnchors()
    const def = caves.definitions()[0]!
    caves.update(def.entrance.x, def.entrance.z)
    expect(caves.contentAnchors()).toEqual(before)
  })
})
