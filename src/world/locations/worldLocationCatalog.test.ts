import { describe, expect, it } from 'vitest'
import type { SettlementCell, SettlementDef } from '../../settlement/settlementGenerator'
import type { RawSampleParams } from '../../terrain/chunkHeightmap'
import type { ChunkManager } from '../../terrain/chunkManager'
import type { CaveDefinition } from '../caveVolume'
import type { Caves } from '../createCaves'
import type { WorldLocation } from './worldLocationTypes'
import { cellKey } from '../../settlement/settlementGenerator'
import { sampleContinentalnessAt, sampleFloorAt, sampleMountainRidgeAt } from '../../terrain/chunkHeightmap'
import { isMountainRidge, isOceanMix, isWetFloor } from '../../terrain/terrainClassification'
import { projectCellAt } from '../map/mapProjection'
import { FAR_RANGE_KM, LOCATION_SCAN_STEP, MEDIUM_RANGE_KM, NEAR_RANGE_KM } from './locationConfig'
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

describe('coarse terrain scan (plan world-013)', () => {
  function scanOnlyCatalog(seed: number, params: RawSampleParams = rawParams()) {
    return createWorldLocationCatalog({
      getSeed: () => seed,
      getCaves: () => fakeCaves([]),
      getChunkManager: () => fakeChunkManager(),
      lookupSettlement: () => null,
      getSampleParams: () => params,
      getChunkSize: () => 64,
    })
  }

  function byId(locations: readonly WorldLocation[]): WorldLocation[] {
    return [...locations].sort((a, b) => a.id.localeCompare(b.id))
  }

  it('the lightweight classifier agrees with projectCellAt() on inland_water/mountain for a grid of points', () => {
    const params = rawParams()
    for (let gz = -6; gz <= 6; gz++) {
      for (let gx = -6; gx <= 6; gx++) {
        const wx = (gx + 0.5) * LOCATION_SCAN_STEP
        const wz = (gz + 0.5) * LOCATION_SCAN_STEP
        const projected = projectCellAt(wx, wz, params)
        const floorH = sampleFloorAt(wx, wz, params)
        if (isWetFloor(floorH, params.waterLevel)) {
          const continentalness = sampleContinentalnessAt(wx, wz, params)
          const expected = isOceanMix(continentalness, params.region.oceanThreshold, params.region.coastThreshold) ? 'ocean' : 'inland_water'
          expect(projected.terrain).toBe(expected)
        } else {
          const ridge = sampleMountainRidgeAt(wx, wz, params)
          expect(projected.terrain === 'mountain').toBe(isMountainRidge(ridge))
        }
      }
    }
  })

  it('cold query equals warm query (repeated call on the same catalog)', () => {
    const catalog = scanOnlyCatalog(42)
    const first = byId(catalog.landmarksWithin(0, 0, FAR_RANGE_KM))
    const second = byId(catalog.landmarksWithin(0, 0, FAR_RANGE_KM))
    expect(second).toEqual(first)
  })

  it('Near -> Guard -> Far order gives the same results as Far -> Guard -> Near', () => {
    const forward = scanOnlyCatalog(42)
    const near1 = byId(forward.landmarksInRange(0, 0, 0, NEAR_RANGE_KM))
    const guard1 = byId(forward.landmarksInRange(0, 0, 0, MEDIUM_RANGE_KM))
    const far1 = byId(forward.landmarksInRange(0, 0, MEDIUM_RANGE_KM, FAR_RANGE_KM))

    const backward = scanOnlyCatalog(42)
    const far2 = byId(backward.landmarksInRange(0, 0, MEDIUM_RANGE_KM, FAR_RANGE_KM))
    const guard2 = byId(backward.landmarksInRange(0, 0, 0, MEDIUM_RANGE_KM))
    const near2 = byId(backward.landmarksInRange(0, 0, 0, NEAR_RANGE_KM))

    expect(near2).toEqual(near1)
    expect(guard2).toEqual(guard1)
    expect(far2).toEqual(far1)
  })

  it('invalidateScanCache forces resampling instead of silently reusing stale terrain data', () => {
    const catalog = scanOnlyCatalog(42)
    catalog.landmarksWithin(0, 0, MEDIUM_RANGE_KM)
    const firstSampled = catalog.getScanDiagnostics().sampledCells
    expect(firstSampled).toBeGreaterThan(0)

    catalog.invalidateScanCache()
    expect(catalog.getScanDiagnostics().sampledCells).toBe(0)

    catalog.landmarksWithin(0, 0, MEDIUM_RANGE_KM)
    expect(catalog.getScanDiagnostics().sampledCells).toBe(firstSampled)
  })

  it('an overlapping query reuses already-classified cells instead of resampling them', () => {
    const shared = scanOnlyCatalog(42)
    shared.landmarksInRange(0, 0, 0, MEDIUM_RANGE_KM)
    const afterGuard = shared.getScanDiagnostics().sampledCells
    shared.landmarksInRange(0, 0, MEDIUM_RANGE_KM, FAR_RANGE_KM)
    const afterFarOnTopOfGuard = shared.getScanDiagnostics().sampledCells - afterGuard
    expect(shared.getScanDiagnostics().cacheHitCells).toBeGreaterThan(0)

    const coldFar = scanOnlyCatalog(42)
    coldFar.landmarksInRange(0, 0, MEDIUM_RANGE_KM, FAR_RANGE_KM)
    const coldFarSampled = coldFar.getScanDiagnostics().sampledCells

    expect(afterFarOnTopOfGuard).toBeLessThanOrEqual(coldFarSampled)
  })

  it('landmarksWithin(maxKm) is equivalent to landmarksInRange(0, maxKm)', () => {
    const a = scanOnlyCatalog(42)
    const b = scanOnlyCatalog(42)
    expect(byId(a.landmarksWithin(0, 0, FAR_RANGE_KM))).toEqual(byId(b.landmarksInRange(0, 0, 0, FAR_RANGE_KM)))
  })

  it('a Far-band query never returns a location from inside its own inner bound', () => {
    const catalog = scanOnlyCatalog(42)
    const far = catalog.landmarksInRange(0, 0, MEDIUM_RANGE_KM, FAR_RANGE_KM)
    for (const loc of far) {
      const km = Math.hypot(loc.x, loc.z) / 20
      expect(km).toBeGreaterThan(MEDIUM_RANGE_KM)
    }
  })

  it('splitting a wide query into adjacent bands and unioning gives the same set as one wide query (boundary-safe lake/peak extraction)', () => {
    const whole = scanOnlyCatalog(42)
    const wholeResult = byId(whole.landmarksWithin(0, 0, FAR_RANGE_KM))

    const split = scanOnlyCatalog(42)
    const near = split.landmarksInRange(0, 0, 0, NEAR_RANGE_KM)
    const medium = split.landmarksInRange(0, 0, NEAR_RANGE_KM, MEDIUM_RANGE_KM)
    const far = split.landmarksInRange(0, 0, MEDIUM_RANGE_KM, FAR_RANGE_KM)
    const splitResult = byId([...near, ...medium, ...far])

    expect(splitResult).toEqual(wholeResult)
  })

  it('a different seed/config can change results (sanity check the fixture isn\'t trivially empty everywhere)', () => {
    const a = scanOnlyCatalog(1).landmarksWithin(0, 0, FAR_RANGE_KM)
    const b = scanOnlyCatalog(2).landmarksWithin(0, 0, FAR_RANGE_KM)
    expect(byId(a)).not.toEqual(byId(b))
  })
})

