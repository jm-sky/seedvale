import { describe, expect, it } from 'vitest'
import { createBoundedHistoryBuffer, createSequenceAllocator, filterHistory } from './domainHistory'

type FakeEvent = { simTime: number, type: string }

function event(simTime: number, type = 'test.event'): FakeEvent {
  return { simTime, type }
}

describe('createBoundedHistoryBuffer', () => {
  it('returns an empty history for a fresh buffer', () => {
    const buffer = createBoundedHistoryBuffer<FakeEvent>(3)
    expect(buffer.history()).toEqual([])
  })

  it('returns entries in insertion order under capacity', () => {
    const buffer = createBoundedHistoryBuffer<FakeEvent>(5)
    buffer.record(event(1))
    buffer.record(event(2))
    buffer.record(event(3))
    expect(buffer.history().map((e) => e.simTime)).toEqual([1, 2, 3])
  })

  it('never exceeds its configured capacity and discards the oldest deterministically', () => {
    const buffer = createBoundedHistoryBuffer<FakeEvent>(3)
    for (let i = 1; i <= 10; i++) buffer.record(event(i))
    expect(buffer.history()).toHaveLength(3)
    expect(buffer.history().map((e) => e.simTime)).toEqual([8, 9, 10])
  })

  it('returns a fresh array each call that cannot mutate the buffer', () => {
    const buffer = createBoundedHistoryBuffer<FakeEvent>(3)
    buffer.record(event(1))
    const first = buffer.history()
    ;(first as FakeEvent[]).push(event(99))
    expect(buffer.history()).toHaveLength(1)
    expect(buffer.history()).not.toBe(first)
  })
})

describe('createSequenceAllocator', () => {
  it('is monotonic starting at 0 and never repeats', () => {
    const seq = createSequenceAllocator()
    expect(seq.next()).toBe(0)
    expect(seq.next()).toBe(1)
    expect(seq.next()).toBe(2)
  })

  it('two allocators are independent', () => {
    const a = createSequenceAllocator()
    const b = createSequenceAllocator()
    expect(a.next()).toBe(0)
    expect(a.next()).toBe(1)
    expect(b.next()).toBe(0)
  })
})

describe('filterHistory', () => {
  const items: FakeEvent[] = [
    event(1, 'a'),
    event(2, 'b'),
    event(3, 'a'),
    event(4, 'c'),
    event(5, 'a'),
  ]

  it('returns everything with no filter', () => {
    expect(filterHistory(items)).toEqual(items)
  })

  it('filters by since (inclusive)', () => {
    expect(filterHistory(items, { since: 3 }).map((e) => e.simTime)).toEqual([3, 4, 5])
  })

  it('filters by types', () => {
    expect(filterHistory(items, { types: ['a'] }).map((e) => e.simTime)).toEqual([1, 3, 5])
  })

  it('an empty types array is treated as no filter', () => {
    expect(filterHistory(items, { types: [] })).toEqual(items)
  })

  it('limit keeps the most recent entries (the tail)', () => {
    expect(filterHistory(items, { limit: 2 }).map((e) => e.simTime)).toEqual([4, 5])
  })

  it('a limit not smaller than the result is a no-op', () => {
    expect(filterHistory(items, { limit: 100 })).toEqual(items)
  })

  it('combines since/types/limit', () => {
    expect(filterHistory(items, { since: 2, types: ['a'], limit: 1 }).map((e) => e.simTime)).toEqual([5])
  })
})
