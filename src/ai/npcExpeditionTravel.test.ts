import { describe, expect, it } from 'vitest'
import { createNpcStateRegistry } from '../settlement/npcState'
import { createExpeditionAssignments } from '../world/createExpeditionAssignments'
import { startNpcAccompanyCommitment } from './npcAccompanyCommitment'
import { dispatchReadyExpedition, dispatchReadyExpeditionAssignment } from './npcExpeditionTravel'

const destination = { x: 400, z: -20 }
const members = ['npc:a', 'npc:b', 'npc:c'] as const

function readyAssignment(id = 'exp:1') {
  return { id, state: 'ready' as const, memberNpcIds: members }
}

function origins() {
  return {
    'npc:a': { x: 0, z: 0 },
    'npc:b': { x: 2, z: 1 },
    'npc:c': { x: -1, z: 3 },
  } as const
}

describe('dispatchReadyExpedition', () => {
  it('only dispatches a ready assignment', () => {
    const registry = createNpcStateRegistry()
    for (const id of members) registry.getOrCreate(id, 0)
    const originMap = origins()
    const result = dispatchReadyExpedition({
      assignment: { id: 'exp:1', state: 'forming', memberNpcIds: members },
      destination,
      nowDays: 3,
      dayLengthSec: 600,
      getNpcState: (id) => registry.get(id),
      originOf: (id) => originMap[id as keyof typeof originMap],
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('not-ready')
    expect(registry.get('npc:a')?.travel).toBeNull()
  })

  it('starts independent per-member travel without changing inventories or membership', () => {
    const registry = createNpcStateRegistry()
    for (const id of members) {
      const state = registry.getOrCreate(id, 0)
      state.personalInventory.add('bread', 2)
    }
    const originMap = origins()
    const result = dispatchReadyExpedition({
      assignment: readyAssignment(),
      destination,
      nowDays: 3,
      dayLengthSec: 600,
      getNpcState: (id) => registry.get(id),
      originOf: (id) => originMap[id as keyof typeof originMap],
      isLive: () => false,
    })
    expect(result.ok).toBe(true)
    expect(result.dispatchedNpcIds).toEqual([...members])
    const travels = members.map((id) => registry.get(id)!.travel)
    expect(travels.every((travel) => travel?.purpose?.kind === 'expedition' && travel.purpose.assignmentId === 'exp:1')).toBe(true)
    expect(new Set(travels.map((travel) => `${travel!.lastPosition.x},${travel!.lastPosition.z}`)).size).toBe(3)
    expect(travels.every((travel) => travel?.execution?.mode === 'off-screen')).toBe(true)
    expect(travels[0]?.execution?.departedAtDays).toBe(3)
    expect(registry.get('npc:a')?.personalInventory.count('bread')).toBe(2)
  })

  it('is idempotent and does not restart an already-started journey', () => {
    const registry = createNpcStateRegistry()
    for (const id of members) registry.getOrCreate(id, 0)
    const originMap = origins()
    const input = {
      assignment: readyAssignment(),
      destination,
      nowDays: 3,
      dayLengthSec: 600,
      getNpcState: (id: string) => registry.get(id),
      originOf: (id: string) => originMap[id as keyof typeof originMap],
      isLive: () => false,
    }
    dispatchReadyExpedition(input)
    registry.get('npc:a')!.travel!.lastPosition.x = 15
    const again = dispatchReadyExpedition({ ...input, nowDays: 9 })
    expect(again.ok).toBe(true)
    expect(registry.get('npc:a')!.travel!.lastPosition.x).toBe(15)
    expect(registry.get('npc:a')!.travel!.execution?.departedAtDays).toBe(3)
  })

  it('starts detailed travel for live members and skips dead or conflicting ones', () => {
    const registry = createNpcStateRegistry()
    const a = registry.getOrCreate('npc:a', 0)
    const b = registry.getOrCreate('npc:b', 0)
    const c = registry.getOrCreate('npc:c', 0)
    b.health.dead = true
    startNpcAccompanyCommitment(c, { source: { kind: 'voluntary' }, startedAtDays: 1 })
    const originMap = origins()
    const result = dispatchReadyExpedition({
      assignment: readyAssignment(),
      destination,
      nowDays: 1,
      dayLengthSec: 600,
      getNpcState: (id) => registry.get(id),
      originOf: (id) => originMap[id as keyof typeof originMap],
      isLive: (id) => id === 'npc:a',
    })
    expect(result.dispatchedNpcIds).toEqual(['npc:a'])
    expect(result.skippedNpcIds).toEqual(['npc:b', 'npc:c'])
    expect(a.travel?.execution).toBeUndefined()
    expect(a.travel?.purpose?.kind).toBe('expedition')
    expect(a.travel?.purpose?.kind === 'expedition' && a.travel.purpose.assignmentId).toBe('exp:1')
    expect(b.travel).toBeNull()
    expect(c.travel).toBeNull()
  })
})

describe('dispatchReadyExpeditionAssignment', () => {
  const members = ['s:npc:0', 's:npc:1', 's:npc:2'] as const

  function readyRegistry() {
    const assignments = createExpeditionAssignments()
    const formed = assignments.createForming({
      sponsorSettlementId: '0_0',
      destination: { kind: 'location', locationId: 'abandoned-mine' },
      memberNpcIds: members,
      createdAtDays: 3,
    })!
    assignments.markProvisioned(formed.id, 4)
    const ready = assignments.markReady(formed.id, 5)!
    const npcStates = createNpcStateRegistry()
    for (const id of members) npcStates.getOrCreate(id, 0)
    const originMap = {
      's:npc:0': { x: 0, z: 0 },
      's:npc:1': { x: 2, z: 1 },
      's:npc:2': { x: -1, z: 3 },
    } as const
    return { assignments, ready, npcStates, originMap }
  }

  it('does not dispatch a missing assignment or an unresolved destination', () => {
    const { assignments, ready, npcStates, originMap } = readyRegistry()
    expect(dispatchReadyExpeditionAssignment({
      assignments,
      assignmentId: 'missing',
      destinationOf: () => ({ x: 400, z: -20 }),
      nowDays: 6,
      dayLengthSec: 600,
      getNpcState: (id) => npcStates.get(id),
      originOf: (id) => originMap[id as keyof typeof originMap],
    })).toEqual({ ok: false, reason: 'missing-assignment', dispatchedNpcIds: [], skippedNpcIds: [] })

    const unresolved = dispatchReadyExpeditionAssignment({
      assignments,
      assignmentId: ready.id,
      destinationOf: () => null,
      nowDays: 6,
      dayLengthSec: 600,
      getNpcState: (id) => npcStates.get(id),
      originOf: (id) => originMap[id as keyof typeof originMap],
    })
    expect(unresolved).toEqual({
      ok: false,
      reason: 'destination-unavailable',
      dispatchedNpcIds: [],
      skippedNpcIds: [...members],
    })
    expect(npcStates.get('s:npc:0')?.travel).toBeNull()
    expect(assignments.find(ready.id)?.state).toBe('ready')
  })

  it('dispatches from the 027 ready registry without reselecting members', () => {
    const { assignments, ready, npcStates, originMap } = readyRegistry()
    const result = dispatchReadyExpeditionAssignment({
      assignments,
      assignmentId: ready.id,
      destinationOf: (ref) => ref.kind === 'location' && ref.locationId === 'abandoned-mine'
        ? { x: 400, z: -20 }
        : null,
      nowDays: 6,
      dayLengthSec: 600,
      getNpcState: (id) => npcStates.get(id),
      originOf: (id) => originMap[id as keyof typeof originMap],
      isLive: () => false,
    })
    expect(result.ok).toBe(true)
    expect(result.dispatchedNpcIds).toEqual([...members])
    expect(assignments.find(ready.id)?.memberNpcIds).toEqual(members)
    expect(npcStates.get('s:npc:0')?.travel?.purpose).toEqual({
      kind: 'expedition',
      assignmentId: ready.id,
    })
  })
})
