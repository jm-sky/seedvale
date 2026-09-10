import { describe, expect, it } from 'vitest'
import {
  createPlayerGroundTraceBuffer,
  detectPlayerGroundSnap,
  PLAYER_GROUND_TRACE_CAPACITY,
  PLAYER_GROUND_TRACE_POST_TICKS,
  type PlayerGroundTraceTick,
} from './playerGroundTrace'

function tick(overrides: Partial<PlayerGroundTraceTick> = {}): PlayerGroundTraceTick {
  return {
    seq: 0,
    writer: 'vertical',
    before: { x: 1, y: 2, z: 3 },
    after: { x: 1.1, y: 2.2, z: 3.3 },
    surfaceY: 11,
    raw: { floorY: 1.4, ceilingY: 8, openSky: false },
    lastGroundHit: { floorY: 1.5, ceilingY: 8.1, openSky: false },
    resolved: { floorY: 1.4, ceilingY: 8, openSky: false },
    source: 'cave',
    groundY: 1.4,
    floorY: 1.4,
    ceilingY: 8,
    occupancy: true,
    queryInterior: true,
    groundedBefore: true,
    groundedAfter: true,
    verticalVelocityBefore: 0,
    verticalVelocityAfter: 0,
    caveId: 'cave:test',
    along: -15,
    lateral: 1.2,
    triggerReason: null,
    ...overrides,
  }
}

describe('detectPlayerGroundSnap', () => {
  it('ignores writer:snap teleports even when Y jumps', () => {
    expect(detectPlayerGroundSnap(tick({
      writer: 'snap',
      before: { x: 0, y: 1, z: 0 },
      after: { x: 0, y: 12, z: 0 },
      source: 'surface',
    }), 'cave')).toBeNull()
  })

  it('latches a large upward swim write', () => {
    expect(detectPlayerGroundSnap(tick({
      writer: 'swim',
      before: { x: 114, y: -2.70, z: -16 },
      after: { x: 114, y: 10.62, z: -16 },
      source: 'cave',
      surfaceY: 10.62,
      groundY: -2.64,
    }), 'cave')).toBe('upward-jump')
  })

  it('detects a large upward vertical jump', () => {
    expect(detectPlayerGroundSnap(tick({
      before: { x: 0, y: 1.4, z: 0 },
      after: { x: 0, y: 11.2, z: 0 },
      source: 'cave',
      lastGroundHit: null,
      surfaceY: 11.2,
    }), 'cave')).toBe('upward-jump')
  })

  it('detects cave→surface takeover under large overburden without a Y jump', () => {
    expect(detectPlayerGroundSnap(tick({
      before: { x: 0, y: 1.4, z: 0 },
      after: { x: 0, y: 1.4, z: 0 },
      source: 'surface',
      surfaceY: 11.2,
      lastGroundHit: { floorY: 1.4, ceilingY: 8, openSky: false },
      raw: null,
      resolved: null,
    }), 'cave')).toBe('surface-takeover')
  })

  it('does not treat a mouth-level surface exit as a takeover', () => {
    expect(detectPlayerGroundSnap(tick({
      before: { x: 0, y: 7.4, z: 0 },
      after: { x: 0, y: 7.5, z: 0 },
      source: 'surface',
      surfaceY: 7.6,
      lastGroundHit: { floorY: 7.4, ceilingY: 10, openSky: true },
      raw: null,
    }), 'cave')).toBeNull()
  })

  it('does not latch standing on the outdoor surface after a snap', () => {
    expect(detectPlayerGroundSnap(tick({
      before: { x: 0, y: 11.18, z: 0 },
      after: { x: 0, y: 11.18, z: 0 },
      source: 'surface',
      surfaceY: 11.18,
      raw: null,
      lastGroundHit: null,
      resolved: null,
    }), 'surface')).toBeNull()
  })
})

