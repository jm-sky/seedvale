import { describe, expect, it } from 'vitest'
import type { NpcPlayerFollowUp } from '../../ai/npcPlayerFollowUp'
import type { WorldLocation } from './worldLocationTypes'
import { createLocationKnowledge } from './locationKnowledge'
import { deliverNpcWorldKnowledgeFollowUp } from './npcPlayerFollowUpDelivery'

function loc(id: string): WorldLocation {
  return { id, kind: 'cemetery', x: 1, z: 2, name: id, discoveryWeight: 0.5 }
}

function host(followUp: NpcPlayerFollowUp | null) {
  return { playerFollowUp: followUp, health: { dead: false }, postDeath: null }
}

const FOLLOW_UP: NpcPlayerFollowUp = {
  kind: 'deliver_world_knowledge',
  id: 'followUp:1',
  createdAtDays: 1,
  source: { kind: 'guard' },
  selectedLocationIds: ['a', 'b', 'gone'],
}

describe('deliverNpcWorldKnowledgeFollowUp', () => {
  it('reveals only the valid locations exactly once and consumes the follow-up', () => {
    const knowledge = createLocationKnowledge()
    const state = host({ ...FOLLOW_UP, selectedLocationIds: [...FOLLOW_UP.selectedLocationIds] })
    const line = deliverNpcWorldKnowledgeFollowUp(
      { getLocation: (id) => (id === 'gone' ? null : loc(id)), locationKnowledge: knowledge },
      state,
      FOLLOW_UP.id,
    )
    expect(line).not.toBeNull()
    expect(knowledge.has('a')).toBe(true)
    expect(knowledge.has('b')).toBe(true)
    expect(knowledge.has('gone')).toBe(false)
    expect(state.playerFollowUp).toBeNull()
  })

  it('is idempotent — a repeated call with the same (now consumed) id is a harmless no-op', () => {
    const knowledge = createLocationKnowledge()
    const state = host({ ...FOLLOW_UP })
    const deps = { getLocation: (id: string) => loc(id), locationKnowledge: knowledge }
    deliverNpcWorldKnowledgeFollowUp(deps, state, FOLLOW_UP.id)
    const revealedCount = knowledge.list().length
    expect(deliverNpcWorldKnowledgeFollowUp(deps, state, FOLLOW_UP.id)).toBeNull()
    expect(knowledge.list()).toHaveLength(revealedCount)
  })

  it('rejects a stale/mismatched follow-up id without touching state', () => {
    const knowledge = createLocationKnowledge()
    const state = host({ ...FOLLOW_UP })
    const result = deliverNpcWorldKnowledgeFollowUp(
      { getLocation: (id) => loc(id), locationKnowledge: knowledge },
      state,
      'some-other-id',
    )
    expect(result).toBeNull()
    expect(state.playerFollowUp).not.toBeNull()
    expect(knowledge.list()).toHaveLength(0)
  })

  it('never invents knowledge when every stored location id is now invalid', () => {
    const knowledge = createLocationKnowledge()
    const state = host({ ...FOLLOW_UP, selectedLocationIds: ['gone-1', 'gone-2'] })
    const line = deliverNpcWorldKnowledgeFollowUp(
      { getLocation: () => null, locationKnowledge: knowledge },
      state,
      FOLLOW_UP.id,
    )
    expect(line).not.toBeNull()
    expect(knowledge.list()).toHaveLength(0)
    expect(state.playerFollowUp).toBeNull()
  })
})
