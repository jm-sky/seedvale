import { describe, expect, it } from 'vitest'
import type { RiverChannelSegment } from '../terrain/chunkHeightmap'
import { findRoute, meanderRoute, type RouteSearchOptions, yawToward } from './roadNetwork'
import { crossingsForPolyline } from './roadRiverCrossing'

describe('yawToward', () => {
  it('maps local +X toward +X world (no Z flip)', () => {
    expect(yawToward(1, 0)).toBeCloseTo(0)
  })

  it('maps local +X toward +Z world', () => {
    // Three.js Y-rot: +X → (cos θ, −sin θ); want (0, 1) ⇒ θ = −π/2
    expect(yawToward(0, 1)).toBeCloseTo(-Math.PI / 2)
  })
})

describe('meanderRoute', () => {
  const sampleHeight = (x: number, z: number) => x * 0.01 + z * 0.02

  const straight = [
    { x: 0, z: 0, h: 0 },
    { x: 10, z: 0, h: 0.1 },
    { x: 20, z: 0, h: 0.2 },
    { x: 30, z: 0, h: 0.3 },
  ]

  it('keeps endpoints fixed and is deterministic for the same seed', () => {
    const a = meanderRoute(straight, sampleHeight, 2, 0.04, 123)
    const b = meanderRoute(straight, sampleHeight, 2, 0.04, 123)
    expect(a).toEqual(b)
    expect(a[0]).toEqual(straight[0])
    expect(a[a.length - 1]).toEqual(straight[straight.length - 1])
  })

  it('offsets interior points for non-zero amplitude', () => {
    const out = meanderRoute(straight, sampleHeight, 3, 0.04, 7)
    const moved = out.slice(1, -1).some((p, i) => p.x !== straight[i + 1]!.x || p.z !== straight[i + 1]!.z)
    expect(moved).toBe(true)
  })

  it('is a no-op when amplitude is 0', () => {
    expect(meanderRoute(straight, sampleHeight, 0, 0.04, 1)).toEqual(straight)
  })

  it('leaves locked crossing anchors exactly where they were', () => {
    const out = meanderRoute(straight, sampleHeight, 3, 0.04, 7, new Set([1]))
    expect(out[1]).toEqual(straight[1])
    expect(out[2]!.x === straight[2]!.x && out[2]!.z === straight[2]!.z).toBe(false)
  })
})

/** Plan world-terrain-023 — a road may only meet canonical river water through
 *  an explicit crossing record. Terrain is flat and dry here so the only thing
 *  the search can react to is the river itself. */
describe('findRoute river-aware crossings', () => {
  const GROUND_H = 10

  function channel(opts: {
    x: number
    waterHalfWidth: number
    channelHalfWidth?: number
    depth?: number
    minZ?: number
    maxZ?: number
  }): RiverChannelSegment {
    const waterH = GROUND_H - 0.4
    const bedH = waterH - (opts.depth ?? 0.4)
    const halfWidth = opts.waterHalfWidth
    const channelHalf = opts.channelHalfWidth ?? halfWidth * 2
    return {
      ax: opts.x,
      az: opts.minZ ?? -400,
      aBedH: bedH,
      aWaterH: waterH,
      aWaterHalfWidth: halfWidth,
      aChannelHalfWidth: channelHalf,
      bx: opts.x,
      bz: opts.maxZ ?? 400,
      bBedH: bedH,
      bWaterH: waterH,
      bWaterHalfWidth: halfWidth,
      bChannelHalfWidth: channelHalf,
    }
  }

  function options(
    riverSegments: RiverChannelSegment[],
    routeKind: 'road' | 'path' = 'road',
  ): RouteSearchOptions {
    return {
      gridStep: 9,
      elevationWeight: 6,
      smoothingWindow: 10,
      meanderAmplitude: 2,
      meanderScale: 0.04,
      seed: 1234,
      sampleHeight: () => GROUND_H,
      sampleMountainRidge: () => 0,
      waterLevel: 0,
      riverSegments,
      routeKind,
      routeId: 'alpha|beta',
    }
  }

  const a = { x: 0, z: 0 }
  const b = { x: 90, z: 0 }
  /** 3 m wide, shallow — narrower than the 9 m A* step, and sitting between
   *  two grid nodes so both of them are dry land. */
  const stream = channel({ x: 49.5, waterHalfWidth: 1.5 })
  /** 16 m wide, 3 m deep — bridge territory, not a raised bar. */
  const bigRiver = channel({ x: 49.5, waterHalfWidth: 8, channelHalfWidth: 11, depth: 3 })

  it('declares a ford for a sub-grid stream both A* nodes miss', () => {
    const route = findRoute(a, b, options([stream]))!
    expect(route).not.toBeNull()
    expect(route.crossings).toHaveLength(1)
    expect(route.crossings[0]!.kind).toBe('ford')
    expect(route.crossings[0]!.x).toBeCloseTo(49.5, 1)
  })

  it('leaves a river-free route completely unchanged', () => {
    const route = findRoute(a, b, options([]))!
    expect(route.crossings).toEqual([])
    expect(route.segments.length).toBeGreaterThan(0)
  })

  it('declares a bridge when a big river has no fordable reach', () => {
    const route = findRoute(a, b, options([bigRiver]))!
    expect(route).not.toBeNull()
    expect(route.crossings).toHaveLength(1)
    expect(route.crossings[0]!.kind).toBe('bridge')
    expect(route.crossings[0]!.waterWidth).toBeCloseTo(16, 6)
  })

  it('prefers a nearby ford over an expensive bridge on the direct line', () => {
    // Same big river, but with a narrow shallow reach a short detour away.
    const fordable = channel({ x: 49.5, waterHalfWidth: 1.5, minZ: 18, maxZ: 45 })
    const route = findRoute(a, b, options([
      channel({ x: 49.5, waterHalfWidth: 8, channelHalfWidth: 11, depth: 3, minZ: -400, maxZ: 18 }),
      fordable,
      channel({ x: 49.5, waterHalfWidth: 8, channelHalfWidth: 11, depth: 3, minZ: 45, maxZ: 400 }),
    ]))!
    expect(route.crossings).toHaveLength(1)
    expect(route.crossings[0]!.kind).toBe('ford')
    expect(route.crossings[0]!.z).toBeGreaterThan(15)
  })

  it('rejects an excessive span rather than producing naked road', () => {
    const huge = channel({ x: 49.5, waterHalfWidth: 20, channelHalfWidth: 40, depth: 4 })
    expect(findRoute(a, b, options([huge]))).toBeNull()
  })

  it('never emits a bridge for a minor-location path (V1 policy)', () => {
    expect(findRoute(a, b, options([bigRiver], 'path'))).toBeNull()
    const path = findRoute(a, b, options([stream], 'path'))!
    expect(path.crossings.map((c) => c.kind)).toEqual(['ford'])
  })

  it('keeps the final meandered polyline bijective with its crossing records', () => {
    const route = findRoute(a, b, options([stream]))!
    // Re-derive the crossing set from the geometry actually shipped: meander
    // and profile smoothing must not have moved it off the declared crossing.
    const rederived = crossingsForPolyline(route.points, [stream], 'road', 'alpha|beta')
    expect(rederived).toEqual(route.crossings)
  })

  it('is deterministic across repeated generation', () => {
    expect(findRoute(a, b, options([stream]))).toEqual(findRoute(a, b, options([stream])))
  })
})
