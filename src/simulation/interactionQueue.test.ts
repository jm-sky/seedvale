import { describe, expect, it } from 'vitest'
import {
  createInteractionQueue,
  wellQueueId,
} from './interactionQueue'
import { vec3 } from './types'

function makeQueue(overrides?: Partial<Parameters<typeof createInteractionQueue>[1]>) {
  return createInteractionQueue('s0:well', {
    anchor: vec3(10, 1, 20),
    lineDir: { x: 0, z: 1 },
    servingOffset: 0,
    spacing: 1.2,
    maxVisibleSlots: 4,
    servingCapacity: 1,
    ...overrides,
  })
}

describe('interactionQueue', () => {
  it('wellQueueId namespaces by settlement', () => {
    expect(wellQueueId('3_5')).toBe('3_5:well')
  })

  it('join is FIFO and idempotent', () => {
    const q = makeQueue()
    q.join('a')
    q.join('b')
    q.join('a')
    expect(q.indexOf('a')).toBe(0)
    expect(q.indexOf('b')).toBe(1)
    expect(q.indexOf('c')).toBe(-1)
  })

  it('leave from middle promotes later waiters', () => {
    const q = makeQueue()
    q.join('a')
    q.join('b')
    q.join('c')
    q.leave('b')
    expect(q.indexOf('a')).toBe(0)
    expect(q.indexOf('c')).toBe(1)
    expect(q.isMember('b')).toBe(false)
  })

  it('leave is idempotent', () => {
    const q = makeQueue()
    q.join('a')
    q.leave('a')
    q.leave('a')
    expect(q.isMember('a')).toBe(false)
  })

  it('canEnterServing only for head when capacity free', () => {
    const q = makeQueue()
    q.join('a')
    q.join('b')
    expect(q.canEnterServing('a')).toBe(true)
    expect(q.canEnterServing('b')).toBe(false)
    expect(q.claimServing('a')).toBe(true)
    expect(q.isServing('a')).toBe(true)
    expect(q.canEnterServing('b')).toBe(false)
    q.releaseServing('a')
    expect(q.canEnterServing('b')).toBe(true)
  })

  it('claimServing rejects non-head and respects capacity', () => {
    const q = makeQueue()
    q.join('a')
    q.join('b')
    expect(q.claimServing('b')).toBe(false)
    expect(q.claimServing('a')).toBe(true)
    expect(q.claimServing('b')).toBe(false)
    expect(q.claimServing('a')).toBe(true) // already serving
  })

  it('releaseServing frees capacity for the next head', () => {
    const q = makeQueue()
    q.join('a')
    q.join('b')
    q.claimServing('a')
    q.releaseServing('a')
    expect(q.isServing('a')).toBe(false)
    expect(q.claimServing('b')).toBe(true)
    expect(q.isServing('b')).toBe(true)
  })

  it('worldDestination uses serving point when eligible', () => {
    const q = makeQueue()
    q.join('a')
    q.join('b')
    expect(q.worldDestination('a')).toEqual(vec3(10, 1, 20))
    expect(q.worldDestination('b')).toEqual(vec3(10, 1, 20 + 1.2 * 2))
    q.claimServing('a')
    expect(q.worldDestination('a')).toEqual(vec3(10, 1, 20))
    // b is now head of waiting → eligible → serving point
    expect(q.canEnterServing('b')).toBe(false)
    expect(q.worldDestination('b')).toEqual(vec3(10, 1, 20 + 1.2))
    q.releaseServing('a')
    expect(q.worldDestination('b')).toEqual(vec3(10, 1, 20))
  })

  it('servingOffset keeps the stand clear of the anchor', () => {
    const q = makeQueue({ servingOffset: 1.15, spacing: 1.2 })
    q.join('a')
    q.join('b')
    expect(q.worldDestination('a')).toEqual(vec3(10, 1, 21.15))
    // waiting index 1 → servingOffset + spacing * 2 = 1.15 + 2.4
    expect(q.worldDestination('b')).toEqual(vec3(10, 1, 23.55))
  })

  it('overflow shares the last visible slot', () => {
    const q = makeQueue({ maxVisibleSlots: 2, spacing: 1 })
    q.join('a')
    q.join('b')
    q.join('c')
    q.join('d')
    // a eligible → serving point; b/c/d waiting indices 1/2/3 → slot clamped to 1 → dist 2
    expect(q.worldDestination('a')).toEqual(vec3(10, 1, 20))
    expect(q.worldDestination('b')).toEqual(vec3(10, 1, 22))
    expect(q.worldDestination('c')).toEqual(vec3(10, 1, 22))
    expect(q.worldDestination('d')).toEqual(vec3(10, 1, 22))
  })

  it('servingCapacity > 1 allows parallel serving', () => {
    const q = makeQueue({ servingCapacity: 2 })
    q.join('a')
    q.join('b')
    q.join('c')
    expect(q.claimServing('a')).toBe(true)
    expect(q.claimServing('b')).toBe(true)
    expect(q.claimServing('c')).toBe(false)
    expect(q.isServing('a')).toBe(true)
    expect(q.isServing('b')).toBe(true)
  })

  it('normalizes zero-length lineDir to +Z', () => {
    const q = makeQueue({ lineDir: { x: 0, z: 0 }, spacing: 2 })
    q.join('a')
    q.join('b')
    // a eligible → anchor; b waiting index 1 → dist 2*(1+1)=4
    expect(q.worldDestination('b')).toEqual(vec3(10, 1, 24))
  })
})
