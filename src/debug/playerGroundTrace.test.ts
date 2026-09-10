import { describe, expect, it } from 'vitest'
import {
  createPlayerGroundTraceBuffer,
  PLAYER_GROUND_TRACE_CAPACITY,
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
    ...overrides,
  }
}

describe('createPlayerGroundTraceBuffer', () => {
  it('snapshots recorded ticks in insertion order', () => {
    const buffer = createPlayerGroundTraceBuffer(4)
    buffer.record(tick({ before: { x: 0, y: 1, z: 0 }, groundY: 1 }))
    buffer.record(tick({ before: { x: 1, y: 1, z: 0 }, groundY: 2, source: 'hysteresis' }))
    const rows = buffer.snapshot()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ seq: 1, groundY: 1, source: 'cave' })
    expect(rows[1]).toMatchObject({ seq: 2, groundY: 2, source: 'hysteresis' })
  })

  it('wraps at capacity and keeps the newest ticks', () => {
    const buffer = createPlayerGroundTraceBuffer(3)
    for (let i = 0; i < 5; i++) {
      buffer.record(tick({ groundY: i, after: { x: i, y: i, z: 0 } }))
    }
    const rows = buffer.snapshot()
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.seq)).toEqual([3, 4, 5])
    expect(rows.map((row) => row.groundY)).toEqual([2, 3, 4])
  })

  it('defaults to PLAYER_GROUND_TRACE_CAPACITY', () => {
    const buffer = createPlayerGroundTraceBuffer()
    for (let i = 0; i < PLAYER_GROUND_TRACE_CAPACITY + 5; i++) {
      buffer.record(tick({ groundY: i }))
    }
    const rows = buffer.snapshot()
    expect(rows).toHaveLength(PLAYER_GROUND_TRACE_CAPACITY)
    expect(rows[0]?.seq).toBe(6)
    expect(rows[rows.length - 1]?.seq).toBe(PLAYER_GROUND_TRACE_CAPACITY + 5)
  })

  it('clear empties the ring and resets seq', () => {
    const buffer = createPlayerGroundTraceBuffer(4)
    buffer.record(tick())
    buffer.record(tick())
    buffer.clear()
    expect(buffer.snapshot()).toEqual([])
    buffer.record(tick({ groundY: 9 }))
    expect(buffer.snapshot()).toEqual([
      expect.objectContaining({ seq: 1, groundY: 9 }),
    ])
  })

  it('snapshot clones so later records and callers cannot mutate stored ticks', () => {
    const buffer = createPlayerGroundTraceBuffer(2)
    buffer.record(tick({
      before: { x: 10, y: 1, z: 20 },
      raw: { floorY: 1, ceilingY: 4, openSky: false },
    }))
    const first = buffer.snapshot()
    first[0]!.before.y = 99
    first[0]!.raw!.floorY = 99
    first[0]!.source = 'surface'
    buffer.record(tick({ source: 'surface', groundY: 11 }))
    const second = buffer.snapshot()
    expect(second[0]).toMatchObject({
      source: 'cave',
      before: { x: 10, y: 1, z: 20 },
      raw: { floorY: 1, ceilingY: 4, openSky: false },
    })
    expect(second[1]?.source).toBe('surface')
  })
})