describe('createPlayerGroundTraceBuffer', () => {
  it('snapshots recorded ticks in insertion order', () => {
    const buffer = createPlayerGroundTraceBuffer(4)
    buffer.record(tick({ before: { x: 0, y: 1, z: 0 }, groundY: 1 }))
    buffer.record(tick({ before: { x: 1, y: 1, z: 0 }, groundY: 2, source: 'hysteresis' }))
    const snap = buffer.snapshot()
    expect(snap.frozen).toBe(false)
    expect(snap.ticks).toHaveLength(2)
    expect(snap.ticks[0]).toMatchObject({ seq: 1, groundY: 1, source: 'cave' })
    expect(snap.ticks[1]).toMatchObject({ seq: 2, groundY: 2, source: 'hysteresis' })
  })

  it('wraps at capacity and keeps the newest ticks', () => {
    const buffer = createPlayerGroundTraceBuffer(3)
    for (let i = 0; i < 5; i++) {
      buffer.record(tick({ groundY: i, after: { x: i, y: 2.2, z: 0 } }))
    }
    const rows = buffer.snapshot().ticks
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.seq)).toEqual([3, 4, 5])
    expect(rows.map((row) => row.groundY)).toEqual([2, 3, 4])
  })

  it('defaults to PLAYER_GROUND_TRACE_CAPACITY', () => {
    const buffer = createPlayerGroundTraceBuffer()
    for (let i = 0; i < PLAYER_GROUND_TRACE_CAPACITY + 5; i++) {
      buffer.record(tick({ groundY: i }))
    }
    const rows = buffer.snapshot().ticks
    expect(rows).toHaveLength(PLAYER_GROUND_TRACE_CAPACITY)
    expect(rows[0]?.seq).toBe(6)
    expect(rows[rows.length - 1]?.seq).toBe(PLAYER_GROUND_TRACE_CAPACITY + 5)
  })

  it('clear empties the ring, resets seq, and unlatches', () => {
    const buffer = createPlayerGroundTraceBuffer(4, 2)
    buffer.record(tick({
      before: { x: 0, y: 1.4, z: 0 },
      after: { x: 0, y: 11.2, z: 0 },
      source: 'surface',
      surfaceY: 11.2,
      raw: null,
      resolved: null,
    }))
    expect(buffer.snapshot().frozen).toBe(true)
    buffer.clear()
    expect(buffer.snapshot()).toEqual({
      frozen: false,
      triggerSeq: null,
      triggerReason: null,
      ticks: [],
    })
    buffer.record(tick({ groundY: 9 }))
    expect(buffer.snapshot()).toEqual({
      frozen: false,
      triggerSeq: null,
      triggerReason: null,
      ticks: [expect.objectContaining({ seq: 1, groundY: 9 })],
    })
  })

  it('snapshot clones so later records and callers cannot mutate stored ticks', () => {
    const buffer = createPlayerGroundTraceBuffer(2)
    buffer.record(tick({
      before: { x: 10, y: 1, z: 20 },
      raw: { floorY: 1, ceilingY: 4, openSky: false },
    }))
    const first = buffer.snapshot()
    first.ticks[0]!.before.y = 99
    first.ticks[0]!.raw!.floorY = 99
    first.ticks[0]!.source = 'surface'
    buffer.record(tick({ source: 'cave', groundY: 1.5, surfaceY: 2 }))
    const second = buffer.snapshot()
    expect(second.ticks[0]).toMatchObject({
      source: 'cave',
      before: { x: 10, y: 1, z: 20 },
      raw: { floorY: 1, ceilingY: 4, openSky: false },
    })
    expect(second.ticks[1]?.source).toBe('cave')
    expect(second.frozen).toBe(false)
  })

  it('latches pre-history plus a few post ticks and ignores later walking', () => {
    const buffer = createPlayerGroundTraceBuffer(8, 3)
    for (let i = 0; i < 4; i++) {
      buffer.record(tick({
        before: { x: i, y: 1.4, z: 0 },
        after: { x: i, y: 1.4, z: 0 },
        groundY: 1.4,
        source: 'cave',
        surfaceY: 11.2,
      }))
    }
    buffer.record(tick({
      before: { x: 4, y: 1.4, z: 0 },
      after: { x: 4, y: 11.2, z: 0 },
      source: 'surface',
      surfaceY: 11.2,
      groundY: 11.2,
      raw: null,
      resolved: null,
      lastGroundHit: { floorY: 1.4, ceilingY: 8, openSky: false },
      occupancy: false,
      queryInterior: false,
    }))
    const atTrigger = buffer.snapshot()
    expect(atTrigger.frozen).toBe(true)
    expect(atTrigger.triggerReason).toBe('upward-jump+surface-takeover')
    expect(atTrigger.triggerSeq).toBe(5)
    expect(atTrigger.ticks.at(-1)).toMatchObject({
      seq: 5,
      triggerReason: 'upward-jump+surface-takeover',
      before: { y: 1.4 },
      after: { y: 11.2 },
      source: 'surface',
    })

    for (let i = 0; i < 20; i++) {
      buffer.record(tick({
        writer: 'vertical',
        before: { x: 5, y: 11.2, z: 0 },
        after: { x: 5, y: 11.2, z: 0 },
        source: 'surface',
        surfaceY: 11.2,
        groundY: 11.2,
        raw: null,
        lastGroundHit: null,
        resolved: null,
        occupancy: false,
        queryInterior: false,
      }))
    }
    const frozen = buffer.snapshot()
    expect(frozen.frozen).toBe(true)
    expect(frozen.triggerSeq).toBe(5)
    expect(frozen.ticks).toHaveLength(4 + 1 + 3)
    expect(frozen.ticks.map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(frozen.ticks.filter((row) => row.triggerReason).map((row) => row.seq)).toEqual([5])
    expect(JSON.parse(JSON.stringify(frozen))).toEqual(frozen)
  })

  it('does not latch a writer:snap teleport onto the surface', () => {
    const buffer = createPlayerGroundTraceBuffer(4, 2)
    buffer.record(tick({
      writer: 'snap',
      before: { x: 0, y: 1, z: 0 },
      after: { x: 0, y: 12, z: 0 },
      source: 'surface',
      surfaceY: 12,
    }))
    expect(buffer.snapshot().frozen).toBe(false)
    buffer.record(tick({ source: 'cave', groundY: 1.4 }))
    expect(buffer.snapshot().ticks).toHaveLength(2)
  })

  it('keeps the default post-window size', () => {
    expect(PLAYER_GROUND_TRACE_POST_TICKS).toBe(10)
  })
})
