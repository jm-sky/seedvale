/** Plan world-terrain-030 — the persistent cave worldgen cache as
 *  `createWorldBundle()` actually wires it: a fresh `createCaves()` pass
 *  persists its manifest + per-cave derived records, and a second pass
 *  hydrated from those records must produce an identical world. Cave
 *  generation semantics themselves are covered by the existing cave tests. */

import * as THREE from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { CacheRecord } from '../../persistence/worldgenCacheDb'
import type { ChunkManager } from '../../terrain/chunkManager'
import type { TerrainCutout } from '../../terrain/terrainCutout'
import type { Collider } from '../collision'
import type { CaveWorldgenBuildResult } from './caveWorldgenCache'
import { createBenchmarkWorldConfig } from '../../config/worldConfig'
import { villageSizeConfig } from '../../settlement/families'
import {
  type RawSampleParams,
  sampleContinentalnessAt,
  sampleHeightAt,
  sampleMountainRidgeAt,
} from '../../terrain/chunkHeightmap'
import { type Caves, createCaves } from '../createCaves'
import {
  CAVE_MANIFEST_SUBKEY,
  CAVES_V2_NAMESPACE,
  CAVES_V2_VERSION,
  caveSubKey,
  type CaveWorldgenCacheStorage,
  caveWorldgenFingerprint,
  loadCaveWorldgenSnapshot,
  persistCaveWorldgen,
} from './caveWorldgenCache'

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

type FakeChunkManagerSpies = {
  modifyTerrain: ReturnType<typeof vi.fn>
  registerTerrainCutouts: ReturnType<typeof vi.fn>
}

function fakeChunkManager(): ChunkManager & { spies: FakeChunkManagerSpies } {
  const params = terrainParams()
  const spies: FakeChunkManagerSpies = {
    modifyTerrain: vi.fn(() => true),
    registerTerrainCutouts: vi.fn((_ownerKey: string, _cutouts: readonly TerrainCutout[]) => {}),
  }
  const fake = {
    waterLevel: params.waterLevel,
    sampleHeight: (x: number, z: number) => sampleHeightAt(x, z, params),
    sampleBaseHeight: (x: number, z: number) => sampleHeightAt(x, z, params),
    sampleContinentalness: (x: number, z: number) => sampleContinentalnessAt(x, z, params),
    sampleMountainRidge: (x: number, z: number) => sampleMountainRidgeAt(x, z, params),
    roadCorridorsNear: () => [],
    modifyTerrain: spies.modifyTerrain,
    registerTerrainCutouts: spies.registerTerrainCutouts,
    clearTerrainCutouts: () => {},
    registerColliders: (_ownerKey: string, _colliders: readonly Collider[]) => {},
    clearColliders: () => {},
    spies,
  }
  return fake as unknown as ChunkManager & { spies: FakeChunkManagerSpies }
}

function fingerprint(): string {
  const params = terrainParams()
  return caveWorldgenFingerprint({
    params,
    waterLevel: params.waterLevel,
    coastThreshold: COAST_THRESHOLD,
    homeFootprintRadius: HOME_RADIUS,
  })
}

/** In-memory stand-in for `worldgenCacheDb.ts`. `structuredClone` on write is
 *  deliberate: it reproduces exactly what `IDBObjectStore.put()` does, so
 *  typed arrays crossing this boundary are tested, not assumed. */
function memoryStorage(): CaveWorldgenCacheStorage & { rows: Map<string, CacheRecord> } {
  const rows = new Map<string, CacheRecord>()
  return {
    rows,
    list: (async (seed: number, namespace: string, version: number) =>
      [...rows.values()].filter((r) => r.seed === seed && r.namespace === namespace && r.version === version)
    ) as CaveWorldgenCacheStorage['list'],
    put: async (records) => {
      for (const record of records) rows.set(record.key, structuredClone(record) as CacheRecord)
    },
    cap: async () => {},
  }
}

function key(subKey: string): string {
  return `${SEED}/${CAVES_V2_NAMESPACE}/${CAVES_V2_VERSION}/${subKey}`
}

type WorldSnapshot = {
  definitions: unknown
  anchors: unknown
  pools: unknown
  ground: unknown
  occupancy: unknown
}

