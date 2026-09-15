import { describe, expect, it } from 'vitest'
import { createNpcStateRegistry } from '../settlement/npcState'
import { startNpcAccompanyCommitment } from './npcAccompanyCommitment'
import { dispatchReadyExpedition } from './npcExpeditionTravel'

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
    expect(travels.every((travel) => travel?.purpose?.assignmentId === 'exp:1')).toBe(true)
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
    expect(a.travel?.purpose?.assignmentId).toBe('exp:1')
    expect(b.travel).toBeNull()
    expect(c.travel).toBeNull()
  })
})
