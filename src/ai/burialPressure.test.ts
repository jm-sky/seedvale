import { describe, expect, it } from 'vitest'
import { createNpcRelationships } from '../settlement/npcRelationships'
import {
  claimNpcCorpseForBurial,
  createActiveNpcPostDeath,
  createLegacyTerminalNpcPostDeath,
} from '../settlement/npcPostDeath'
import { createNpcAuthoritativeState } from '../settlement/npcState'
import { damageHealth } from '../shared/HealthState'
import { pickActionKind } from '../simulation'
import type { NpcDecisionTarget } from './weatherPressure'
import { createBurialPlan } from './npcPlan'
import { resolveBurialPressure } from './burialPressure'

function makeState(id: string, opts?: { dead?: boolean, postDeath?: ReturnType<typeof createActiveNpcPostDeath> }) {
  const state = createNpcAuthoritativeState(id, 0)
  if (opts?.dead) damageHealth(state.health, state.health.maxHp)
  if (opts?.postDeath) state.postDeath = opts.postDeath
  return state
}

describe('resolveBurialPressure (plan npc-011)', () => {
  it('does not require a fake NeedId in arbitration', () => {
    const deceased = makeState('0_0:npc:0', {
      dead: true,
      postDeath: createActiveNpcPostDeath({ x: 5, z: 5, yaw: 0, deathAtDays: 1, loot: { counts: {}, instances: [] } }),
    })
    const claimant = makeState('0_0:npc:1')
    const relations = createNpcRelationships()
    const pressure = resolveBurialPressure({
      claimantId: '0_0:npc:1',
      claimantHouseholdId: '0_0:household:0',
      claimantPosition: { x: 0, z: 0 },
      settlementPrefix: '0_0',
      npcStates: { '0_0:npc:0': deceased, '0_0:npc:1': claimant },
      npcHouseholdId: (id) => (id === '0_0:npc:0' || id === '0_0:npc:1' ? '0_0:household:0' : null),
      relations,
      graves: { hasForDeceased: () => false } as never,
      activePlan: null,
      nowDays: 1.1,
    })
    expect(pressure.score).toBeGreaterThan(0)
    expect(pressure.deceasedNpcId).toBe('0_0:npc:0')
    const winner = pickActionKind<NpcDecisionTarget>(
      [{ kind: 'idle', score: 0.1 }, { kind: 'buryDeceased', score: pressure.score }],
      'idle',
    )
    expect(winner).toBe('buryDeceased')
  })

  it('ignores corpses without household or relationship context', () => {
    const deceased = makeState('0_0:npc:0', {
      dead: true,
      postDeath: createActiveNpcPostDeath({ x: 5, z: 5, yaw: 0, deathAtDays: 1, loot: { counts: {}, instances: [] } }),
    })
    const claimant = makeState('0_0:npc:1')
    const pressure = resolveBurialPressure({
      claimantId: '0_0:npc:1',
      claimantHouseholdId: '0_0:household:1',
      claimantPosition: { x: 0, z: 0 },
      settlementPrefix: '0_0',
      npcStates: { '0_0:npc:0': deceased, '0_0:npc:1': claimant },
      npcHouseholdId: (id) => (id === '0_0:npc:1' ? '0_0:household:1' : '0_0:household:0'),
      relations: createNpcRelationships(),
      graves: { hasForDeceased: () => false } as never,
      activePlan: null,
      nowDays: 1.1,
    })
    expect(pressure.score).toBe(0)
    expect(pressure.deceasedNpcId).toBeNull()
  })

  it('allows only one claimant to hold an active burial claim', () => {
    const post = createActiveNpcPostDeath({ x: 1, z: 2, yaw: 0, deathAtDays: 0, loot: { counts: {}, instances: [] } })
    expect(claimNpcCorpseForBurial(post, 'a')).toBe(true)
    expect(claimNpcCorpseForBurial(post, 'b')).toBe(false)
    expect(claimNpcCorpseForBurial(post, 'a')).toBe(true)
  })

  it('does not fabricate burial pressure for legacy terminal dead without corpse', () => {
    const deceased = makeState('0_0:npc:0', { dead: true, postDeath: createLegacyTerminalNpcPostDeath() })
    const pressure = resolveBurialPressure({
      claimantId: '0_0:npc:1',
      claimantHouseholdId: '0_0:household:0',
      claimantPosition: { x: 0, z: 0 },
      settlementPrefix: '0_0',
      npcStates: { '0_0:npc:0': deceased },
      npcHouseholdId: () => '0_0:household:0',
      relations: createNpcRelationships(),
      graves: { hasForDeceased: () => false } as never,
      activePlan: null,
      nowDays: 10,
    })
    expect(pressure.score).toBe(0)
  })

  it('resumes stale claims only when the claimant still has a matching burial plan', () => {
    const post = createActiveNpcPostDeath({ x: 0, z: 0, yaw: 0, deathAtDays: 0, loot: { counts: {}, instances: [] } })
    claimNpcCorpseForBurial(post, '0_0:npc:1')
    const pressureWithPlan = resolveBurialPressure({
      claimantId: '0_0:npc:1',
      claimantHouseholdId: '0_0:household:0',
      claimantPosition: { x: 0, z: 0 },
      settlementPrefix: '0_0',
      npcStates: {
        '0_0:npc:0': makeState('0_0:npc:0', { dead: true, postDeath: post }),
        '0_0:npc:1': makeState('0_0:npc:1'),
      },
      npcHouseholdId: () => '0_0:household:0',
      relations: createNpcRelationships(),
      graves: { hasForDeceased: () => false } as never,
      activePlan: createBurialPlan('0_0:npc:0'),
      nowDays: 0.1,
    })
    expect(pressureWithPlan.score).toBeGreaterThan(0)
  })
})
