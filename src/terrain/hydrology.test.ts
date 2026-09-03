import { describe, expect, it, vi } from 'vitest'
import type { RawSampleParams } from './chunkHeightmap'
import * as chunkHeightmap from './chunkHeightmap'
import { sampleContinentalnessAt, sampleMountainRidgeAt } from './chunkHeightmap'
import {
  computeHydrologyRegion,
  D8_DIRECTIONS,
  findSourceCandidates,
  FLOW_DIR_SINK,
  HydrologyFlag,
  type HydrologyRegion,
  type HydrologyRegionParams,
} from './hydrology'

/** Defaults aligned with `worldConfig` base terrain (plan 062/181). */
function rawParams(seed: number, overrides: Partial<RawSampleParams> = {}): RawSampleParams {
  return {
    seed,
    heightScale: 18,
    waterLevel: 0.45,
    noiseScale: 105,
    detailAmplitude: 0.65,
    hillsScale: 420,
    hillsAmplitude: 0.34,
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
      mountainThresholdWidth: 0.2,
      worleyCellSize: 400,
      ridgeSharpness: 1.4,
      mountainGain: 0.88,
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

const SIZE = 64
const CELL_STEP = 6

function terminalAccumulationSum(region: HydrologyRegion): number {
  let sum = 0
  for (let i = 0; i < region.flags.length; i++) {
    if ((region.flags[i]! & (HydrologyFlag.SINK | HydrologyFlag.BOUNDARY_EXIT)) !== 0) {
      sum += region.accumulation[i]!
    }
  }
  return sum
}

function sinkRatio(region: HydrologyRegion): number {
  let sinks = 0
  for (let i = 0; i < region.flags.length; i++) {
    if ((region.flags[i]! & HydrologyFlag.SINK) !== 0) sinks++
  }
  return sinks / region.flags.length
}

/** Deterministically finds a mountain-heavy and a coast-heavy region origin for a
 *  given seed by scanning a coarse candidate grid — no hardcoded "magic" world
 *  coordinates that only happen to work for one seed. */
function scanRegions(seed: number): { mountain: HydrologyRegionParams; coast: HydrologyRegionParams } {
  const params = rawParams(seed)
  const candidateStep = 800
  const candidates: { x: number; z: number; ridge: number; continentalness: number }[] = []
  for (let gx = -2; gx <= 2; gx++) {
    for (let gz = -2; gz <= 2; gz++) {
      const x = gx * candidateStep
      const z = gz * candidateStep
      let ridgeSum = 0
      const samples = 3
      for (let sx = 0; sx < samples; sx++) {
        for (let sz = 0; sz < samples; sz++) {
          ridgeSum += sampleMountainRidgeAt(
            x + (sx - 1) * SIZE * CELL_STEP,
            z + (sz - 1) * SIZE * CELL_STEP,
            params,
          )
        }
      }
      candidates.push({
        x,
        z,
        ridge: ridgeSum / (samples * samples),
        continentalness: sampleContinentalnessAt(x, z, params),
      })
    }
  }
  candidates.sort((a, b) => b.ridge - a.ridge)
  const mountainPick = candidates[0]!
  candidates.sort((a, b) => a.continentalness - b.continentalness)
  const coastPick = candidates.find((c) => c.continentalness >= params.region.oceanThreshold) ?? candidates[0]!

  const regionSizeWorld = SIZE * CELL_STEP
  return {
    mountain: { originX: mountainPick.x - regionSizeWorld / 2, originZ: mountainPick.z - regionSizeWorld / 2, size: SIZE, cellStep: CELL_STEP },
    coast: { originX: coastPick.x - regionSizeWorld / 2, originZ: coastPick.z - regionSizeWorld / 2, size: SIZE, cellStep: CELL_STEP },
  }
}

describe('hydrology D8 prototype', () => {
  it('is deterministic for the same seed/region', () => {
    const params = rawParams(42)
    const regionParams: HydrologyRegionParams = { originX: 100, originZ: -200, size: SIZE, cellStep: CELL_STEP }
    const a = computeHydrologyRegion(regionParams, params)
    const b = computeHydrologyRegion(regionParams, params)
    expect(a.elevation).toEqual(b.elevation)
    expect(a.flowDir).toEqual(b.flowDir)
    expect(a.accumulation).toEqual(b.accumulation)
    expect(a.flags).toEqual(b.flags)
  })

  it('always flows to a strictly lower in-grid neighbour unless it is a sink or exits the window', () => {
    const params = rawParams(7)
    const regionParams: HydrologyRegionParams = { originX: 0, originZ: 0, size: SIZE, cellStep: CELL_STEP }
    const region = computeHydrologyRegion(regionParams, params)
    for (let i = 0; i < region.flowDir.length; i++) {
      const flag = region.flags[i]!
      if ((flag & (HydrologyFlag.SINK | HydrologyFlag.BOUNDARY_EXIT)) !== 0) continue
      const dir = D8_DIRECTIONS[region.flowDir[i]!]!
      const ix = i % SIZE
      const iz = Math.floor(i / SIZE)
      const downstream = (iz + dir.dz) * SIZE + (ix + dir.dx)
      expect(region.elevation[downstream]!).toBeLessThan(region.elevation[i]!)
    }
  })

  it('conserves mass: every cell drains to exactly one terminal cell', () => {
    const params = rawParams(1337)
    const regionParams: HydrologyRegionParams = { originX: -500, originZ: 300, size: SIZE, cellStep: CELL_STEP }
    const region = computeHydrologyRegion(regionParams, params)
    expect(terminalAccumulationSum(region)).toBe(SIZE * SIZE)
  })

  it('flags OCEAN_OUTLET only on a terminal cell (sink or boundary-exit) whose own drainage point is underwater', () => {
    const params = rawParams(5)
    const regionParams: HydrologyRegionParams = { originX: 0, originZ: 0, size: SIZE, cellStep: CELL_STEP }
    const region = computeHydrologyRegion(regionParams, params)
    for (let i = 0; i < region.flags.length; i++) {
      const flag = region.flags[i]!
      if ((flag & HydrologyFlag.OCEAN_OUTLET) !== 0) {
        expect((flag & (HydrologyFlag.SINK | HydrologyFlag.BOUNDARY_EXIT)) !== 0).toBe(true)
      }
    }
  })

  it('flags a sink as OCEAN_OUTLET only when its own elevation is at/below waterLevel', () => {
    const waterLevel = 0.45
    const params = rawParams(1, { waterLevel })
    const size = 12
    const cellStep = 4
    const regionParams: HydrologyRegionParams = { originX: -1000, originZ: -1000, size, cellStep }
    const cix = Math.floor(size / 2)
    const ciz = Math.floor(size / 2)
    const centerX = regionParams.originX + cix * cellStep
    const centerZ = regionParams.originZ + ciz * cellStep

    for (const bottom of [waterLevel - 0.2, waterLevel + 0.5]) {
      const floorAtSpy = vi
        .spyOn(chunkHeightmap, 'sampleFloorAt')
        .mockImplementation((wx: number, wz: number) => bottom + Math.hypot(wx - centerX, wz - centerZ) * 0.3)
      const heightAtSpy = vi
        .spyOn(chunkHeightmap, 'sampleHeightAt')
        .mockImplementation((wx: number, wz: number) =>
          Math.max(bottom + Math.hypot(wx - centerX, wz - centerZ) * 0.3, waterLevel),
        )

      const region = computeHydrologyRegion(regionParams, params)
      const idx = ciz * size + cix
      expect(region.flags[idx]! & HydrologyFlag.SINK).toBeTruthy()
      expect((region.flags[idx]! & HydrologyFlag.OCEAN_OUTLET) !== 0).toBe(bottom <= waterLevel)

      floorAtSpy.mockRestore()
      heightAtSpy.mockRestore()
    }
  })

  it('produces plausible sink ratios and source candidates across several seeds/regions (Etap 3)', () => {
    const seeds = [1, 42, 999]
    for (const seed of seeds) {
      const { mountain, coast } = scanRegions(seed)
      const params = rawParams(seed)
      for (const regionParams of [mountain, coast]) {
        const region = computeHydrologyRegion(regionParams, params)
        const ratio = sinkRatio(region)
        // Naive D8 always produces some closed depressions; a healthy terrain
        // should not be dominated by them. Observed range across these seeds/
        // regions at this grid size is ~2.6%-4%; 15% leaves generous headroom
        // while still catching a pathological terrain/tuning regression.
        expect(ratio).toBeLessThan(0.15)
        expect(terminalAccumulationSum(region)).toBe(SIZE * SIZE)

        const sources = findSourceCandidates(region)
        expect(sources.length).toBeGreaterThan(0)
        for (const idx of sources) {
          expect(region.accumulation[idx]).toBe(1)
        }
      }
    }
  })

  it('never assigns FLOW_DIR_SINK together with a resolved downstream neighbour', () => {
    const params = rawParams(2024)
    const regionParams: HydrologyRegionParams = { originX: 250, originZ: 250, size: SIZE, cellStep: CELL_STEP }
    const region = computeHydrologyRegion(regionParams, params)
    for (let i = 0; i < region.flowDir.length; i++) {
      const isSinkFlag = (region.flags[i]! & HydrologyFlag.SINK) !== 0
      expect(isSinkFlag).toBe(region.flowDir[i] === FLOW_DIR_SINK)
    }
  })
})
