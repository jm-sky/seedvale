import { describe, expect, it } from 'vitest'
import type { RiverChannelSegment } from './chunkHeightmap'
import { FORD_WATER_DEPTH, type FordProjection } from './riverFord'
import { type RiverChain, riverChannelSegmentsNear, type RiverPoint } from './riverNetwork'
import { sampleLocalWater } from './waterSample'

const WATER_LEVEL = 10

function riverSegment(overrides: Partial<RiverChannelSegment> = {}): RiverChannelSegment {
  return {
    ax: -10,
    az: 0,
    aBedH: 18,
    aWaterH: 19,
    aWaterHalfWidth: 2,
    aChannelHalfWidth: 4,
    bx: 10,
    bz: 0,
    bBedH: 18,
    bWaterH: 19,
    bWaterHalfWidth: 2,
    bChannelHalfWidth: 4,
    ...overrides,
  }
}

describe('sampleLocalWater (plan fauna-015)', () => {
  it('reports dry land when the clamped height sits above waterLevel and there is no river here', () => {
    const sample = sampleLocalWater(WATER_LEVEL + 5, WATER_LEVEL + 5, WATER_LEVEL, [], 0, 0)
    expect(sample.present).toBe(false)
  })

  it('reports lake/ocean depth from floorHeight vs. the global waterLevel', () => {
    const sample = sampleLocalWater(WATER_LEVEL, WATER_LEVEL - 3, WATER_LEVEL, [], 0, 0)
    expect(sample).toEqual({ present: true, waterSurfaceHeight: WATER_LEVEL, floorHeight: WATER_LEVEL - 3, depth: 3 })
  })

  it('never reports negative depth even if floorHeight sits above waterLevel', () => {
    const sample = sampleLocalWater(WATER_LEVEL, WATER_LEVEL + 1, WATER_LEVEL, [], 0, 0)
    expect(sample).toEqual({ present: true, waterSurfaceHeight: WATER_LEVEL, floorHeight: WATER_LEVEL + 1, depth: 0 })
  })

  it('uses the river channel canonical water/bed height, not the global waterLevel, when inside a river channel', () => {
    // River bed (18) sits well above the global waterLevel (10) — a mountain
    // stream. The clamped `heights` field for such a point never dips below
    // waterLevel, so only the river channel data can report it as water.
    const segments = [riverSegment()]
    const sample = sampleLocalWater(WATER_LEVEL + 20, WATER_LEVEL + 20, WATER_LEVEL, segments, 0, 0)
    expect(sample).toEqual({ present: true, waterSurfaceHeight: 19, floorHeight: 18, depth: 1 })
  })

  it('falls back to the lake/ocean check outside the river channel even when river segments are loaded nearby', () => {
    const segments = [riverSegment()]
    // Far across the bank from the river's centerline (halfWidth 2, well outside).
    const sample = sampleLocalWater(WATER_LEVEL + 20, WATER_LEVEL + 20, WATER_LEVEL, segments, 0, 50)
    expect(sample.present).toBe(false)
  })

  it('river data wins over a coincidentally-water-clamped height at the same point', () => {
    const segments = [riverSegment()]
    // Even if the (contrived) clamped height also reads as lake/ocean water,
    // being inside the river channel must resolve to the river's own numbers.
    const sample = sampleLocalWater(WATER_LEVEL, WATER_LEVEL - 100, WATER_LEVEL, segments, 0, 0)
    expect(sample).toEqual({ present: true, waterSurfaceHeight: 19, floorHeight: 18, depth: 1 })
  })
})

/** Plan world-terrain-023 §9 — a declared ford shapes the bed, so gameplay
 *  water depth has to agree with the ground the player walks on while
 *  canonical hydrology stays road-independent. */
