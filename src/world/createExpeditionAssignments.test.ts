import { describe, expect, it } from 'vitest'
import { createExpeditionAssignments } from './createExpeditionAssignments'
import { createExpeditionAssignmentRecord } from './expeditionAssignment'

const destination = { kind: 'location' as const, locationId: 'abandoned-mine' }
const members = ['s:npc:0', 's:npc:1', 's:npc:2'] as const

function makeParams(overrides: Partial<Parameters<ReturnType<typeof createExpeditionAssignments>['createForming']>[0]> = {}) {
  return {
    sponsorSettlementId: '0_0',
    destination,
    memberNpcIds: members,
    createdAtDays: 3,
    ...overrides,
  }
}

describe('createExpeditionAssignments', () => {
  it('creates a forming assignment with a stable id', () => {
    const registry = createExpeditionAssignments()
    const record = registry.createForming(makeParams())!
    expect(record.state).toBe('forming')
    expect(record.memberNpcIds).toEqual(members)
    expect(record.id.startsWith('expeditionAssignment:')).toBe(true)
    expect(registry.find(record.id)).toEqual(record)
    expect(registry.findActiveByNpc('s:npc:1')).toEqual(record)
    expect(registry.findActiveBySponsorAndDestination('0_0', destination)).toEqual(record)
  })

  it('rejects duplicate members and one active assignment per NPC', () => {
    const registry = createExpeditionAssignments()
    expect(registry.createForming(makeParams({ memberNpcIds: ['a', 'a', 'b'] }))).toBeNull()
    expect(registry.createForming(makeParams())).not.toBeNull()
    expect(registry.createForming(makeParams({
      destination: { kind: 'location', locationId: 'other' },
      memberNpcIds: ['s:npc:2', 's:npc:3', 's:npc:4'],
    }))).toBeNull()
  })

  it('rejects a second assignment for the same sponsor and destination', () => {
    const registry = createExpeditionAssignments()
    expect(registry.createForming(makeParams())).not.toBeNull()
    expect(registry.createForming(makeParams({
      memberNpcIds: ['s:npc:5', 's:npc:6', 's:npc:7'],
    }))).toBeNull()
  })

  it('marks provisioned then ready, and listReady only includes ready', () => {
    const registry = createExpeditionAssignments()
    const record = registry.createForming(makeParams())!
    expect(registry.markReady(record.id, 4)).toBeNull()
    const provisioned = registry.markProvisioned(record.id, 4)!
    expect(provisioned.state).toBe('provisioned')
    expect(provisioned.provisionedAtDays).toBe(4)
    expect(registry.markProvisioned(record.id, 5)?.state).toBe('provisioned')
    const ready = registry.markReady(record.id, 6)!
    expect(ready.state).toBe('ready')
    expect(registry.listReady()).toEqual([ready])
  })

  it('seeds from initial records without inventing a second identity', () => {
    const existing = createExpeditionAssignmentRecord({
      id: 'expeditionAssignment:seed',
      sponsorSettlementId: '0_0',
      destination,
      memberNpcIds: members,
      createdAtDays: 1,
    })
    const registry = createExpeditionAssignments([existing])
    expect(registry.find('expeditionAssignment:seed')?.memberNpcIds).toEqual(members)
  })

  it('never reuses an id already present in seeded records', () => {
    const probe = createExpeditionAssignments()
    const first = probe.createForming(makeParams())!
    const [, ms, counter] = first.id.split(':')
    const collidingId = `expeditionAssignment:${ms}:${Number(counter) + 1}`
    const seeded = createExpeditionAssignmentRecord({
      id: collidingId,
      sponsorSettlementId: '1_0',
      destination,
      memberNpcIds: ['x:npc:0', 'x:npc:1', 'x:npc:2'],
      createdAtDays: 1,
    })
    const registry = createExpeditionAssignments([seeded])
    const created = registry.createForming(makeParams())!
    expect(created.id).not.toBe(collidingId)
  })

  it('dispose clears the registry', () => {
    const registry = createExpeditionAssignments()
    registry.createForming(makeParams())
    registry.dispose()
    expect(registry.list()).toEqual([])
    expect(registry.findActiveByNpc('s:npc:0')).toBeUndefined()
  })
})
