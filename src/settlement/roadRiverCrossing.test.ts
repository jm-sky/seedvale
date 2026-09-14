import { describe, expect, it } from 'vitest'
import type { RiverChannelSegment } from '../terrain/chunkHeightmap'
import {
  crossingsForPolyline,
  evaluateRoadRiverCrossing,
  riverHitsOnEdge,
  type RoadRiverCrossingFacts,
} from './roadRiverCrossing'

/** Ground is flat and well above water everywhere in these fixtures, so the
 *  only thing routing/classification can react to is the channel itself. */
const GROUND_H = 10

function channel(opts: {
  ax: number
  az: number
  bx: number
  bz: number
  waterHalfWidth: number
  channelHalfWidth?: number
  depth?: number
}): RiverChannelSegment {
  const waterH = GROUND_H - 0.4
  const bedH = waterH - (opts.depth ?? 0.4)
  return {
    ax: opts.ax,
    az: opts.az,
    aBedH: bedH,
    aWaterH: waterH,
    aWaterHalfWidth: opts.waterHalfWidth,
    aChannelHalfWidth: opts.channelHalfWidth ?? opts.waterHalfWidth * 2,
    bx: opts.bx,
    bz: opts.bz,
    bBedH: bedH,
    bWaterH: waterH,
    bWaterHalfWidth: opts.waterHalfWidth,
    bChannelHalfWidth: opts.channelHalfWidth ?? opts.waterHalfWidth * 2,
  }
}

function facts(over: Partial<RoadRiverCrossingFacts> = {}): RoadRiverCrossingFacts {
  return {
    x: 0,
    z: 0,
    angle: 0,
    waterWidth: 3,
    channelWidth: 6,
    waterH: 0,
    naturalBedH: -0.4,
    crossSin: 1,
    span: 6,
    ...over,
  }
}

describe('riverHitsOnEdge', () => {
  /** 3 m wide stream running north→south at x = 49.5 — narrower than the 9 m
   *  A* step that has to notice it. */
  const stream = channel({ ax: 49.5, az: -200, bx: 49.5, bz: 200, waterHalfWidth: 1.5 })

  it('detects a sub-grid-step river even though both edge endpoints are dry', () => {
    const hits = riverHitsOnEdge(45, 0, 54, 0, [stream])
    expect(hits).toHaveLength(1)
    expect(hits[0]!.facts.x).toBeCloseTo(49.5, 6)
    expect(hits[0]!.facts.waterWidth).toBeCloseTo(3, 6)
  })

  it('ignores an edge that stops short of the water', () => {
    expect(riverHitsOnEdge(0, 0, 45, 0, [stream])).toHaveLength(0)
  })

  it('counts a tangent pass that clips a bank, not just a centerline crossing', () => {
    // Runs parallel to the stream, 1 m from its centerline — inside the 1.5 m
    // water half-width, so it is a wet crossing rather than a naked road.
    const hits = riverHitsOnEdge(48.5, -5, 48.5, 5, [stream])
    expect(hits).toHaveLength(1)
  })

  it('leaves a parallel road outside the water footprint alone', () => {
    expect(riverHitsOnEdge(45, -5, 45, 5, [stream])).toHaveLength(0)
  })

  it('measures an oblique crossing as a longer span than a square one', () => {
    const square = riverHitsOnEdge(45, 0, 54, 0, [stream])[0]!
    const oblique = riverHitsOnEdge(40, -9, 58, 9, [stream])[0]!
    expect(oblique.facts.crossSin).toBeLessThan(square.facts.crossSin)
    expect(oblique.facts.span).toBeGreaterThan(square.facts.span)
  })

  it('reports hits in order along the edge', () => {
    const second = channel({ ax: 70, az: -200, bx: 70, bz: 200, waterHalfWidth: 1.5 })
    const hits = riverHitsOnEdge(0, 0, 100, 0, [second, stream])
    expect(hits.map((h) => Math.round(h.facts.x))).toEqual([50, 70])
  })
})

