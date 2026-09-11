import { describe, expect, it } from 'vitest'
import {
  classifyMovementBackward,
  createPlayerMovementTraceBuffer,
  findLargestBackwardEvent,
  MOVEMENT_BACKWARD_EPSILON,
  movementBackwardAmount,
  PLAYER_MOVEMENT_TRACE_CAPACITY,
  selectMovementTraceWindow,
} from './playerMovementTrace'

describe('movementBackwardAmount', () => {
  it('is positive when delta opposes intended direction', () => {
    expect(movementBackwardAmount(-0.5, 0, 1, 0)).toBeGreaterThan(0)
    expect(movementBackwardAmount(-0.5, 0, 1, 0)).toBeCloseTo(0.5)
  })

  it('is zero when delta aligns with intended direction', () => {
    expect(movementBackwardAmount(0.3, 0, 1, 0)).toBeCloseTo(-0.3)
  })

  it('returns zero for zero intended movement', () => {
    expect(movementBackwardAmount(1, 0, 0, 0)).toBe(0)
  })
})

describe('classifyMovementBackward', () => {
  it('flags cave-horizontal as worst stage on entrance-directed push', () => {
    const c = classifyMovementBackward({
      slopeDeltaX: 0,
      slopeDeltaZ: 0,
      ordinaryDeltaX: 0,
      ordinaryDeltaZ: 0,
      caveDeltaX: -1.5,
      caveDeltaZ: 0,
      startX: 10,
      startZ: 0,
      finalX: 8.5,
      finalZ: 0,
      intendedX: 0.2,
      intendedZ: 0,
    })
    expect(c.worstStage).toBe('cave-horizontal')
    expect(c.worstBackward).toBeGreaterThan(MOVEMENT_BACKWARD_EPSILON)
    expect(c.backwardCave).toBeCloseTo(1.5)
  })

  it('reports none when all stages are below epsilon', () => {
    const c = classifyMovementBackward({
      slopeDeltaX: 0.001,
      slopeDeltaZ: 0,
      ordinaryDeltaX: 0,
      ordinaryDeltaZ: 0,
      caveDeltaX: 0,
      caveDeltaZ: 0,
      startX: 0,
      startZ: 0,
      finalX: 0.2,
      finalZ: 0,
      intendedX: 0.2,
      intendedZ: 0,
    })
    expect(c.worstStage).toBe('none')
    expect(c.worstBackward).toBe(0)
  })
})

function baseTick(overrides: Record<string, unknown> = {}) {
  return {
    frame: 1,
    startX: 0,
    startY: 1,
    startZ: 0,
    grounded: true,
    verticalVelocity: 0,
    rawWishX: 0.2,
    rawWishZ: 0,
    slopeBeforeX: 0.2,
    slopeBeforeZ: 0,
    slopeAfterX: 0.2,
    slopeAfterZ: 0,
    slopeDeltaX: 0,
    slopeDeltaZ: 0,
    slopeAngleDeg: 10,
    candidateX: 0.2,
    candidateZ: 0,
    ordinaryBeforeX: 0.2,
    ordinaryBeforeZ: 0,
    ordinaryAfterX: 0.2,
    ordinaryAfterZ: 0,
    ordinaryDeltaX: 0,
    ordinaryDeltaZ: 0,
    activeColliderCount: 0,
    influencingCollider: null,
    caveBeforeX: 0.2,
    caveBeforeZ: 0,
    caveAfterX: 0.2,
    caveAfterZ: 0,
    caveDeltaX: 0,
    caveDeltaZ: 0,
    heightfield: null,
    groundSource: 'cave' as const,
    groundY: 1,
    yBeforeVertical: 1,
    yAfterVertical: 1,
    groundedAfter: true,
    verticalVelocityAfter: 0,
    finalX: 0.2,
    finalY: 1,
    finalZ: 0,
    intendedX: 0.2,
    intendedZ: 0,
    ...overrides,
  }
}

describe('createPlayerMovementTraceBuffer', () => {
  it('does not record when tracing is off', () => {
    const buffer = createPlayerMovementTraceBuffer(8)
    buffer.record(baseTick())
    expect(buffer.snapshot().ticks).toHaveLength(0)
  })

  it('records while active and wraps at capacity', () => {
    const buffer = createPlayerMovementTraceBuffer(3)
    buffer.start()
    for (let i = 0; i < 5; i++) {
      buffer.record(baseTick({ finalX: i }))
    }
    buffer.stop()
    const rows = buffer.snapshot().ticks
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.finalX)).toEqual([2, 3, 4])
    expect(rows.every((r) => r.seq > 0)).toBe(true)
  })

  it('defaults to PLAYER_MOVEMENT_TRACE_CAPACITY slots', () => {
    const buffer = createPlayerMovementTraceBuffer()
    buffer.start()
    for (let i = 0; i < PLAYER_MOVEMENT_TRACE_CAPACITY + 3; i++) {
      buffer.record(baseTick({ frame: i }))
    }
    expect(buffer.snapshot().ticks).toHaveLength(PLAYER_MOVEMENT_TRACE_CAPACITY)
  })

  it('clear stops recording and empties ticks', () => {
    const buffer = createPlayerMovementTraceBuffer(4)
    buffer.start()
    buffer.record(baseTick())
    buffer.clear()
    expect(buffer.isRecording()).toBe(false)
    expect(buffer.snapshot().ticks).toEqual([])
  })

  it('printReport highlights the largest backward event', () => {
    const buffer = createPlayerMovementTraceBuffer(20)
    buffer.start()
    buffer.record(baseTick({ finalX: 1, caveDeltaX: 0 }))
    buffer.record(baseTick({
      startX: 5,
      finalX: 3.2,
      finalZ: 0,
      intendedX: 0.2,
      intendedZ: 0,
      caveDeltaX: -1.8,
      caveDeltaZ: 0,
      caveBeforeX: 5,
      caveAfterX: 3.2,
    }))
    buffer.stop()
    const report = buffer.printReport()
    expect(report).toContain('Largest backward event')
    expect(report).toContain('cave-horizontal')
    expect(report).toMatch(/backward: 1\.8/)
  })
})

describe('findLargestBackwardEvent', () => {
  it('picks the tick with max worstBackward', () => {
    const buffer = createPlayerMovementTraceBuffer(10)
    buffer.start()
    buffer.record(baseTick({ caveDeltaX: -0.5, intendedX: 0.2, finalX: -0.3, startX: 0 }))
    buffer.record(baseTick({ caveDeltaX: -2, intendedX: 0.2, finalX: -1.8, startX: 0 }))
    const ticks = buffer.snapshot().ticks
    const event = findLargestBackwardEvent(ticks)
    expect(event?.worstBackward).toBeGreaterThan(1.9)
  })
})

describe('selectMovementTraceWindow', () => {
  it('returns ticks around the center seq', () => {
    const buffer = createPlayerMovementTraceBuffer(20)
    buffer.start()
    for (let i = 0; i < 10; i++) buffer.record(baseTick({ frame: i }))
    const ticks = buffer.snapshot().ticks
    const center = ticks[5]!
    const window = selectMovementTraceWindow(ticks, center.seq, 2, 1)
    expect(window.map((t) => t.seq)).toEqual([4, 5, 6, 7].map((i) => ticks[i - 1]!.seq))
  })
})
