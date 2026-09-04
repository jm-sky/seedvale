import { describe, expect, it } from 'vitest'
import type { SettlementCell, SettlementDef } from '../../settlement/settlementGenerator'
import type { RawSampleParams } from '../../terrain/chunkHeightmap'
import type { ChunkManager } from '../../terrain/chunkManager'
import type { CaveDefinition } from '../caveVolume'
import type { Caves } from '../createCaves'
import { cellKey } from '../../settlement/settlementGenerator'
import { createWorldLocationCatalog, settlementLocationId } from './worldLocationCatalog'

function rawParams(overrides: Partial<RawSampleParams> = {}): RawSampleParams {
  return {
    seed: 42,
    heightScale: 18,
    waterLevel: 0.45,
    noiseScale: 120,
    detailAmplitude: 0.55,
    hillsScale: 420,
    hillsAmplitude: 0.28,
    hillsFbm: { octaves: 3, persistence: 0.55, lacunarity: 2.0, exponentiation: 1.15 },
    fbm: { octaves: 4, persistence: 0.65, lacunarity: 2.0, exponentiation: 1.35 },
    biome: {
      noiseScale: 96,
      fbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 },
    },
    region: {
      continentScale: 2200,
      continentFbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 },
      mountainScale: 1800,
      mountainFbm: { octaves: 2, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.2 },
      mountainThreshold: 0.62,
      mountainThresholdWidth: 0.14,
      worleyCellSize: 260,
      ridgeSharpness: 2.0,
      mountainGain: 0.8,
      oceanThreshold: 0.32,
      coastThreshold: 0.45,
      oceanDetailWeight: 0.25,
      moistureRegionScale: 2000,
      moistureRegionFbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 },
      desertThreshold: 0.35,
      desertThresholdWidth: 0.12,
      swampThreshold: 0.72,
      swampThresholdWidth: 0.15,
      roadNetwork: {
        roadHalfWidth: 5,
        roadHeightStrength: 0.85,
        roadTintStrength: 0.8,
        pathHalfWidth: 1.5,
        pathHeightStrength: 0.2,
        pathTintStrength: 0.4,
        smoothingWindow: 10,
        maxNeighborRoads: 3,
        dockSearchRadius: 140,
        edgeWobbleAmplitude: 0.15,
        edgeWobbleScale: 0.06,
        potholeDepth: 0.12,
        potholeThreshold: 0.72,
        meanderAmplitude: 2,
        meanderScale: 0.04,
        surfaceDetailEnabled: true,
        rutDepth: 0.05,
        rutOffsetFraction: 0.42,
        rutWidthFraction: 0.16,
        microBumpStrength: 0.025,
        microBumpScale: 0.6,
      },
      village: {
        coreRadius: 9,
        houseRadius: 4.5,
        heightStrength: 0.8,
        tintStrength: 0.75,
        regionalHeightStrengthFlat: 0.3,
        regionalHeightStrengthMountain: 0.15,
      },
    },
    ...overrides,
  }
}

function fakeCaves(defs: Partial<CaveDefinition>[]): Caves {
  return { definitions: () => defs as CaveDefinition[] } as unknown as Caves
}

function fakeChunkManager(cemeteries: { chunkX: number, chunkZ: number, id: string, x: number, z: number }[] = []): ChunkManager {
  return {
    findLandmarkNear: (kind: string, worldX: number, worldZ: number) => {
      if (kind !== 'cemetery') return undefined
      // Test double mirrors `findLandmarkNear`'s real "nearest chunk"
      // resolution closely enough: `worldLocationCatalog.ts` always calls it
      // either from the exact cemetery chunk's own center (id resolve) or
      // from a settlement's position for a search, so a coarse distance
      // pick is sufficient here.
      let best: typeof cemeteries[number] | undefined
      let bestDist = Infinity
      for (const c of cemeteries) {
        const dist = Math.hypot(c.x - worldX, c.z - worldZ)
        if (dist < bestDist) { bestDist = dist; best = c }
      }
      return best && bestDist < 200 ? { id: best.id, x: best.x, z: best.z } : undefined
    },
  } as unknown as ChunkManager
}

function makeSettlementDef(gx: number, gz: number, name: string): SettlementDef {
  const cell: SettlementCell = { gx, gz }
  return {
    id: cellKey(cell),
    gx,
    gz,
    x: gx * 280,
    z: gz * 280,
    y: 0,
    name,
  } as unknown as SettlementDef
}

