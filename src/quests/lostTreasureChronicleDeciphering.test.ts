import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import type { FamilyDef } from '../settlement/families'
import type { SettlementDef } from '../settlement/settlementGenerator'
import type { LostTreasureEstateSearchArea } from '../world/locations/lostTreasureEstateSearchArea'
import { Inventory } from '../items/Inventory'
import { transferInventoryCount } from '../items/inventoryTransfer'
import { createLostTreasureArchaeologistFamily } from '../settlement/lostTreasureChroniclesArchaeologistResident'
import {
  appendAuthoredResidentFamilies,
  appendAuthoredResidentFamily,
  createLostTreasureElderFamily,
} from '../settlement/lostTreasureChroniclesElderResident'
import { createLostTreasureSpecialistFamily } from '../settlement/lostTreasureChroniclesSpecialistResident'
import { LOST_TREASURE_ESTATE_SEARCH_AREA_LOCATION_ID } from '../world/locations/lostTreasureEstateSearchArea'
import { createWorldGeneratedContainers } from '../world/worldGeneratedContainers'
import {
  buildLostTreasureChronicleDecipheringQuest,
  CHRONICLE_REFERENCE_KIND,
  createChronicleReferenceInstance,
  LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID,
  LOST_TREASURE_CHRONICLE_REFERENCE_INSTANCE_ID,
  LOST_TREASURE_DECIPHERED_FAVOUR_OUTCOME,
  LOST_TREASURE_DECIPHERED_PAID_OUTCOME,
  LOST_TREASURE_DECIPHERING_FEE,
  lostTreasureChronicleReferenceContainerSpec,
  resolveLostTreasureChronicleDecipheringBinding,
} from './lostTreasureChronicleDeciphering'
import { createEncodedChronicleInstance } from './lostTreasureChronicleSearch'
import {
  buildLostTreasureChronicleSearchQuests,
  LOST_TREASURE_CHRONICLE_ACQUIRED_OUTCOME,
  LOST_TREASURE_CHRONICLE_INSTANCE_ID,
  LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
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

function settlement(id: string, name: string, families: FamilyDef[], x = 40, z = 12): SettlementDef {
  return { id, name, families, x, z } as unknown as SettlementDef
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
  const specialistFamilies = appendAuthoredResidentFamilies(
    [family('family-0', 'Ewa'), family('family-1', 'Filip')],
    [createLostTreasureSpecialistFamily(13, 'polish')],
  )
  const sameTownFamilies = appendAuthoredResidentFamilies(
    [family('family-0', 'Celina'), family('family-1', 'Dorota')],
    [createLostTreasureArchaeologistFamily(9, 'polish'), createLostTreasureSpecialistFamily(13, 'polish')],
  )
  const elderDef = settlement('1_0', 'Lipowo', elderFamilies)
  const archaeologistDef = settlement('2_0', 'Grodno', archaeologistFamilies)
  const specialistDef = settlement('3_0', 'Brzegi', specialistFamilies, 120, -30)
  const sameTownDef = settlement('2_0', 'Grodno', sameTownFamilies)
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
  const search = resolveLostTreasureChronicleSearchBinding({
    worldSeed,
    elderDef,
    archaeologistDef,
    elderBinding,
    cemetery,
    ruins,
  })!
  const searchArea: LostTreasureEstateSearchArea = {
    locationId: LOST_TREASURE_ESTATE_SEARCH_AREA_LOCATION_ID,
    x: 410,
    z: -220,
    radius: 118,
    name: 'Okolice dawnego majątku',
  }
  const binding = resolveLostTreasureChronicleDecipheringBinding({
    worldSeed,
    search,
    specialistDef,
    searchArea,
  })
  const sameTownBinding = resolveLostTreasureChronicleDecipheringBinding({
    worldSeed,
    search,
    specialistDef: sameTownDef,
    searchArea,
  })
  return {
    elderDef,
    archaeologistDef,
    specialistDef,
    sameTownDef,
    elderBinding,
    search,
    binding,
    sameTownBinding,
    searchArea,
    worldSeed,
  }
}

function makeManager(
  binding: NonNullable<ReturnType<typeof resolveLostTreasureChronicleDecipheringBinding>>,
  elderBinding: ReturnType<typeof resolveLostTreasureChroniclesElderBinding>,
  search: NonNullable<ReturnType<typeof resolveLostTreasureChronicleSearchBinding>>,
  inventory: Inventory,
  opts: {
    stageIndex: number
    coinsTo?: Inventory
    referenceTo?: Inventory
    revealed?: string[]
    social?: Array<{ settlementId: string, reputation?: Record<string, number> }>
  },
) {
  const quests = [
    ...buildLostTreasureChroniclesElderQuests(elderBinding!),
    ...buildLostTreasureChronicleSearchQuests(search),
    buildLostTreasureChronicleDecipheringQuest(binding),
  ]
  return new QuestManager(
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
        state: 'complete',
        stageIndex: 2,
        resolvedOutcomeId: LOST_TREASURE_CHRONICLE_ACQUIRED_OUTCOME,
      }, {
        id: LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID,
        state: 'active',
        stageIndex: opts.stageIndex,
      }],
      relations: {},
    },
    undefined,
    undefined,
    undefined,
    (consequence) => {
      opts.social?.push(consequence)
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
    {
      canResolve: (_questId, _outcomeId, context) => {
        if (context.requireItemInstanceId && !inventory.getInstance(context.requireItemInstanceId)) {
          return false
        }
        return Boolean(context.requireItemInstanceId)
      },
      onResolve: () => {},
    },
    {
      revealLocation: (locationId) => opts.revealed?.push(locationId),
      transferItemInstance: (instanceId, npcId) => {
        if (npcId !== binding.specialistNpcId) return false
        const instance = inventory.getInstance(instanceId)
        if (!instance) return false
        if (!inventory.removeInstance(instanceId)) return false
        if (opts.referenceTo) return opts.referenceTo.addInstance(instance)
        return true
      },
      transferItemCount: (kind, count, npcId) => {
        if (npcId !== binding.specialistNpcId || !opts.coinsTo) return false
        return transferInventoryCount(inventory, opts.coinsTo, kind, count)
      },
    },
  )
}

