import { describe, expect, it } from 'vitest'
import type { FamilyDef, FamilyMember } from './families'
import { flattenedSettlementMembers, settlementNpcDescriptors, settlementNpcId } from './npcIdentity'

function member(name: string): FamilyMember {
  return { name } as FamilyMember
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
