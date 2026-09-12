import { describe, expect, it } from 'vitest'
import { createNpcAuthoritativeState } from '../settlement/npcState'
import {
  cloneNpcAccompanyCommitment,
  endNpcAccompanyCommitment,
  setNpcAccompanyMode,
  startNpcAccompanyCommitment,
} from './npcAccompanyCommitment'

describe('npcAccompanyCommitment lifecycle', () => {
  it('starts a follow commitment and clones as plain data', () => {
    const state = createNpcAuthoritativeState('npc:0', 0)
    const result = startNpcAccompanyCommitment(state, {
      source: { kind: 'voluntary' },
      startedAtDays: 3.5,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(state.accompanyCommitment).toEqual({
      target: { kind: 'player' },
      source: { kind: 'voluntary' },
      mode: 'follow',
      stayAnchor: undefined,
      startedAtDays: 3.5,
    })
    const cloned = cloneNpcAccompanyCommitment(state.accompanyCommitment)
    expect(cloned).toEqual(state.accompanyCommitment)
    expect(cloned).not.toBe(state.accompanyCommitment)
    expect(cloned?.source).not.toBe(state.accompanyCommitment?.source)
  })

  it('switches follow ↔ stay on the same commitment and records the stay anchor once', () => {
    const state = createNpcAuthoritativeState('npc:0', 0)
    startNpcAccompanyCommitment(state, {
      source: { kind: 'voluntary' },
      startedAtDays: 1,
    })
    const first = state.accompanyCommitment
    expect(setNpcAccompanyMode(state, 'stay', { x: 4, y: 1, z: 7 })).toBe(true)
    expect(state.accompanyCommitment).toBe(first)
    expect(state.accompanyCommitment?.mode).toBe('stay')
    expect(state.accompanyCommitment?.stayAnchor).toEqual({ x: 4, y: 1, z: 7 })
    expect(setNpcAccompanyMode(state, 'follow')).toBe(true)
    expect(state.accompanyCommitment).toBe(first)
    expect(state.accompanyCommitment?.mode).toBe('follow')
    expect(state.accompanyCommitment?.stayAnchor).toBeUndefined()
  })

  it('rejects a second commitment, stay without an anchor, death, and incompatible work', () => {
    const state = createNpcAuthoritativeState('npc:0', 0)
    expect(startNpcAccompanyCommitment(state, {
      source: { kind: 'voluntary' },
      startedAtDays: 1,
      mode: 'stay',
    }).ok).toBe(false)

    const first = startNpcAccompanyCommitment(state, {
      source: { kind: 'voluntary' },
      startedAtDays: 1,
    })
    expect(first.ok).toBe(true)
    expect(startNpcAccompanyCommitment(state, {
      source: { kind: 'voluntary' },
      startedAtDays: 2,
    })).toEqual({ ok: false, reason: 'already-active' })
    endNpcAccompanyCommitment(state, 'cancelled')

    expect(startNpcAccompanyCommitment(state, {
      source: { kind: 'voluntary' },
      startedAtDays: 1,
    }, { activeWorkContractId: 'work:1' })).toEqual({ ok: false, reason: 'incompatible-work' })

    expect(startNpcAccompanyCommitment(state, {
      source: { kind: 'work-contract', contractId: 'work:1' },
      startedAtDays: 1,
    }, { activeWorkContractId: 'work:1' }).ok).toBe(true)
    endNpcAccompanyCommitment(state, 'cancelled')

    state.health.dead = true
    expect(startNpcAccompanyCommitment(state, {
      source: { kind: 'voluntary' },
      startedAtDays: 1,
    })).toEqual({ ok: false, reason: 'dead' })
  })

  it('ends the commitment immediately and is idempotent, including death cleanup', () => {
    const state = createNpcAuthoritativeState('npc:0', 0)
    startNpcAccompanyCommitment(state, {
      source: { kind: 'voluntary' },
      startedAtDays: 1,
    })
    expect(endNpcAccompanyCommitment(state, 'cancelled')).toBe(true)
    expect(state.accompanyCommitment).toBeNull()
    expect(endNpcAccompanyCommitment(state, 'cancelled')).toBe(false)
    startNpcAccompanyCommitment(state, {
      source: { kind: 'voluntary' },
      startedAtDays: 2,
    })
    expect(endNpcAccompanyCommitment(state, 'death')).toBe(true)
    expect(endNpcAccompanyCommitment(state, 'death')).toBe(false)
    expect(state.accompanyCommitment).toBeNull()
  })
})
