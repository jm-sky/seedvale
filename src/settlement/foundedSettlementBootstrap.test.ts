import { describe, expect, it } from 'vitest'
import { createEconomyRegistry } from '../economy/registry'
import { createTentInstance } from '../items/itemInstances'
import { createFoundedSettlementRegistry, foundedHouseholdId, foundedSettlementId, foundedTentId } from './foundedSettlement'
import {
  bootstrapFoundedSettlement,
  type BootstrapFoundedSettlementDeps,
  type BootstrapFoundedSettlementInput,
  type FoundedSettlementTentsDeps,
} from './foundedSettlementBootstrap'
import { createHouseholdRegistry } from './household'
import { createNpcAuthoritativeState, type NpcAuthoritativeState, type NpcId } from './npcState'

const ASSIGNMENT_ID = 'expedition:1'
const SITE_ID = 'gold-mine:site-1'
const MEMBER_IDS: readonly [NpcId, NpcId, NpcId] = ['0_0:npc:0', '0_0:npc:1', '0_0:npc:2']

function arrivedState(npcId: NpcId, assignmentId = ASSIGNMENT_ID): NpcAuthoritativeState {
  const state = createNpcAuthoritativeState(npcId, 0)
  state.travel = {
    destination: { x: 100, z: 200 },
    lastPosition: { x: 100, z: 200 },
    purpose: { kind: 'expedition', assignmentId },
    arrival: 'reached',
  }
  state.personalInventory.addInstance(createTentInstance(90, `tent-item:${npcId}`))
  return state
}

function fakePlacedTents(): FoundedSettlementTentsDeps & { placed: Map<string, { id: string, condition: number }> } {
  const placed = new Map<string, { id: string, condition: number }>()
  let seq = 0
  return {
    placed,
    get: (id) => placed.get(id) ?? null,
    place: (_x, _z, _yaw, _worldDays, from) => {
      const id = from?.id ?? `tent:auto:${seq++}`
      const rec = { id, condition: from?.condition ?? 100 }
      placed.set(id, rec)
      return rec
    },
  }
}

function makeDeps(states: Map<NpcId, NpcAuthoritativeState>): { deps: BootstrapFoundedSettlementDeps, placedTents: ReturnType<typeof fakePlacedTents> } {
  const placedTents = fakePlacedTents()
  const deps: BootstrapFoundedSettlementDeps = {
    founded: createFoundedSettlementRegistry(),
    getNpcState: (id) => states.get(id),
    households: createHouseholdRegistry(),
    economies: createEconomyRegistry(),
    placedTents,
  }
  return { deps, placedTents }
}

function baseInput(overrides: Partial<BootstrapFoundedSettlementInput> = {}): BootstrapFoundedSettlementInput {
  return {
    siteId: SITE_ID,
    x: 100,
    z: 200,
    sponsorSettlementId: '0_0',
    assignment: { id: ASSIGNMENT_ID, memberNpcIds: MEMBER_IDS },
    siteReady: true,
    nowDays: 12,
    ...overrides,
  }
}

