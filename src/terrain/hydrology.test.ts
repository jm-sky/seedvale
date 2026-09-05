import { describe, expect, it, vi } from 'vitest'
import type { RawSampleParams } from './chunkHeightmap'
import * as chunkHeightmap from './chunkHeightmap'
import { sampleContinentalnessAt, sampleMountainRidgeAt } from './chunkHeightmap'
import {
  computeHydrologyRegion,
  D8_DIRECTIONS,
  DEFAULT_DEPRESSION_REPAIR_OPTIONS,
  type DepressionRepairOptions,
  findSourceCandidates,
  FLOW_DIR_SINK,
  HydrologyFlag,
  type HydrologyRegion,
  type HydrologyRegionParams,
  probeDownstreamTerminal,
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

type RadialDepressionSpec = {
  pitBottom: number
  rimRadius: number
  riseSlope: number
  outerFallSlope: number
}

/** Radially symmetric synthetic terrain, centered at world (0,0): a cone
 *  rising from `pitBottom` out to a `rimRadius` "rim", then falling away
 *  steeply beyond it — a closed depression with a controllable rim height
 *  (`rimRadius * riseSlope`) and a genuine, comfortably-lower escape just
 *  past the rim (`outerFallSlope` deliberately steep so the escape cell sits
 *  well below `pitBottom`, not merely just under it). */
function radialDepressionFloorAt(spec: RadialDepressionSpec) {
  return (wx: number, wz: number): number => {
    const d = Math.hypot(wx, wz)
    if (d <= spec.rimRadius) return spec.pitBottom + d * spec.riseSlope
    const rimTop = spec.pitBottom + spec.rimRadius * spec.riseSlope
    return rimTop - (d - spec.rimRadius) * spec.outerFallSlope
  }
}

describe('bounded dry-sink repair (world-terrain-011)', () => {
  const waterLevel = 0.45
  const pitBottom = 5
  const region: HydrologyRegionParams = { originX: -120, originZ: -120, size: 40, cellStep: 6 }
  const sinkIdx = 20 * region.size + 20 // world (0,0) exactly, given this origin/cellStep

  function mockRadialTerrain(spec: RadialDepressionSpec): () => void {
    const floorAt = radialDepressionFloorAt(spec)
    const floorAtSpy = vi.spyOn(chunkHeightmap, 'sampleFloorAt').mockImplementation(floorAt)
    const heightAtSpy = vi
      .spyOn(chunkHeightmap, 'sampleHeightAt')
      .mockImplementation((wx: number, wz: number) => Math.max(floorAt(wx, wz), waterLevel))
    return () => {
      floorAtSpy.mockRestore()
      heightAtSpy.mockRestore()
    }
  }

  const shallowSpec: RadialDepressionSpec = { pitBottom, rimRadius: 24, riseSlope: 0.02, outerFallSlope: 1.0 }
  const deepSpec: RadialDepressionSpec = { pitBottom, rimRadius: 24, riseSlope: 0.15, outerFallSlope: 1.0 }

  it('leaves a weak dry sink unresolved when its accumulation is below the repair threshold', () => {
    const restore = mockRadialTerrain(shallowSpec)
    try {
      const params = rawParams(11, { waterLevel })
      const disabled = computeHydrologyRegion(region, params, {
        ...DEFAULT_DEPRESSION_REPAIR_OPTIONS,
        minAccumulationForRepair: Number.MAX_SAFE_INTEGER,
      })
      const rawCatchment = disabled.accumulation[sinkIdx]!
      expect(rawCatchment).toBeGreaterThan(1) // sanity: this sink does receive real upstream drainage

      const options: DepressionRepairOptions = {
        ...DEFAULT_DEPRESSION_REPAIR_OPTIONS,
        minAccumulationForRepair: rawCatchment + 1,
      }
      const result = computeHydrologyRegion(region, params, options)
      expect(result.flags[sinkIdx]! & HydrologyFlag.SINK).toBeTruthy()
      expect(result.elevation[sinkIdx]).toBeCloseTo(pitBottom, 5)
    } finally {
      restore()
    }
  })

  it('repairs a meaningful shallow depression with a low rim, giving the former sink a valid downstream route', () => {
    const restore = mockRadialTerrain(shallowSpec)
    try {
      const params = rawParams(11, { waterLevel })
      const options: DepressionRepairOptions = { ...DEFAULT_DEPRESSION_REPAIR_OPTIONS, minAccumulationForRepair: 1 }
      const result = computeHydrologyRegion(region, params, options)
      expect(result.flags[sinkIdx]! & HydrologyFlag.SINK).toBeFalsy()
      expect(result.flowDir[sinkIdx]).not.toBe(FLOW_DIR_SINK)
      expect(result.elevation[sinkIdx]).toBeCloseTo(pitBottom, 5) // the sink's own elevation is never modified
    } finally {
      restore()
    }
  })

  it('leaves a deep/large depression unresolved rather than producing an artificial deep cut', () => {
    const restore = mockRadialTerrain(deepSpec)
    try {
      const params = rawParams(11, { waterLevel })
      const options: DepressionRepairOptions = { ...DEFAULT_DEPRESSION_REPAIR_OPTIONS, minAccumulationForRepair: 1 }
      const result = computeHydrologyRegion(region, params, options)
      expect(result.flags[sinkIdx]! & HydrologyFlag.SINK).toBeTruthy()
      expect(result.elevation[sinkIdx]).toBeCloseTo(pitBottom, 5)
    } finally {
      restore()
    }
  })

  it('is deterministic for the same synthetic depression', () => {
    const restore = mockRadialTerrain(shallowSpec)
    try {
      const params = rawParams(11, { waterLevel })
      const options: DepressionRepairOptions = { ...DEFAULT_DEPRESSION_REPAIR_OPTIONS, minAccumulationForRepair: 1 }
      const a = computeHydrologyRegion(region, params, options)
      const b = computeHydrologyRegion(region, params, options)
      expect(a.elevation).toEqual(b.elevation)
      expect(a.flowDir).toEqual(b.flowDir)
      expect(a.accumulation).toEqual(b.accumulation)
      expect(a.flags).toEqual(b.flags)
    } finally {
      restore()
    }
  })

  it('conserves mass and keeps every non-terminal edge strictly descending after repair', () => {
    const restore = mockRadialTerrain(shallowSpec)
    try {
      const params = rawParams(11, { waterLevel })
      const options: DepressionRepairOptions = { ...DEFAULT_DEPRESSION_REPAIR_OPTIONS, minAccumulationForRepair: 1 }
      const repaired = computeHydrologyRegion(region, params, options)
      expect(terminalAccumulationSum(repaired)).toBe(region.size * region.size)
      for (let i = 0; i < repaired.flowDir.length; i++) {
        const flag = repaired.flags[i]!
        if ((flag & (HydrologyFlag.SINK | HydrologyFlag.BOUNDARY_EXIT)) !== 0) continue
        const dir = D8_DIRECTIONS[repaired.flowDir[i]!]!
        const ix = i % region.size
        const iz = Math.floor(i / region.size)
        const downstream = (iz + dir.dz) * region.size + (ix + dir.dx)
        expect(repaired.elevation[downstream]!).toBeLessThan(repaired.elevation[i]!)
      }
    } finally {
      restore()
    }
  })

  it('does not breach a wet sink (already a valid OCEAN_OUTLET)', () => {
    const restore = mockRadialTerrain({ ...shallowSpec, pitBottom: waterLevel - 1 })
    try {
      const params = rawParams(11, { waterLevel })
      const result = computeHydrologyRegion(region, params)
      expect(result.flags[sinkIdx]! & HydrologyFlag.SINK).toBeTruthy()
      expect(result.flags[sinkIdx]! & HydrologyFlag.OCEAN_OUTLET).toBeTruthy()
      expect(result.elevation[sinkIdx]).toBeCloseTo(waterLevel - 1, 5)
    } finally {
      restore()
    }
  })
})

type FloorFn = (wx: number, wz: number) => number

function mockTerrain(floorAt: FloorFn, waterLevel: number): () => void {
  const floorAtSpy = vi.spyOn(chunkHeightmap, 'sampleFloorAt').mockImplementation(floorAt)
  const heightAtSpy = vi
    .spyOn(chunkHeightmap, 'sampleHeightAt')
    .mockImplementation((wx: number, wz: number) => Math.max(floorAt(wx, wz), waterLevel))
  return () => {
    floorAtSpy.mockRestore()
    heightAtSpy.mockRestore()
  }
}

function rawElevationGrid(regionParams: HydrologyRegionParams, floorAt: FloorFn): Float32Array {
  const { originX, originZ, size, cellStep } = regionParams
  const out = new Float32Array(size * size)
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      out[iz * size + ix] = floorAt(originX + ix * cellStep, originZ + iz * cellStep)
    }
  }
  return out
}

