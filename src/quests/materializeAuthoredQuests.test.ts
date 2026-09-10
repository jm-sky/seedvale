import { describe, expect, it } from 'vitest'
import { generateFamilies } from '../settlement/families'
import { type SettlementNpcDescriptor, settlementNpcDescriptors } from '../settlement/npcIdentity'
import { resolveInitialProfessionStaffing } from '../settlement/professionStaffing'
import {
  AuthoredNpcResolutionError,
  materializeAuthoredQuestDefs,
  normalizeLegacyQuestRelations,
} from './materializeAuthoredQuests'
import { type AuthoredQuestDef, QUESTS } from './quests'

const descriptors: readonly SettlementNpcDescriptor[] = [
  { id: 'home:npc:0', name: 'Piotr' },
  { id: 'home:npc:1', name: 'Anna' },
  { id: 'home:npc:2', name: 'Marek' },
  { id: 'home:npc:3', name: 'Kasia' },
]

const relay: AuthoredQuestDef = {
  id: 'relay-anna-piotr',
  title: 'Relay',
  description: 'desc',
  giverName: 'Anna',
  offerLine: 'offer',
  stages: [{
    objective: { type: 'talk_to_npc', npcName: 'Piotr' },
    description: 'talk',
    reminderLine: 'remind',
  }],
  reportLine: 'report',
  availability: {
    prerequisites: [{ type: 'relation', npcName: 'Anna', minimum: 'acquainted' }],
  },
  outcomes: [{
    id: 'delivered',
    state: 'complete',
    consequences: {
      relations: [
        { npcName: 'Anna', delta: 1 },
        { npcName: 'Piotr', delta: 1 },
      ],
    },
  }],
}

describe('materializeAuthoredQuestDefs', () => {
  it('resolves reserved authored names to deterministic home NPC ids', () => {
    const [def] = materializeAuthoredQuestDefs([relay], descriptors)
    expect(def?.giver).toEqual({ npcId: 'home:npc:1' })
    expect(def?.giverName).toBe('Anna')
    expect(def?.stages[0]?.objective).toEqual({ type: 'talk_to_npc', npc: { npcId: 'home:npc:0' } })
    expect(def?.availability?.prerequisites).toEqual([
      { type: 'relation', npc: { npcId: 'home:npc:1' }, minimum: 'acquainted' },
    ])
    expect(def?.outcomes[0]?.consequences?.relations).toEqual([
      { npc: { npcId: 'home:npc:1' }, delta: 1 },
      { npc: { npcId: 'home:npc:0' }, delta: 1 },
    ])
  })

  it('fails on a missing authored name instead of falling back by name', () => {
    const missing: AuthoredQuestDef = {
      ...relay,
      giverName: 'Nobody',
    }
    expect(() => materializeAuthoredQuestDefs([missing], descriptors)).toThrow(AuthoredNpcResolutionError)
    expect(() => materializeAuthoredQuestDefs([missing], descriptors)).toThrow(/unknown NPC "Nobody"/)
  })

  it('fails on an ambiguous authored name instead of picking either NPC', () => {
    const ambiguous: readonly SettlementNpcDescriptor[] = [
      { id: 'a:npc:0', name: 'Jan' },
      { id: 'b:npc:7', name: 'Jan' },
    ]
    const quest: AuthoredQuestDef = { ...relay, giverName: 'Jan' }
    expect(() => materializeAuthoredQuestDefs([quest], ambiguous)).toThrow(/ambiguous NPC name "Jan"/)
  })

  it('materializes authored QUESTS against staffed home families without missing or ambiguous NPCs', () => {
    for (const size of ['SM', 'MD', 'LG', 'XL'] as const) {
      for (const seed of [3, 7, 21, 99]) {
        const families = generateFamilies(seed, size, true, 'polish')
        const staffed = resolveInitialProfessionStaffing(families, {
          size,
          terrain: 'forest',
          foodSourceType: 'garden',
          dominantResource: null,
          isHome: true,
          seed,
        })
        const descriptors = settlementNpcDescriptors({ id: '0_0', families: staffed })
        expect(() => materializeAuthoredQuestDefs(QUESTS, descriptors)).not.toThrow()
        const reserved = descriptors.filter((d) => ['Anna', 'Kasia', 'Marek', 'Piotr'].includes(d.name))
        expect(reserved).toHaveLength(4)
        expect(descriptors[0]?.name).toBe('Piotr')
        expect(descriptors[1]?.name).toBe('Anna')
        expect(descriptors[2]?.name).toBe('Marek')
        expect(descriptors[3]?.name).toBe('Kasia')
      }
    }
  })

  it('binds stage dialogue action npc names and relation consequences to stable ids', () => {
    const scout: AuthoredQuestDef = {
      id: 'scout-actions',
      title: 'Scout',
      description: 'desc',
      giverName: 'Piotr',
      offerLine: 'offer',
      stages: [{
        objective: { type: 'spot_animal', kind: 'stag', range: 16 },
        description: 'spot',
        reminderLine: 'remind',
        dialogueActions: [{
          npcName: 'Piotr',
          playerLine: 'Tak, widziałem jelenia.',
          npcLine: 'Skoro tak.',
          consequences: { relations: [{ npcName: 'Piotr', delta: -1 }] },
        }],
      }],
      reportLine: 'report',
      outcomes: [{ id: 'reported', state: 'complete' }],
    }
    const [def] = materializeAuthoredQuestDefs([scout], descriptors)
    expect(def?.stages[0]?.dialogueActions).toEqual([{
      npc: { npcId: 'home:npc:0' },
      playerLine: 'Tak, widziałem jelenia.',
      npcLine: 'Skoro tak.',
      consequences: { relations: [{ npc: { npcId: 'home:npc:0' }, delta: -1 }] },
    }])
  })
})

describe('normalizeLegacyQuestRelations', () => {
  it('maps a legacy authored name to the matching stable id', () => {
    expect(normalizeLegacyQuestRelations({ Anna: 3 }, descriptors)).toEqual({ 'home:npc:1': 3 })
  })

  it('round-trips already id-keyed relation data unchanged', () => {
    const keyed = { 'home:npc:1': 4, 'home:npc:0': 1 }
    expect(normalizeLegacyQuestRelations(keyed, descriptors)).toEqual(keyed)
  })

  it('does not silently map an ambiguous legacy name', () => {
    const ambiguous: readonly SettlementNpcDescriptor[] = [
      { id: 'a:npc:0', name: 'Jan' },
      { id: 'b:npc:7', name: 'Jan' },
    ]
    expect(() => normalizeLegacyQuestRelations({ Jan: 2 }, ambiguous)).toThrow(/ambiguous/)
  })
})
