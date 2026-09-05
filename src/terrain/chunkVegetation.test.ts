import { describe, expect, it } from 'vitest'
import {
  apronOriginWorld,
  type ChunkTileData,
  type ChunkTileParams,
  computeChunkTile,
  type RawSampleParams,
  type RegionParams,
  type RiverChannelSegment,
  sampleApronGrid,
} from './chunkHeightmap'
import { computeChunkVegetation } from './chunkVegetation'
import { isInsideRiverChannel, nearestRiverBankDistance } from './riverNetwork'
import { computeBodyScale, detectWaterBodies } from './waterBodies'

/** Same base terrain as `grassPlacement.test.ts`'s `tileParams` — `region`
 *  thresholds are overridden per test to force a specific biome so fern
 *  gating can be asserted without depending on exact FBM noise output. */
function tileParams(
  overrides: Partial<Omit<ChunkTileParams, 'region'>> & { region?: Partial<RegionParams> } = {},
): ChunkTileParams {
  const raw: RawSampleParams = {
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
  }
  return {
    ...raw,
    cx: 0,
    cz: 0,
    chunkSize: 64,
    resolution: 65,
    isHomeChunk: false,
    vegetationSpeciesCount: { tree: 9, bush: 5, cactus: 2, reed: 1, fern: 1, lily: 1, seaweed: 1 },
    roadSegments: [],
    clearings: [],
    regional: [],
    riverSegments: [],
    ...overrides,
    region: { ...raw.region, ...overrides.region },
  }
}

/** Aggregates fern placement counts across several chunk coords/seeds so the
 *  assertion doesn't depend on one seed's exact RNG draws — only on whether
 *  the forced biome ever admits a fern. */
function fernCountAcross(params: ChunkTileParams, chunkCount: number): number {
  let total = 0
  for (let i = 0; i < chunkCount; i++) {
    const coord = { cx: i, cz: -i }
    const p = { ...params, cx: coord.cx, cz: coord.cz, seed: params.seed + i }
    const tile = computeChunkTile(p)
    const vegetation = computeChunkVegetation(coord, tile, p)
    total += vegetation.filter((v) => v.kind === 'fern').length
  }
  return total
}

describe('computeChunkVegetation — river channel exclusion (world-terrain-006)', () => {
  it('never places vegetation inside a river channel, even where the carved bed stays above waterLevel (mountain stream)', () => {
    const waterLevel = 0.45
    // A wide, straight channel along z=0 whose bed sits well above
    // waterLevel — the heights clamp alone would not reject candidates here
    // (unlike a sea-level river); only the explicit channel geometry should.
    const riverSegments: RiverChannelSegment[] = [
      {
        ax: -500,
        az: 0,
        aBedH: waterLevel + 2,
        aWaterH: waterLevel + 3,
        aWaterHalfWidth: 20,
        aChannelHalfWidth: 22,
        bx: 500,
        bz: 0,
        bBedH: waterLevel + 2,
        bWaterH: waterLevel + 3,
        bWaterHalfWidth: 20,
        bChannelHalfWidth: 22,
      },
    ]

    let totalVegetation = 0
    for (let cx = -3; cx <= 8; cx++) {
      const coord = { cx, cz: 0 }
      const params = tileParams({ cx, cz: 0, seed: 100 + cx, riverSegments })
      const tile = computeChunkTile(params)
      const vegetation = computeChunkVegetation(coord, tile, params)
      totalVegetation += vegetation.length
      for (const v of vegetation) {
        expect(isInsideRiverChannel(riverSegments, v.x, v.z)).toBe(false)
      }
    }
    // Sanity: the channel doesn't span the whole chunk, so placements still
    // happen outside it — an empty result would make the assertion above
    // vacuous.
    expect(totalVegetation).toBeGreaterThan(0)
  })

  it('leaves the river bank (just outside the channel) eligible as ordinary dry land', () => {
    const waterLevel = 0.45
    const riverSegments: RiverChannelSegment[] = [
      {
        ax: -500,
        az: 0,
        aBedH: waterLevel + 2,
        aWaterH: waterLevel + 3,
        aWaterHalfWidth: 4,
        aChannelHalfWidth: 5,
        bx: 500,
        bz: 0,
        bBedH: waterLevel + 2,
        bWaterH: waterLevel + 3,
        bWaterHalfWidth: 4,
        bChannelHalfWidth: 5,
      },
    ]
    // Just outside the channel's water half-width (4m) but still close to it.
    expect(isInsideRiverChannel(riverSegments, 0, 4.5)).toBe(false)
    expect(isInsideRiverChannel(riverSegments, 0, 2)).toBe(true)
  })
})

