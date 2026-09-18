import { describe, expect, it } from 'vitest'
import {
  armNpcPlayerFollowUp,
  cloneNpcPlayerFollowUp,
  consumeNpcPlayerFollowUp,
  type NpcPlayerFollowUp,
} from './npcPlayerFollowUp'

function host(overrides: { dead?: boolean, postDeath?: unknown } = {}) {
  return {
    playerFollowUp: null as NpcPlayerFollowUp | null,
    health: { dead: overrides.dead ?? false },
    postDeath: overrides.postDeath ?? null,
  }
}

const PAYLOAD = {
  kind: 'deliver_world_knowledge' as const,
  createdAtDays: 3,
  source: { kind: 'guard' as const },
  selectedLocationIds: ['cemetery:a:1', 'ruins:b:2'],
}

describe('armNpcPlayerFollowUp', () => {
  it('arms exactly one follow-up for the intended NPC', () => {
    const state = host()
    const armed = armNpcPlayerFollowUp(state, PAYLOAD, 'npc:1')
    expect(armed).not.toBeNull()
    expect(state.playerFollowUp).toEqual(armed)
    expect(armed?.selectedLocationIds).toEqual(PAYLOAD.selectedLocationIds)
  })

  it('is idempotent — a second arm call never replaces or duplicates it', () => {
    const state = host()
    const first = armNpcPlayerFollowUp(state, PAYLOAD, 'npc:1')
    const second = armNpcPlayerFollowUp(state, { ...PAYLOAD, selectedLocationIds: ['different:1'] }, 'npc:1')
    expect(second).toEqual(first)
    expect(state.playerFollowUp?.selectedLocationIds).toEqual(PAYLOAD.selectedLocationIds)
  })

  it('refuses to arm a dead or terminal NPC', () => {
    expect(armNpcPlayerFollowUp(host({ dead: true }), PAYLOAD, 'npc:1')).toBeNull()
    expect(armNpcPlayerFollowUp(host({ postDeath: { status: 'active' } }), PAYLOAD, 'npc:1')).toBeNull()
  })

  it('does not retain the caller-owned selectedLocationIds array identity', () => {
    const ids = [...PAYLOAD.selectedLocationIds]
    const state = host()
    const armed = armNpcPlayerFollowUp(state, { ...PAYLOAD, selectedLocationIds: ids }, 'npc:1')
    ids.push('mutated:1')
    expect(armed?.selectedLocationIds).toEqual(PAYLOAD.selectedLocationIds)
  })
})

describe('consumeNpcPlayerFollowUp', () => {
  it('clears the follow-up only when the id matches, and is idempotent after', () => {
    const state = host()
    const armed = armNpcPlayerFollowUp(state, PAYLOAD, 'npc:1')!
    expect(consumeNpcPlayerFollowUp(state, 'stale-id')).toBe(false)
    expect(state.playerFollowUp).toEqual(armed)
    expect(consumeNpcPlayerFollowUp(state, armed.id)).toBe(true)
    expect(state.playerFollowUp).toBeNull()
    expect(consumeNpcPlayerFollowUp(state, armed.id)).toBe(false)
  })
})

describe('cloneNpcPlayerFollowUp', () => {
  it('deep-clones without sharing array identity, and passes null through', () => {
    const followUp: NpcPlayerFollowUp = {
      kind: 'deliver_world_knowledge',
      id: 'x',
      createdAtDays: 1,
      source: { kind: 'hunter' },
      selectedLocationIds: ['a', 'b'],
    }
    const clone = cloneNpcPlayerFollowUp(followUp)
    expect(clone).toEqual(followUp)
    expect(clone).not.toBe(followUp)
    expect(clone?.selectedLocationIds).not.toBe(followUp.selectedLocationIds)
    expect(cloneNpcPlayerFollowUp(null)).toBeNull()
  })
})