describe('lost treasure chronicle deciphering (quests-progression-039)', () => {
  it('binds a stable specialist without requiring a third settlement', () => {
    const { binding, sameTownBinding, specialistDef, search } = fixtures()
    expect(binding).not.toBeNull()
    expect(binding?.specialistSettlementId).toBe(specialistDef.id)
    expect(binding?.chronicleInstanceId).toBe(LOST_TREASURE_CHRONICLE_INSTANCE_ID)
    expect(binding?.searchAreaLocationId).toBe(LOST_TREASURE_ESTATE_SEARCH_AREA_LOCATION_ID)
    expect(sameTownBinding?.specialistNpcId).not.toBe(search.archaeologistNpcId)
    expect(sameTownBinding?.specialistSettlementId).toBe(search.archaeologistSettlementId)
    expect(fixtures().binding?.specialistNpcId).toBe(binding?.specialistNpcId)
    expect(fixtures().binding?.searchAreaRadius).toBe(binding?.searchAreaRadius)
  })

  it('does not treat a completed 038 as possession without the chronicle instance', () => {
    const { binding, elderBinding, search } = fixtures()
    const inventory = new Inventory()
    const qm = makeManager(binding!, elderBinding, search, inventory, { stageIndex: 0 })
    expect(qm.onInteract(binding!.archaeologistNpcId)?.actions?.some((action) => action.label.includes('kronikę'))).toBe(false)
    inventory.addInstance(createEncodedChronicleInstance())
    const labels = qm.onInteract(binding!.archaeologistNpcId)?.actions?.map((action) => action.label) ?? []
    expect(labels.some((label) => label.includes('kronikę'))).toBe(true)
  })

  it('keeps pay and favour as explicit choices when both are available', () => {
    const { binding, elderBinding, search } = fixtures()
    const inventory = new Inventory()
    inventory.addInstance(createEncodedChronicleInstance())
    inventory.add('coin', LOST_TREASURE_DECIPHERING_FEE)
    const qm = makeManager(binding!, elderBinding, search, inventory, { stageIndex: 1 })
    const labels = qm.onInteract(binding!.specialistNpcId)?.actions?.map((action) => action.label) ?? []
    expect(labels.some((label) => label.includes(`${LOST_TREASURE_DECIPHERING_FEE} monet`))).toBe(true)
    expect(labels.some((label) => label.includes('glosariusz'))).toBe(true)
  })

  it('does not auto-select payment when the player can afford it', () => {
    const { binding, elderBinding, search } = fixtures()
    const inventory = new Inventory()
    inventory.addInstance(createEncodedChronicleInstance())
    inventory.add('coin', LOST_TREASURE_DECIPHERING_FEE)
    const coinsTo = new Inventory()
    const qm = makeManager(binding!, elderBinding, search, inventory, { stageIndex: 1, coinsTo })
    const favour = qm.onInteract(binding!.specialistNpcId)?.actions?.find((action) => action.label.includes('glosariusz'))
    favour?.onSelect()
    expect(qm.getState(LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID)).toBe('active')
    expect(inventory.count('coin')).toBe(LOST_TREASURE_DECIPHERING_FEE)
    expect(coinsTo.count('coin')).toBe(0)
    expect(qm.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID)?.stageIndex)
      .toBe(2)
  })

  it('charges coins once into specialist personal inventory and cannot replay after restore', () => {
    const { binding, elderBinding, search } = fixtures()
    const inventory = new Inventory()
    inventory.addInstance(createEncodedChronicleInstance())
    inventory.add('coin', LOST_TREASURE_DECIPHERING_FEE)
    const coinsTo = new Inventory()
    const revealed: string[] = []
    const social: Array<{ settlementId: string, reputation?: Record<string, number> }> = []
    const qm = makeManager(binding!, elderBinding, search, inventory, {
      stageIndex: 1,
      coinsTo,
      revealed,
      social,
    })
    const pay = qm.onInteract(binding!.specialistNpcId)?.actions?.find((action) => action.label.includes('monet'))
    pay?.onSelect()
    expect(qm.getResolvedOutcomeId(LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID))
      .toBe(LOST_TREASURE_DECIPHERED_PAID_OUTCOME)
    expect(inventory.count('coin')).toBe(0)
    expect(coinsTo.count('coin')).toBe(LOST_TREASURE_DECIPHERING_FEE)
    expect(inventory.getInstance(LOST_TREASURE_CHRONICLE_INSTANCE_ID)?.id).toBe(LOST_TREASURE_CHRONICLE_INSTANCE_ID)
    expect(revealed).toEqual([binding!.searchAreaLocationId])
    expect(qm.getRelation(binding!.specialistNpcId)).toBe(1)
    expect(social).toEqual([])

    const restoredQm = new QuestManager(
      [
        ...buildLostTreasureChroniclesElderQuests(elderBinding!),
        ...buildLostTreasureChronicleSearchQuests(search),
        buildLostTreasureChronicleDecipheringQuest(binding!),
      ],
      undefined,
      inventory,
      { progress: qm.exportProgress(), relations: qm.exportRelations() },
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
      undefined,
      undefined,
      { canResolve: () => true, onResolve: () => {} },
      {
        transferItemCount: () => {
          throw new Error('payment replayed')
        },
      },
    )
    expect(restoredQm.getState(LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID)).toBe('complete')
    expect(restoredQm.onInteract(binding!.specialistNpcId)?.actions ?? []).toEqual([])
    expect(inventory.count('coin')).toBe(0)
    expect(coinsTo.count('coin')).toBe(LOST_TREASURE_DECIPHERING_FEE)
  })

  it('leaves coins and quest state unchanged when the player cannot afford the fee', () => {
    const { binding, elderBinding, search } = fixtures()
    const inventory = new Inventory()
    inventory.addInstance(createEncodedChronicleInstance())
    inventory.add('coin', LOST_TREASURE_DECIPHERING_FEE - 1)
    const coinsTo = new Inventory()
    const qm = makeManager(binding!, elderBinding, search, inventory, { stageIndex: 1, coinsTo })
    const reply = qm.onInteract(binding!.specialistNpcId)?.actions
      ?.find((action) => action.label.includes('monet'))
      ?.onSelect()
    expect(reply).toContain('Nie masz dość monet')
    expect(qm.getState(LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID)).toBe('active')
    expect(inventory.count('coin')).toBe(LOST_TREASURE_DECIPHERING_FEE - 1)
    expect(coinsTo.count('coin')).toBe(0)
  })

  it('catches up from early reference ownership and returns that exact instance once', () => {
    const { binding, elderBinding, search } = fixtures()
    const inventory = new Inventory()
    inventory.addInstance(createEncodedChronicleInstance())
    inventory.addInstance(createChronicleReferenceInstance())
    const revealed: string[] = []
    const social: Array<{ settlementId: string, reputation?: Record<string, number> }> = []
    const referenceTo = new Inventory()
    const qm = makeManager(binding!, elderBinding, search, inventory, {
      stageIndex: 1,
      revealed,
      social,
      referenceTo,
    })
    qm.onInteract(binding!.specialistNpcId)?.actions
      ?.find((action) => action.label.includes('glosariusz'))
      ?.onSelect()
    qm.notifyInventoryChanged()
    expect(qm.exportProgress().find((entry) => entry.id === LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID)?.stageIndex)
      .toBe(3)
    const reply = qm.onInteract(binding!.specialistNpcId)?.actions?.[0]?.onSelect()
    expect(reply).toContain('majątku')
    expect(qm.getResolvedOutcomeId(LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID))
      .toBe(LOST_TREASURE_DECIPHERED_FAVOUR_OUTCOME)
    expect(inventory.getInstance(LOST_TREASURE_CHRONICLE_REFERENCE_INSTANCE_ID)).toBeNull()
    expect(referenceTo.getInstance(LOST_TREASURE_CHRONICLE_REFERENCE_INSTANCE_ID)?.id)
      .toBe(LOST_TREASURE_CHRONICLE_REFERENCE_INSTANCE_ID)
    expect(inventory.getInstance(LOST_TREASURE_CHRONICLE_INSTANCE_ID)?.kind).toBe('encoded_chronicle')
    expect(qm.getRelation(binding!.specialistNpcId)).toBe(2)
    expect(social[0]?.reputation?.benevolence).toBe(1)
    expect(revealed).toEqual([binding!.searchAreaLocationId])
  })

  it('does not refill the reference document into a saved-empty container', () => {
    const { binding } = fixtures()
    const spec = lostTreasureChronicleReferenceContainerSpec(binding!)
    expect(spec.initialInstances?.[0]?.id).toBe(LOST_TREASURE_CHRONICLE_REFERENCE_INSTANCE_ID)
    expect(spec.initialInstances?.[0]?.kind).toBe(CHRONICLE_REFERENCE_KIND)
    const containers = createWorldGeneratedContainers(
      new Scene(),
      () => 0,
      [spec],
      [{ id: spec.id, x: spec.x, z: spec.z, yaw: spec.yaw, counts: {}, instances: [] }],
    )
    expect(containers.containerInstances(spec.id, CHRONICLE_REFERENCE_KIND)).toEqual([])
  })
})