describe('computeChunkVegetation — fern (plan 140)', () => {
  it('never spawns ferns on forced-desert terrain', () => {
    const params = tileParams({
      region: { desertThreshold: 5, desertThresholdWidth: 0.1, swampThreshold: 5, swampThresholdWidth: 0.1 },
    })
    expect(fernCountAcross(params, 12)).toBe(0)
  })

  it('spawns ferns on forced-swamp/wet-forest terrain', () => {
    const params = tileParams({
      region: { desertThreshold: -1, desertThresholdWidth: 0.1, swampThreshold: -0.5, swampThresholdWidth: 0.1 },
    })
    expect(fernCountAcross(params, 12)).toBeGreaterThan(0)
  })
})

/** Forces `biomeWeightsAt`'s forest remainder to ~1 everywhere (no desert/
 *  swamp gate) and `forestDensityAt`'s moisture band to sit at its canopy-core
 *  plateau (`moistureRegionFbm` output centers well inside [0.42, 0.72] for
 *  most world positions when the thresholds below are this wide) — cheapest
 *  way to force strong deepForest-range density across many chunk coords
 *  without depending on exact FBM output per test. */
function deepForestParams(overrides: Partial<ChunkTileParams> = {}): ChunkTileParams {
  return tileParams({
    region: {
      desertThreshold: -1,
      desertThresholdWidth: 0.1,
      swampThreshold: 5,
      swampThresholdWidth: 0.1,
      oceanThreshold: -1,
      coastThreshold: -0.5,
    },
    ...overrides,
  })
}

/** Pushes `biomeWeightsAt`'s desert cutoff onto the declining shoulder of
 *  `forestDensityAt`'s canopy-core moisture band (`biomeRegions.ts`'s
 *  `FOREST_CANOPY_*` constants peak ≈0.54, decline past ≈0.60) instead of
 *  gating via swamp — swamp's own altitude gate (`SWAMP_ALTITUDE_*`) turns
 *  off outside true lowlands, so it can't reliably suppress forest across a
 *  chunk sample at mixed altitudes. Forest still exists here (real trees,
 *  unlike `openParams`' zero-tree desert) but only past the canopy peak, so
 *  `forestDensityAt` stays well below the deepForest range. */
function weakForestParams(overrides: Partial<ChunkTileParams> = {}): ChunkTileParams {
  return tileParams({
    region: { desertThreshold: 0.58, desertThresholdWidth: 0.08 },
    ...overrides,
  })
}

function openParams(overrides: Partial<ChunkTileParams> = {}): ChunkTileParams {
  return tileParams({
    region: {
      // Desert threshold far above any moisture sample forces `forest ≈ 0`
      // (biomeWeightsAt's desert weight stays ~1), which zeroes forestDensity
      // via its `forestBiome <= 0` gate — reliable "open" land without
      // depending on exact FBM output.
      desertThreshold: 5,
      desertThresholdWidth: 0.1,
      swampThreshold: 5,
      swampThresholdWidth: 0.1,
    },
    ...overrides,
  })
}

/** Aggregates placements across several chunk coords/seeds (same shape as
 *  `fernCountAcross`) so assertions don't depend on one seed's exact draws. */