describe('persistent worldgen cache hooks (plan world-015 §11/§13/§15)', () => {
  // Mirrors worldLocationCatalog.ts's private tile layout/constants — there's
  // no public export for these since only this module owns the coarse-tile
  // representation; a persistence controller (`locationsCoarseCache.ts`)
  // only ever receives/returns whole tile objects, never cell constants.
  const TILE_CELLS = 16
  const CELL_UNKNOWN = 0
  const CELL_NONE = 1

  // A query fully inside tile (0, 0)'s own bounds, including the halo margin
  // `scanLakesAndPeaks` adds around minKm/maxKm — centered on cell (5, 5) with
  // a near-zero radius so the scanned rectangle (roughly grid cells 2..8 on
  // each axis) never crosses into a neighboring, unhydrated tile.
  const TILE_LOCAL_CELL = 5
  const QUERY_CENTER = (TILE_LOCAL_CELL + 0.5) * LOCATION_SCAN_STEP
  const QUERY_MAX_KM = 0.05

  function fullyKnownTile(unknownIndex?: number): { state: Uint8Array, height: Float32Array } {
    const state = new Uint8Array(TILE_CELLS * TILE_CELLS).fill(CELL_NONE)
    if (unknownIndex !== undefined) state[unknownIndex] = CELL_UNKNOWN
    return { state, height: new Float32Array(TILE_CELLS * TILE_CELLS) }
  }

  it('hydrateTile is consulted at most once for a given tile (materialized tile is cached, not re-hydrated)', () => {
    const hydrateCallsForOrigin: number[] = []
    const tile = fullyKnownTile()
    const catalog = createWorldLocationCatalog({
      getSeed: () => 1,
      getCaves: () => fakeCaves([]),
      getChunkManager: () => fakeChunkManager(),
      lookupSettlement: () => null,
      getSampleParams: () => rawParams(),
      getChunkSize: () => 64,
      hydrateTile: (tx, tz) => {
        if (tx === 0 && tz === 0) hydrateCallsForOrigin.push(1)
        return tx === 0 && tz === 0 ? tile : null
      },
    })
    catalog.landmarksWithin(QUERY_CENTER, QUERY_CENTER, QUERY_MAX_KM)
    catalog.landmarksWithin(QUERY_CENTER, QUERY_CENTER, QUERY_MAX_KM)
    expect(hydrateCallsForOrigin.length).toBe(1)
  })

  it('a hydrated partial tile keeps its already-known cells and only classifies the still-unknown one', () => {
    const unknownIndex = TILE_LOCAL_CELL * TILE_CELLS + TILE_LOCAL_CELL
    const tile = fullyKnownTile(unknownIndex)
    const dirtyEvents: { tx: number, tz: number, tile: { state: Uint8Array, height: Float32Array } }[] = []
    const catalog = createWorldLocationCatalog({
      getSeed: () => 1,
      getCaves: () => fakeCaves([]),
      getChunkManager: () => fakeChunkManager(),
      lookupSettlement: () => null,
      getSampleParams: () => rawParams(),
      getChunkSize: () => 64,
      hydrateTile: (tx, tz) => (tx === 0 && tz === 0 ? tile : null),
      onTileDirty: (tx, tz, dirtyTile) => dirtyEvents.push({ tx, tz, tile: dirtyTile }),
    })

    expect(tile.state[unknownIndex]).toBe(CELL_UNKNOWN)
    catalog.landmarksWithin(QUERY_CENTER, QUERY_CENTER, QUERY_MAX_KM)

    // The one previously-unknown cell got classified in place — the tile
    // object handed back by `hydrateTile` is the exact one the catalog keeps
    // mutating, never a copy.
    expect(tile.state[unknownIndex]).not.toBe(CELL_UNKNOWN)
    // Every other cell in the supplied tile was already known and must be
    // left untouched by this query.
    expect(tile.state.filter((v) => v === CELL_UNKNOWN).length).toBe(0)

    // Dirty-marking fires only for the tile whose previously-unknown cell was
    // just classified, never for a cell that was already known.
    expect(dirtyEvents.length).toBeGreaterThan(0)
    expect(dirtyEvents.every((e) => e.tx === 0 && e.tz === 0)).toBe(true)
    expect(dirtyEvents.every((e) => e.tile.state === tile.state)).toBe(true)

    // A second, identical query touches only already-known cells now — no
    // further dirty-marking for this tile.
    dirtyEvents.length = 0
    catalog.landmarksWithin(QUERY_CENTER, QUERY_CENTER, QUERY_MAX_KM)
    expect(dirtyEvents.length).toBe(0)
  })

  it('without a hydrateTile dep, a fresh empty tile is used and every cell starts unknown (no dependency on the persistence seam)', () => {
    const catalog = createWorldLocationCatalog({
      getSeed: () => 1,
      getCaves: () => fakeCaves([]),
      getChunkManager: () => fakeChunkManager(),
      lookupSettlement: () => null,
      getSampleParams: () => rawParams(),
      getChunkSize: () => 64,
    })
    expect(() => catalog.landmarksWithin(QUERY_CENTER, QUERY_CENTER, QUERY_MAX_KM)).not.toThrow()
    expect(catalog.getScanDiagnostics().sampledCells).toBeGreaterThan(0)
  })
})
