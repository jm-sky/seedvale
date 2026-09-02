import { describe, expect, it } from 'vitest'
import { classifyPendingActivity, promoteChainKind } from './NpcAgent'

describe('classifyPendingActivity / promoteChainKind', () => {
  it('reports work for a plain work action', () => {
    expect(classifyPendingActivity({ kind: 'work' }, 'idle')).toBe('work')
  })

  it('reports work for the mine leg of ore gathering', () => {
    expect(classifyPendingActivity({ kind: 'mine' }, 'idle')).toBe('work')
  })

  it('reports work for the deposit leg after mine (ore-deliver)', () => {
    // Mirrors NpcAgent's `execute` phase promotion: `next.chainKind` is set
    // from `promoteChainKind(parent)` when the `mine` leg completes and
    // `deposit` becomes the pending action.
    const mineLeg = { kind: 'mine' } as const
    const depositLeg = { kind: 'deposit', chainKind: promoteChainKind(mineLeg) } as const
    expect(classifyPendingActivity(depositLeg, 'idle')).toBe('work')
  })

  it('still reports the active need for the deposit leg after a need-driven chop', () => {
    const chopLeg = { kind: 'chop' } as const
    const depositLeg = { kind: 'deposit', chainKind: promoteChainKind(chopLeg) } as const
    expect(classifyPendingActivity(depositLeg, 'wood')).toEqual('need')
  })

  it('reports eat only when driven by the idle-schedule eat routine, not a need', () => {
    expect(classifyPendingActivity({ kind: 'eat' }, 'idle')).toBe('eat')
    expect(classifyPendingActivity({ kind: 'eat' }, 'food')).toBe('need')
  })

  it('reports need for a plain need-driven action (e.g. drink)', () => {
    expect(classifyPendingActivity({ kind: 'drink' }, 'water')).toBe('need')
  })

  it('reports talking for an in-flight conversation (plan 151)', () => {
    expect(classifyPendingActivity({ kind: 'conversation' }, 'idle')).toBe('talking')
  })

  it('reports idle for the social settle-at-campfire marker', () => {
    expect(classifyPendingActivity({ kind: 'social' }, 'idle')).toBe('idle')
  })

  it('reports idle for the weather seekShelter reaction (plan npc-012)', () => {
    expect(classifyPendingActivity({ kind: 'shelter' }, 'idle')).toBe('idle')
  })

  it('reports idle when there is no pending action', () => {
    expect(classifyPendingActivity(undefined, 'idle')).toBe('idle')
  })

  it('promoteChainKind inherits the root kind across a multi-hop chain', () => {
    const root = { kind: 'mine' } as const
    const leg2 = { kind: 'deposit', chainKind: promoteChainKind(root) } as const
    // A hypothetical third leg should still resolve to the chain's root, not `deposit`.
    expect(promoteChainKind(leg2)).toBe('mine')
  })
})