function vegetationAcross(params: ChunkTileParams, chunkCount: number) {
  const placements: ReturnType<typeof computeChunkVegetation> = []
  for (let i = 0; i < chunkCount; i++) {
    const coord = { cx: i, cz: -i }
    const p = { ...params, cx: coord.cx, cz: coord.cz, seed: params.seed + i }
    const tile = computeChunkTile(p)
    placements.push(...computeChunkVegetation(coord, tile, p))
  }
  return placements
}

describe('computeChunkVegetation — Deep Forest tuning (plan 182)', () => {
  it('is deterministic for identical seed + chunk coords', () => {
    const params = deepForestParams()
    const coord = { cx: 3, cz: -2 }
    const tile = computeChunkTile(params)
    const a = computeChunkVegetation(coord, tile, params)
    const b = computeChunkVegetation(coord, tile, params)
    expect(a).toEqual(b)
  })

  it('favours trees over bushes far more than open/weak-forest terrain', () => {
    const deep = vegetationAcross(deepForestParams(), 10)
    const open = vegetationAcross(openParams(), 10)
    const treeRatio = (placements: typeof deep) => {
      const trees = placements.filter((p) => p.kind === 'tree').length
      const bushes = placements.filter((p) => p.kind === 'bush').length
      return trees / Math.max(1, trees + bushes)
    }
    expect(treeRatio(deep)).toBeGreaterThan(0.85)
    expect(treeRatio(deep)).toBeGreaterThan(treeRatio(open))
  })

  it('increases large/old tree distribution over weak-forest (low forestDensity) terrain', () => {
    const deep = vegetationAcross(deepForestParams(), 14).filter((p) => p.kind === 'tree')
    // Weak-forest land only accepts a small fraction of candidates as trees
    // at all (low forestDensity → low acceptance density) — needs many more
    // chunks than `deep` for a stable large/old-fraction sample.
    const weak = vegetationAcross(weakForestParams(), 150).filter((p) => p.kind === 'tree')
    expect(deep.length).toBeGreaterThan(200)
    expect(weak.length).toBeGreaterThan(100)
    const largeOldFrac = (trees: typeof deep) =>
      trees.filter((t) => t.sizeClass === 'large' || t.growthStage === 'old').length / trees.length
    expect(largeOldFrac(deep)).toBeGreaterThan(largeOldFrac(weak))
  })

  it('does not exceed the existing candidate budget (no candidate-count explosion)', () => {
    const params = deepForestParams()
    const coord = { cx: 1, cz: 1 }
    const tile = computeChunkTile(params)
    const placements = computeChunkVegetation(coord, tile, params)
    // BASE_CANDIDATES_PER_CHUNK + FOREST_EXTRA_CANDIDATES (16 + 90) plus the
    // small fixed meadow/fern candidate passes — generous upper bound that
    // would fail if a future change multiplies the tree budget instead of
    // tuning acceptance/shape.
    expect(placements.length).toBeLessThan(140)
  })

  it('road/water constraints stay effective in Deep Forest conditions', () => {
    const params = deepForestParams()
    const coord = { cx: 0, cz: 0 }
    const tile = computeChunkTile(params)
    const placements = computeChunkVegetation(coord, tile, params)
    const o = apronOriginWorld(coord.cx, coord.cz, params.chunkSize, params.resolution)
    const sample = (grid: Float32Array, x: number, z: number) =>
      sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)
    expect(placements.length).toBeGreaterThan(0)
    for (const p of placements) {
      expect(sample(tile.heights, p.x, p.z)).toBeGreaterThan(params.waterLevel)
      expect(sample(tile.roadTint, p.x, p.z)).toBeLessThanOrEqual(0.15)
    }
  })
})

