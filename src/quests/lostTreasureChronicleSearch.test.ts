import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import type { FamilyDef } from '../settlement/families'
import type { SettlementDef } from '../settlement/settlementGenerator'
import { Inventory } from '../items/Inventory'
import { createLostTreasureArchaeologistFamily } from '../settlement/lostTreasureChroniclesArchaeologistResident'
import { appendAuthoredResidentFamily, createLostTreasureElderFamily } from '../settlement/lostTreasureChroniclesElderResident'
import { cemeteryGraveLayout } from '../settlement/props'
import { createWorldGeneratedContainers } from '../world/worldGeneratedContainers'
import {
  buildLostTreasureChronicleSearchQuests,
  chronicleSearchOfferLine,
  chronicleSearchTruth,
  createEncodedChronicleInstance,
  ENCODED_CHRONICLE_KIND,
  LOST_TREASURE_CEMETERY_FAVOUR_QUEST_ID,
  LOST_TREASURE_CHRONICLE_ACQUIRED_OUTCOME,
  LOST_TREASURE_CHRONICLE_INSTANCE_ID,
  LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
  LOST_TREASURE_GRAVE_ACCESS_OUTCOME,
  lostTreasureChronicleGravePlacement,
  lostTreasureChronicleRuinsContainerSpec,
  type LostTreasureChronicleSearchBinding,
  resolveChronicleSearchLead,
  resolveLostTreasureChronicleSearchBinding,
} from './lostTreasureChronicleSearch'
import {
  buildLostTreasureChroniclesElderQuests,
  LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
  LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
  resolveLostTreasureChroniclesElderBinding,
} from './lostTreasureChroniclesElder'
import { QuestManager } from './QuestManager'

const PERSONALITY = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
}

function family(id: string, name: string): FamilyDef {
  return {
    id,
    members: [{
      name,
      lastName: 'Nowak',
      relation: 'single',
      character: {
        name,
        lastName: 'Nowak',
        gender: 'female',
        role: 'farmer',
        personality: PERSONALITY,
        traits: ['curious'],
      },
      scale: 1,
      age: 28,
    }],
  }
}

function settlement(id: string, name: string, families: FamilyDef[]): SettlementDef {
  return { id, name, families } as unknown as SettlementDef
}

function fixtures(worldSeed = 42) {
  const elderFamilies = appendAuthoredResidentFamily(
    [family('family-0', 'Ada'), family('family-1', 'Bartek')],
    createLostTreasureElderFamily(4, 'polish'),
  )
  const archaeologistFamilies = appendAuthoredResidentFamily(
    [family('family-0', 'Celina'), family('family-1', 'Dorota')],
    createLostTreasureArchaeologistFamily(9, 'polish'),
  )
  const elderDef = settlement('1_0', 'Lipowo', elderFamilies)
  const archaeologistDef = settlement('2_0', 'Grodno', archaeologistFamilies)
  const elderBinding = resolveLostTreasureChroniclesElderBinding(elderDef)!
  const cemetery = {
    id: 'cemetery:a:2_0:0',
    x: 40,
    z: 12,
    rotationY: 0,
    scale: 1,
    cemeterySize: 'SM' as const,
  }
  const ruins = {
    id: 'smallRuins:3:1:0:abc',
    kind: 'smallRuins' as const,
    x: 88,
    z: -20,
    rotationY: 0.2,
    scale: 1,
  }
  const binding = resolveLostTreasureChronicleSearchBinding({
    worldSeed,
    elderDef,
    archaeologistDef,
    elderBinding,
    cemetery,
    ruins,
  })
  return { elderDef, archaeologistDef, elderBinding, binding, cemetery, ruins, worldSeed }
}

