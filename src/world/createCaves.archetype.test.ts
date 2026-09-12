/** Plan world-terrain-020 Stage A — archetype assignment as `createCaves()`
 *  actually wires it: real analytic terrain, the unchanged siting authority,
 *  and topology acceptance owned by the recipes. Pure ordering/roll/fallback
 *  contracts live in `caves/caveArchetype.test.ts`. */

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
import {
  ADVENTURE_FINAL_CHAMBER_NODE_ID,
  ADVENTURE_JUNCTION_NODE_ID,
  ADVENTURE_SIDE_CHAMBER_NODE_ID,
} from './caves/adventureTopology'
import {
  ADVENTURE_HOME_BAND_MAX,
  orderGuaranteedDungeonCandidates,
  orderHomeAdventureCandidates,
} from './caves/caveArchetype'
import { estimateHeightfieldGrid } from './caves/caveHeightfieldRepresentation'
import {
  DUNGEON_FINAL_CHAMBER_NODE_ID,
  DUNGEON_JUNCTION_1_NODE_ID,
  DUNGEON_MAX_HEIGHTFIELD_CELLS,
  DUNGEON_SIDE_CHAMBER_1_NODE_ID,
} from './caves/dungeonTopology'
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

/** The exact site set `createCaves()` works from — no second siting pass. */
function productionSites(): ReturnType<typeof pickLargeCaveSites> {
  const chunkManager = fakeChunkManager()
  const villages = [{ x: 0, z: 0, radius: Math.max(HOME_RADIUS, villageSizeConfig('MD').footprintRadius) }]
  return pickLargeCaveSites({
    seed: SEED,
    sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
    sampleContinentalness: (x, z) => chunkManager.sampleContinentalness(x, z),
    sampleMountainRidge: (x, z) => chunkManager.sampleMountainRidge(x, z),
    waterLevel: chunkManager.waterLevel,
    coastThreshold: COAST_THRESHOLD,
    roadsNear: () => [],
    villages,
  })
}

let caves: Caves
let scene: THREE.Scene

beforeAll(() => {
  scene = new THREE.Scene()
  caves = createCaves(scene, fakeChunkManager(), SEED, HOME_RADIUS, COAST_THRESHOLD)
})

function archetypes(): { caveId: string, archetype: string | null }[] {
  return caves.definitions().map((d) => ({ caveId: d.caveId, archetype: caves.archetypeOf(d.caveId) }))
}