describe('bounded downstream terminal probe (world-terrain-013)', () => {
  const waterLevel = 0.45
  const regionParams: HydrologyRegionParams = { originX: -120, originZ: -120, size: 40, cellStep: 6 }
  const coastX = 0
  const oceanFloor = waterLevel - 1
  /** Ramp descending eastwards into a flat sea — every land cell already has
   *  a valid existing D8 route to real water, so nothing needs conditioning. */
  const coastalRamp: FloorFn = (wx: number) => Math.max(oceanFloor, oceanFloor + (coastX - wx) * 0.2)

  it('reports an existing D8 route to a real water receiver without any terrain conditioning', () => {
    const restore = mockTerrain(coastalRamp, waterLevel)
    try {
      const params = rawParams(11, { waterLevel })
      const region = computeHydrologyRegion(regionParams, params)
      expect(region.elevation).toEqual(rawElevationGrid(regionParams, coastalRamp))

      const inland = 20 * regionParams.size + 2 // well west of the coast
      const probe = probeDownstreamTerminal(region, inland)
      expect(probe.outcome).toBe('water-receiver')
      expect(probe.steps).toBeGreaterThan(0)
      expect(region.elevation[probe.endIndex]!).toBeLessThanOrEqual(waterLevel)
    } finally {
      restore()
    }
  })

  it('reports a dry sink honestly instead of upgrading it to a receiver, and respects its step budget', () => {
    const dryBowl: FloorFn = (wx: number, wz: number) => waterLevel + 3 + Math.hypot(wx, wz) * 0.05
    const restore = mockTerrain(dryBowl, waterLevel)
    try {
      const params = rawParams(11, { waterLevel })
      const region = computeHydrologyRegion(regionParams, params, {
        ...DEFAULT_DEPRESSION_REPAIR_OPTIONS,
        minAccumulationForRepair: Number.MAX_SAFE_INTEGER, // no repair: probe the raw topology
      })
      const corner = 2 * regionParams.size + 2
      expect(probeDownstreamTerminal(region, corner).outcome).toBe('dry-sink')
      expect(probeDownstreamTerminal(region, corner, 1).outcome).toBe('budget-exceeded')
    } finally {
      restore()
    }
  })
})