describe('computeChunkVegetation — riparian pass (plan world-terrain-010)', () => {
  const waterLevel = 0.45
  const riverSegments: RiverChannelSegment[] = [
    {
      ax: -500,
      az: 0,
      aBedH: waterLevel - 1,
      aWaterH: waterLevel - 0.2,
      aWaterHalfWidth: 3,
      aChannelHalfWidth: 5,
      bx: 500,
      bz: 0,
      bBedH: waterLevel - 1,
      bWaterH: waterLevel - 0.2,
      bWaterHalfWidth: 3,
      bChannelHalfWidth: 5,
    },
  ]

  it('never places any vegetation inside the channel, and produces reeds within the riparian band near the river', () => {
    // Force swamp-biome probability to zero so every 'reed' placement can
    // only come from the dedicated riparian pass, not the unrelated
    // swamp-biome branch in the ordinary candidate loop.
    const noSwamp = { region: { swampThreshold: 5, swampThresholdWidth: 0.1 } }
    let reedCount = 0
    for (let cx = -2; cx <= 2; cx++) {
      const coord = { cx, cz: 0 }
      const params = tileParams({ cx, cz: 0, seed: 200 + cx, riverSegments, ...noSwamp })
      const tile = computeChunkTile(params)
      const vegetation = computeChunkVegetation(coord, tile, params)
      for (const v of vegetation) {
        expect(isInsideRiverChannel(riverSegments, v.x, v.z)).toBe(false)
        if (v.kind !== 'reed') continue
        reedCount++
        const d = nearestRiverBankDistance(riverSegments, v.x, v.z)!
        expect(d).toBeGreaterThanOrEqual(0)
        expect(d).toBeLessThan(6)
      }
    }
    // Sanity: the river actually produced riparian reeds somewhere in this
    // span — an empty result would make the band assertion above vacuous.
    expect(reedCount).toBeGreaterThan(0)
  })

  it('is deterministic and keeps a bounded per-chunk placement budget', () => {
    const params = tileParams({ riverSegments })
    const coord = { cx: 0, cz: 0 }
    const tile = computeChunkTile(params)
    const a = computeChunkVegetation(coord, tile, params)
    const b = computeChunkVegetation(coord, tile, params)
    expect(a).toEqual(b)
    // Generous upper bound (ordinary + meadow + fern + riparian + lily passes
    // combined) — guards a future change multiplying a budget instead of
    // tuning acceptance.
    expect(a.length).toBeLessThan(180)
  })
})