describe('createCaves archetype assignment (plan world-terrain-020 Stage A)', () => {
  it('every accepted cave has a known archetype, and an unknown id has none', () => {
    expect(caves.definitions().length).toBeGreaterThan(0)
    for (const { archetype } of archetypes()) {
      expect(['natural', 'adventure', 'dungeon']).toContain(archetype)
    }
    expect(caves.archetypeOf('cave:deadbeef')).toBeNull()
  })

  it('guarantees exactly one adventure cave in the home area, on the first candidate whose adventure topology is accepted', () => {
    const sites = productionSites()
    const order = orderHomeAdventureCandidates(SEED, sites)
    const chunkManager = fakeChunkManager()
    const firstAccepted = order.find((candidate) => buildProductionCaveTopology({
      seed: SEED,
      site: candidate.site,
      archetype: 'adventure',
      sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
      sampleBaseHeight: (x, z) => chunkManager.sampleBaseHeight(x, z),
    }) !== null)
    expect(firstAccepted, 'no existing site on this seed can carry an adventure cave').toBeDefined()
    expect(caves.archetypeOf(firstAccepted!.caveId)).toBe('adventure')

    const homeArea = archetypes().filter(({ caveId }) => {
      const site = order.find((c) => c.caveId === caveId)!
      return site.homeDistance <= ADVENTURE_HOME_BAND_MAX
    })
    expect(homeArea.filter((a) => a.archetype === 'adventure')).toHaveLength(1)
  })

  it('creates no cave outside the existing site set — the guarantee never synthesizes a site', () => {
    const sites = productionSites()
    const siteKeys = new Set(sites.map((s) => `${s.x.toFixed(4)},${s.z.toFixed(4)}`))
    const defs = caves.definitions()
    expect(defs.length).toBeLessThanOrEqual(sites.length)
    for (const def of defs) {
      expect(siteKeys.has(`${def.entrance.x.toFixed(4)},${def.entrance.z.toFixed(4)}`)).toBe(true)
    }
    expect(new Set(defs.map((d) => d.caveId)).size).toBe(defs.length)
  })

  it('is deterministic: a second world on the same seed assigns exactly the same archetypes', () => {
    const other = createCaves(new THREE.Scene(), fakeChunkManager(), SEED, HOME_RADIUS, COAST_THRESHOLD)
    try {
      expect(other.definitions().map((d) => [d.caveId, other.archetypeOf(d.caveId)]))
        .toEqual(caves.definitions().map((d) => [d.caveId, caves.archetypeOf(d.caveId)]))
    } finally {
      other.dispose()
    }
  })

  it('gives the guaranteed adventure cave its junction, side chamber and final chamber on real terrain', () => {
    const adventureIds = archetypes().filter((a) => a.archetype === 'adventure').map((a) => a.caveId)
    expect(adventureIds.length).toBeGreaterThanOrEqual(1)
    const chunkManager = fakeChunkManager()
    const sites = productionSites()
    for (const caveId of adventureIds) {
      const candidate = orderHomeAdventureCandidates(SEED, sites).find((c) => c.caveId === caveId)!
      const topology = buildProductionCaveTopology({
        seed: SEED,
        site: candidate.site,
        archetype: 'adventure',
        sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
        sampleBaseHeight: (x, z) => chunkManager.sampleBaseHeight(x, z),
      })!
      const ids = new Set(topology.nodes.map((n) => n.id))
      expect(ids.has(ADVENTURE_JUNCTION_NODE_ID)).toBe(true)
      expect(ids.has(ADVENTURE_SIDE_CHAMBER_NODE_ID)).toBe(true)
      expect(ids.has(ADVENTURE_FINAL_CHAMBER_NODE_ID)).toBe(true)
      // The retained representation stays proportionate to a natural cave's.
      expect(estimateHeightfieldGrid(topology).cells).toBeLessThanOrEqual(72_000)
    }
  })

  it('keeps every natural cave a natural cave — no adventure nodes leak into them', () => {
    const sites = productionSites()
    const chunkManager = fakeChunkManager()
    const order = orderHomeAdventureCandidates(SEED, sites)
    for (const { caveId, archetype } of archetypes()) {
      if (archetype !== 'natural') continue
      const candidate = order.find((c) => c.caveId === caveId)!
      const topology = buildProductionCaveTopology({
        seed: SEED,
        site: candidate.site,
        sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
        sampleBaseHeight: (x, z) => chunkManager.sampleBaseHeight(x, z),
      })
      expect(topology, `natural cave ${caveId} must still be accepted by the natural recipe`).not.toBeNull()
      expect(topology!.nodes.some((n) => n.id.startsWith('adventure-'))).toBe(false)
      expect(topology!.nodes.some((n) => n.id.startsWith('dungeon-'))).toBe(false)
    }
  })

  it('selects a guaranteed dungeon from existing sites without moving the home adventure cave', () => {
    const sites = productionSites()
    const chunkManager = fakeChunkManager()
    const adventureOrder = orderHomeAdventureCandidates(SEED, sites)
    const firstAdventure = adventureOrder.find((candidate) => buildProductionCaveTopology({
      seed: SEED,
      site: candidate.site,
      archetype: 'adventure',
      sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
      sampleBaseHeight: (x, z) => chunkManager.sampleBaseHeight(x, z),
    }) !== null)
    expect(firstAdventure).toBeDefined()
    expect(caves.archetypeOf(firstAdventure!.caveId)).toBe('adventure')

    const dungeonOrder = orderGuaranteedDungeonCandidates(SEED, sites, firstAdventure!.caveId)
    const firstDungeon = dungeonOrder.find((candidate) => buildProductionCaveTopology({
      seed: SEED,
      site: candidate.site,
      archetype: 'dungeon',
      sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
      sampleBaseHeight: (x, z) => chunkManager.sampleBaseHeight(x, z),
    }) !== null)
    if (!firstDungeon) {
      expect(archetypes().every((a) => a.archetype !== 'dungeon')).toBe(true)
      return
    }
    expect(caves.archetypeOf(firstDungeon.caveId)).toBe('dungeon')
    expect(firstDungeon.caveId).not.toBe(firstAdventure!.caveId)
    const topology = buildProductionCaveTopology({
      seed: SEED,
      site: firstDungeon.site,
      archetype: 'dungeon',
      sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
      sampleBaseHeight: (x, z) => chunkManager.sampleBaseHeight(x, z),
    })!
    const ids = new Set(topology.nodes.map((n) => n.id))
    expect(ids.has(DUNGEON_JUNCTION_1_NODE_ID)).toBe(true)
    expect(ids.has(DUNGEON_SIDE_CHAMBER_1_NODE_ID)).toBe(true)
    expect(ids.has(DUNGEON_FINAL_CHAMBER_NODE_ID)).toBe(true)
    expect(estimateHeightfieldGrid(topology).cells).toBeLessThanOrEqual(DUNGEON_MAX_HEIGHTFIELD_CELLS)
    const chambers = caves.dungeonChambersOf(firstDungeon.caveId)
    expect(chambers.length).toBeGreaterThanOrEqual(5)
    expect(chambers.every((c) => ids.has(c.nodeId))).toBe(true)
    expect(caves.dungeonChambersOf(firstAdventure!.caveId)).toEqual([])
    expect(caves.dungeonChambersOf('cave:deadbeef')).toEqual([])
    const pool = caves.undergroundPoolOf(firstDungeon.caveId)
    expect(pool).not.toBeNull()
    expect(pool!.waterSource).toEqual({ kind: 'lake', quality: 'unsafe' })
    expect(caves.undergroundPoolOf(firstAdventure!.caveId)).toBeNull()
  })

  it('exposes exactly one underground pool per accepted dungeon and none elsewhere', () => {
    for (const { caveId, archetype } of archetypes()) {
      const pool = caves.undergroundPoolOf(caveId)
      if (archetype === 'dungeon') {
        expect(pool).not.toBeNull()
        expect(pool!.caveId).toBe(caveId)
      } else {
        expect(pool).toBeNull()
      }
    }
    expect(caves.undergroundPoolOf('cave:deadbeef')).toBeNull()
  })

  it('does not leak dungeon content onto adventure caves', () => {
    for (const { caveId, archetype } of archetypes()) {
      if (archetype !== 'adventure') continue
      expect(caves.dungeonChambersOf(caveId)).toEqual([])
      expect(caves.contentAnchorsOf(caveId).length).toBeGreaterThan(0)
    }
  })
})
