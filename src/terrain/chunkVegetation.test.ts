import { describe, expect, it } from 'vitest'
import {
  apronOriginWorld,
  type ChunkTileParams,
  computeChunkTile,
  type RawSampleParams,
  type RegionParams,
  sampleApronGrid,
} from './chunkHeightmap'
import { computeChunkVegetation } from './chunkVegetation'

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
    vegetationSpeciesCount: { tree: 9, bush: 5, cactus: 2, reed: 1, fern: 1 },
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