describe('computeChunkVegetation — lily pads (plan world-terrain-010, Phase 6)', () => {
  const waterLevel = 0.45
  const chunkSize = 64
  const resolution = 20

  /** Synthetic tile with a real inland-lake `bodyScale` (via the same
   *  `detectWaterBodies`/`computeBodyScale` pipeline `computeChunkTile` uses)
   *  instead of depending on procedural terrain happening to carve a lake —
   *  a round lake centered at the chunk origin, land beyond it. */
  function lakeTile(): { tile: ChunkTileData, o: ReturnType<typeof apronOriginWorld> } {
    const o = apronOriginWorld(0, 0, chunkSize, resolution)
    const n = o.apronRes * o.apronRes
    const heights = new Float32Array(n)
    const floorHeights = new Float32Array(n)
    const continentalness = new Float32Array(n).fill(0.6) // inland, not ocean
    for (let iz = 0; iz < o.apronRes; iz++) {
      for (let ix = 0; ix < o.apronRes; ix++) {
        const wx = o.x + ix * o.step
        const wz = o.z + iz * o.step
        const idx = iz * o.apronRes + ix
        const floorH = Math.hypot(wx, wz) < 14 ? waterLevel - 0.3 : waterLevel + 1
        floorHeights[idx] = floorH
        heights[idx] = Math.max(floorH, waterLevel)
      }
    }
    const bodies = detectWaterBodies(heights, o.apronRes, waterLevel, o.step)
    const bodyScale = computeBodyScale(bodies, { continentalness, oceanThreshold: 0.32, coastThreshold: 0.45 })
    const tile: ChunkTileData = {
      heights,
      floorHeights,
      biomes: new Float32Array(n).fill(0.6),
      bodyScale,
      continentalness,
      mountainRidge: new Float32Array(n),
      moistureRegion: new Float32Array(n).fill(0.5),
      roadTint: new Float32Array(n),
    }
    return { tile, o }
  }

  it('places lily pads only on shallow inland water, never on dry land', () => {
    const { tile, o } = lakeTile()
    const coord = { cx: 0, cz: 0 }
    const params = tileParams({ cx: 0, cz: 0, chunkSize, resolution })
    const sample = (grid: Float32Array, x: number, z: number) =>
      sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)

    let lilyCount = 0
    for (let seed = 0; seed < 12; seed++) {
      const p = { ...params, seed: 300 + seed }
      const vegetation = computeChunkVegetation(coord, tile, p)
      for (const v of vegetation.filter((x) => x.kind === 'lily')) {
        lilyCount++
        expect(sample(tile.bodyScale, v.x, v.z)).toBeGreaterThan(0)
        expect(sample(tile.bodyScale, v.x, v.z)).toBeLessThan(0.9)
        expect(sample(tile.heights, v.x, v.z)).toBeLessThanOrEqual(waterLevel + 1e-6)
      }
    }
    expect(lilyCount).toBeGreaterThan(0)
  })

  it('never accepts a lily pad well inside solid ocean water', () => {
    const { tile, o } = lakeTile()
    // Force every wet texel to read as ocean (bodyScale saturates to 1).
    tile.continentalness.fill(0.1)
    const oceanBodyScale = computeBodyScale(
      detectWaterBodies(tile.heights, o.apronRes, waterLevel, o.step),
      { continentalness: tile.continentalness, oceanThreshold: 0.32, coastThreshold: 0.45 },
    )
    const oceanTile: ChunkTileData = { ...tile, bodyScale: oceanBodyScale }
    const sample = (grid: Float32Array, x: number, z: number) =>
      sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)
    // Sanity: the fixture really reads as ocean at the lake's own center —
    // otherwise the assertion below would be vacuous.
    expect(sample(oceanTile.bodyScale, 0, 0)).toBeGreaterThanOrEqual(0.9)

    const coord = { cx: 0, cz: 0 }
    const params = tileParams({ cx: 0, cz: 0, chunkSize, resolution })

    let deepOceanLilyCount = 0
    for (let seed = 0; seed < 12; seed++) {
      const p = { ...params, seed: 400 + seed }
      for (const v of computeChunkVegetation(coord, oceanTile, p).filter((x) => x.kind === 'lily')) {
        // Margin inside the lake's radius-14 shoreline (>1 grid step), away
        // from the bilinear land/water boundary interpolation band.
        if (Math.hypot(v.x, v.z) < 10) deepOceanLilyCount++
      }
    }
    expect(deepOceanLilyCount).toBe(0)
  })
})

