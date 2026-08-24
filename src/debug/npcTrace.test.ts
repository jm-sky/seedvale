import { describe, expect, it } from 'vitest'
import { createNpcTraceBuffer, type NpcTraceEvent } from './npcTrace'

function needEvent(simTime: number): NpcTraceEvent {
  return { simTime, type: 'need.selected', need: 'water', pressures: [] }
}

describe('createNpcTraceBuffer', () => {
  it('returns an empty history for a fresh buffer', () => {
    const buffer = createNpcTraceBuffer(3)
    expect(buffer.history()).toEqual([])
  })

  it('returns events in chronological order under capacity', () => {
    const buffer = createNpcTraceBuffer(5)
    buffer.record(needEvent(1))
    buffer.record(needEvent(2))
    buffer.record(needEvent(3))
    expect(buffer.history().map((e) => e.simTime)).toEqual([1, 2, 3])
  })

  it('never exceeds its configured capacity', () => {
    const buffer = createNpcTraceBuffer(3)
    for (let i = 0; i < 10; i++) buffer.record(needEvent(i))
    expect(buffer.history()).toHaveLength(3)
  })

  it('discards the oldest event deterministically once full', () => {
    const buffer = createNpcTraceBuffer(3)
    buffer.record(needEvent(1))
    buffer.record(needEvent(2))
    buffer.record(needEvent(3))
    buffer.record(needEvent(4))
    // 1 discarded — oldest remaining is 2, newest is 4.
    expect(buffer.history().map((e) => e.simTime)).toEqual([2, 3, 4])
    buffer.record(needEvent(5))
    expect(buffer.history().map((e) => e.simTime)).toEqual([3, 4, 5])
  })

  it('returns a fresh array each call that cannot mutate the buffer', () => {
    const buffer = createNpcTraceBuffer(3)
    buffer.record(needEvent(1))
    const first = buffer.history()
    ;(first as NpcTraceEvent[]).push(needEvent(99))
    expect(buffer.history()).toHaveLength(1)
    expect(buffer.history()).not.toBe(first)
  })
})