describe('sampleLocalWater at a declared ford', () => {
  const segments = [riverSegment()]
  /** Road crossing the stream at the origin, running north→south. */
  const ford: FordProjection = { x: 0, z: 0, dirX: 0, dirZ: 1, halfLength: 6, halfWidth: 5 }

  it('reports the shaped ford bed, not the natural channel bed', () => {
    const sample = sampleLocalWater(
      WATER_LEVEL + 20, WATER_LEVEL + 20, WATER_LEVEL, segments, 0, 0, [ford],
    )
    expect(sample.present).toBe(true)
    if (!sample.present) return
    expect(sample.waterSurfaceHeight).toBe(19)
    expect(sample.floorHeight).toBeCloseTo(19 - FORD_WATER_DEPTH, 6)
    expect(sample.depth).toBeCloseTo(FORD_WATER_DEPTH, 6)
  })

  it('leaves the canonical water surface untouched', () => {
    const natural = sampleLocalWater(WATER_LEVEL + 20, WATER_LEVEL + 20, WATER_LEVEL, segments, 0, 0)
    const forded = sampleLocalWater(
      WATER_LEVEL + 20, WATER_LEVEL + 20, WATER_LEVEL, segments, 0, 0, [ford],
    )
    expect(natural.present && forded.present).toBe(true)
    if (!natural.present || !forded.present) return
    expect(forded.waterSurfaceHeight).toBe(natural.waterSurfaceHeight)
    expect(forded.depth).toBeLessThan(natural.depth)
  })

  it('reports natural depth again just outside the crossing footprint', () => {
    const sample = sampleLocalWater(
      WATER_LEVEL + 20, WATER_LEVEL + 20, WATER_LEVEL, segments, 8, 0, [ford],
    )
    expect(sample).toEqual({ present: true, waterSurfaceHeight: 19, floorHeight: 18, depth: 1 })
  })
})

/** Plan fauna-033 — `ChunkManager.sampleLocalWater()` now reads a per-chunk
 *  `riverGameplaySegments` cache (built once, from the same whole-chunk-rect
 *  `riverChannelSegmentsNear` query `ensureLoaded()` already ran for terrain
 *  carving) instead of recomputing a narrower per-point query on every call.
 *  This regression pins the assumption that makes reusing the wider,
 *  once-per-chunk result safe: for any point actually inside this chunk, the
 *  resulting `LocalWaterSample` is identical either way. */
describe('sampleLocalWater with chunk-rect cached segments vs. the old per-query segments (plan fauna-033)', () => {
  function riverPoint(x: number, z: number, elevation: number, accumulation: number): RiverPoint {
    return { x, z, elevation, accumulation }
  }

  it('matches at dry, near-edge and mid-channel points inside the chunk', () => {
    const chunkSize = 64
    const chunkCenterX = 32
    const chunkCenterZ = 32
    const oldQuerySize = 32 // matches chunkManager.ts's RIVER_SHORE_QUERY_SIZE
    const chain: RiverChain = {
      points: [
        riverPoint(-16, 32, 100, 2000),
        riverPoint(16, 32, 96, 2000),
        riverPoint(48, 32, 92, 2000),
        riverPoint(80, 32, 88, 2000),
      ],
    }
    // What `ensureLoaded()` now caches once into `ChunkRecord.riverGameplaySegments`.
    const cached = riverChannelSegmentsNear([chain], chunkCenterX, chunkCenterZ, chunkSize)

    const samplePoints = [
      { x: 2, z: 32 }, // near the chunk's left edge, inside the channel
      { x: 62, z: 32 }, // near the chunk's right edge, inside the channel
      { x: 32, z: 32 }, // chunk center, inside the channel
      { x: 4, z: 4 }, // corner, dry
      { x: 60, z: 60 }, // opposite corner, dry
    ]

    for (const p of samplePoints) {
      const perQuerySegments = riverChannelSegmentsNear([chain], p.x, p.z, oldQuerySize)
      const cachedSample = sampleLocalWater(200, 200, WATER_LEVEL, cached, p.x, p.z)
      const perQuerySample = sampleLocalWater(200, 200, WATER_LEVEL, perQuerySegments, p.x, p.z)
      expect(cachedSample).toEqual(perQuerySample)
    }
  })
})
