import { describe, expect, it } from 'vitest'
import type { QuestDef } from './quests'
import { Inventory } from '../items/Inventory'
import {
  LOST_TREASURE_ELDER_FAMILY_ID,
  LOST_TREASURE_ELDER_GIVEN_NAME,
} from '../settlement/lostTreasureChroniclesElderResident'
import {
  buildLostTreasureChroniclesElderQuests,
  findLostTreasureChroniclesElderSettlement,
  LOST_TREASURE_CHRONICLES_DISPUTE_RECONCILE_OUTCOME,
  LOST_TREASURE_CHRONICLES_DISPUTE_SUPPORT_ELDER_OUTCOME,
  LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID,
  LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
  LOST_TREASURE_CHRONICLES_WINTER_BRANCH_COUNT,
  LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
  LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME,
  type LostTreasureChroniclesElderBinding,
  resolveLostTreasureChroniclesElderBinding,
} from './lostTreasureChroniclesElder'
import { QuestManager } from './QuestManager'
import { relationToLevel, validateQuestDefinitions } from './quests'

function family(id: string, members: readonly { name: string, relation?: 'single' | 'husband' | 'wife' | 'child' }[]) {
  return {
    id,
    members: members.map((member) => ({
      name: member.name,
      lastName: 'Test',
      relation: member.relation ?? 'single',
      character: { name: member.name, gender: 'male' as const, role: 'farmer' as const, personality: { openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, neuroticism: 0 }, traits: [] },
      scale: 1,
      age: member.relation === 'child' ? 8 : 40,
    })),
  }
}

const bindingDef = {
  id: '1_0',
  name: 'Lipowo',
  families: [
    family('family-0', [{ name: 'Jan', relation: 'husband' }, { name: 'Ola', relation: 'wife' }]),
    family(LOST_TREASURE_ELDER_FAMILY_ID, [{ name: LOST_TREASURE_ELDER_GIVEN_NAME }]),
  ],
}

function testBinding(overrides: Partial<LostTreasureChroniclesElderBinding> = {}): LostTreasureChroniclesElderBinding {
  return {
    settlementId: '1_0',
    settlementName: 'Lipowo',
    elderNpcId: '1_0:npc:2',
    elderName: LOST_TREASURE_ELDER_GIVEN_NAME,
    elderHouseholdId: LOST_TREASURE_ELDER_FAMILY_ID,
    helperNpcId: '1_0:npc:0',
    helperName: 'Jan',
    counterpartNpcId: '1_0:npc:1',
    counterpartName: 'Ola',
    ...overrides,
  }
}

function makeQuestManager(defs: readonly QuestDef[], inventory = new Inventory()) {
  const social: Array<{ settlementId: string, reputation?: Record<string, number>, renown?: number }> = []
  const qm = new QuestManager(
    defs,
    undefined,
    inventory,
    undefined,
    undefined,
    undefined,
    undefined,
    (consequence) => social.push(consequence),
  )
  return { qm, social }
}

function accept(qm: QuestManager, npcId: string): void {
  qm.onInteract(npcId)?.offer?.onAccept()
}

function speak(qm: QuestManager, npcId: string, index = 0): string | undefined {
  return qm.onInteract(npcId)?.actions?.[index]?.onSelect()
}