describe('createWorldLocationCatalog', () => {
  it('resolves a settlement id back to its position/name', () => {
    const home = makeSettlementDef(0, 0, 'Dębowo')
    const catalog = createWorldLocationCatalog({
      getSeed: () => 1,
      getCaves: () => fakeCaves([]),
      getChunkManager: () => fakeChunkManager(),
      lookupSettlement: (cell) => (cell.gx === 0 && cell.gz === 0 ? home : null),
      getSampleParams: () => rawParams(),
      getChunkSize: () => 64,
    })
    const id = settlementLocationId(home)
    const location = catalog.getById(id)
    expect(location).toEqual({ id, kind: 'settlement', x: 0, z: 0, name: 'Dębowo', discoveryWeight: 0 })
  })

  it('resolves a cave id deterministically from Caves.definitions()', () => {
    const caves = fakeCaves([{ caveId: 'cave-1', entrance: { x: 100, z: -50, yaw: 0, y: 0, width: 3, height: 3 } }])
    const catalog = createWorldLocationCatalog({
      getSeed: () => 1,
      getCaves: () => caves,
      getChunkManager: () => fakeChunkManager(),
      lookupSettlement: () => null,
      getSampleParams: () => rawParams(),
      getChunkSize: () => 64,
    })
    const location = catalog.getById('cave:cave-1')
    expect(location?.x).toBe(100)
    expect(location?.z).toBe(-50)
    expect(location?.kind).toBe('cave')
    expect(location?.name.length).toBeGreaterThan(0)
  })

  it('cave name/weight are a stable function of (seed, id)', () => {
    const caves = fakeCaves([{ caveId: 'cave-1', entrance: { x: 0, z: 0, yaw: 0, y: 0, width: 3, height: 3 } }])
    const build = (seed: number) => createWorldLocationCatalog({
      getSeed: () => seed,
      getCaves: () => caves,
      getChunkManager: () => fakeChunkManager(),
      lookupSettlement: () => null,
      getSampleParams: () => rawParams(),
      getChunkSize: () => 64,
    })
    const a = build(7).getById('cave:cave-1')
    const b = build(7).getById('cave:cave-1')
    const c = build(8).getById('cave:cave-1')
    expect(a).toEqual(b)
    expect(a?.name).toBeTruthy()
    // Different seeds are allowed to coincide by chance, but weight is a
    // pure hash of (seed, id) so it must differ almost always for these
    // fixed inputs — assert the underlying computation actually uses seed.
    expect(a?.discoveryWeight === c?.discoveryWeight && a?.name === c?.name).toBe(false)
  })

  it('returns null for a cave id no longer present in Caves.definitions()', () => {
    const catalog = createWorldLocationCatalog({
      getSeed: () => 1,
      getCaves: () => fakeCaves([]),
      getChunkManager: () => fakeChunkManager(),
      lookupSettlement: () => null,
      getSampleParams: () => rawParams(),
      getChunkSize: () => 64,
    })
    expect(catalog.getById('cave:missing')).toBeNull()
  })

  it('resolves a cemetery id via ChunkManager.findLandmarkNear using the id-embedded chunk coords', () => {
    const chunkManager = fakeChunkManager([{ chunkX: 2, chunkZ: 3, id: 'cemetery:2:3:0:1a', x: 133, z: 198 }])
    const catalog = createWorldLocationCatalog({
      getSeed: () => 1,
      getCaves: () => fakeCaves([]),
      getChunkManager: () => chunkManager,
      lookupSettlement: () => null,
      getSampleParams: () => rawParams(),
      getChunkSize: () => 64,
    })
    const location = catalog.getById('cemetery:2:3:0:1a')
    expect(location?.x).toBe(133)
    expect(location?.z).toBe(198)
    expect(location?.kind).toBe('cemetery')
  })

  it('nearestSettlements is bounded by maxKm and sorted nearest-first', () => {
    const defs = new Map<string, SettlementDef>([
      ['0_0', makeSettlementDef(0, 0, 'Home')],
      ['1_0', makeSettlementDef(1, 0, 'East')],
      ['5_0', makeSettlementDef(5, 0, 'Far')],
    ])
    const catalog = createWorldLocationCatalog({
      getSeed: () => 1,
      getCaves: () => fakeCaves([]),
      getChunkManager: () => fakeChunkManager(),
      lookupSettlement: (cell) => defs.get(cellKey(cell)) ?? null,
      getSampleParams: () => rawParams(),
      getChunkSize: () => 64,
    })
    // 280 world units = 14 km; East sits at 14km, Far at 70km.
    const near = catalog.nearestSettlements(0, 0, 20)
    expect(near.map((l) => l.name)).toEqual(['Home', 'East'])
  })

  it('settlement and landmark pools stay separate: settlements never appear in landmarksWithin', () => {
    const caves = fakeCaves([{ caveId: 'cave-1', entrance: { x: 10, z: 10, yaw: 0, y: 0, width: 3, height: 3 } }])
    const home = makeSettlementDef(0, 0, 'Home')
    const catalog = createWorldLocationCatalog({
      getSeed: () => 1,
      getCaves: () => caves,
      getChunkManager: () => fakeChunkManager(),
      lookupSettlement: (cell) => (cell.gx === 0 && cell.gz === 0 ? home : null),
      getSampleParams: () => rawParams(),
      getChunkSize: () => 64,
    })
    const landmarks = catalog.landmarksWithin(0, 0, 1)
    expect(landmarks.some((l) => l.kind === 'settlement')).toBe(false)
    expect(landmarks.some((l) => l.id === 'cave:cave-1')).toBe(true)
  })
})
