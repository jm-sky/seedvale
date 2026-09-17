import { describe, expect, it } from 'vitest'
import type { FamilyDef, FamilyMember } from './families'
import {
  flattenedSettlementMembers,
  resolveSettlementNpcHomeDescriptor,
  settlementMemberPhysicalSeed,
  settlementNpcDescriptors,
  settlementNpcId,
  settlementNpcMemberIndex,
} from './npcIdentity'

function member(name: string): FamilyMember {
  return { name } as FamilyMember
}

function memberWithLastName(name: string, lastName: string, relation: string): FamilyMember {
  return { name, lastName, relation } as FamilyMember
}

function family(id: string, names: readonly string[]): FamilyDef {
  return { id, members: names.map(member) }
}

describe('settlementNpcIdentity', () => {
  const def = {
    id: 'home',
    families: [
      family('family-0', ['Piotr', 'Anna']),
      family('family-1', ['Marek', 'Kasia']),
    ],
  }

  it('assigns ids in flattened family order', () => {
    expect(flattenedSettlementMembers(def).map((m) => m.name)).toEqual(['Piotr', 'Anna', 'Marek', 'Kasia'])
    expect(settlementNpcDescriptors(def)).toEqual([
      { id: 'home:npc:0', name: 'Piotr' },
      { id: 'home:npc:1', name: 'Anna' },
      { id: 'home:npc:2', name: 'Marek' },
      { id: 'home:npc:3', name: 'Kasia' },
    ])
  })

  it('uses the same id formula createSettlement relies on', () => {
    expect(settlementNpcId('settlement-a', 3)).toBe('settlement-a:npc:3')
  })

  it('keeps duplicate display names as distinct identities', () => {
    const dup = {
      id: 'settlement-b',
      families: [family('family-0', ['Jan']), family('family-1', ['Jan'])],
    }
    expect(settlementNpcDescriptors(dup)).toEqual([
      { id: 'settlement-b:npc:0', name: 'Jan' },
      { id: 'settlement-b:npc:1', name: 'Jan' },
    ])
  })
})

describe('settlementNpcMemberIndex (plan settlements-npcs-038)', () => {
  it('inverts settlementNpcId for that settlement', () => {
    expect(settlementNpcMemberIndex('home', 'home:npc:3')).toBe(3)
  })

  it('returns null for a different settlement or malformed id', () => {
    expect(settlementNpcMemberIndex('home', 'other:npc:3')).toBeNull()
    expect(settlementNpcMemberIndex('home', 'home:npc:not-a-number')).toBeNull()
  })
})

describe('resolveSettlementNpcHomeDescriptor (plan settlements-npcs-038)', () => {
  const anna = memberWithLastName('Anna', 'Leśniewska', 'wife')
  const piotr = memberWithLastName('Piotr', 'Leśniewski', 'husband')
  const marek = memberWithLastName('Marek', 'Hornblower', 'husband')
  const def = {
    id: 'home',
    families: [
      { id: 'family-0', members: [piotr, anna] },
      { id: 'family-1', members: [marek] },
    ],
  }

  it('resolves the member, family index and family-member roster for a mid-settlement npc', () => {
    const descriptor = resolveSettlementNpcHomeDescriptor(def, 'home:npc:1')
    expect(descriptor).toEqual({
      npcId: 'home:npc:1',
      memberIndex: 1,
      familyIndex: 0,
      member: anna,
      familyMembers: [{ name: 'Piotr', lastName: 'Leśniewski', relation: 'husband' }],
    })
  })

  it('resolves a single-member family correctly (no family-member peers)', () => {
    const descriptor = resolveSettlementNpcHomeDescriptor(def, 'home:npc:2')
    expect(descriptor).toMatchObject({ memberIndex: 2, familyIndex: 1, member: marek, familyMembers: [] })
  })

  it('returns null for an npc id belonging to a different settlement', () => {
    expect(resolveSettlementNpcHomeDescriptor(def, 'away:npc:0')).toBeNull()
  })

  it('returns null for an out-of-range member index', () => {
    expect(resolveSettlementNpcHomeDescriptor(def, 'home:npc:99')).toBeNull()
  })
})

describe('settlementMemberPhysicalSeed (plan settlements-npcs-038)', () => {
  it('is deterministic and matches createSettlement’s own formula', () => {
    expect(settlementMemberPhysicalSeed(1234, 0)).toBe(1234 ^ Math.imul(1, 0x51ed270b) ^ 0x50485953)
    expect(settlementMemberPhysicalSeed(1234, 0)).toBe(settlementMemberPhysicalSeed(1234, 0))
  })

  it('differs per member index for the same settlement seed', () => {
    expect(settlementMemberPhysicalSeed(1234, 0)).not.toBe(settlementMemberPhysicalSeed(1234, 1))
  })
})
