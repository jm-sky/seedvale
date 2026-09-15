import { describe, expect, it } from 'vitest'
import type { Role } from '../ai/characters'
import type { FamilyMember } from '../settlement/families'
import { personalityForIndex } from '../ai/dialogue'
import { settlementNpcId } from '../settlement/npcIdentity'
import { createNpcAuthoritativeState, type NpcAuthoritativeState } from '../settlement/npcState'
import { createExpeditionAssignments } from './createExpeditionAssignments'
import {
  canDispatchParty,
  commitExpeditionParty,
  type ExpeditionPartyLookups,
  listExpeditionCandidates,
} from './expeditionParty'

const destination = { kind: 'location' as const, locationId: 'abandoned-mine' }

function member(
  name: string,
  gender: 'male' | 'female',
  age: number,
  role: Role,
  relation: FamilyMember['relation'] = 'husband',
): FamilyMember {
  return {
    name,
    lastName: 'Test',
    relation,
    character: {
      name,
      lastName: 'Test',
      gender,
      role,
      personality: personalityForIndex(0),
      traits: [],
    },
    scale: age < 18 ? 0.7 : 1,
    age,
  }
}

function lookups(
  states: Record<string, NpcAuthoritativeState> = {},
  extras: Partial<ExpeditionPartyLookups> = {},
): ExpeditionPartyLookups {
  return {
    getNpcState: (id) => states[id],
    findActiveWorkByNpc: () => undefined,
    findByCarrier: () => undefined,
    ...extras,
  }
}

describe('expeditionParty', () => {
  it('ranks miner 18–35 above other males and uses member order as tie-break', () => {
    const def = {
      id: '0_0',
      families: [
        {
          id: 'family-1',
          members: [
            member('Older', 'male', 40, 'farmer'),
            member('YoungA', 'male', 22, 'farmer'),
            member('Miner', 'male', 30, 'miner'),
            member('YoungB', 'male', 22, 'guard'),
          ],
        },
      ],
    }
    const ranked = listExpeditionCandidates(def, lookups(), createExpeditionAssignments())
    expect(ranked.map((row) => row.member.name)).toEqual(['Miner', 'YoungA', 'YoungB', 'Older'])
    expect(ranked.map((row) => row.tier)).toEqual([1, 2, 2, 3])
  })

  it('filters children, reserved families, dead NPCs, and conflicting commitments', () => {
    const def = {
      id: '0_0',
      families: [
        { id: 'family-reserved-0', members: [member('Piotr', 'male', 30, 'miner')] },
        {
          id: 'family-1',
          members: [
            member('Child', 'male', 12, 'farmer', 'child'),
            member('Dead', 'male', 28, 'miner'),
            member('Busy', 'male', 24, 'miner'),
            member('Free', 'male', 26, 'miner'),
            member('Woman', 'female', 24, 'miner'),
            member('Plan', 'male', 25, 'miner'),
          ],
        },
      ],
    }
    const deadId = settlementNpcId(def.id, 2)
    const busyId = settlementNpcId(def.id, 3)
    const planId = settlementNpcId(def.id, 6)
    const dead = createNpcAuthoritativeState(deadId, 0)
    dead.health.dead = true
    const busy = createNpcAuthoritativeState(busyId, 0)
    const plan = createNpcAuthoritativeState(planId, 0)
    plan.activePlan = {
      goal: 'secureWater',
      strategy: null,
      state: 'active',
      progress: { amount: 0 },
      currentStep: 'findNextTarget',
    }
    const ranked = listExpeditionCandidates(def, lookups({
      [deadId]: dead,
      [busyId]: busy,
      [planId]: plan,
    }, {
      findActiveWorkByNpc: (id) => (id === busyId ? { contract: {}, assignment: {} } : undefined),
    }), createExpeditionAssignments())
    expect(ranked.map((row) => row.member.name)).toEqual(['Free', 'Plan'])
  })

  it('blocks a one-adult outpost and a household left with a child and no adult', () => {
    const outpost = {
      id: '1_0',
      families: [{ id: 'family-1', members: [member('Solo', 'male', 30, 'miner')] }],
    }
    expect(commitExpeditionParty({
      assignments: createExpeditionAssignments(),
      def: outpost,
      destination,
      nowDays: 1,
      lookups: lookups(),
    }).ok).toBe(false)

    const unsafe = {
      id: '0_0',
      families: [
        {
          id: 'family-1',
          members: [
            member('A', 'male', 20, 'miner'),
            member('B', 'male', 21, 'miner'),
            member('Kid', 'male', 8, 'farmer', 'child'),
          ],
        },
        {
          id: 'family-2',
          members: [
            member('C', 'male', 22, 'miner'),
            member('D', 'male', 23, 'miner'),
          ],
        },
      ],
    }
    const result = commitExpeditionParty({
      assignments: createExpeditionAssignments(),
      def: unsafe,
      destination,
      nowDays: 1,
      lookups: lookups(),
    })
    expect(result).toEqual({ ok: false, reason: 'staffing-unsafe' })
    expect(canDispatchParty(unsafe, [
      settlementNpcId(unsafe.id, 0),
      settlementNpcId(unsafe.id, 1),
      settlementNpcId(unsafe.id, 3),
    ], () => undefined)).toBe(false)
  })

  it('commits the ordered top 3 when the full party is staffing-safe', () => {
    const def = {
      id: '0_0',
      families: [
        {
          id: 'family-1',
          members: [
            member('A', 'male', 20, 'miner'),
            member('Stay', 'female', 40, 'farmer', 'wife'),
            member('Kid', 'male', 8, 'farmer', 'child'),
          ],
        },
        {
          id: 'family-2',
          members: [
            member('B', 'male', 21, 'miner'),
            member('C', 'male', 22, 'miner'),
            member('D', 'male', 23, 'miner'),
          ],
        },
      ],
    }
    const assignments = createExpeditionAssignments()
    const result = commitExpeditionParty({
      assignments,
      def,
      destination,
      nowDays: 2,
      lookups: lookups(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.assignment.memberNpcIds).toEqual([
      settlementNpcId(def.id, 0),
      settlementNpcId(def.id, 3),
      settlementNpcId(def.id, 4),
    ])
    const again = commitExpeditionParty({
      assignments,
      def,
      destination,
      nowDays: 9,
      lookups: lookups(),
    })
    expect(again.ok).toBe(true)
    if (again.ok) expect(again.assignment.id).toBe(result.assignment.id)
  })

  it('re-resolves after a candidate dies before commit', () => {
    const def = {
      id: '0_0',
      families: [
        {
          id: 'family-1',
          members: [
            member('A', 'male', 20, 'miner'),
            member('B', 'male', 21, 'miner'),
            member('C', 'male', 22, 'miner'),
            member('D', 'male', 23, 'miner'),
            member('Stay', 'female', 40, 'farmer', 'wife'),
          ],
        },
      ],
    }
    const dead = createNpcAuthoritativeState(settlementNpcId(def.id, 0), 0)
    dead.health.dead = true
    const result = commitExpeditionParty({
      assignments: createExpeditionAssignments(),
      def,
      destination,
      nowDays: 1,
      lookups: lookups({ [dead.id]: dead }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.assignment.memberNpcIds[0]).toBe(settlementNpcId(def.id, 1))
    expect(result.assignment.memberNpcIds).not.toContain(dead.id)
  })
})