function worldSnapshot(caves: Caves): WorldSnapshot {
  const defs = caves.definitions()
  return {
    definitions: defs.map((d) => [d.caveId, caves.archetypeOf(d.caveId), d.entrance, d.bounds]),
    anchors: caves.contentAnchors(),
    pools: defs.map((d) => caves.undergroundPoolOf(d.caveId)),
    ground: defs.map((d) => {
      const e = d.entrance
      return [-2, 0, 6, 14].map((along) =>
        caves.queryGroundIn(d.caveId, e.x + Math.sin(e.yaw) * along, e.y, e.z + Math.cos(e.yaw) * along),
      )
    }),
    occupancy: defs.map((d) => {
      const e = d.entrance
      return [0, 4, 10].map((along) =>
        caves.occupancyAt(e.x + Math.sin(e.yaw) * along, e.y + 0.5, e.z + Math.cos(e.yaw) * along),
      )
    }),
  }
}

function build(options?: Parameters<typeof createCaves>[6]): {
  caves: Caves
  chunkManager: ChunkManager & { spies: FakeChunkManagerSpies }
} {
  const chunkManager = fakeChunkManager()
  const caves = createCaves(new THREE.Scene(), chunkManager, SEED, HOME_RADIUS, COAST_THRESHOLD, undefined, options)
  return { caves, chunkManager }
}

let freshSnapshot: WorldSnapshot
let freshResult: CaveWorldgenBuildResult
let storage: ReturnType<typeof memoryStorage>

beforeAll(async () => {
  let captured: CaveWorldgenBuildResult | null = null
  const { caves } = build({ onWorldgenBuilt: (result) => { captured = result } })
  freshSnapshot = worldSnapshot(caves)
  caves.dispose()
  freshResult = captured as unknown as CaveWorldgenBuildResult
  storage = memoryStorage()
  await persistCaveWorldgen(SEED, fingerprint(), freshResult, storage)
})