describe('evaluateRoadRiverCrossing', () => {
  it('fords a small shallow stream cheaply', () => {
    const verdict = evaluateRoadRiverCrossing(facts(), 'road')
    expect(verdict.kind).toBe('ford')
  })

  it('never fords a narrow but deep channel — width alone is not enough', () => {
    // Same 3 m water width as the fordable stream above, but 2.5 m deep.
    const deep = evaluateRoadRiverCrossing(facts({ waterH: 0, naturalBedH: -2.5 }), 'road')
    expect(deep.kind).toBe('bridge')
  })

  it('bridges a wide river and prices it far above a ford', () => {
    const ford = evaluateRoadRiverCrossing(facts(), 'road')
    const bridge = evaluateRoadRiverCrossing(
      facts({ waterWidth: 16, channelWidth: 22, span: 22, naturalBedH: -3 }),
      'road',
    )
    expect(bridge.kind).toBe('bridge')
    if (ford.kind === 'reject' || bridge.kind === 'reject') throw new Error('unreachable')
    expect(bridge.cost).toBeGreaterThan(ford.cost * 10)
  })

  it('prices a marginal ford above a comfortable one', () => {
    const easy = evaluateRoadRiverCrossing(facts({ waterWidth: 2 }), 'road')
    const marginal = evaluateRoadRiverCrossing(facts({ waterWidth: 8.5 }), 'road')
    if (easy.kind === 'reject' || marginal.kind === 'reject') throw new Error('unreachable')
    expect(marginal.cost).toBeGreaterThan(easy.cost)
  })

  it('rejects an excessive bridge span outright', () => {
    const verdict = evaluateRoadRiverCrossing(
      facts({ waterWidth: 20, channelWidth: 40, span: 40, naturalBedH: -3 }),
      'road',
    )
    expect(verdict.kind).toBe('reject')
  })

  it('rejects a near-parallel traversal rather than building a causeway', () => {
    const verdict = evaluateRoadRiverCrossing(
      facts({ waterWidth: 16, channelWidth: 22, crossSin: 0.15, span: 22 / 0.15, naturalBedH: -3 }),
      'road',
    )
    expect(verdict.kind).toBe('reject')
  })

  it('never lets a minor-location path request a bridge (V1 policy)', () => {
    const verdict = evaluateRoadRiverCrossing(
      facts({ waterWidth: 16, channelWidth: 22, span: 22, naturalBedH: -3 }),
      'path',
    )
    expect(verdict.kind).toBe('reject')
    // A safe ford on the same path is still fine.
    expect(evaluateRoadRiverCrossing(facts(), 'path').kind).toBe('ford')
  })
})

describe('crossingsForPolyline', () => {
  const stream = channel({ ax: 49.5, az: -200, bx: 49.5, bz: 200, waterHalfWidth: 1.5 })

  it('emits exactly one record per physical traversal, anchor split or not', () => {
    const straight = crossingsForPolyline(
      [{ x: 0, z: 0 }, { x: 100, z: 0 }],
      [stream],
      'road',
      'route',
    )
    const anchored = crossingsForPolyline(
      [{ x: 0, z: 0 }, { x: 49.5, z: 0 }, { x: 100, z: 0 }],
      [stream],
      'road',
      'route',
    )
    expect(straight).toHaveLength(1)
    expect(anchored).toHaveLength(1)
    expect(anchored![0]!.x).toBeCloseTo(49.5, 6)
  })

  it('gives every record a stable id derived from route identity and order', () => {
    const second = channel({ ax: 80, az: -200, bx: 80, bz: 200, waterHalfWidth: 1.5 })
    const crossings = crossingsForPolyline(
      [{ x: 0, z: 0 }, { x: 100, z: 0 }],
      [stream, second],
      'road',
      'alpha|beta',
    )!
    expect(crossings.map((c) => c.id)).toEqual(['alpha|beta#0', 'alpha|beta#1'])
  })

  it('refuses the whole polyline when a crossing is unsupported for its kind', () => {
    const river = channel({
      ax: 49.5,
      az: -200,
      bx: 49.5,
      bz: 200,
      waterHalfWidth: 8,
      channelHalfWidth: 11,
      depth: 3,
    })
    expect(crossingsForPolyline([{ x: 0, z: 0 }, { x: 100, z: 0 }], [river], 'road', 'r'))
      .toHaveLength(1)
    expect(crossingsForPolyline([{ x: 0, z: 0 }, { x: 100, z: 0 }], [river], 'path', 'r'))
      .toBeNull()
  })

  it('has no crossings at all without canonical river geometry', () => {
    expect(crossingsForPolyline([{ x: 0, z: 0 }, { x: 100, z: 0 }], [], 'road', 'r')).toEqual([])
  })
})
