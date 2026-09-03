import { describe, expect, it } from 'vitest'
import { createLocationKnowledge } from './locationKnowledge'

describe('createLocationKnowledge', () => {
  it('is empty by default and reveals a new entry', () => {
    const knowledge = createLocationKnowledge()
    expect(knowledge.has('cave:a')).toBe(false)
    expect(knowledge.reveal('cave:a', 'discovered', 'npc')).toBe(true)
    expect(knowledge.has('cave:a')).toBe(true)
    expect(knowledge.get('cave:a')).toEqual({ id: 'cave:a', state: 'discovered', source: 'npc' })
  })

  it('is idempotent: revealing the same state/source again reports no change', () => {
    const knowledge = createLocationKnowledge()
    expect(knowledge.reveal('cave:a', 'discovered', 'npc')).toBe(true)
    expect(knowledge.reveal('cave:a', 'discovered', 'npc')).toBe(false)
    expect(knowledge.list()).toHaveLength(1)
  })

  it('upgrades state forward (estimated -> discovered -> confirmed) but never downgrades', () => {
    const knowledge = createLocationKnowledge()
    knowledge.reveal('cave:a', 'estimated', 'npc')
    expect(knowledge.reveal('cave:a', 'discovered', 'npc')).toBe(true)
    expect(knowledge.get('cave:a')?.state).toBe('discovered')
    expect(knowledge.reveal('cave:a', 'estimated', 'npc')).toBe(false)
    expect(knowledge.get('cave:a')?.state).toBe('discovered')
    expect(knowledge.reveal('cave:a', 'confirmed', 'exploration')).toBe(true)
    expect(knowledge.get('cave:a')).toEqual({ id: 'cave:a', state: 'confirmed', source: 'exploration' })
  })

  it('round-trips serialize/restore', () => {
    const knowledge = createLocationKnowledge()
    knowledge.reveal('cave:a', 'discovered', 'npc')
    knowledge.reveal('lake:1,2', 'confirmed', 'exploration')
    const saved = knowledge.serialize()
    const restored = createLocationKnowledge(saved)
    expect([...restored.list()].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...saved].sort((a, b) => a.id.localeCompare(b.id)),
    )
  })

  it('clear() empties every entry', () => {
    const knowledge = createLocationKnowledge([{ id: 'cave:a', state: 'confirmed', source: 'exploration' }])
    knowledge.clear()
    expect(knowledge.list()).toEqual([])
  })
})