describe('cave worldgen cache round trip (plan world-terrain-030)', () => {
  it('a cold pass reports a non-hydrated manifest and every accepted cave as freshly built', () => {
    expect(freshResult.manifestHydrated).toBe(false)
    expect(freshResult.accepted.length).toBeGreaterThan(0)
    expect(freshResult.freshlyBuilt.map((d) => d.caveId))
      .toEqual(freshResult.accepted.map((e) => e.topology.caveId))
  })

  it('persists one manifest record plus one record per accepted cave', () => {
    expect(storage.rows.has(key(CAVE_MANIFEST_SUBKEY))).toBe(true)
    for (const entry of freshResult.accepted) {
      expect(storage.rows.has(key(caveSubKey(entry.topology.caveId)))).toBe(true)
    }
    expect(storage.rows.size).toBe(freshResult.accepted.length + 1)
  })

  it('typed heightfield arrays survive the structured-clone boundary as Float32Array', async () => {
    const snapshot = await loadCaveWorldgenSnapshot(SEED, fingerprint(), storage)
    expect(snapshot).not.toBeNull()
    const entry = snapshot!.accepted[0]!
    const derived = snapshot!.derivedFor(entry)!
    expect(derived).not.toBeNull()
    const source = freshResult.freshlyBuilt.find((d) => d.caveId === entry.topology.caveId)!
    for (const field of ['floorY', 'ceilY', 'surfaceY', 'coreT'] as const) {
      expect(derived.heightfield[field]).toBeInstanceOf(Float32Array)
      expect(Array.from(derived.heightfield[field])).toEqual(Array.from(source.heightfield[field]))
    }
  })

  it('a full hit rebuilds an identical world without regenerating anything', async () => {
    const snapshot = await loadCaveWorldgenSnapshot(SEED, fingerprint(), storage)
    let captured: CaveWorldgenBuildResult | null = null
    const { caves, chunkManager } = build({
      hydratedWorldgen: snapshot,
      onWorldgenBuilt: (result) => { captured = result },
    })
    try {
      const result = captured as unknown as CaveWorldgenBuildResult
      expect(result.manifestHydrated).toBe(true)
      expect(result.freshlyBuilt).toEqual([])
      expect(worldSnapshot(caves)).toEqual(freshSnapshot)
      // Mouth carve and the terrain cutout are derived system effects replayed
      // every build — never cached terrain state.
      expect(chunkManager.spies.modifyTerrain.mock.calls.length).toBeGreaterThan(0)
      expect(chunkManager.spies.registerTerrainCutouts).toHaveBeenCalledTimes(1)
      expect(chunkManager.spies.registerTerrainCutouts.mock.calls[0]![1].length)
        .toBe(caves.definitions().length)
    } finally {
      caves.dispose()
    }
  })

  it('a missing per-cave record rebuilds only that cave, identically', async () => {
    const victim = freshResult.accepted.at(-1)!.topology.caveId
    const partial = memoryStorage()
    for (const [k, v] of storage.rows) if (k !== key(caveSubKey(victim))) partial.rows.set(k, v)
    const snapshot = await loadCaveWorldgenSnapshot(SEED, fingerprint(), partial)
    let captured: CaveWorldgenBuildResult | null = null
    const { caves } = build({ hydratedWorldgen: snapshot, onWorldgenBuilt: (r) => { captured = r } })
    try {
      const result = captured as unknown as CaveWorldgenBuildResult
      expect(result.manifestHydrated).toBe(true)
      expect(result.freshlyBuilt.map((d) => d.caveId)).toEqual([victim])
      expect(worldSnapshot(caves)).toEqual(freshSnapshot)
    } finally {
      caves.dispose()
    }
  })

  it('a heightfield whose typed-array length disagrees with nx*nz is a per-cave miss', async () => {
    const victim = freshResult.accepted[0]!.topology.caveId
    const corrupt = memoryStorage()
    for (const [k, v] of storage.rows) corrupt.rows.set(k, structuredClone(v) as CacheRecord)
    const row = corrupt.rows.get(key(caveSubKey(victim)))!
    const payload = row.payload as { heightfield: { nz: number } }
    payload.heightfield.nz += 1
    const snapshot = await loadCaveWorldgenSnapshot(SEED, fingerprint(), corrupt)
    let captured: CaveWorldgenBuildResult | null = null
    const { caves } = build({ hydratedWorldgen: snapshot, onWorldgenBuilt: (r) => { captured = r } })
    try {
      expect((captured as unknown as CaveWorldgenBuildResult).freshlyBuilt.map((d) => d.caveId)).toEqual([victim])
      expect(worldSnapshot(caves)).toEqual(freshSnapshot)
    } finally {
      caves.dispose()
    }
  })

  it('a malformed manifest is a full miss, not a partial world', async () => {
    const corrupt = memoryStorage()
    for (const [k, v] of storage.rows) corrupt.rows.set(k, structuredClone(v) as CacheRecord)
    corrupt.rows.get(key(CAVE_MANIFEST_SUBKEY))!.payload = { accepted: [{ archetype: 'wyrm', topology: {} }] }
    expect(await loadCaveWorldgenSnapshot(SEED, fingerprint(), corrupt)).toBeNull()
  })

  it('a different fingerprint, version or seed never hits', async () => {
    expect(await loadCaveWorldgenSnapshot(SEED, 'other-fingerprint', storage)).toBeNull()
    expect(await loadCaveWorldgenSnapshot(SEED + 1, fingerprint(), storage)).toBeNull()
    const nextVersion = memoryStorage()
    for (const [k, v] of storage.rows) nextVersion.rows.set(k, { ...structuredClone(v) as CacheRecord, version: CAVES_V2_VERSION + 1 })
    expect(await loadCaveWorldgenSnapshot(SEED, fingerprint(), nextVersion)).toBeNull()
  })

  it('the fingerprint moves with every configuration input it covers', () => {
    const params = terrainParams()
    const base = { params, waterLevel: params.waterLevel, coastThreshold: COAST_THRESHOLD, homeFootprintRadius: HOME_RADIUS }
    expect(caveWorldgenFingerprint(base)).toBe(fingerprint())
    expect(caveWorldgenFingerprint({ ...base, waterLevel: params.waterLevel + 1 })).not.toBe(fingerprint())
    expect(caveWorldgenFingerprint({ ...base, coastThreshold: 0.5 })).not.toBe(fingerprint())
    expect(caveWorldgenFingerprint({ ...base, homeFootprintRadius: HOME_RADIUS + 1 })).not.toBe(fingerprint())
    expect(caveWorldgenFingerprint({ ...base, params: { ...params, heightScale: params.heightScale + 1 } }))
      .not.toBe(fingerprint())
  })

  it('a storage read or write failure leaves normal generation fully functional', async () => {
    const broken: CaveWorldgenCacheStorage = {
      list: (async () => { throw new Error('idb unavailable') }) as CaveWorldgenCacheStorage['list'],
      put: async () => { throw new Error('idb unavailable') },
      cap: async () => { throw new Error('idb unavailable') },
    }
    expect(await loadCaveWorldgenSnapshot(SEED, fingerprint(), broken)).toBeNull()
    await expect(persistCaveWorldgen(SEED, fingerprint(), freshResult, broken)).resolves.toBeUndefined()
    const { caves } = build({ hydratedWorldgen: null })
    try {
      expect(worldSnapshot(caves)).toEqual(freshSnapshot)
    } finally {
      caves.dispose()
    }
  })
})