describe('lost treasure chronicles elder quests', () => {
  it('binds the elder by family slot, not display name, and picks other-household adults', () => {
    expect(findLostTreasureChroniclesElderSettlement([
      { id: '0_0', name: 'Home', families: [family('family-0', [{ name: LOST_TREASURE_ELDER_GIVEN_NAME }])] },
      bindingDef,
    ])?.id).toBe('1_0')

    const binding = resolveLostTreasureChroniclesElderBinding(bindingDef)
    expect(binding).toEqual(testBinding())
    expect(binding?.elderNpcId).not.toBe(binding?.helperNpcId)
    expect(binding?.helperNpcId).not.toBe(binding?.counterpartNpcId)
    expect(binding?.elderHouseholdId).toBe(LOST_TREASURE_ELDER_FAMILY_ID)
  })

  it('reuses one supporting adult when the settlement has only one other adult', () => {
    const binding = resolveLostTreasureChroniclesElderBinding({
      id: '1_0',
      name: 'Lipowo',
      families: [
        family('family-0', [{ name: 'Jan' }, { name: 'Franek', relation: 'child' }]),
        family(LOST_TREASURE_ELDER_FAMILY_ID, [{ name: LOST_TREASURE_ELDER_GIVEN_NAME }]),
      ],
    })
    expect(binding?.helperNpcId).toBe(binding?.counterpartNpcId)
    expect(binding?.helperName).toBe('Jan')
  })

  it('returns valid winter and dispute defs with stable ids', () => {
    const defs = buildLostTreasureChroniclesElderQuests(testBinding())
    expect(() => validateQuestDefinitions(defs)).not.toThrow()
    expect(defs.map((def) => def.id)).toEqual([
      LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
      LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID,
    ])
    expect(defs[1]?.availability?.prerequisites).toEqual([{
      type: 'quest_outcome',
      questId: LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
      outcomeIds: [
        LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
        LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME,
      ],
    }])
  })

  it('completes the winter material route, consumes branches once, and leaves dispute locked until then', () => {
    const defs = buildLostTreasureChroniclesElderQuests(testBinding())
    const inventory = new Inventory()
    inventory.add('branch', LOST_TREASURE_CHRONICLES_WINTER_BRANCH_COUNT + 1)
    const { qm, social } = makeQuestManager(defs, inventory)
    expect(qm.isQuestAvailable(LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID)).toBe(false)
    accept(qm, '1_0:npc:2')
    speak(qm, '1_0:npc:2')
    expect(inventory.count('branch')).toBe(1)
    expect(qm.getState(LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID)).toBe('complete')
    expect(qm.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID)?.resolvedOutcomeId)
      .toBe(LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME)
    expect(qm.getRelation('1_0:npc:2')).toBe(1)
    expect(qm.getRelation('1_0:npc:0')).toBe(0)
    expect(social).toEqual([{ settlementId: '1_0', reputation: { benevolence: 2 } }])
    speak(qm, '1_0:npc:2')
    expect(inventory.count('branch')).toBe(1)
    expect(social).toHaveLength(1)
    expect(qm.isQuestAvailable(LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID)).toBe(true)
  })

  it('completes the winter neighbor route against the helper, not the elder hand-in', () => {
    const defs = buildLostTreasureChroniclesElderQuests(testBinding())
    const inventory = new Inventory()
    inventory.add('branch', LOST_TREASURE_CHRONICLES_WINTER_BRANCH_COUNT)
    const { qm, social } = makeQuestManager(defs, inventory)
    accept(qm, '1_0:npc:2')
    speak(qm, '1_0:npc:0')
    expect(inventory.count('branch')).toBe(LOST_TREASURE_CHRONICLES_WINTER_BRANCH_COUNT)
    expect(qm.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID)?.resolvedOutcomeId)
      .toBe(LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME)
    expect(qm.getRelation('1_0:npc:2')).toBe(2)
    expect(qm.getRelation('1_0:npc:0')).toBe(1)
    expect(social).toEqual([{ settlementId: '1_0', reputation: { trust: 1 } }])
    expect(qm.isQuestAvailable(LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID)).toBe(true)
  })

  it('does not silently pick the material route when talking to the helper is also possible', () => {
    const defs = buildLostTreasureChroniclesElderQuests(testBinding())
    const inventory = new Inventory()
    inventory.add('branch', LOST_TREASURE_CHRONICLES_WINTER_BRANCH_COUNT)
    const { qm } = makeQuestManager(defs, inventory)
    accept(qm, '1_0:npc:2')
    expect(qm.onInteract('1_0:npc:0')?.actions?.[0]?.label).toBeTruthy()
    expect(qm.getState(LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID)).toBe('active')
    expect(inventory.count('branch')).toBe(LOST_TREASURE_CHRONICLES_WINTER_BRANCH_COUNT)
  })

  it('unlocks dispute after either winter success and resolves support_elder vs reconcile', () => {
    const defs = buildLostTreasureChroniclesElderQuests(testBinding())
    const restored = new QuestManager(defs, undefined, new Inventory(), {
      progress: [{
        id: LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
        state: 'complete',
        stageIndex: 1,
        resolvedOutcomeId: LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME,
      }],
      relations: { '1_0:npc:2': 2, '1_0:npc:0': 1 },
    })
    expect(restored.isQuestAvailable(LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID)).toBe(true)
    accept(restored, '1_0:npc:2')
    speak(restored, '1_0:npc:2')
    speak(restored, '1_0:npc:1')
    speak(restored, '1_0:npc:1')
    expect(restored.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID)?.resolvedOutcomeId)
      .toBe(LOST_TREASURE_CHRONICLES_DISPUTE_SUPPORT_ELDER_OUTCOME)
    expect(restored.getRelation('1_0:npc:2')).toBe(4)
    expect(restored.getRelation('1_0:npc:1')).toBe(-1)
    expect(relationToLevel(restored.getRelation('1_0:npc:2'))).toBe('friendly')
  })

  it('reconcile raises both relations without granting trusted from these two quests', () => {
    const defs = buildLostTreasureChroniclesElderQuests(testBinding())
    const { qm, social } = makeQuestManager(defs)
    accept(qm, '1_0:npc:2')
    speak(qm, '1_0:npc:0')
    accept(qm, '1_0:npc:2')
    speak(qm, '1_0:npc:2')
    speak(qm, '1_0:npc:1')
    speak(qm, '1_0:npc:2')
    expect(qm.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID)?.resolvedOutcomeId)
      .toBe(LOST_TREASURE_CHRONICLES_DISPUTE_RECONCILE_OUTCOME)
    expect(qm.getRelation('1_0:npc:2')).toBe(3)
    expect(qm.getRelation('1_0:npc:1')).toBe(1)
    expect(relationToLevel(qm.getRelation('1_0:npc:2'))).toBe('friendly')
    expect(social.at(-1)).toEqual({ settlementId: '1_0', reputation: { benevolence: 2, integrity: 1 } })

    const snapshot = {
      progress: qm.exportProgress(),
      relations: qm.exportRelations(),
    }
    const restored = new QuestManager(defs, undefined, new Inventory(), snapshot, undefined, undefined, undefined, () => {
      throw new Error('terminal consequences must not replay')
    })
    expect(restored.getState(LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID)).toBe('complete')
    expect(restored.getRelation('1_0:npc:2')).toBe(3)
    restored.onInteract('1_0:npc:2')
    restored.onInteract('1_0:npc:1')
  })

  it('keeps reconcile/support_elder outcomes and varies elder reply by relation (plan quests-progression-050)', () => {
    const defs = buildLostTreasureChroniclesElderQuests(testBinding())
    const low = new QuestManager(defs, undefined, new Inventory(), {
      progress: [{
        id: LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
        state: 'complete',
        stageIndex: 1,
        resolvedOutcomeId: LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME,
      }, {
        id: LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID,
        state: 'active',
        stageIndex: 2,
      }],
      relations: { '1_0:npc:2': 0, '1_0:npc:1': 0 },
    })
    expect(low.onInteract('1_0:npc:2')?.actions?.[0]?.onSelect())
      .toBe('Łatwo ci mówić. To nie twoja rzecz zniknęła.')
    expect(low.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID)?.resolvedOutcomeId)
      .toBe(LOST_TREASURE_CHRONICLES_DISPUTE_RECONCILE_OUTCOME)

    const high = new QuestManager(defs, undefined, new Inventory(), {
      progress: [{
        id: LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
        state: 'complete',
        stageIndex: 1,
        resolvedOutcomeId: LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME,
      }, {
        id: LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID,
        state: 'active',
        stageIndex: 2,
      }],
      relations: { '1_0:npc:2': 6, '1_0:npc:1': 0 },
    })
    expect(high.onInteract('1_0:npc:2')?.actions?.[0]?.onSelect())
      .toBe('Od kogoś obcego bym tego nie słuchał. Od ciebie… jeszcze przemyślę.')
    expect(high.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID)?.resolvedOutcomeId)
      .toBe(LOST_TREASURE_CHRONICLES_DISPUTE_RECONCILE_OUTCOME)
  })
})
