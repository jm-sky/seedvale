import { describe, expect, it } from 'vitest'
import {
  apronOriginWorld,
  computeChunkTile,
  type RawSampleParams,
  type RegionalSmoothingSegment,
  type RiverChannelSegment,
  type RoadCorridorSegment,
  sampleContinentalnessAt,
  sampleFloorAt,
  sampleHeightAt,
  sampleMoistureRegionAt,
  sampleMountainRidgeAt,
} from './chunkHeightmap'

/** Defaults aligned with `worldConfig` base terrain (plan 062). */
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

function expectFiniteGrid(grid: Float32Array): void {
  for (let i = 0; i < grid.length; i++) {
    expect(Number.isFinite(grid[i])).toBe(true)
  }
}

describe('chunkHeightmap determinism', () => {
  it('returns identical analytic samples for the same seed/config/world point', () => {
    const params = rawParams()
    const points = [
      [0, 0],
      [12.5, -7.25],
      [640, 128],
      [-320.5, 901.25],
    ] as const

    for (const [x, z] of points) {
      expect(sampleHeightAt(x, z, params)).toBe(sampleHeightAt(x, z, params))
      expect(sampleFloorAt(x, z, params)).toBe(sampleFloorAt(x, z, params))
      expect(sampleContinentalnessAt(x, z, params)).toBe(sampleContinentalnessAt(x, z, params))
      expect(sampleMountainRidgeAt(x, z, params)).toBe(sampleMountainRidgeAt(x, z, params))
      expect(sampleMoistureRegionAt(x, z, params)).toBe(sampleMoistureRegionAt(x, z, params))
    }
  })

  it('is independent of call order across distant world points', () => {
    const params = rawParams({ seed: 7 })
    const a1 = sampleFloorAt(100, 200, params)
    const b1 = sampleFloorAt(-800, 40, params)
    const b2 = sampleFloorAt(-800, 40, params)
    const a2 = sampleFloorAt(100, 200, params)
    expect(a1).toBe(a2)
    expect(b1).toBe(b2)
  })

  it('keeps heights finite and clamps surface height to waterLevel', () => {
    const params = rawParams()
    for (let i = 0; i < 40; i++) {
      const x = (i % 8) * 97.3 - 300
      const z = Math.floor(i / 8) * 113.7 - 250
      const h = sampleHeightAt(x, z, params)
      const floorH = sampleFloorAt(x, z, params)
      expect(Number.isFinite(h)).toBe(true)
      expect(Number.isFinite(floorH)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(params.waterLevel)
      expect(h).toBe(Math.max(floorH, params.waterLevel))
    }
  })

  it('bounds hills contribution by hillsAmplitude', () => {
    const off = rawParams({ hillsAmplitude: 0 })
    const on = rawParams({ hillsAmplitude: 0.28 })
    // Same point, land-ish area near origin for seed 42 — difference must stay
    // within ±hillsAmplitude * heightScale (centered term, before other layers).
    const x = 80
    const z = 40
    const d = Math.abs(sampleFloorAt(x, z, on) - sampleFloorAt(x, z, off))
    expect(d).toBeLessThanOrEqual(on.hillsAmplitude * on.heightScale + 1e-6)
  })
})

describe('chunkHeightmap seams', () => {
  it('matches analytic floor height on shared world coordinates of adjacent chunks', () => {
    const params = rawParams()
    const chunkSize = 64
    const resolution = 33

    const left = computeChunkTile({
      ...params,
      cx: 0,
      cz: 0,
      chunkSize,
      resolution,
      isHomeChunk: false,
      vegetationSpeciesCount: { tree: 1, bush: 1, cactus: 1, reed: 1, fern: 1, lily: 1, seaweed: 1 },
      roadSegments: [],
      clearings: [],
      regional: [],
      riverSegments: [],
    })
    const right = computeChunkTile({
      ...params,
      cx: 1,
      cz: 0,
      chunkSize,
      resolution,
      isHomeChunk: false,
      vegetationSpeciesCount: { tree: 1, bush: 1, cactus: 1, reed: 1, fern: 1, lily: 1, seaweed: 1 },
      roadSegments: [],
      clearings: [],
      regional: [],
      riverSegments: [],
    })

    expectFiniteGrid(left.heights)
    expectFiniteGrid(left.floorHeights)
    expectFiniteGrid(right.heights)
    expectFiniteGrid(right.floorHeights)

    const leftOrigin = apronOriginWorld(0, 0, chunkSize, resolution)
    const rightOrigin = apronOriginWorld(1, 0, chunkSize, resolution)

    // Shared vertical edge at world x = +chunkSize/2 (= 32).
    const seamX = chunkSize / 2
    for (let iz = 0; iz < leftOrigin.apronRes; iz++) {
      const wz = leftOrigin.z + iz * leftOrigin.step
      const lx = Math.round((seamX - leftOrigin.x) / leftOrigin.step)
      const rx = Math.round((seamX - rightOrigin.x) / rightOrigin.step)
      const li = iz * leftOrigin.apronRes + lx
      const ri = iz * rightOrigin.apronRes + rx

      expect(left.floorHeights[li]).toBeCloseTo(right.floorHeights[ri], 5)
      expect(left.heights[li]).toBeCloseTo(right.heights[ri], 5)

      const analytic = sampleFloorAt(seamX, wz, params)
      expect(left.floorHeights[li]).toBeCloseTo(analytic, 5)
      expect(right.floorHeights[ri]).toBeCloseTo(analytic, 5)
    }
  })

  it('produces identical tiles when generated in reverse order', () => {
    const params = rawParams({ seed: 1337 })
    const base = {
      ...params,
      chunkSize: 64,
      resolution: 17,
      isHomeChunk: false,
      vegetationSpeciesCount: { tree: 1, bush: 1, cactus: 1, reed: 1, fern: 1, lily: 1, seaweed: 1 },
      roadSegments: [] as const,
      clearings: [] as const,
      regional: [] as const,
      riverSegments: [] as const,
    }

    const aThenB = [
      computeChunkTile({ ...base, cx: 2, cz: -1, roadSegments: [], clearings: [], regional: [], riverSegments: [] }),
      computeChunkTile({ ...base, cx: 3, cz: -1, roadSegments: [], clearings: [], regional: [], riverSegments: [] }),
    ]
    const bThenA = [
      computeChunkTile({ ...base, cx: 3, cz: -1, roadSegments: [], clearings: [], regional: [], riverSegments: [] }),
      computeChunkTile({ ...base, cx: 2, cz: -1, roadSegments: [], clearings: [], regional: [], riverSegments: [] }),
    ]

    expect(aThenB[0]!.floorHeights).toEqual(bThenA[1]!.floorHeights)
    expect(aThenB[1]!.floorHeights).toEqual(bThenA[0]!.floorHeights)
    expect(aThenB[0]!.continentalness).toEqual(bThenA[1]!.continentalness)
    expect(aThenB[0]!.mountainRidge).toEqual(bThenA[1]!.mountainRidge)
    expect(aThenB[0]!.moistureRegion).toEqual(bThenA[1]!.moistureRegion)
  })
})

describe('chunkHeightmap road irregularity', () => {
  const roadSeg = {
    ax: -20,
    az: 0,
    ah: 2,
    bx: 20,
    bz: 0,
    bh: 2,
    halfWidth: 5,
    heightStrength: 0.85,
    tintStrength: 0.8,
  }

  function tileWithRoads(seed = 42) {
    const params = rawParams({ seed })
    return computeChunkTile({
      ...params,
      cx: 0,
      cz: 0,
      chunkSize: 64,
      resolution: 17,
      isHomeChunk: false,
      vegetationSpeciesCount: { tree: 1, bush: 1, cactus: 1, reed: 1, fern: 1, lily: 1, seaweed: 1 },
      roadSegments: [roadSeg],
      clearings: [],
      regional: [],
      riverSegments: [],
    })
  }

  it('is deterministic for the same seed with road corridors', () => {
    const a = tileWithRoads(99)
    const b = tileWithRoads(99)
    expect(a.floorHeights).toEqual(b.floorHeights)
    expect(a.roadTint).toEqual(b.roadTint)
  })

  it('near-field surface detail (ruts + micro bumps) is deterministic, actually reshapes the corridor, and can be fully disabled (plan world-terrain-005)', () => {
    const params = rawParams({ seed: 11 })
    const tileWith = (overrides: Partial<typeof params.region.roadNetwork>) =>
      computeChunkTile({
        ...params,
        region: { ...params.region, roadNetwork: { ...params.region.roadNetwork, ...overrides } },
        cx: 0,
        cz: 0,
        chunkSize: 64,
        resolution: 33,
        isHomeChunk: false,
        vegetationSpeciesCount: { tree: 1, bush: 1, cactus: 1, reed: 1, fern: 1, lily: 1, seaweed: 1 },
        roadSegments: [roadSeg],
        clearings: [],
        regional: [],
        riverSegments: [],
      })

    // Baseline with potholes but no ruts/bumps.
    const baseline = tileWith({ surfaceDetailEnabled: false })
    // Same knobs, computed twice — must be bit-identical.
    const enabledA = tileWith({})
    const enabledB = tileWith({})
    expect(enabledA.floorHeights).toEqual(enabledB.floorHeights)

    // The feature must actually change the corridor's height field...
    expect(enabledA.floorHeights).not.toEqual(baseline.floorHeights)
    // ...and disabling it must reproduce the pre-feature baseline exactly,
    // not just "some" different-but-still-off value.
    const disabledAgain = tileWith({ surfaceDetailEnabled: false, rutDepth: 0.3, microBumpStrength: 0.3 })
    expect(disabledAgain.floorHeights).toEqual(baseline.floorHeights)
  })

  it('does not change clearings-only tiles when road irregularity knobs vary', () => {
    const clearing = {
      x: 0,
      z: 0,
      radius: 8,
      targetH: 3,
      heightStrength: 0.8,
      tintStrength: 0.75,
    }
    const base = {
      ...rawParams(),
      cx: 0,
      cz: 0,
      chunkSize: 64,
      resolution: 17,
      isHomeChunk: false,
      vegetationSpeciesCount: { tree: 1, bush: 1, cactus: 1, reed: 1, fern: 1, lily: 1, seaweed: 1 },
      roadSegments: [] as RoadCorridorSegment[],
      clearings: [clearing],
      regional: [] as RegionalSmoothingSegment[],
      riverSegments: [],
    }
    const a = computeChunkTile(base)
    const b = computeChunkTile({
      ...base,
      region: {
        ...base.region,
        roadNetwork: {
          ...base.region.roadNetwork,
          edgeWobbleAmplitude: 0.4,
          potholeDepth: 0.4,
          potholeThreshold: 0.5,
        },
      },
    })
    expect(a.floorHeights).toEqual(b.floorHeights)
    expect(a.roadTint).toEqual(b.roadTint)
  })

  it('produces non-uniform road tint along a straight corridor (edge wobble)', () => {
    const flat = tileWithRoads(7)
    const params = rawParams({
      seed: 7,
      region: {
        ...rawParams().region,
        roadNetwork: {
          ...rawParams().region.roadNetwork,
          edgeWobbleAmplitude: 0,
          potholeDepth: 0,
        },
      },
    })
    const noWobble = computeChunkTile({
      ...params,
      cx: 0,
      cz: 0,
      chunkSize: 64,
      resolution: 17,
      isHomeChunk: false,
      vegetationSpeciesCount: { tree: 1, bush: 1, cactus: 1, reed: 1, fern: 1, lily: 1, seaweed: 1 },
      roadSegments: [roadSeg],
      clearings: [],
      regional: [],
      riverSegments: [],
    })
    // With wobble, the tint footprint differs from a perfect capsule.
    expect(flat.roadTint).not.toEqual(noWobble.roadTint)
  })
})

describe('chunkHeightmap river channel carving (plan 189)', () => {
  const riverSeg: RiverChannelSegment = {
    ax: -20,
    az: 0,
    aBedH: 1,
    aWaterH: 1.8,
    aWaterHalfWidth: 3,
    aChannelHalfWidth: 5,
    bx: 20,
    bz: 0,
    bBedH: -2,
    bWaterH: -1.2,
    bWaterHalfWidth: 4,
    bChannelHalfWidth: 6.5,
  }

  function tileWithRiver(riverSegments: RiverChannelSegment[], seed = 42) {
    const params = rawParams({ seed })
    return computeChunkTile({
      ...params,
      cx: 0,
      cz: 0,
      chunkSize: 64,
      resolution: 33,
      isHomeChunk: false,
      vegetationSpeciesCount: { tree: 1, bush: 1, cactus: 1, reed: 1, fern: 1, lily: 1, seaweed: 1 },
      roadSegments: [],
      clearings: [],
      regional: [],
      riverSegments,
    })
  }

  it('carves floorHeights down toward the channel bed near the centerline', () => {
    const withRiver = tileWithRiver([riverSeg])
    const withoutRiver = tileWithRiver([])
    const origin = apronOriginWorld(0, 0, 64, 33)
    const ix = Math.round((0 - origin.x) / origin.step)
    const iz = Math.round((0 - origin.z) / origin.step)
    const idx = iz * origin.apronRes + ix
    expect(withRiver.floorHeights[idx]).toBeLessThan(withoutRiver.floorHeights[idx])
  })

  it('never raises terrain above its original (uncarved) height, anywhere in the tile', () => {
    const withRiver = tileWithRiver([riverSeg])
    const withoutRiver = tileWithRiver([])
    for (let i = 0; i < withRiver.floorHeights.length; i++) {
      expect(withRiver.floorHeights[i]!).toBeLessThanOrEqual(withoutRiver.floorHeights[i]! + 1e-6)
    }
  })

  it('leaves terrain unchanged well outside the channel half-width + bank reach', () => {
    const withRiver = tileWithRiver([riverSeg])
    const withoutRiver = tileWithRiver([])
    const origin = apronOriginWorld(0, 0, 64, 33)
    // Far corner of the chunk — well beyond the segment's channel/bank-top reach from z=0.
    const idx = 0 * origin.apronRes + 0
    expect(withRiver.floorHeights[idx]).toBeCloseTo(withoutRiver.floorHeights[idx]!, 5)
  })

  it('is deterministic for the same seed with river segments', () => {
    const a = tileWithRiver([riverSeg])
    const b = tileWithRiver([riverSeg])
    expect(a.floorHeights).toEqual(b.floorHeights)
  })

  it('matches on the shared seam of adjacent chunks straddling the same river segment', () => {
    const seg: RiverChannelSegment = {
      ax: -50,
      az: 0,
      aBedH: -3,
      aWaterH: -2.2,
      aWaterHalfWidth: 5,
      aChannelHalfWidth: 8,
      bx: 50,
      bz: 0,
      bBedH: -6,
      bWaterH: -5.2,
      bWaterHalfWidth: 5,
      bChannelHalfWidth: 8,
    }
    const params = rawParams({ seed: 5 })
    const chunkSize = 64
    const resolution = 33
    const shared = {
      ...params,
      chunkSize,
      resolution,
      isHomeChunk: false,
      vegetationSpeciesCount: { tree: 1, bush: 1, cactus: 1, reed: 1, fern: 1, lily: 1, seaweed: 1 },
      roadSegments: [],
      clearings: [],
      regional: [],
      riverSegments: [seg],
    }
    const left = computeChunkTile({ ...shared, cx: 0, cz: 0 })
    const right = computeChunkTile({ ...shared, cx: 1, cz: 0 })
    const leftOrigin = apronOriginWorld(0, 0, chunkSize, resolution)
    const rightOrigin = apronOriginWorld(1, 0, chunkSize, resolution)
    const seamX = chunkSize / 2
    for (let iz = 0; iz < leftOrigin.apronRes; iz++) {
      const lx = Math.round((seamX - leftOrigin.x) / leftOrigin.step)
      const rx = Math.round((seamX - rightOrigin.x) / rightOrigin.step)
      const li = iz * leftOrigin.apronRes + lx
      const ri = iz * rightOrigin.apronRes + rx
      expect(left.floorHeights[li]).toBeCloseTo(right.floorHeights[ri]!, 5)
    }
  })
})