describe('computeChunkVegetation — shallow coastal seaweed (plan world-terrain-010, Phase 7)', () => {
  const waterLevel = 0.45
  const chunkSize = 64
  const resolution = 20

  /** Same round "water body centered at chunk origin" shape as the lily
   *  fixture above, parameterized by seabed depth and continentalness so one
   *  helper covers shallow-coastal, inland-lake and deep-open-ocean cases. */
  function waterTile(
    depthBelowWaterLevel: number,
    continentalnessValue: number,
  ): { tile: ChunkTileData, o: ReturnType<typeof apronOriginWorld> } {
    const o = apronOriginWorld(0, 0, chunkSize, resolution)
    const n = o.apronRes * o.apronRes
    const heights = new Float32Array(n)
    const floorHeights = new Float32Array(n)
    const continentalness = new Float32Array(n).fill(continentalnessValue)
    for (let iz = 0; iz < o.apronRes; iz++) {
      for (let ix = 0; ix < o.apronRes; ix++) {
        const wx = o.x + ix * o.step
        const wz = o.z + iz * o.step
        const idx = iz * o.apronRes + ix
        const floorH = Math.hypot(wx, wz) < 14 ? waterLevel - depthBelowWaterLevel : waterLevel + 1
        floorHeights[idx] = floorH
        heights[idx] = Math.max(floorH, waterLevel)
      }
    }
    const bodies = detectWaterBodies(heights, o.apronRes, waterLevel, o.step)
    const bodyScale = computeBodyScale(bodies, { continentalness, oceanThreshold: 0.32, coastThreshold: 0.45 })
    const tile: ChunkTileData = {
      heights,
      floorHeights,
      biomes: new Float32Array(n).fill(0.6),
      bodyScale,
      continentalness,
      mountainRidge: new Float32Array(n),
      moistureRegion: new Float32Array(n).fill(0.5),
      roadTint: new Float32Array(n),
    }
    return { tile, o }
  }

  it('places seaweed only on shallow coastal ocean water, never on dry land', () => {
    // continentalness 0.1 (<= oceanThreshold 0.32) saturates bodyScale to 1
    // (unambiguously ocean, not an inland lake); shallow 0.6 m seabed depth
    // keeps it well inside SEAWEED_MAX_DEPTH.
    const { tile, o } = waterTile(0.6, 0.1)
    const coord = { cx: 0, cz: 0 }
    const params = tileParams({ cx: 0, cz: 0, chunkSize, resolution })
    const sample = (grid: Float32Array, x: number, z: number) =>
      sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)

    let seaweedCount = 0
    for (let seed = 0; seed < 12; seed++) {
      const p = { ...params, seed: 500 + seed }
      const vegetation = computeChunkVegetation(coord, tile, p)
      for (const v of vegetation.filter((x) => x.kind === 'seaweed')) {
        seaweedCount++
        expect(sample(tile.bodyScale, v.x, v.z)).toBeGreaterThanOrEqual(0.9)
        expect(sample(tile.heights, v.x, v.z)).toBeLessThanOrEqual(waterLevel + 1e-6) // underwater, not dry land
        const depth = waterLevel - sample(tile.floorHeights, v.x, v.z)
        expect(depth).toBeGreaterThan(0)
        expect(depth).toBeLessThanOrEqual(2.0 + 1e-6) // SEAWEED_MAX_DEPTH
      }
    }
    expect(seaweedCount).toBeGreaterThan(0)
  })

  it('never accepts seaweed on inland lake water (bodyScale below the ocean gate)', () => {
    // continentalness 0.6 (inland) caps bodyScale at LAKE_SCALE_MAX (0.85) —
    // shallow enough depth-wise that only the ocean gate can be rejecting it.
    const { tile } = waterTile(0.6, 0.6)
    const coord = { cx: 0, cz: 0 }
    const params = tileParams({ cx: 0, cz: 0, chunkSize, resolution })

    let seaweedCount = 0
    for (let seed = 0; seed < 12; seed++) {
      const p = { ...params, seed: 600 + seed }
      seaweedCount += computeChunkVegetation(coord, tile, p).filter((x) => x.kind === 'seaweed').length
    }
    expect(seaweedCount).toBe(0)
  })

  it('never accepts seaweed on the deep open ocean floor beyond the shallow bias', () => {
    // continentalness 0.1 keeps this unambiguously ocean; a 5 m seabed depth
    // is well past SEAWEED_MAX_DEPTH.
    const { tile, o } = waterTile(5, 0.1)
    const sample = (grid: Float32Array, x: number, z: number) =>
      sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)
    expect(sample(tile.bodyScale, 0, 0)).toBeGreaterThanOrEqual(0.9) // sanity: reads as ocean

    const coord = { cx: 0, cz: 0 }
    const params = tileParams({ cx: 0, cz: 0, chunkSize, resolution })

    let deepOceanSeaweedCount = 0
    for (let seed = 0; seed < 12; seed++) {
      const p = { ...params, seed: 700 + seed }
      for (const v of computeChunkVegetation(coord, tile, p).filter((x) => x.kind === 'seaweed')) {
        // Margin inside the body's radius-14 shoreline, away from the
        // bilinear land/water boundary interpolation band.
        if (Math.hypot(v.x, v.z) < 10) deepOceanSeaweedCount++
      }
    }
    expect(deepOceanSeaweedCount).toBe(0)
  })
})