describe('lost treasure chronicle search (quests-progression-038)', () => {
  it('binds a stable archaeologist NpcId without looking up the display name', () => {
    const { binding, archaeologistDef } = fixtures()
    expect(binding).not.toBeNull()
    expect(binding?.archaeologistSettlementId).toBe(archaeologistDef.id)
    expect(binding?.archaeologistName).toBe('Konstanty')
    expect(binding?.caretakerNpcId).not.toBe(binding?.archaeologistNpcId)
    const again = fixtures()
    expect(again.binding?.archaeologistNpcId).toBe(binding?.archaeologistNpcId)
  })

  it('does not shift the 037 elder NpcId', () => {
    const { elderBinding } = fixtures()
    const elderFamilies = appendAuthoredResidentFamily(
      [family('family-0', 'Ada'), family('family-1', 'Bartek')],
      createLostTreasureElderFamily(4, 'polish'),
    )
    const again = resolveLostTreasureChroniclesElderBinding(
      settlement('1_0', 'Lipowo', elderFamilies),
    )
    expect(again?.elderNpcId).toBe(elderBinding.elderNpcId)
  })

  it('picks a real cemetery grave index and same-seed grave/ruins truth', () => {
    const { binding, cemetery, ruins, worldSeed } = fixtures(17)
    const layout = cemeteryGraveLayout(cemetery.cemeterySize, cemetery.scale)
    expect(binding?.graveIndex).toBeGreaterThanOrEqual(0)
    expect(binding?.graveIndex).toBeLessThan(layout.length)
    expect(binding?.graveSpotId).toBe(`${cemetery.id}:${binding?.graveIndex}`)
    expect(binding?.truth).toBe(chronicleSearchTruth(worldSeed, cemetery.id, binding!.graveIndex, ruins.id))
    expect(fixtures(17).binding?.truth).toBe(binding?.truth)
    expect(fixtures(17).binding?.graveIndex).toBe(binding?.graveIndex)
  })

  it('materializes exactly one chronicle source in both truth variants', () => {
    let graveTruth: LostTreasureChronicleSearchBinding | null = null
    let ruinsTruth: LostTreasureChronicleSearchBinding | null = null
    for (let seed = 1; seed < 40 && (!graveTruth || !ruinsTruth); seed++) {
      const { binding } = fixtures(seed)
      if (!binding) continue
      if (binding.truth === 'grave') graveTruth = binding
      else ruinsTruth = binding
    }
    expect(graveTruth).not.toBeNull()
    expect(ruinsTruth).not.toBeNull()
    expect(lostTreasureChronicleGravePlacement(graveTruth!).instance.id).toBe(LOST_TREASURE_CHRONICLE_INSTANCE_ID)
    expect(lostTreasureChronicleRuinsContainerSpec(graveTruth!).initialInstances?.[0]?.id)
      .not.toBe(LOST_TREASURE_CHRONICLE_INSTANCE_ID)
    expect(lostTreasureChronicleGravePlacement(ruinsTruth!).instance.id)
      .not.toBe(LOST_TREASURE_CHRONICLE_INSTANCE_ID)
    expect(lostTreasureChronicleRuinsContainerSpec(ruinsTruth!).initialInstances?.[0]?.id)
      .toBe(LOST_TREASURE_CHRONICLE_INSTANCE_ID)
  })

  it('derives basic vs strong lead without persisting a tier', () => {
    expect(resolveChronicleSearchLead({
      elderRelation: 0,
      reputation: { trust: 0, competence: 0 },
    })).toBe('basic')
    expect(resolveChronicleSearchLead({
      elderRelation: 3,
      reputation: { trust: 0, competence: 0 },
    })).toBe('strong')
    expect(resolveChronicleSearchLead({
      elderRelation: 1,
      disputeOutcomeId: 'support_elder',
      reputation: { trust: 0, competence: 0 },
    })).toBe('strong')
    const { binding } = fixtures()
    expect(chronicleSearchOfferLine(binding!, 'basic')).not.toContain(binding!.researcherSurname)
    expect(chronicleSearchOfferLine(binding!, 'strong')).toContain(binding!.researcherSurname)
  })

  it('does not refill story instances into a saved-empty ruins container', () => {
    const { binding } = fixtures()
    const spec = lostTreasureChronicleRuinsContainerSpec(binding!)
    const containers = createWorldGeneratedContainers(
      new Scene(),
      () => 0,
      [spec],
      [{ id: spec.id, x: spec.x, z: spec.z, yaw: spec.yaw, counts: {}, instances: [] }],
    )
    expect(containers.containerInstances(spec.id, ENCODED_CHRONICLE_KIND)).toEqual([])
    expect(containers.containerInstances(spec.id, 'chronicle_search_evidence')).toEqual([])
  })

  it('completes the chapter from physical chronicle ownership, not source depletion', () => {
    const { binding, elderBinding } = fixtures()
    const quests = [
      ...buildLostTreasureChroniclesElderQuests(elderBinding),
      ...buildLostTreasureChronicleSearchQuests(binding!),
    ]
    const inventory = new Inventory()
    inventory.addInstance(createEncodedChronicleInstance())
    const qm = new QuestManager(
      quests,
      undefined,
      inventory,
      {
        progress: [{
          id: LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
          state: 'complete',
          stageIndex: 1,
          resolvedOutcomeId: LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
        }, {
          id: LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
          state: 'active',
          stageIndex: 0,
        }],
        relations: { [elderBinding.elderNpcId]: 2 },
      },
    )
    expect(qm.getState(LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)).toBe('complete')
    expect(qm.getResolvedOutcomeId(LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID))
      .toBe(LOST_TREASURE_CHRONICLE_ACQUIRED_OUTCOME)
  })

  it('does not complete from a resolved grave while the chronicle is only on the ground', () => {
    const { binding, elderBinding } = fixtures()
    const quests = [
      ...buildLostTreasureChroniclesElderQuests(elderBinding),
      ...buildLostTreasureChronicleSearchQuests(binding!),
    ]
    const qm = new QuestManager(
      quests,
      undefined,
      new Inventory(),
      {
        progress: [{
          id: LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
          state: 'complete',
          stageIndex: 1,
          resolvedOutcomeId: LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
        }, {
          id: LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
          state: 'active',
          stageIndex: 2,
        }],
        relations: {},
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        hasReadItem: () => false,
        hasDiscoveredLocation: () => false,
        isWorldContainerLooted: () => false,
        hasResolvedHiddenFindSpot: (spotId) => spotId === binding!.graveSpotId,
        hasAcquiredPortableContainer: () => false,
      },
    )
    qm.pollWorldProgressionObjectives()
    expect(qm.getState(LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)).toBe('active')
  })

  it('treats false-site looting as progress, not chapter completion', () => {
    const { binding, elderBinding } = fixtures()
    const quests = [
      ...buildLostTreasureChroniclesElderQuests(elderBinding),
      ...buildLostTreasureChronicleSearchQuests(binding!),
    ]
    const falseContainer = binding!.truth === 'grave'
    const qm = new QuestManager(
      quests,
      undefined,
      new Inventory(),
      {
        progress: [{
          id: LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
          state: 'complete',
          stageIndex: 1,
          resolvedOutcomeId: LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
        }, {
          id: LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
          state: 'active',
          stageIndex: 1,
        }],
        relations: {},
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        hasReadItem: () => false,
        hasDiscoveredLocation: () => false,
        isWorldContainerLooted: (containerId) => (
          falseContainer && containerId === binding!.ruinsContainerId
        ),
        hasResolvedHiddenFindSpot: (spotId) => (
          !falseContainer && spotId === binding!.graveSpotId
        ),
        hasAcquiredPortableContainer: () => false,
      },
    )
    qm.pollWorldProgressionObjectives()
    expect(qm.getState(LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)).toBe('active')
    expect(qm.getResolvedOutcomeId(LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)).toBeUndefined()
  })

  it('exposes the cemetery-favour outcome as the only grave-access fact', () => {
    const { binding } = fixtures()
    const favour = buildLostTreasureChronicleSearchQuests(binding!).find(
      (quest) => quest.id === LOST_TREASURE_CEMETERY_FAVOUR_QUEST_ID,
    )
    expect(favour?.outcomes.map((outcome) => outcome.id)).toEqual([LOST_TREASURE_GRAVE_ACCESS_OUTCOME])
    expect(binding?.questId).toBe(LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)
  })

  it('defers the ruins clue through world knowledge without rerolling chapter truth (plan quests-progression-047)', async () => {
    const { binding, elderBinding } = fixtures()
    const search = buildLostTreasureChronicleSearchQuests(binding!).find(
      (quest) => quest.id === LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
    )!
    expect(search.worldKnowledge?.[0]).toMatchObject({
      id: 'ruins',
      bind: { type: 'landmark', landmarkId: binding!.ruinsLandmarkId },
    })
    let elapsedDays = 0
    let resolves = 0
    const quests = [
      ...buildLostTreasureChroniclesElderQuests(elderBinding),
      ...buildLostTreasureChronicleSearchQuests(binding!),
    ]
    const qm = new QuestManager(
      quests,
      undefined,
      new Inventory(),
      {
        progress: [{
          id: LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
          state: 'complete',
          stageIndex: 1,
          resolvedOutcomeId: LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
        }, {
          id: LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
          state: 'active',
          stageIndex: 0,
        }],
        relations: {},
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { getWorldSeed: () => 1, getTimeOfDay: () => 0, getElapsedDays: () => elapsedDays },
      undefined,
      undefined,
      undefined,
      {
        resolve: async () => {
          resolves += 1
          return {
            kind: 'landmark',
            landmarkId: binding!.ruinsLandmarkId,
            landmarkKind: 'smallRuins',
          }
        },
        describe: (ref) => `clue:${ref.landmarkId}`,
      },
    )
    const meet = qm.onInteract(binding!.archaeologistNpcId)
    meet?.actions?.[0]?.onSelect()
    await Promise.resolve()
    expect(qm.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)?.stageIndex).toBe(1)
    expect(qm.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)?.worldKnowledge?.ruins?.status)
      .toBe('resolved')
    expect(resolves).toBe(1)
    const pending = qm.onInteract(binding!.archaeologistNpcId)
    expect(pending?.actions?.some((action) => action.label.includes('notatki'))).toBeFalsy()
    expect(pending?.line).toContain('notatki')
    elapsedDays = 1 / 24
    const ready = qm.onInteract(binding!.archaeologistNpcId)
    expect(ready?.actions?.[0]?.label).toContain('trasę')
    const reply = ready?.actions?.[0]?.onSelect()
    expect(reply).toContain(`clue:${binding!.ruinsLandmarkId}`)
    expect(qm.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)?.stageIndex).toBe(1)
    expect(qm.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)?.worldKnowledge?.ruins?.revealed)
      .toBe(true)
    expect(binding!.truth === 'grave' || binding!.truth === 'ruins').toBe(true)
    expect(binding!.ruinsContainerId).toBe(fixtures().binding?.ruinsContainerId)
  })

  it('migrates an older active chronicle-search save into revealed ruins knowledge', () => {
    const { binding, elderBinding } = fixtures()
    const quests = [
      ...buildLostTreasureChroniclesElderQuests(elderBinding),
      ...buildLostTreasureChronicleSearchQuests(binding!),
    ]
    const qm = new QuestManager(
      quests,
      undefined,
      new Inventory(),
      {
        progress: [{
          id: LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
          state: 'complete',
          stageIndex: 1,
          resolvedOutcomeId: LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
        }, {
          id: LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
          state: 'active',
          stageIndex: 1,
        }],
        relations: {},
      },
    )
    const knowledge = qm.exportProgress()
      .find((entry) => entry.id === LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)
      ?.worldKnowledge?.ruins
    expect(qm.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)?.stageIndex).toBe(1)
    expect(knowledge?.status).toBe('resolved')
    expect(knowledge?.revealed).toBe(true)
    expect(knowledge?.ref?.landmarkId).toBe(binding!.ruinsLandmarkId)
  })

  it('adds an optional archaeologist social action without changing chronicle acquisition (plan quests-progression-050)', () => {
    const { binding, elderBinding } = fixtures()
    const search = buildLostTreasureChronicleSearchQuests(binding!).find(
      (quest) => quest.id === LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
    )!
    const social = search.stages.find((stage) => stage.id === 'investigate')?.dialogueActions
      ?.find((action) => action.playerLine.includes('resztę notatek'))
    expect(social?.skipAdvance).toBe(true)
    expect(social?.requireWorldKnowledgeReady).toBeUndefined()
    expect(social?.effects).toBeUndefined()
    expect(search.outcomes.map((outcome) => outcome.id)).toEqual([LOST_TREASURE_CHRONICLE_ACQUIRED_OUTCOME])

    const quests = [
      ...buildLostTreasureChroniclesElderQuests(elderBinding),
      ...buildLostTreasureChronicleSearchQuests(binding!),
    ]
    const qm = new QuestManager(quests, undefined, new Inventory(), {
      progress: [{
        id: LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
        state: 'complete',
        stageIndex: 1,
        resolvedOutcomeId: LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
      }, {
        id: LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
        state: 'active',
        stageIndex: 1,
      }],
      relations: {},
    })
    const reply = qm.onInteract(binding!.archaeologistNpcId)?.actions
      ?.find((action) => action.label.includes('resztę notatek'))
      ?.onSelect()
    expect(reply).toBe('Najpierw sprawdź to, co już dostałeś. Nie będę zgadywał za ciebie.')
    expect(qm.getState(LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)).toBe('active')
    expect(qm.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID)?.stageIndex).toBe(1)
    expect(qm.onInteract(binding!.archaeologistNpcId)?.line)
      .toBe('Przejrzyj notatki, które już masz. Potem wrócimy do ruin.')
    expect(qm.onInteract(binding!.archaeologistNpcId)?.actions?.some((action) => action.label.includes('resztę notatek')) ?? false)
      .toBe(false)
  })
})
