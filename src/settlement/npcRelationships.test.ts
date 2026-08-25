import { describe, expect, it } from 'vitest'
import { createNpcRelationships } from './npcRelationships'

describe('createNpcRelationships', () => {
  it('unknown pairs start at 0', () => {
    const relations = createNpcRelationships()
    expect(relations.get('a', 'b')).toBe(0)
  })

  it('adjust is symmetric — get(a, b) === get(b, a)', () => {
    const relations = createNpcRelationships()
    relations.adjust('a', 'b', 1)
    expect(relations.get('a', 'b')).toBe(1)
    expect(relations.get('b', 'a')).toBe(1)
  })

  it('accumulates across multiple adjustments, including negative deltas', () => {
    const relations = createNpcRelationships()
    relations.adjust('a', 'b', 1)
    relations.adjust('b', 'a', 1)
    relations.adjust('a', 'b', -1)
    expect(relations.get('a', 'b')).toBe(1)
  })

  it('keeps different pairs independent', () => {
    const relations = createNpcRelationships()
    relations.adjust('a', 'b', 2)
    expect(relations.get('a', 'c')).toBe(0)
    expect(relations.get('b', 'c')).toBe(0)
  })
})