describe('bootstrapFoundedSettlement — validation without mutation', () => {
  it('returns not_ready when the site is not ready, without creating anything', () => {
    const states = new Map(MEMBER_IDS.map((id) => [id, arrivedState(id)]))
    const { deps } = makeDeps(states)
    const result = bootstrapFoundedSettlement(baseInput({ siteReady: false }), deps)
    expect(result).toEqual({ status: 'not_ready', reason: 'site-not-ready' })
    expect(deps.founded.list()).toEqual([])
  })

  it('returns not_ready when a member has no authoritative state', () => {
    const states = new Map(MEMBER_IDS.slice(0, 2).map((id) => [id, arrivedState(id)]))
    const { deps } = makeDeps(states)
    const result = bootstrapFoundedSettlement(baseInput(), deps)
    expect(result).toEqual({ status: 'not_ready', reason: 'missing-npc-state' })
    expect(deps.founded.list()).toEqual([])
  })

  it('returns not_ready when a member is dead', () => {
    const states = new Map(MEMBER_IDS.map((id) => [id, arrivedState(id)]))
    states.get(MEMBER_IDS[1])!.health.dead = true
    const { deps } = makeDeps(states)
    const result = bootstrapFoundedSettlement(baseInput(), deps)
    expect(result).toEqual({ status: 'not_ready', reason: 'member-dead' })
    expect(deps.founded.list()).toEqual([])
  })

  it('returns not_ready when a member is travelling for a different assignment', () => {
    const states = new Map<NpcId, NpcAuthoritativeState>(MEMBER_IDS.map((id) => [id, arrivedState(id)]))
    states.set(MEMBER_IDS[2], arrivedState(MEMBER_IDS[2], 'expedition:other'))
    const { deps } = makeDeps(states)
    const result = bootstrapFoundedSettlement(baseInput(), deps)
    expect(result).toEqual({ status: 'not_ready', reason: 'not-travelling-for-this-assignment' })
    expect(deps.founded.list()).toEqual([])
  })

  it('returns not_ready when a member has not yet arrived', () => {
    const states = new Map(MEMBER_IDS.map((id) => [id, arrivedState(id)]))
    const notArrived = states.get(MEMBER_IDS[0])!
    notArrived.travel = { ...notArrived.travel!, arrival: undefined }
    const { deps } = makeDeps(states)
    const result = bootstrapFoundedSettlement(baseInput(), deps)
    expect(result).toEqual({ status: 'not_ready', reason: 'not-arrived' })
    expect(deps.founded.list()).toEqual([])
  })

  it('returns not_ready when a member travel is blocked', () => {
    const states = new Map(MEMBER_IDS.map((id) => [id, arrivedState(id)]))
    const blocked = states.get(MEMBER_IDS[0])!
    blocked.travel = { ...blocked.travel!, blocked: true }
    const { deps } = makeDeps(states)
    const result = bootstrapFoundedSettlement(baseInput(), deps)
    expect(result).toEqual({ status: 'not_ready', reason: 'travel-blocked' })
    expect(deps.founded.list()).toEqual([])
  })

  it('returns not_ready when a member has no tent instance', () => {
    const states = new Map(MEMBER_IDS.map((id) => [id, arrivedState(id)]))
    const noTent = states.get(MEMBER_IDS[0])!
    for (const instance of noTent.personalInventory.getInstances('tent')) {
      noTent.personalInventory.removeInstance(instance.id)
    }
    const { deps } = makeDeps(states)
    const result = bootstrapFoundedSettlement(baseInput(), deps)
    expect(result).toEqual({ status: 'not_ready', reason: 'missing-tent-instance' })
    expect(deps.founded.list()).toEqual([])
  })
})

describe('bootstrapFoundedSettlement — commit + idempotency', () => {
  it('creates one founded record, one household+tent per founder, one economy, and clears travel', () => {
    const states = new Map(MEMBER_IDS.map((id) => [id, arrivedState(id)]))
    const { deps, placedTents } = makeDeps(states)
    const result = bootstrapFoundedSettlement(baseInput(), deps)
    expect(result.status).toBe('created')
    const settlementId = (result as { status: 'created', settlementId: string }).settlementId
    expect(settlementId).toBe(foundedSettlementId(SITE_ID))

    expect(deps.founded.list()).toHaveLength(1)
    const record = deps.founded.get(settlementId)!
    expect(record.residentNpcIds).toEqual(MEMBER_IDS)
    expect(record.sponsorSettlementId).toBe('0_0')

    for (const npcId of MEMBER_IDS) {
      expect(deps.founded.residencyOf(npcId)).toBe(settlementId)
      const tentId = foundedTentId(settlementId, npcId)
      expect(placedTents.get(tentId)).not.toBeNull()
      expect(deps.households.get(foundedHouseholdId(settlementId, npcId))).toBeDefined()
      // Travel cleared exactly once the founder settled.
      expect(states.get(npcId)!.travel).toBeNull()
      // Exactly one real tent instance consumed.
      expect(states.get(npcId)!.personalInventory.getInstances('tent')).toHaveLength(0)
    }
    expect(deps.economies.get(settlementId)).toBeDefined()
  })

  it('gives founding households no free starting supplies', () => {
    const states = new Map(MEMBER_IDS.map((id) => [id, arrivedState(id)]))
    const { deps } = makeDeps(states)
    const result = bootstrapFoundedSettlement(baseInput(), deps)
    const settlementId = (result as { status: 'created', settlementId: string }).settlementId
    for (const npcId of MEMBER_IDS) {
      const household = deps.households.get(foundedHouseholdId(settlementId, npcId))!
      expect(household.water.current).toBe(0)
      expect(household.foodCount()).toBe(0)
      expect(household.woodCount()).toBe(0)
    }
  })

  it('is idempotent: a repeated call returns existing without consuming anything again', () => {
    const states = new Map(MEMBER_IDS.map((id) => [id, arrivedState(id)]))
    const { deps, placedTents } = makeDeps(states)
    const first = bootstrapFoundedSettlement(baseInput(), deps)
    expect(first.status).toBe('created')
    const tentCountAfterFirst = placedTents.placed.size

    const second = bootstrapFoundedSettlement(baseInput(), deps)
    expect(second).toEqual({ status: 'existing', settlementId: (first as { settlementId: string }).settlementId })
    expect(deps.founded.list()).toHaveLength(1)
    expect(placedTents.placed.size).toBe(tentCountAfterFirst)
  })
})