/**
 * Pit → moat terrain: a shallow cone draining to a dry pit at world (0,0),
 * a rim, then a flat annulus ("moat") comfortably below the pit bottom, and
 * an outer wall rising back up. The moat is the only escape the bounded
 * search can reach — so `moatFloor` alone decides whether that escape is a
 * genuine water receiver or just a second closed depression.
 */
function pitAndMoatFloorAt(moatFloor: number, riseSlope: number): FloorFn {
  const pitBottom = 5
  const coneRadius = 24
  const moatOuterRadius = 60
  const rimTop = pitBottom + coneRadius * riseSlope
  return (wx: number, wz: number): number => {
    const d = Math.hypot(wx, wz)
    if (d <= coneRadius) return pitBottom + d * riseSlope
    if (d <= moatOuterRadius) return Math.max(moatFloor, rimTop - (d - coneRadius) * 0.5)
    return moatFloor + (d - moatOuterRadius) // outer wall, draining back into the moat
  }
}

describe('receiver-aware, cost-based breach selection (world-terrain-013)', () => {
  const waterLevel = 0.45
  const regionParams: HydrologyRegionParams = { originX: -120, originZ: -120, size: 40, cellStep: 6 }
  const sinkIdx = 20 * regionParams.size + 20 // world (0,0)
  // High enough that only the pit's own catchment qualifies, so flat moat/
  // corridor cells never trigger repairs of their own and every conditioned
  // cell in these tests belongs to the pit's accepted breach.
  const options: DepressionRepairOptions = { ...DEFAULT_DEPRESSION_REPAIR_OPTIONS, minAccumulationForRepair: 20 }

  it('breaches a shallow rim toward a genuine water receiver', () => {
    const floorAt = pitAndMoatFloorAt(waterLevel - 0.05, 0.02)
    const restore = mockTerrain(floorAt, waterLevel)
    try {
      const params = rawParams(11, { waterLevel })
      const region = computeHydrologyRegion(regionParams, params, options)
      expect(region.flags[sinkIdx]! & HydrologyFlag.SINK).toBeFalsy()
      expect(region.flowDir[sinkIdx]).not.toBe(FLOW_DIR_SINK)
      expect(probeDownstreamTerminal(region, sinkIdx).outcome).toBe('water-receiver')
    } finally {
      restore()
    }
  })

  it('rejects an equally cheap escape whose own downstream is just another unresolved dry sink', () => {
    // Same geometry, same cut cost — only the moat's water status differs.
    const floorAt = pitAndMoatFloorAt(waterLevel + 1.5, 0.02)
    const restore = mockTerrain(floorAt, waterLevel)
    try {
      const params = rawParams(11, { waterLevel })
      const region = computeHydrologyRegion(regionParams, params, options)
      expect(region.flags[sinkIdx]! & HydrologyFlag.SINK).toBeTruthy()
      expect(region.elevation).toEqual(rawElevationGrid(regionParams, floorAt)) // nothing was cut
    } finally {
      restore()
    }
  })

  it('leaves a sink unresolved when reaching nearby water would need a cut past the budget', () => {
    const floorAt = pitAndMoatFloorAt(waterLevel - 0.05, 0.15) // rim ~3.6 m above the pit
    const restore = mockTerrain(floorAt, waterLevel)
    try {
      const params = rawParams(11, { waterLevel })
      const region = computeHydrologyRegion(regionParams, params, options)
      expect(region.flags[sinkIdx]! & HydrologyFlag.SINK).toBeTruthy()
      expect(region.elevation).toEqual(rawElevationGrid(regionParams, floorAt))
    } finally {
      restore()
    }
  })
})

