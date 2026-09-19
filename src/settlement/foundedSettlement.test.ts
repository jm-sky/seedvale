import { describe, expect, it } from 'vitest'
import {
  createFoundedSettlementRegistry,
  foundedHouseholdId,
  foundedSettlementId,
  type FoundedSettlementRecord,
  foundedTentId,
} from './foundedSettlement'

function record(overrides: Partial<FoundedSettlementRecord> = {}): FoundedSettlementRecord {
  return {
    id: foundedSettlementId('site:1'),
    siteId: 'site:1',
    x: 10,
    z: 20,
    sponsorSettlementId: '0_0',
    residentNpcIds: ['0_0:npc:0', '0_0:npc:1'],
    foundedAtDays: 5,
    ...overrides,
  }
}

describe('foundedSettlement stable ids', () => {
  it('derives the settlement id deterministically from siteId', () => {
    expect(foundedSettlementId('site:1')).toBe(foundedSettlementId('site:1'))
    expect(foundedSettlementId('site:1')).not.toBe(foundedSettlementId('site:2'))
  })

  it('derives household/tent ids deterministically from settlementId + npcId', () => {
    const settlementId = foundedSettlementId('site:1')
    expect(foundedHouseholdId(settlementId, '0_0:npc:0')).toBe(foundedHouseholdId(settlementId, '0_0:npc:0'))
    expect(foundedHouseholdId(settlementId, '0_0:npc:0')).not.toBe(foundedHouseholdId(settlementId, '0_0:npc:1'))
    expect(foundedTentId(settlementId, '0_0:npc:0')).toBe(foundedTentId(settlementId, '0_0:npc:0'))
    expect(foundedTentId(settlementId, '0_0:npc:0')).not.toBe(foundedHouseholdId(settlementId, '0_0:npc:0'))
  })
})

describe('createFoundedSettlementRegistry', () => {
  it('starts empty with no initial snapshot', () => {
    const registry = createFoundedSettlementRegistry()
    expect(registry.list()).toEqual([])
    expect(registry.get('anything')).toBeUndefined()
    expect(registry.getBySiteId('site:1')).toBeUndefined()
  })

  it('creates and resolves a record by id and by siteId', () => {
    const registry = createFoundedSettlementRegistry()
    const rec = record()
    registry.create(rec)
    expect(registry.get(rec.id)).toEqual(rec)
    expect(registry.getBySiteId('site:1')).toEqual(rec)
    expect(registry.list()).toEqual([rec])
  })

  it('throws on a stable-id collision instead of minting a second id', () => {
    const registry = createFoundedSettlementRegistry()
    registry.create(record())
    expect(() => registry.create(record())).toThrow()
  })

  it('tracks residency overrides independent of procedural residents', () => {
    const registry = createFoundedSettlementRegistry()
    expect(registry.residencyOf('0_0:npc:0')).toBeUndefined()
    registry.setResidency('0_0:npc:0', 'settlement:founded:site:1')
    expect(registry.residencyOf('0_0:npc:0')).toBe('settlement:founded:site:1')
  })

  it('round-trips through serialize/restore', () => {
    const registry = createFoundedSettlementRegistry()
    const rec = record()
    registry.create(rec)
    registry.setResidency('0_0:npc:0', rec.id)
    registry.setResidency('0_0:npc:1', rec.id)
    const snapshot = registry.serialize()

    const restored = createFoundedSettlementRegistry(snapshot)
    expect(restored.get(rec.id)).toEqual(rec)
    expect(restored.residencyOf('0_0:npc:0')).toBe(rec.id)
    expect(restored.residencyOf('0_0:npc:1')).toBe(rec.id)
    expect(restored.serialize()).toEqual(snapshot)
  })

  it('clear empties both records and residency', () => {
    const registry = createFoundedSettlementRegistry()
    registry.create(record())
    registry.setResidency('0_0:npc:0', foundedSettlementId('site:1'))
    registry.clear()
    expect(registry.list()).toEqual([])
    expect(registry.residencyOf('0_0:npc:0')).toBeUndefined()
  })
})