describe('cost-based outlet choice (world-terrain-013)', () => {
  const waterLevel = 0.45
  const regionParams: HydrologyRegionParams = { originX: -150, originZ: -150, size: 50, cellStep: 6 }
  const sinkIdx = 25 * regionParams.size + 25 // world (0,0)

  // A dry pit walled in except for two gates, one east and one west, each
  // with its own sill height and corridor length — so a test can make the
  // shorter route the expensive one and see which the policy picks.
  const pitBottom = 5
  const coneRadius = 24
  const rimTop = pitBottom + coneRadius * 0.005
  type GateSpec = { eastSill: number; eastLength: number; westSill: number; westLength: number }

  function twoGateFloorAt(gates: GateSpec): FloorFn {
    return (wx: number, wz: number): number => {
      const d = Math.hypot(wx, wz)
      if (d <= coneRadius) return pitBottom + d * 0.005
      if (Math.abs(wz) > 6) return rimTop + 20 // flat wall; contributes no drainage of its own
      // Gates are rectangular corridors (flat across the band, so no cell is
      // cheaper just for sitting off the axis) that fall away beyond their end.
      const east = wx > 0
      const sill = east ? gates.eastSill : gates.westSill
      const beyondGate = Math.abs(wx) - coneRadius - (east ? gates.eastLength : gates.westLength)
      return beyondGate <= 0 ? rimTop + sill : rimTop + sill - beyondGate
    }
  }

  /** Every cell the repair actually lowered, with its world x. */
  function cutCells(region: HydrologyRegion, raw: Float32Array): { wx: number; cut: number }[] {
    const out: { wx: number; cut: number }[] = []
    for (let i = 0; i < raw.length; i++) {
      const cut = raw[i]! - region.elevation[i]!
      if (cut > 1e-6) out.push({ wx: regionParams.originX + (i % regionParams.size) * regionParams.cellStep, cut })
    }
    return out
  }

  const options: DepressionRepairOptions = { ...DEFAULT_DEPRESSION_REPAIR_OPTIONS, minAccumulationForRepair: 20 }

  it('prefers the longer, much shallower gate over the short deep one', () => {
    // Both routes fit every budget, so terrain cost alone decides.
    const floorAt = twoGateFloorAt({ eastSill: 1.0, eastLength: 6, westSill: 0.15, westLength: 36 })
    const restore = mockTerrain(floorAt, waterLevel)
    try {
      const params = rawParams(11, { waterLevel })
      const region = computeHydrologyRegion(regionParams, params, options)
      expect(region.flags[sinkIdx]! & HydrologyFlag.SINK).toBeFalsy()

      const cuts = cutCells(region, rawElevationGrid(regionParams, floorAt))
      expect(cuts.length).toBeGreaterThan(0)
      // Every conditioned cell sits on the shallow western route ...
      expect(cuts.every((c) => c.wx <= 0)).toBe(true)
      // ... and the deepest cut stays far below what the eastern sill would cost.
      expect(Math.max(...cuts.map((c) => c.cut))).toBeLessThan(0.9)
    } finally {
      restore()
    }
  })

  it('falls back to a costlier gate when the shallowest rim leads to a route that busts the cut budget', () => {
    // The western sill is still the lowest rim the search reaches first, but
    // its corridor is so long that the summed cut exceeds `maxTotalCut` — the
    // sink must be resolved through the eastern gate instead of abandoned.
    const floorAt = twoGateFloorAt({ eastSill: 1.0, eastLength: 6, westSill: 0.15, westLength: 90 })
    const restore = mockTerrain(floorAt, waterLevel)
    try {
      const params = rawParams(11, { waterLevel })
      const region = computeHydrologyRegion(regionParams, params, options)
      expect(region.flags[sinkIdx]! & HydrologyFlag.SINK).toBeFalsy()

      const cuts = cutCells(region, rawElevationGrid(regionParams, floorAt))
      expect(cuts.length).toBeGreaterThan(0)
      expect(cuts.every((c) => c.wx >= 0)).toBe(true)
      expect(Math.max(...cuts.map((c) => c.cut))).toBeLessThanOrEqual(options.maxCutDepth)
      expect(cuts.reduce((sum, c) => sum + c.cut, 0)).toBeLessThanOrEqual(options.maxTotalCut)
    } finally {
      restore()
    }
  })
})
