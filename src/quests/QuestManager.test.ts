import { describe, expect, it } from 'vitest'
import type { SocialConsequence } from '../reputation/ReputationManager'
import type { QuestDialogOverride, QuestManagerInitial, QuestSocialAvailabilityLookup } from './QuestManager'
import type { AuthoredQuestDef, QuestDef } from './quests'
import { WOLF_DEN_ID } from '../fauna/AnimalSpawner'
import { Inventory } from '../items/Inventory'
import { materializeAuthoredQuestDefs } from './materializeAuthoredQuests'
import { QuestManager } from './QuestManager'
import { bindExactCaveQuests, buildHorseAcquisitionQuest, QUESTS, relationToLevel } from './quests'

const NAME_AS_ID = (['Anna', 'Piotr', 'Kasia', 'Marek'] as const).map((name) => ({ id: name, name }))

function runtimeAuthored(def: AuthoredQuestDef, settlementId = 'home'): QuestDef {
  return materializeAuthoredQuestDefs(
    [{ ...def, settlementId: def.settlementId ?? settlementId }],
    NAME_AS_ID,
  )[0]!
}

function quest(
  partial: Omit<QuestDef, 'title' | 'description' | 'outcomes' | 'giver'> & Partial<Pick<QuestDef, 'title' | 'description' | 'outcomes' | 'giver'>>,
): QuestDef {
  const giver = partial.giver ?? { npcId: partial.giverName }
  return {
    ...partial,
    giver,
    title: partial.title ?? partial.id,
    description: partial.description ?? partial.offerLine,
    outcomes: partial.outcomes ?? [{
      id: 'complete',
      state: 'complete',
      consequences: { relations: [{ npc: giver, delta: 1 }] },
    }],
  }
}

const simpleQuest = quest({
  id: 'simple',
  giverName: 'Anna',
  offerLine: 'offer',
  stages: [
    { objective: { type: 'interact_well' }, description: 'well', reminderLine: 'remind' },
  ],
  reportLine: 'report',
})

const gatedQuest = quest({
  id: 'gated',
  giverName: 'Anna',
  offerLine: 'offer gated',
  stages: [
    { objective: { type: 'interact_tree' }, description: 'tree', reminderLine: 'remind' },
  ],
  reportLine: 'report gated',
  availability: {
    prerequisites: [
      { type: 'relation', npc: { npcId: 'Anna' }, minimum: 'trusted' },
    ],
  },
})

const effectsQuest = quest({
  id: 'effects',
  giverName: 'Kasia',
  offerLine: 'offer effects',
  stages: [
    { objective: { type: 'interact_well' }, description: 'well', reminderLine: 'remind' },
  ],
  reportLine: 'report effects',
  outcomes: [{
    id: 'complete',
    state: 'complete',
    consequences: { relations: [{ npc: { npcId: 'Kasia' }, delta: 3 }] },
  }],
})

function makeManager(
  defs: readonly QuestDef[],
  resolveAnimalTarget?: (kind: string) => string | undefined,
  grantItem?: (kind: string, count: number) => void,
  initial?: QuestManagerInitial,
  socialAvailability?: QuestSocialAvailabilityLookup,
  settlementRatInfestation?: import('./QuestManager').SettlementRatInfestationLookup,
  spawnPointDestruction?: import('./QuestManager').SpawnPointDestructionLookup,
  worldQuestSource?: import('./QuestManager').WorldQuestSourceLookup,
  lostLivestockSource?: import('./opportunities/worldQuestOpportunityTypes').LostLivestockSourceLookup,
): QuestManager {
  return new QuestManager(
    defs,
    undefined,
    new Inventory(),
    initial,
    grantItem,
    resolveAnimalTarget,
    undefined,
    undefined,
    socialAvailability,
    settlementRatInfestation,
    undefined,
    undefined,
    spawnPointDestruction,
    undefined,
    worldQuestSource,
    lostLivestockSource,
  )
}

const wolfQuest = quest({
  id: 'wolf',
  giverName: 'Anna',
  offerLine: 'offer wolf',
  stages: [
    { objective: { type: 'kill_target_animal', kind: 'wolf' }, description: 'kill wolf', reminderLine: 'remind' },
  ],
  reportLine: 'report wolf',
})

/** Talks to `npcName` and accepts the offer, moving the matching quest to `active`. */
function acceptOffer(qm: QuestManager, npcName: string): void {
  const offer = qm.onInteract(npcName)
  offer?.offer?.onAccept()
}

function selectAction(dialog: QuestDialogOverride | null, index = 0): string | undefined {
  return dialog?.actions?.[index]?.onSelect()
}

/** Selects the first authored dialogue action from the current NPC override. */
function speak(qm: QuestManager, npcName: string, index = 0): string | undefined {
  return selectAction(qm.onInteract(npcName), index)
}

const CAVE_REF = { type: 'interact_spawner', spawnerType: 'rockDen', spawnerId: 'test-cave' } as const

describe('relationToLevel', () => {
  it('maps numeric relation to the highest threshold met', () => {
    expect(relationToLevel(-5)).toBe('stranger')
    expect(relationToLevel(0)).toBe('stranger')
    expect(relationToLevel(1)).toBe('acquainted')
    expect(relationToLevel(2)).toBe('acquainted')
    expect(relationToLevel(3)).toBe('friendly')
    expect(relationToLevel(5)).toBe('friendly')
    expect(relationToLevel(6)).toBe('trusted')
    expect(relationToLevel(100)).toBe('trusted')
  })
})

describe('QuestManager availability', () => {
  it('does not offer a quest whose relation gate is unmet', () => {
    const qm = makeManager([gatedQuest])
    expect(qm.isQuestAvailable('gated')).toBe(false)
    expect(qm.onInteract('Anna')).toBeNull()
    expect(qm.getState('gated')).toBe('not_offered')
  })

  it('hides an unavailable not_offered quest from the log', () => {
    const qm = makeManager([gatedQuest])
    expect(qm.list()).toHaveLength(0)
  })

  it('stays below the gate after a single default-reward completion (+1 relation)', () => {
    const qm = makeManager([simpleQuest, gatedQuest])
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    speak(qm, 'Anna') // report -> complete, +1 relation
    expect(qm.getRelation('Anna')).toBe(1)
    expect(qm.isQuestAvailable('gated')).toBe(false)
  })

  it('unlocks a gated quest once relation crosses the threshold via effects', () => {
    const boosted = quest({
      ...simpleQuest,
      outcomes: [{
        id: 'complete',
        state: 'complete',
        consequences: { relations: [{ npc: { npcId: 'Anna' }, delta: 6 }] },
      }],
    })
    const qm = makeManager([boosted, gatedQuest])
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    speak(qm, 'Anna')
    expect(qm.getRelation('Anna')).toBe(6)
    expect(qm.getRelationLevel('Anna')).toBe('trusted')
    expect(qm.isQuestAvailable('gated')).toBe(true)
    expect(qm.list().some((e) => e.id === 'gated')).toBe(true)
    const offer = qm.onInteract('Anna')
    expect(offer?.line).toBe('offer gated')
  })

  it('availability check does not itself mutate quest state', () => {
    const qm = makeManager([gatedQuest])
    qm.isQuestAvailable('gated')
    qm.isQuestAvailable('gated')
    expect(qm.getState('gated')).toBe('not_offered')
  })
})

describe('QuestManager outcomes', () => {
  it('does not apply an implicit giver relation when consequences omit relations', () => {
    const noRelation = quest({
      ...simpleQuest,
      outcomes: [{ id: 'complete', state: 'complete' }],
    })
    const qm = makeManager([noRelation])
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    speak(qm, 'Anna')
    expect(qm.getRelation('Anna')).toBe(0)
    expect(qm.getState('simple')).toBe('complete')
  })

  it('applies authored relation consequences exactly once', () => {
    const qm = makeManager([effectsQuest])
    acceptOffer(qm, 'Kasia')
    qm.onInteractObjective({ type: 'interact_well' })
    const result = qm.onInteract('Kasia')
    expect(result?.line).toBe('No i jak? Udało się?')
    expect(qm.getState('effects')).toBe('ready_to_report')
    expect(selectAction(result)).toBe('report effects')
    expect(qm.getRelation('Kasia')).toBe(3)
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe('complete')
    speak(qm, 'Kasia')
    expect(qm.getRelation('Kasia')).toBe(3)
  })

  it('does not bump a talk_to_npc target unless the outcome names them', () => {
    const relay = quest({
      id: 'relay',
      giverName: 'Anna',
      offerLine: 'offer',
      stages: [
        { objective: { type: 'talk_to_npc', npc: { npcId: 'Piotr' } }, description: 'talk', reminderLine: 'remind', progressLine: 'got it' },
      ],
      reportLine: 'report',
      outcomes: [{
        id: 'delivered',
        state: 'complete',
        consequences: { relations: [{ npc: { npcId: 'Anna' }, delta: 1 }] },
      }],
    })
    const qm = makeManager([relay])
    acceptOffer(qm, 'Anna')
    speak(qm, 'Piotr')
    speak(qm, 'Anna')
    expect(qm.getRelation('Anna')).toBe(1)
    expect(qm.getRelation('Piotr')).toBe(0)
  })
})

describe('QuestManager kill_target_animal binding', () => {
  it('binds to the resolver-supplied animalId on accept, and completes only on that animal\'s death', () => {
    const qm = makeManager([wolfQuest], () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    expect(qm.getState('wolf')).toBe('active')

    // A different wolf dying does not satisfy the objective.
    expect(qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-2' })).toBeNull()
    expect(qm.getState('wolf')).toBe('active')

    // The bound wolf dying does.
    const override = qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })
    expect(override?.line).toBe('kill wolf')
    expect(qm.getState('wolf')).toBe('ready_to_report')
  })

  it('does not bind a target when the resolver finds no live candidate', () => {
    const qm = makeManager([wolfQuest], () => undefined)
    acceptOffer(qm, 'Anna')
    expect(qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })).toBeNull()
    expect(qm.getState('wolf')).toBe('active')
  })

  it('clears the binding on completion so a stale id cannot re-trigger it', () => {
    const qm = makeManager([wolfQuest], () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })
    speak(qm, 'Anna') // report -> complete
    expect(qm.getState('wolf')).toBe('complete')
    // Re-reporting a death for the same id afterward must not affect anything.
    expect(qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })).toBeNull()
  })
})

describe('QuestManager hasSocialOutcomeClaim (plan quests-progression-019 §2)', () => {
  const groznyWilkDef = runtimeAuthored(QUESTS.find((d) => d.id === 'grozny-wilk')!)
  const trusted: QuestManagerInitial = { progress: [], relations: { Anna: 6 } }

  it('is false before the quest is even accepted (nothing bound yet)', () => {
    const qm = makeManager([wolfQuest], () => 'wolf-1')
    expect(qm.hasSocialOutcomeClaim('wolf-1')).toBe(false)
  })

  it('is false for a bound kill_target_animal quest with no authored social consequence', () => {
    const qm = makeManager([wolfQuest], () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    expect(qm.hasSocialOutcomeClaim('wolf-1')).toBe(false)
  })

  it('is true for a bound kill_target_animal quest whose complete outcome authors a social consequence (dangerous wolf included)', () => {
    const qm = new QuestManager([groznyWilkDef], undefined, new Inventory(), trusted, undefined, () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    expect(qm.hasSocialOutcomeClaim('wolf-1')).toBe(true)
  })

  it('is false for an animalId that is not the bound target', () => {
    const qm = new QuestManager([groznyWilkDef], undefined, new Inventory(), trusted, undefined, () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    expect(qm.hasSocialOutcomeClaim('wolf-2')).toBe(false)
  })

  it('must be read before the generic animal_died dispatch: it goes false once that dispatch has already advanced the bound stage past kill_target_animal', () => {
    const qm = new QuestManager([groznyWilkDef], undefined, new Inventory(), trusted, undefined, () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    expect(qm.hasSocialOutcomeClaim('wolf-1')).toBe(true)
    // Simulates AnimalAgent.collapse()'s synchronous onInteractObjective('animal_died') dispatch.
    qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })
    expect(qm.hasSocialOutcomeClaim('wolf-1')).toBe(false)
  })

  it('is false once the quest is fully resolved (binding cleared)', () => {
    const qm = new QuestManager([groznyWilkDef], undefined, new Inventory(), trusted, undefined, () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })
    speak(qm, 'Anna') // report -> complete
    expect(qm.hasSocialOutcomeClaim('wolf-1')).toBe(false)
  })
})

describe('QuestManager find_animal binding', () => {
  const sheepQuest = quest({
    id: 'sheep',
    giverName: 'Anna',
    offerLine: 'offer sheep',
    stages: [
      { objective: { type: 'find_animal', kind: 'sheep' }, description: 'find sheep', reminderLine: 'remind' },
    ],
    reportLine: 'report sheep',
    outcomes: [
      { id: 'found_and_reported', state: 'complete' },
      { id: 'sheep_died', state: 'failed' },
    ],
  })

  it('binds to the resolver-supplied animalId on accept, and completes only when that animal is found', () => {
    const qm = makeManager([sheepQuest], () => 'sheep-house0-0')
    acceptOffer(qm, 'Anna')
    expect(qm.getState('sheep')).toBe('active')

    // A different sheep being found does not satisfy the objective.
    expect(qm.onInteractObjective({ type: 'animal_found', animalId: 'sheep-house1-0' })).toBeNull()
    expect(qm.getState('sheep')).toBe('active')

    // The bound sheep being found does.
    const override = qm.onInteractObjective({ type: 'animal_found', animalId: 'sheep-house0-0' })
    expect(override?.line).toBe('find sheep')
    expect(qm.getState('sheep')).toBe('ready_to_report')
  })

  it('does not bind a target when the resolver finds no live candidate', () => {
    const qm = makeManager([sheepQuest], () => undefined)
    acceptOffer(qm, 'Anna')
    expect(qm.onInteractObjective({ type: 'animal_found', animalId: 'sheep-house0-0' })).toBeNull()
    expect(qm.getState('sheep')).toBe('active')
  })
})

describe('QuestManager resolve_storage_rat_infestation', () => {
  const ratQuest = quest({
    id: 'plaga',
    giverName: 'Marek',
    offerLine: 'offer rats',
    settlementId: 'home',
    stages: [
      {
        objective: { type: 'resolve_storage_rat_infestation' },
        description: 'clear infestation',
        reminderLine: 'fallback',
      },
    ],
    reportLine: 'report rats',
  })

  it('stays active until storage is repaired, the nest is destroyed, and rats are at most one', () => {
    let snapshot = { storageDamaged: true, nestDestroyed: false, aliveRatCount: 5 }
    const qm = makeManager([ratQuest], undefined, undefined, undefined, undefined, {
      getSnapshot: () => snapshot,
    })
    acceptOffer(qm, 'Marek')
    expect(qm.getState('plaga')).toBe('active')
    snapshot = { storageDamaged: false, nestDestroyed: true, aliveRatCount: 2 }
    qm.pollSettlementRatInfestationObjectives()
    expect(qm.getState('plaga')).toBe('active')
    snapshot = { storageDamaged: false, nestDestroyed: false, aliveRatCount: 0 }
    qm.pollSettlementRatInfestationObjectives()
    expect(qm.getState('plaga')).toBe('active')
    snapshot = { storageDamaged: false, nestDestroyed: true, aliveRatCount: 1 }
    qm.pollSettlementRatInfestationObjectives()
    expect(qm.getState('plaga')).toBe('ready_to_report')
  })
})

describe('QuestManager destroy_spawn_point', () => {
  const destroyDenQuest = quest({
    id: 'wilki-pod-osada',
    giverName: 'Anna',
    offerLine: 'offer destroy',
    stages: [
      {
        objective: { type: 'destroy_spawn_point', spawnerId: WOLF_DEN_ID },
        description: 'destroy den',
        reminderLine: 'remind destroy',
      },
    ],
    reportLine: 'report destroy',
  })

  it('does not complete on depleted alone', () => {
    let destroyed = false
    const qm = makeManager([destroyDenQuest], undefined, undefined, undefined, undefined, undefined, {
      isPermanentlyDestroyed: () => destroyed,
    })
    acceptOffer(qm, 'Anna')
    expect(qm.getState('wilki-pod-osada')).toBe('active')
    destroyed = false
    qm.pollDestroySpawnPointObjectives()
    expect(qm.getState('wilki-pod-osada')).toBe('active')
  })

  it('completes after permanent destruction', () => {
    let destroyed = false
    const qm = makeManager([destroyDenQuest], undefined, undefined, undefined, undefined, undefined, {
      isPermanentlyDestroyed: () => destroyed,
    })
    acceptOffer(qm, 'Anna')
    destroyed = true
    qm.pollDestroySpawnPointObjectives()
    expect(qm.getState('wilki-pod-osada')).toBe('ready_to_report')
  })
})

describe('QuestManager clear_wolf_den', () => {
  const denQuest = quest({
    id: 'den',
    giverName: 'Anna',
    offerLine: 'offer den',
    stages: [
      { objective: { type: 'clear_wolf_den', denId: 'wolf-den' }, description: 'clear den', reminderLine: 'remind' },
    ],
    reportLine: 'report den',
  })

  it('only completes when the matching denId is reported', () => {
    const qm = makeManager([denQuest])
    acceptOffer(qm, 'Anna')
    expect(qm.onInteractObjective({ type: 'wolf_den_cleared', denId: 'other-den' })).toBeNull()
    expect(qm.getState('den')).toBe('active')
    const override = qm.onInteractObjective({ type: 'wolf_den_cleared', denId: 'wolf-den' })
    expect(override?.line).toBe('clear den')
    expect(qm.getState('den')).toBe('ready_to_report')
  })
})

describe('QuestManager interact_landmark', () => {
  const landmarkQuest = quest({
    id: 'landmark',
    giverName: 'Anna',
    offerLine: 'offer landmark',
    stages: [
      {
        objective: { type: 'interact_landmark', landmarkId: 'monolith:4:-7:0:3f' },
        description: 'inspect landmark',
        reminderLine: 'remind',
        progressLine: 'inspected',
      },
    ],
    reportLine: 'report landmark',
  })

  it('only completes when the bound landmarkId is reported', () => {
    const qm = makeManager([landmarkQuest])
    acceptOffer(qm, 'Anna')
    expect(qm.onInteractObjective({ type: 'interact_landmark', landmarkId: 'monolith:9:9:0:3f' })).toBeNull()
    expect(qm.getState('landmark')).toBe('active')
    const override = qm.onInteractObjective({ type: 'interact_landmark', landmarkId: 'monolith:4:-7:0:3f' })
    expect(override?.line).toBe('inspected')
    expect(qm.getState('landmark')).toBe('ready_to_report')
  })

  it('does not double-complete on a repeated report of the same landmark', () => {
    const qm = makeManager([landmarkQuest])
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_landmark', landmarkId: 'monolith:4:-7:0:3f' })
    expect(qm.getState('landmark')).toBe('ready_to_report')
    expect(qm.onInteractObjective({ type: 'interact_landmark', landmarkId: 'monolith:4:-7:0:3f' })).toBeNull()
    expect(qm.getState('landmark')).toBe('ready_to_report')
  })
})

describe('QuestManager reset', () => {
  it('clears relation and progress back to fresh state', () => {
    const qm = makeManager([effectsQuest])
    acceptOffer(qm, 'Kasia')
    qm.onInteractObjective({ type: 'interact_well' })
    speak(qm, 'Kasia')
    expect(qm.getRelation('Kasia')).toBeGreaterThan(0)
    qm.reset()
    expect(qm.getRelation('Kasia')).toBe(0)
    expect(qm.getState('effects')).toBe('not_offered')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBeUndefined()
  })
})

const sheepQuest = quest({
  id: 'sheep',
  giverName: 'Anna',
  offerLine: 'offer sheep',
  stages: [
    {
      objective: { type: 'find_animal', kind: 'sheep' },
      description: 'find sheep',
      reminderLine: 'remind',
      failLine: 'too late',
    },
  ],
  reportLine: 'report sheep',
  outcomes: [
    { id: 'found_and_reported', state: 'complete', consequences: { relations: [{ npc: { npcId: 'Anna' }, delta: 1 }] } },
    { id: 'sheep_died', state: 'failed' },
  ],
})

describe('QuestManager failed lifecycle', () => {
  it('transitions find_animal to failed when the bound target dies before being found', () => {
    const qm = makeManager([sheepQuest], () => 'sheep-house0-0')
    acceptOffer(qm, 'Anna')
    expect(qm.getState('sheep')).toBe('active')

    // A different sheep dying does not fail the quest.
    expect(qm.onInteractObjective({ type: 'animal_died', animalId: 'sheep-house1-0' })).toBeNull()
    expect(qm.getState('sheep')).toBe('active')

    const override = qm.onInteractObjective({ type: 'animal_died', animalId: 'sheep-house0-0' })
    expect(override?.line).toBe('too late')
    expect(qm.getState('sheep')).toBe('failed')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe('sheep_died')
  })

  it('falls back to a generic line when the stage has no failLine', () => {
    const noFailLineQuest: QuestDef = { ...sheepQuest, id: 'sheep2', stages: [{ ...sheepQuest.stages[0], failLine: undefined }] }
    const qm = makeManager([noFailLineQuest], () => 'sheep-house0-0')
    acceptOffer(qm, 'Anna')
    const override = qm.onInteractObjective({ type: 'animal_died', animalId: 'sheep-house0-0' })
    expect(override?.line).toBeTruthy()
    expect(qm.getState('sheep2')).toBe('failed')
  })

  it('grants no reward and cannot be re-completed once failed', () => {
    const qm = makeManager([sheepQuest], () => 'sheep-house0-0')
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'sheep-house0-0' })
    expect(qm.getRelation('Anna')).toBe(0)
    // Talking to the giver again must not offer a fresh instance or complete it.
    expect(qm.onInteract('Anna')).toBeNull()
    expect(qm.getState('sheep')).toBe('failed')
  })

  it('clears the animal binding on failure so a stale id cannot re-trigger it', () => {
    const qm = makeManager([sheepQuest], () => 'sheep-house0-0')
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'sheep-house0-0' })
    expect(qm.onInteractObjective({ type: 'animal_died', animalId: 'sheep-house0-0' })).toBeNull()
  })

  it('kill_target_animal still treats animal_died as success, not failure', () => {
    const qm = makeManager([wolfQuest], () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })
    expect(qm.getState('wolf')).toBe('ready_to_report')
  })
})

describe('QuestManager save/load restore of animal-bound quests', () => {
  const wolfDef = quest({
    id: 'wolf',
    giverName: 'Anna',
    offerLine: 'offer wolf',
    stages: [
      { objective: { type: 'kill_target_animal', kind: 'wolf' }, description: 'kill wolf', reminderLine: 'remind' },
    ],
    reportLine: 'report wolf',
  })

  function makeRestoredManager(
    defs: readonly QuestDef[],
    initial: QuestManagerInitial,
    resolveAnimalTarget: (kind: string) => string | undefined,
  ): QuestManager {
    return new QuestManager(defs, undefined, new Inventory(), initial, undefined, resolveAnimalTarget)
  }

  it('rebinds an active livestock-kind quest (sheep) on restore and can still complete it', () => {
    const initial: QuestManagerInitial = {
      progress: [{ id: 'sheep', state: 'active', stageIndex: 0 }],
      relations: {},
    }
    const qm = makeRestoredManager([sheepQuest], initial, () => 'sheep-house0-0')
    expect(qm.getState('sheep')).toBe('active')
    const override = qm.onInteractObjective({ type: 'animal_found', animalId: 'sheep-house0-0' })
    expect(override?.line).toBe('find sheep')
    expect(qm.getState('sheep')).toBe('ready_to_report')
  })

  it('invalidates an active wild-fauna-kind quest (wolf) on restore instead of rebinding', () => {
    const initial: QuestManagerInitial = {
      progress: [{ id: 'wolf', state: 'active', stageIndex: 0 }],
      relations: {},
    }
    const qm = makeRestoredManager([wolfDef], initial, () => 'wolf-1')
    expect(qm.getState('wolf')).toBe('invalidated')
    // No fresh binding should have been made — a death report for a "resolved"
    // id must not complete an invalidated quest.
    expect(qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })).toBeNull()
    expect(qm.getState('wolf')).toBe('invalidated')
  })

  it('leaves non-animal-bound quest states untouched on restore', () => {
    const initial: QuestManagerInitial = {
      progress: [{ id: 'simple', state: 'ready_to_report', stageIndex: 0 }],
      relations: { Anna: 2 },
    }
    const qm = makeRestoredManager([simpleQuest], initial, () => undefined)
    expect(qm.getState('simple')).toBe('ready_to_report')
    expect(qm.getRelation('Anna')).toBe(2)
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBeUndefined()
  })
})

// Plan 199 — `WorldBundle` rebuild resets fauna's per-kind id counter, so a
// bound wild-fauna `animalId` can silently collide with an unrelated new
// animal unless the mid-session rebuild path also invalidates it (the
// constructor-only path above only covers save/load restore).
describe('QuestManager invalidateStaleAnimalTargets (mid-session rebuild)', () => {
  it('invalidates an active wild-fauna-kind (wolf) binding instead of leaving a stale id bound', () => {
    const qm = makeManager([wolfQuest], () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    expect(qm.getState('wolf')).toBe('active')

    qm.invalidateStaleAnimalTargets()
    expect(qm.getState('wolf')).toBe('invalidated')

    // A post-rebuild animal that coincidentally reused the same id string
    // must not be able to complete the now-invalidated quest.
    expect(qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })).toBeNull()
    expect(qm.getState('wolf')).toBe('invalidated')
  })

  it('rebinds an active livestock-kind (sheep) binding to a freshly resolved id instead of invalidating', () => {
    let resolved = 'sheep-house0-0'
    const qm = makeManager([sheepQuest], () => resolved)
    acceptOffer(qm, 'Anna')
    expect(qm.getState('sheep')).toBe('active')

    // Rebuild reissues livestock ids too — the resolver now returns a
    // different (but still deterministically re-derivable) id.
    resolved = 'sheep-house0-1'
    qm.invalidateStaleAnimalTargets()
    expect(qm.getState('sheep')).toBe('active')

    expect(qm.onInteractObjective({ type: 'animal_found', animalId: 'sheep-house0-0' })).toBeNull()
    const override = qm.onInteractObjective({ type: 'animal_found', animalId: 'sheep-house0-1' })
    expect(override?.line).toBe('find sheep')
    expect(qm.getState('sheep')).toBe('ready_to_report')
  })

  it('is a no-op for quests with no active animal binding', () => {
    const qm = makeManager([simpleQuest])
    acceptOffer(qm, 'Anna')
    expect(qm.getState('simple')).toBe('active')
    qm.invalidateStaleAnimalTargets()
    expect(qm.getState('simple')).toBe('active')
  })
})

describe('QuestManager dangerous trait binding', () => {
  const dangerousWolfQuest = quest({
    id: 'dangerous-wolf',
    giverName: 'Anna',
    offerLine: 'offer dangerous wolf',
    stages: [
      {
        objective: { type: 'kill_target_animal', kind: 'wolf', dangerous: true },
        description: 'kill dangerous wolf',
        reminderLine: 'remind',
      },
    ],
    reportLine: 'report dangerous wolf',
  })

  it('applies the dangerous trait to the bound animal on bind, not to unrelated wolves', () => {
    const applied: string[] = []
    const qm = new QuestManager(
      [dangerousWolfQuest, wolfQuest],
      undefined,
      new Inventory(),
      undefined,
      undefined,
      () => 'wolf-1',
      (animalId) => applied.push(animalId),
    )
    acceptOffer(qm, 'Anna') // matches the first def with 'Anna' as giver in not_offered/offered
    expect(applied).toEqual(['wolf-1'])
  })

  it('does not apply the trait for a plain kill_target_animal quest', () => {
    const applied: string[] = []
    const qm = new QuestManager(
      [wolfQuest],
      undefined,
      new Inventory(),
      undefined,
      undefined,
      () => 'wolf-1',
      (animalId) => applied.push(animalId),
    )
    acceptOffer(qm, 'Anna')
    expect(applied).toEqual([])
  })
})

describe('QuestManager applySocialConsequence', () => {
  const groznyWilkDef = runtimeAuthored(QUESTS.find((d) => d.id === 'grozny-wilk')!)
  const wilczaJamaDef = runtimeAuthored(QUESTS.find((d) => d.id === 'wilcza-jama')!)

  /** Both wolf quests gate on `Anna: trusted` — pre-seed the relation via
   *  `QuestManagerInitial` instead of accepting/completing an earlier quest. */
  function makeTrustedManager(
    defs: readonly QuestDef[],
    onConsequence: (c: SocialConsequence) => void,
    resolveAnimalTarget?: (kind: string) => string | undefined,
    initial?: QuestManagerInitial,
  ): QuestManager {
    const trusted: QuestManagerInitial = { progress: [], relations: { Anna: 6 } }
    return new QuestManager(
      defs,
      undefined,
      new Inventory(),
      initial ?? trusted,
      undefined,
      resolveAnimalTarget,
      undefined,
      onConsequence,
    )
  }

  it('applies exactly grozny-wilk\'s calibrated deltas, once, on completion', () => {
    const consequences: SocialConsequence[] = []
    const qm = makeTrustedManager([groznyWilkDef], (c) => consequences.push(c), () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' }) // -> ready_to_report
    speak(qm, 'Anna') // report -> complete, applies consequence
    expect(consequences).toEqual([
      { settlementId: 'home', reputation: { competence: 10, courage: 12, benevolence: 4 }, renown: 15 },
    ])
    // trust/integrity are untouched by this quest.
    expect(consequences[0]?.reputation?.trust).toBeUndefined()
    expect(consequences[0]?.reputation?.integrity).toBeUndefined()
    // Talking to the already-complete giver again must not re-apply it.
    qm.onInteract('Anna')
    expect(consequences).toHaveLength(1)
  })

  it('applies exactly wilcza-jama\'s calibrated deltas, once, on completion', () => {
    const consequences: SocialConsequence[] = []
    const qm = makeTrustedManager(
      [groznyWilkDef, wilczaJamaDef],
      (c) => consequences.push(c),
      undefined,
      {
        progress: [{ id: 'grozny-wilk', state: 'complete', stageIndex: 1, resolvedOutcomeId: 'reported' }],
        relations: { Anna: 6 },
      },
    )
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'wolf_den_cleared', denId: WOLF_DEN_ID })
    speak(qm, 'Anna')
    expect(consequences).toEqual([
      { settlementId: 'home', reputation: { competence: 15, courage: 18, benevolence: 6 }, renown: 25 },
    ])
    expect(consequences[0]?.reputation?.trust).toBeUndefined()
    expect(consequences[0]?.reputation?.integrity).toBeUndefined()
  })

  it('does not apply a consequence for a quest with neither settlementId nor social authored', () => {
    const consequences: SocialConsequence[] = []
    const qm = makeTrustedManager([simpleQuest], (c) => consequences.push(c))
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    speak(qm, 'Anna')
    expect(consequences).toHaveLength(0)
  })

  it('does not apply a consequence for a quest with authored deltas but no resolved settlementId', () => {
    const { settlementId: _settlementId, ...unresolved } = groznyWilkDef
    const consequences: SocialConsequence[] = []
    const qm = makeTrustedManager([unresolved], (c) => consequences.push(c), () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })
    speak(qm, 'Anna')
    expect(consequences).toHaveLength(0)
  })

  it('a failed quest never applies its social consequence', () => {
    const consequences: SocialConsequence[] = []
    const qm = makeTrustedManager([sheepQuest], (c) => consequences.push(c), () => 'sheep-house0-0')
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'sheep-house0-0' }) // -> failed, no reward
    expect(qm.getState('sheep')).toBe('failed')
    expect(consequences).toHaveLength(0)
  })

  it('bare animal_died with no completed quest applies nothing', () => {
    const consequences: SocialConsequence[] = []
    const qm = makeTrustedManager([groznyWilkDef], (c) => consequences.push(c), () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' }) // -> ready_to_report only
    expect(consequences).toHaveLength(0)
  })

  it('passes through the quest\'s own settlementId, not a hardcoded one', () => {
    const consequences: SocialConsequence[] = []
    const otherSettlementDef: QuestDef = { ...groznyWilkDef, settlementId: 'outpost' }
    const qm = makeTrustedManager([otherSettlementDef], (c) => consequences.push(c), () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })
    speak(qm, 'Anna')
    expect(consequences).toEqual([{ settlementId: 'outpost', reputation: { competence: 10, courage: 12, benevolence: 4 }, renown: 15 }])
  })
})

describe('QuestManager resolveQuest', () => {
  it('applies reward items through the grant callback exactly once', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const rewarded = quest({
      ...simpleQuest,
      outcomes: [{
        id: 'complete',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'coin', count: 5 }, { kind: 'shell', count: 2 }] },
      }],
    })
    const qm = makeManager([rewarded], undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    expect(granted).toEqual([])
    speak(qm, 'Anna')
    expect(granted).toEqual([{ kind: 'coin', count: 5 }, { kind: 'shell', count: 2 }])
    speak(qm, 'Anna')
    expect(granted).toHaveLength(2)
    expect(qm.resolveQuest('simple', 'complete')).toBe(false)
    expect(granted).toHaveLength(2)
  })

  it('does not mutate state for an unknown outcome id', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const rewarded = quest({
      ...simpleQuest,
      outcomes: [{
        id: 'complete',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'coin', count: 1 }] },
        consequences: { relations: [{ npc: { npcId: 'Anna' }, delta: 1 }] },
      }],
    })
    const qm = makeManager([rewarded], undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    expect(qm.resolveQuest('simple', 'nope')).toBe(false)
    expect(qm.getState('simple')).toBe('ready_to_report')
    expect(qm.getRelation('Anna')).toBe(0)
    expect(granted).toEqual([])
  })

  it('does not guess when multiple complete outcomes exist', () => {
    const multi = quest({
      ...simpleQuest,
      outcomes: [
        { id: 'a', state: 'complete', consequences: { relations: [{ npc: { npcId: 'Anna' }, delta: 1 }] } },
        { id: 'b', state: 'complete', consequences: { relations: [{ npc: { npcId: 'Anna' }, delta: 2 }] } },
      ],
    })
    const qm = makeManager([multi])
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    expect(qm.onInteract('Anna')).toBeNull()
    expect(qm.getState('simple')).toBe('ready_to_report')
    expect(qm.getRelation('Anna')).toBe(0)
  })

  it('grants no items when the outcome has no reward', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const qm = makeManager([simpleQuest], undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    speak(qm, 'Anna')
    expect(granted).toEqual([])
  })
})

describe('QuestManager promised reward preview', () => {
  it('shows an unambiguous shown reward and hides hidden or mixed complete rewards', () => {
    const shown = quest({
      ...simpleQuest,
      outcomes: [{
        id: 'complete',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'coin', count: 5 }] },
      }],
    })
    const hidden = quest({
      ...simpleQuest,
      id: 'hidden',
      outcomes: [{
        id: 'complete',
        state: 'complete',
        reward: { visibility: 'hidden', items: [{ kind: 'coin', count: 5 }] },
      }],
    })
    const mixed = quest({
      ...simpleQuest,
      id: 'mixed',
      outcomes: [
        { id: 'a', state: 'complete', reward: { visibility: 'shown', items: [{ kind: 'coin', count: 5 }] } },
        { id: 'b', state: 'complete', reward: { visibility: 'shown', items: [{ kind: 'shell', count: 1 }] } },
      ],
    })
    const qm = makeManager([shown, hidden, mixed])
    expect(qm.list().find((e) => e.id === 'simple')?.promisedReward).toEqual({ items: [{ kind: 'coin', count: 5 }] })
    expect(qm.list().find((e) => e.id === 'hidden')?.promisedReward).toBeNull()
    expect(qm.list().find((e) => e.id === 'mixed')?.promisedReward).toBeNull()
  })
})

describe('QuestManager authored sheep outcomes', () => {
  const sheepDef = runtimeAuthored(QUESTS.find((d) => d.id === 'zagubiona-owca')!)

  it('resolves found_and_reported after find + report', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const qm = new QuestManager(
      [sheepDef],
      undefined,
      new Inventory(),
      undefined,
      (kind, count) => granted.push({ kind, count }),
      () => 'sheep-house0-0',
    )
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_found', animalId: 'sheep-house0-0' })
    expect(qm.getState('zagubiona-owca')).toBe('ready_to_report')
    expect(granted).toEqual([])
    speak(qm, 'Anna')
    expect(qm.getState('zagubiona-owca')).toBe('complete')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe('found_and_reported')
    expect(granted).toEqual([{ kind: 'coin', count: 10 }])
    expect(qm.getRelation('Anna')).toBe(1)
  })

  it('resolves sheep_died when the bound target dies', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const qm = new QuestManager(
      [sheepDef],
      undefined,
      new Inventory(),
      undefined,
      (kind, count) => granted.push({ kind, count }),
      () => 'sheep-house0-0',
    )
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'sheep-house0-0' })
    expect(qm.getState('zagubiona-owca')).toBe('failed')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe('sheep_died')
    expect(granted).toEqual([])
    expect(qm.getRelation('Anna')).toBe(0)
  })
})

describe('QuestManager legacy restore outcome normalization', () => {
  it('fills resolvedOutcomeId from the unique matching terminal outcome', () => {
    const initial: QuestManagerInitial = {
      progress: [{ id: 'simple', state: 'complete', stageIndex: 1 }],
      relations: { Anna: 1 },
    }
    const qm = new QuestManager([simpleQuest], undefined, new Inventory(), initial)
    expect(qm.exportProgress()).toEqual([
      { id: 'simple', state: 'complete', stageIndex: 1, resolvedOutcomeId: 'complete' },
    ])
    expect(qm.getRelation('Anna')).toBe(1)
  })

  it('does not pick an outcome when zero or more than one match the terminal state', () => {
    const none = quest({ ...simpleQuest, id: 'none', outcomes: [{ id: 'fail', state: 'failed' }] })
    const many = quest({
      ...simpleQuest,
      id: 'many',
      outcomes: [
        { id: 'a', state: 'complete' },
        { id: 'b', state: 'complete' },
      ],
    })
    const qm = new QuestManager(
      [none, many],
      undefined,
      new Inventory(),
      {
        progress: [
          { id: 'none', state: 'complete', stageIndex: 1 },
          { id: 'many', state: 'complete', stageIndex: 1 },
        ],
        relations: {},
      },
    )
    expect(qm.exportProgress().find((e) => e.id === 'none')?.resolvedOutcomeId).toBeUndefined()
    expect(qm.exportProgress().find((e) => e.id === 'many')?.resolvedOutcomeId).toBeUndefined()
  })

  it('does not attach an outcome to invalidated progress', () => {
    const initial: QuestManagerInitial = {
      progress: [{ id: 'wolf', state: 'invalidated', stageIndex: 0 }],
      relations: {},
    }
    const qm = new QuestManager([wolfQuest], undefined, new Inventory(), initial)
    expect(qm.getState('wolf')).toBe('invalidated')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBeUndefined()
    expect(qm.getRelation('Anna')).toBe(0)
  })
})

describe('QuestManager formal vs personal relation rebalance', () => {
  it('drewno-na-naprawe grants coins without a relation bump', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const def = runtimeAuthored(QUESTS.find((d) => d.id === 'drewno-na-naprawe')!)
    const inventory = new Inventory()
    inventory.add('branch', 5)
    const qm = new QuestManager([def], undefined, inventory, undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Piotr')
    speak(qm, 'Piotr')
    expect(qm.getState('drewno-na-naprawe')).toBe('complete')
    expect(granted).toEqual([{ kind: 'coin', count: 8 }])
    expect(qm.getRelation('Piotr')).toBe(0)
  })

  it('woda-dla-marka grants five coins instead of a sword', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const def = runtimeAuthored(QUESTS.find((d) => d.id === 'woda-dla-marka')!)
    const qm = new QuestManager([def], undefined, new Inventory(), undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Marek')
    qm.onInteractObjective({ type: 'interact_well' })
    speak(qm, 'Marek')
    expect(granted).toEqual([{ kind: 'coin', count: 5 }])
    expect(qm.getRelation('Marek')).toBe(1)
  })
})

describe('QuestManager gather_item turn-in', () => {
  const gatherQuest = quest({
    id: 'gather-coins',
    giverName: 'Anna',
    offerLine: 'offer gather',
    stages: [
      { objective: { type: 'gather_item', kind: 'herb', count: 3 }, description: 'gather herbs', reminderLine: 'remind herbs' },
    ],
    reportLine: 'report gather',
    outcomes: [{
      id: 'delivered',
      state: 'complete',
      reward: { visibility: 'shown', items: [{ kind: 'coin', count: 8 }] },
    }],
  })

  const multiStageGather = quest({
    id: 'multi-gather',
    giverName: 'Piotr',
    offerLine: 'offer multi',
    stages: [
      { objective: { type: 'gather_item', kind: 'stone', count: 2 }, description: 'gather stones', reminderLine: 'remind stones' },
      { objective: { type: 'interact_spawner', spawnerType: 'rockDen' }, description: 'cave', reminderLine: 'remind cave', progressLine: 'cave done' },
    ],
    reportLine: 'report multi',
    outcomes: [{ id: 'reported', state: 'complete', consequences: { relations: [{ npc: { npcId: 'Piotr' }, delta: 1 }] } }],
  })

  const ambiguousGather = quest({
    id: 'ambiguous-gather',
    giverName: 'Anna',
    offerLine: 'offer ambiguous',
    stages: [
      { objective: { type: 'gather_item', kind: 'branch', count: 2 }, description: 'gather branches', reminderLine: 'remind branches' },
    ],
    reportLine: 'report ambiguous',
    outcomes: [
      { id: 'a', state: 'complete', reward: { visibility: 'shown', items: [{ kind: 'coin', count: 5 }] } },
      { id: 'b', state: 'complete', reward: { visibility: 'shown', items: [{ kind: 'coin', count: 10 }] } },
    ],
  })

  it('does not consume items or grant reward when inventory is insufficient', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const inventory = new Inventory()
    inventory.add('herb', 2)
    const qm = new QuestManager([gatherQuest], undefined, inventory, undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Anna')
    qm.onInteract('Anna')
    expect(inventory.count('herb')).toBe(2)
    expect(qm.getState('gather-coins')).toBe('active')
    expect(granted).toEqual([])
  })

  it('removes the exact item count once and grants coin reward exactly once on final turn-in', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const inventory = new Inventory()
    inventory.add('herb', 3)
    const qm = new QuestManager([gatherQuest], undefined, inventory, undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Anna')
    speak(qm, 'Anna')
    expect(inventory.count('herb')).toBe(0)
    expect(qm.getState('gather-coins')).toBe('complete')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe('delivered')
    expect(granted).toEqual([{ kind: 'coin', count: 8 }])
    speak(qm, 'Anna')
    expect(granted).toHaveLength(1)
  })

  it('does not consume delivery items when multiple complete outcomes make resolution ambiguous', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const inventory = new Inventory()
    inventory.add('branch', 2)
    const qm = new QuestManager([ambiguousGather], undefined, inventory, undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Anna')
    qm.onInteract('Anna')
    expect(inventory.count('branch')).toBe(2)
    expect(qm.getState('ambiguous-gather')).toBe('active')
    expect(granted).toEqual([])
  })

  it('consumes items and advances without reward on a non-terminal gather stage', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const inventory = new Inventory()
    inventory.add('stone', 2)
    const qm = new QuestManager([multiStageGather], undefined, inventory, undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Piotr')
    expect(selectAction(qm.onInteract('Piotr'))).toBe('remind cave')
    expect(inventory.count('stone')).toBe(0)
    expect(qm.getState('multi-gather')).toBe('active')
    expect(qm.getState('multi-gather')).not.toBe('ready_to_report')
    expect(granted).toEqual([])
  })
})

describe('QuestManager paid quest definitions', () => {
  it('ziola-dla-anny delivers herb ×3 for 8 coins without relation', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const def = runtimeAuthored(QUESTS.find((d) => d.id === 'ziola-dla-anny')!)
    const inventory = new Inventory()
    inventory.add('herb', 3)
    const qm = new QuestManager([def], undefined, inventory, undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Anna')
    speak(qm, 'Anna')
    expect(granted).toEqual([{ kind: 'coin', count: 8 }])
    expect(qm.getRelation('Anna')).toBe(0)
    expect(qm.list().find((e) => e.id === 'ziola-dla-anny')?.promisedReward).toBeNull()
  })

  it('kamienie-dla-piotra delivers stone ×6 for 9 coins without relation', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const def = runtimeAuthored(QUESTS.find((d) => d.id === 'kamienie-dla-piotra')!)
    const inventory = new Inventory()
    inventory.add('stone', 6)
    const qm = new QuestManager([def], undefined, inventory, undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Piotr')
    speak(qm, 'Piotr')
    expect(granted).toEqual([{ kind: 'coin', count: 9 }])
    expect(qm.getRelation('Piotr')).toBe(0)
  })

  it('sprawdz-szlak pays 12 coins after cave interaction without relation', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const def = runtimeAuthored(QUESTS.find((d) => d.id === 'sprawdz-szlak')!)
    const qm = new QuestManager([def], undefined, new Inventory(), undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Kasia')
    qm.onInteractObjective(CAVE_REF)
    speak(qm, 'Kasia')
    expect(granted).toEqual([{ kind: 'coin', count: 12 }])
    expect(qm.getRelation('Kasia')).toBe(0)
  })

  it('lis-przy-osadzie binds a fox, ignores other deaths, and applies social consequence once', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const consequences: SocialConsequence[] = []
    const def = runtimeAuthored(QUESTS.find((d) => d.id === 'lis-przy-osadzie')!)
    const qm = new QuestManager(
      [def],
      undefined,
      new Inventory(),
      undefined,
      (kind, count) => granted.push({ kind, count }),
      () => 'fox-1',
      undefined,
      (c) => consequences.push(c),
    )
    acceptOffer(qm, 'Marek')
    expect(qm.onInteractObjective({ type: 'animal_died', animalId: 'fox-2' })).toBeNull()
    qm.onInteractObjective({ type: 'animal_died', animalId: 'fox-1' })
    speak(qm, 'Marek')
    expect(granted).toEqual([{ kind: 'coin', count: 20 }])
    expect(consequences).toEqual([{ settlementId: 'home', reputation: { competence: 3, courage: 3 }, renown: 3 }])
    expect(qm.getRelation('Marek')).toBe(0)
    speak(qm, 'Marek')
    expect(granted).toHaveLength(1)
    expect(consequences).toHaveLength(1)
  })

  it('does not pay reward again after terminal restore of a completed paid quest', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const def = runtimeAuthored(QUESTS.find((d) => d.id === 'ziola-dla-anny')!)
    const initial: QuestManagerInitial = {
      progress: [{ id: 'ziola-dla-anny', state: 'complete', stageIndex: 1, resolvedOutcomeId: 'delivered' }],
      relations: {},
    }
    const qm = new QuestManager([def], undefined, new Inventory(), initial, (kind, count) => granted.push({ kind, count }))
    qm.onInteract('Anna')
    expect(granted).toEqual([])
    expect(qm.getState('ziola-dla-anny')).toBe('complete')
  })
})

describe('QuestManager prerequisites (plan quests-progression-004)', () => {
  const prerequisiteWolf = quest({
    id: 'prereq-wolf',
    giverName: 'Anna',
    offerLine: 'wolf offer',
    stages: [
      { objective: { type: 'kill_target_animal', kind: 'wolf' }, description: 'kill', reminderLine: 'remind' },
    ],
    reportLine: 'wolf done',
    outcomes: [
      { id: 'reported', state: 'complete' },
      { id: 'escaped', state: 'failed' },
    ],
  })

  const prerequisiteDen = quest({
    id: 'prereq-den',
    giverName: 'Anna',
    offerLine: 'den offer',
    stages: [
      { objective: { type: 'clear_wolf_den', denId: WOLF_DEN_ID }, description: 'den', reminderLine: 'remind' },
    ],
    reportLine: 'den done',
    availability: {
      prerequisites: [
        { type: 'relation', npc: { npcId: 'Anna' }, minimum: 'trusted' },
        { type: 'quest_outcome', questId: 'prereq-wolf', outcomeIds: ['reported'] },
      ],
    },
  })

  const socialQuest = quest({
    id: 'social-gated',
    giverName: 'Anna',
    offerLine: 'social offer',
    settlementId: 'home',
    stages: [
      { objective: { type: 'interact_tree' }, description: 'tree', reminderLine: 'remind' },
    ],
    reportLine: 'social done',
    availability: {
      prerequisites: [
        { type: 'reputation', dimension: 'courage', minimum: 10 },
        { type: 'renown', minimum: 5 },
      ],
    },
  })

  const otherSettlementQuest = quest({
    ...socialQuest,
    id: 'social-outpost',
    settlementId: 'outpost',
    offerLine: 'outpost offer',
  })

  it('keeps relation below/at threshold behaviour after migration', () => {
    const qm = makeManager([gatedQuest], undefined, undefined, { progress: [], relations: { Anna: 5 } })
    expect(qm.isQuestAvailable('gated')).toBe(false)
    const atThreshold = makeManager([gatedQuest], undefined, undefined, { progress: [], relations: { Anna: 6 } })
    expect(atThreshold.isQuestAvailable('gated')).toBe(true)
  })

  it('does not unlock on quest_outcome until resolvedOutcomeId matches', () => {
    const qm = makeManager(
      [prerequisiteWolf, prerequisiteDen],
      undefined,
      undefined,
      { progress: [{ id: 'prereq-wolf', state: 'offered', stageIndex: 0 }], relations: { Anna: 6 } },
    )
    expect(qm.isQuestAvailable('prereq-den')).toBe(false)
    expect(qm.list().some((e) => e.id === 'prereq-den')).toBe(false)
  })

  it('unlocks quest_outcome when resolvedOutcomeId is in the allowed set', () => {
    const qm = makeManager(
      [prerequisiteWolf, prerequisiteDen],
      undefined,
      undefined,
      {
        progress: [{ id: 'prereq-wolf', state: 'complete', stageIndex: 1, resolvedOutcomeId: 'reported' }],
        relations: { Anna: 6 },
      },
    )
    expect(qm.isQuestAvailable('prereq-den')).toBe(true)
    expect(qm.list().some((e) => e.id === 'prereq-den')).toBe(true)
    expect(qm.labelMarker('Anna')).toBe('!')
    expect(qm.onInteract('Anna')?.line).toBe('den offer')
  })

  it('does not unlock on a non-matching resolved outcome', () => {
    const qm = makeManager(
      [prerequisiteWolf, prerequisiteDen],
      undefined,
      undefined,
      {
        progress: [{ id: 'prereq-wolf', state: 'failed', stageIndex: 0, resolvedOutcomeId: 'escaped' }],
        relations: { Anna: 6 },
      },
    )
    expect(qm.isQuestAvailable('prereq-den')).toBe(false)
  })

  it('can unlock on an authored failed outcome id when listed in outcomeIds', () => {
    const failedFollowUp = quest({
      ...prerequisiteDen,
      id: 'failed-follow-up',
      availability: {
        prerequisites: [
          { type: 'quest_outcome', questId: 'prereq-wolf', outcomeIds: ['escaped', 'reported'] },
        ],
      },
    })
    const qm = makeManager(
      [prerequisiteWolf, failedFollowUp],
      undefined,
      undefined,
      {
        progress: [{ id: 'prereq-wolf', state: 'failed', stageIndex: 0, resolvedOutcomeId: 'escaped' }],
        relations: {},
      },
    )
    expect(qm.isQuestAvailable('failed-follow-up')).toBe(true)
  })

  it('does not treat invalidated progress as a matching quest_outcome', () => {
    const qm = makeManager(
      [prerequisiteWolf, prerequisiteDen],
      undefined,
      undefined,
      {
        progress: [{ id: 'prereq-wolf', state: 'invalidated', stageIndex: 0 }],
        relations: { Anna: 6 },
      },
    )
    expect(qm.isQuestAvailable('prereq-den')).toBe(false)
  })

  it('requires every prerequisite (AND semantics)', () => {
    const qm = makeManager(
      [prerequisiteWolf, prerequisiteDen],
      undefined,
      undefined,
      {
        progress: [{ id: 'prereq-wolf', state: 'complete', stageIndex: 1, resolvedOutcomeId: 'reported' }],
        relations: { Anna: 1 },
      },
    )
    expect(qm.isQuestAvailable('prereq-den')).toBe(false)
  })

  it('reads reputation and renown from def.settlementId via the injected lookup', () => {
    const lookup: QuestSocialAvailabilityLookup = {
      getReputationDimension: (settlementId, dimension) => (
        settlementId === 'home' && dimension === 'courage' ? 10 : 0
      ),
      getRenown: (settlementId) => (settlementId === 'home' ? 5 : 0),
    }
    const qm = makeManager([socialQuest, otherSettlementQuest], undefined, undefined, undefined, lookup)
    expect(qm.isQuestAvailable('social-gated')).toBe(true)
    expect(qm.isQuestAvailable('social-outpost')).toBe(false)
  })

  it('keeps offered/active quests visible after prerequisites later fail', () => {
    const active = makeManager(
      [gatedQuest],
      undefined,
      undefined,
      { progress: [{ id: 'gated', state: 'active', stageIndex: 0 }], relations: { Anna: 0 } },
    )
    expect(active.isQuestAvailable('gated')).toBe(false)
    expect(active.list().some((e) => e.id === 'gated')).toBe(true)
    expect(active.labelMarker('Anna')).toBe('…')
    expect(active.onInteract('Anna')).not.toBeNull()

    const offered = makeManager(
      [gatedQuest],
      undefined,
      undefined,
      { progress: [{ id: 'gated', state: 'offered', stageIndex: 0 }], relations: { Anna: 0 } },
    )
    expect(offered.list().some((e) => e.id === 'gated')).toBe(true)
    expect(offered.labelMarker('Anna')).toBe('!')
    expect(offered.onInteract('Anna')?.line).toBe('offer gated')
  })

  it('restores availability from persisted relations, outcomes and social lookup after load', () => {
    const grozny = runtimeAuthored(QUESTS.find((d) => d.id === 'grozny-wilk')!)
    const den = runtimeAuthored(QUESTS.find((d) => d.id === 'wilcza-jama')!)
    const lookup: QuestSocialAvailabilityLookup = {
      getReputationDimension: () => 0,
      getRenown: () => 0,
    }
    const initial: QuestManagerInitial = {
      progress: [{ id: 'grozny-wilk', state: 'complete', stageIndex: 1, resolvedOutcomeId: 'reported' }],
      relations: { Anna: 6 },
    }
    const qm = makeManager([grozny, den], undefined, undefined, initial, lookup)
    expect(qm.isQuestAvailable('wilcza-jama')).toBe(true)
    expect(qm.labelMarker('Anna')).toBe('!')
  })
})

function homeQuest(id: string): QuestDef {
  return runtimeAuthored(
    bindExactCaveQuests(
      [QUESTS.find((d) => d.id === id)!],
      { id: CAVE_REF.spawnerId, directionPhrase: null },
    )[0]!,
  )
}

const woodPack = (): QuestDef[] => [
  homeQuest('sporne-drewno'),
  homeQuest('drewno-dla-anny'),
  homeQuest('drewno-dla-piotra'),
]

describe('QuestManager talk_to_npc_choice (plan quests-progression-005)', () => {
  function makeChoiceManager(
    grantItem?: (kind: string, count: number) => void,
    applySocial?: (c: SocialConsequence) => void,
  ): QuestManager {
    return new QuestManager(
      [homeQuest('zaginiona-przesylka')],
      undefined,
      new Inventory(),
      undefined,
      grantItem,
      undefined,
      undefined,
      applySocial,
    )
  }

  function startChoiceStage(qm: QuestManager): void {
    acceptOffer(qm, 'Kasia')
    qm.onInteractObjective(CAVE_REF)
  }

  it('advances the cave stage without granting an item, then talks to Kasia for returned_sealed', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const consequences: SocialConsequence[] = []
    const qm = makeChoiceManager(
      (kind, count) => granted.push({ kind, count }),
      (c) => consequences.push(c),
    )
    acceptOffer(qm, 'Kasia')
    expect(qm.onInteract('Kasia')?.line).toBe('Jaskinia jest poza osadą. Szukaj przesyłki przy wejściu.')
    expect(qm.onInteract('Marek')).toBeNull()
    qm.onInteractObjective(CAVE_REF)
    expect(granted).toEqual([])
    expect(qm.getState('zaginiona-przesylka')).toBe('active')
    expect(qm.exportProgress()[0]?.stageIndex).toBe(1)
    expect(qm.list().find((e) => e.id === 'zaginiona-przesylka')?.promisedReward).toBeNull()

    const dialog = qm.onInteract('Kasia')
    expect(qm.getState('zaginiona-przesylka')).toBe('active')
    expect(dialog?.actions?.[0]?.label).toBe('Znalazłem przesyłkę. Proszę, jest twoja.')
    expect(selectAction(dialog)).toBe('Dziękuję, że przyniosłeś przesyłkę nietkniętą. To dla mnie dużo znaczy.')
    expect(qm.getState('zaginiona-przesylka')).toBe('complete')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe('returned_sealed')
    expect(granted).toEqual([{ kind: 'coin', count: 15 }])
    expect(qm.getRelation('Kasia')).toBe(2)
    expect(qm.getRelation('Marek')).toBe(0)
    expect(consequences).toEqual([{ settlementId: 'home', reputation: { trust: 5, integrity: 6 }, renown: 3 }])
    expect(qm.list().find((e) => e.id === 'zaginiona-przesylka')?.resultText)
      .toBe('Dziękuję, że przyniosłeś przesyłkę nietkniętą. To dla mnie dużo znaczy.')
  })

  it('lets Marek select only turned_over_to_guard, even though Kasia is the giver', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const consequences: SocialConsequence[] = []
    const qm = makeChoiceManager(
      (kind, count) => granted.push({ kind, count }),
      (c) => consequences.push(c),
    )
    startChoiceStage(qm)
    expect(qm.labelMarker('Kasia')).toBe('?')
    expect(qm.labelMarker('Marek')).toBe('?')
    const dialog = qm.onInteract('Marek')
    expect(qm.getState('zaginiona-przesylka')).toBe('active')
    expect(dialog?.actions?.[0]?.label).toBe('Znalazłem przesyłkę Kasi. Przekazuję ją straży.')
    expect(selectAction(dialog)).toBe('Dobrze, że mi to oddałeś. Sprawdzę, skąd ta przesyłka.')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe('turned_over_to_guard')
    expect(granted).toEqual([{ kind: 'bandage', count: 2 }])
    expect(qm.getRelation('Kasia')).toBe(-1)
    expect(qm.getRelation('Marek')).toBe(2)
    expect(consequences).toEqual([{
      settlementId: 'home',
      reputation: { competence: 4, courage: 2, integrity: 1 },
      renown: 2,
    }])
  })

  it('does not change outcome, reward or consequences on a later conversation', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const consequences: SocialConsequence[] = []
    const qm = makeChoiceManager(
      (kind, count) => granted.push({ kind, count }),
      (c) => consequences.push(c),
    )
    startChoiceStage(qm)
    speak(qm, 'Kasia')
    speak(qm, 'Marek')
    speak(qm, 'Kasia')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe('returned_sealed')
    expect(granted).toEqual([{ kind: 'coin', count: 15 }])
    expect(qm.getRelation('Kasia')).toBe(2)
    expect(qm.getRelation('Marek')).toBe(0)
    expect(consequences).toHaveLength(1)
    expect(qm.labelMarker('Kasia')).toBeNull()
    expect(qm.labelMarker('Marek')).toBeNull()
  })

  it('keeps ordinary talk_to_npc markers and giver reminders when the stage is not a choice', () => {
    const relay = quest({
      id: 'relay',
      giverName: 'Anna',
      offerLine: 'offer',
      stages: [
        { objective: { type: 'talk_to_npc', npc: { npcId: 'Piotr' } }, description: 'talk', reminderLine: 'remind', progressLine: 'got it' },
      ],
      reportLine: 'report',
    })
    const qm = makeManager([relay])
    acceptOffer(qm, 'Anna')
    expect(qm.labelMarker('Anna')).toBe('…')
    expect(qm.labelMarker('Piotr')).toBe('?')
    expect(qm.onInteract('Anna')?.line).toBe('remind')
    const piotr = qm.onInteract('Piotr')
    expect(piotr?.line).toBe('Tak?')
    expect(qm.getState('relay')).toBe('active')
    expect(selectAction(piotr)).toBe('got it')
    expect(qm.getState('relay')).toBe('ready_to_report')
    expect(qm.labelMarker('Piotr')).toBeNull()
    expect(qm.labelMarker('Anna')).toBe('✓')
  })
})

describe('QuestManager sporne-drewno follow-ups (plan quests-progression-005)', () => {
  it('requires Piotr before the side choice, then unlocks only Anna\'s follow-up', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const inventory = new Inventory()
    inventory.add('branch', 5)
    const qm = new QuestManager(
      woodPack(),
      undefined,
      inventory,
      undefined,
      (kind, count) => granted.push({ kind, count }),
    )
    acceptOffer(qm, 'Anna')
    expect(qm.onInteract('Anna')?.line).toBe('Rozmawiałeś już z Piotrem?')
    expect(qm.getState('sporne-drewno')).toBe('active')
    const piotr = qm.onInteract('Piotr')
    expect(piotr?.line).toBe('Tak?')
    expect(selectAction(piotr)).toContain('nie wystarczy dla obojga')
    const annaChoice = qm.onInteract('Anna')
    expect(qm.getState('sporne-drewno')).toBe('active')
    expect(selectAction(annaChoice)).toBe('Dziękuję. Przyda nam się każda pomoc przy gospodarstwie.')
    expect(qm.exportProgress().find((e) => e.id === 'sporne-drewno')?.resolvedOutcomeId).toBe('support_anna')
    expect(qm.getRelation('Anna')).toBe(2)
    expect(qm.getRelation('Piotr')).toBe(-1)
    expect(qm.isQuestAvailable('drewno-dla-anny')).toBe(true)
    expect(qm.isQuestAvailable('drewno-dla-piotra')).toBe(false)
    expect(qm.onInteract('Piotr')).toBeNull()
    expect(qm.onInteract('Anna')?.line).toBe('Skoro zdecydowałeś — przyniesiesz pięć gałęzi? Przyda się na gospodarstwie.')
    qm.onInteract('Anna')?.offer?.onAccept()
    speak(qm, 'Anna')
    expect(inventory.count('branch')).toBe(0)
    expect(granted).toEqual([{ kind: 'seed_carrot', count: 3 }])
    expect(qm.getRelation('Anna')).toBe(3)
    expect(qm.exportProgress().find((e) => e.id === 'drewno-dla-anny')?.resolvedOutcomeId).toBe('delivered_to_anna')
    speak(qm, 'Anna')
    expect(granted).toHaveLength(1)
    expect(inventory.count('branch')).toBe(0)
  })

  it('unlocks only Piotr\'s paid follow-up after support_piotr and consumes branches once', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const inventory = new Inventory()
    inventory.add('branch', 5)
    const qm = new QuestManager(
      woodPack(),
      undefined,
      inventory,
      undefined,
      (kind, count) => granted.push({ kind, count }),
    )
    acceptOffer(qm, 'Anna')
    speak(qm, 'Piotr')
    expect(selectAction(qm.onInteract('Piotr'))).toBe('Dobra, skoro tak. Będę miał czym robić.')
    expect(qm.exportProgress().find((e) => e.id === 'sporne-drewno')?.resolvedOutcomeId).toBe('support_piotr')
    expect(qm.isQuestAvailable('drewno-dla-anny')).toBe(false)
    expect(qm.isQuestAvailable('drewno-dla-piotra')).toBe(true)
    expect(qm.list().find((e) => e.id === 'drewno-dla-piotra')?.promisedReward).toEqual({
      items: [{ kind: 'coin', count: 8 }],
    })
    acceptOffer(qm, 'Piotr')
    speak(qm, 'Piotr')
    expect(inventory.count('branch')).toBe(0)
    expect(granted).toEqual([{ kind: 'coin', count: 8 }])
    expect(qm.getRelation('Piotr')).toBe(3)
    expect(qm.list().find((e) => e.id === 'drewno-dla-piotra')?.promisedReward).toBeNull()
  })

  it('restores the chosen outcome and the matching follow-up after save/load', () => {
    const initial: QuestManagerInitial = {
      progress: [{ id: 'sporne-drewno', state: 'complete', stageIndex: 2, resolvedOutcomeId: 'support_anna' }],
      relations: { Anna: 2, Piotr: -1 },
    }
    const qm = new QuestManager(woodPack(), undefined, new Inventory(), initial)
    expect(qm.exportProgress().find((e) => e.id === 'sporne-drewno')?.resolvedOutcomeId).toBe('support_anna')
    expect(qm.isQuestAvailable('drewno-dla-anny')).toBe(true)
    expect(qm.isQuestAvailable('drewno-dla-piotra')).toBe(false)
    expect(qm.onInteract('Anna')?.line).toBe('Skoro zdecydowałeś — przyniesiesz pięć gałęzi? Przyda się na gospodarstwie.')
  })
})

describe('QuestManager dzik-przy-szlaku (plan quests-progression-005)', () => {
  const boarLookup = (renown: number): QuestSocialAvailabilityLookup => ({
    getReputationDimension: () => 0,
    getRenown: () => renown,
  })

  it('stays locked at renown 9 and offers at 10', () => {
    const def = homeQuest('dzik-przy-szlaku')
    const locked = makeManager([def], undefined, undefined, undefined, boarLookup(9))
    expect(locked.isQuestAvailable('dzik-przy-szlaku')).toBe(false)
    expect(locked.onInteract('Marek')).toBeNull()
    expect(locked.list()).toHaveLength(0)
    const open = makeManager([def], undefined, undefined, undefined, boarLookup(10))
    expect(open.isQuestAvailable('dzik-przy-szlaku')).toBe(true)
    expect(open.onInteract('Marek')?.line).toContain('dzika')
  })

  it('requires Piotr, binds one boar, and applies the hidden book plus social once', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const consequences: SocialConsequence[] = []
    const marked: string[] = []
    const def = homeQuest('dzik-przy-szlaku')
    const qm = new QuestManager(
      [def],
      undefined,
      new Inventory(),
      undefined,
      (kind, count) => granted.push({ kind, count }),
      () => 'boar-1',
      (animalId) => marked.push(animalId),
      (c) => consequences.push(c),
      boarLookup(10),
    )
    acceptOffer(qm, 'Marek')
    expect(qm.onInteract('Marek')?.line).toBe('Porozmawiaj z Piotrem — wie, gdzie kręci się dzik przy szlaku.')
    expect(selectAction(qm.onInteract('Piotr'))).toBe(
      'Tak. Przy szlaku w lesie, tam gdzie ludzie już nie chodzą. Bestia nie odpuszcza — uważaj na siebie.',
    )
    expect(marked).toEqual([])
    expect(qm.onInteractObjective({ type: 'animal_died', animalId: 'boar-2' })).toBeNull()
    expect(qm.onInteractObjective({ type: 'animal_died', animalId: 'boar-1' })?.line).toBe(
      'Dzik nie żyje. Szlak znów jest przejezdny. Wróć do Marka.',
    )
    expect(qm.getState('dzik-przy-szlaku')).toBe('ready_to_report')
    const report = qm.onInteract('Marek')
    expect(qm.getState('dzik-przy-szlaku')).toBe('ready_to_report')
    expect(selectAction(report)).toBe('Dzięki. Weź tę książkę — przyda ci się, zanim znów wyjdziesz poza osadę.')
    expect(granted).toEqual([{ kind: 'book_defense_intermediate', count: 1 }])
    expect(qm.getRelation('Marek')).toBe(2)
    expect(consequences).toEqual([{
      settlementId: 'home',
      reputation: { competence: 6, courage: 6, benevolence: 2 },
      renown: 8,
    }])
    qm.onInteract('Marek')
    expect(granted).toHaveLength(1)
    expect(consequences).toHaveLength(1)
    expect(marked).toEqual([])
  })

  it('invalidates an active wild boar binding on restore and rebuild', () => {
    const def = homeQuest('dzik-przy-szlaku')
    const restored = new QuestManager(
      [def],
      undefined,
      new Inventory(),
      { progress: [{ id: 'dzik-przy-szlaku', state: 'active', stageIndex: 1 }], relations: {} },
      undefined,
      () => 'boar-1',
      undefined,
      undefined,
      boarLookup(10),
    )
    expect(restored.getState('dzik-przy-szlaku')).toBe('invalidated')
    expect(restored.onInteractObjective({ type: 'animal_died', animalId: 'boar-1' })).toBeNull()

    const live = new QuestManager(
      [def],
      undefined,
      new Inventory(),
      undefined,
      undefined,
      () => 'boar-1',
      undefined,
      undefined,
      boarLookup(10),
    )
    acceptOffer(live, 'Marek')
    speak(live, 'Piotr')
    expect(live.getState('dzik-przy-szlaku')).toBe('active')
    live.invalidateStaleAnimalTargets()
    expect(live.getState('dzik-przy-szlaku')).toBe('invalidated')
    expect(live.onInteractObjective({ type: 'animal_died', animalId: 'boar-1' })).toBeNull()
  })
})

describe('QuestManager horse acquisition (plan quests-progression-012)', () => {
  const HORSE_ID = 'merchant-horse-home'
  const horseQuest = (): QuestDef => runtimeAuthored(buildHorseAcquisitionQuest(HORSE_ID))

  function makeHorseManager(opts?: {
    transferAnimalOwnership?: (animalId: string) => boolean
    canReserveHorseReward?: () => boolean
    isPermanentlyDestroyed?: (spawnerId: string) => boolean
  }): QuestManager {
    return new QuestManager(
      [horseQuest()],
      undefined,
      new Inventory(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      opts?.transferAnimalOwnership ?? (() => false),
      opts?.canReserveHorseReward ?? (() => true),
      { isPermanentlyDestroyed: opts?.isPermanentlyDestroyed ?? (() => false) },
    )
  }

  it('binds wilki-u-kupca to destroy_spawn_point, not clear_wolf_den', () => {
    expect(horseQuest().stages[0]?.objective).toEqual({
      type: 'destroy_spawn_point',
      spawnerId: WOLF_DEN_ID,
    })
  })

  it('acceptance reserves the horse and suppresses re-offer when unavailable', () => {
    let available = true
    const qm = makeHorseManager({ canReserveHorseReward: () => available })
    acceptOffer(qm, 'Kasia')
    expect(qm.getState('wilki-u-kupca')).toBe('active')
    expect(qm.isHorseRewardReserving(HORSE_ID)).toBe(true)
    available = false
    expect(qm.isQuestAvailable('wilki-u-kupca')).toBe(false)
  })

  it('does not complete on pack clear; becomes ready_to_report after permanent destruction', () => {
    let destroyed = false
    const qm = makeHorseManager({ isPermanentlyDestroyed: () => destroyed })
    acceptOffer(qm, 'Kasia')
    expect(qm.getState('wilki-u-kupca')).toBe('active')

    expect(qm.onInteractObjective({ type: 'wolf_den_cleared', denId: WOLF_DEN_ID })).toBeNull()
    expect(qm.getState('wilki-u-kupca')).toBe('active')

    qm.pollDestroySpawnPointObjectives()
    expect(qm.getState('wilki-u-kupca')).toBe('active')

    destroyed = true
    qm.pollDestroySpawnPointObjectives()
    expect(qm.getState('wilki-u-kupca')).toBe('ready_to_report')
  })

  it('transfers ownership before committing complete outcome', () => {
    const transferred: string[] = []
    const qm = makeHorseManager({
      transferAnimalOwnership: (animalId) => {
        transferred.push(animalId)
        return true
      },
      isPermanentlyDestroyed: () => true,
    })
    acceptOffer(qm, 'Kasia')
    qm.pollDestroySpawnPointObjectives()
    expect(qm.getState('wilki-u-kupca')).toBe('ready_to_report')
    speak(qm, 'Kasia')
    expect(transferred).toEqual([HORSE_ID])
    expect(qm.getState('wilki-u-kupca')).toBe('complete')
  })

  it('fails instead of completing when horse transfer is unavailable at turn-in', () => {
    const qm = makeHorseManager({
      transferAnimalOwnership: () => false,
      isPermanentlyDestroyed: () => true,
    })
    acceptOffer(qm, 'Kasia')
    qm.pollDestroySpawnPointObjectives()
    speak(qm, 'Kasia')
    expect(qm.getState('wilki-u-kupca')).toBe('failed')
  })

  it('fails an active horse-reward quest when the reserved target dies', () => {
    const qm = makeHorseManager({ transferAnimalOwnership: () => false })
    acceptOffer(qm, 'Kasia')
    qm.onHorseRewardTargetDied(HORSE_ID)
    expect(qm.getState('wilki-u-kupca')).toBe('failed')
    expect(qm.isHorseRewardReserving(HORSE_ID)).toBe(false)
  })
})

describe('QuestManager dialogue actions (plan quests-progression-014)', () => {
  it('does not resolve ready_to_report until the player selects the report action', () => {
    const qm = makeManager([simpleQuest])
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    const dialog = qm.onInteract('Anna')
    expect(qm.getState('simple')).toBe('ready_to_report')
    expect(dialog?.actions).toHaveLength(1)
    expect(selectAction(dialog)).toBe('report')
    expect(qm.getState('simple')).toBe('complete')
  })

  it('cannot duplicate reward or consequences via a stale report callback', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const rewarded = quest({
      ...simpleQuest,
      outcomes: [{
        id: 'complete',
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'coin', count: 4 }] },
        consequences: { relations: [{ npc: { npcId: 'Anna' }, delta: 2 }] },
      }],
    })
    const qm = makeManager([rewarded], undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    const dialog = qm.onInteract('Anna')
    expect(selectAction(dialog)).toBe('report')
    expect(selectAction(dialog)).toBe('report')
    expect(granted).toEqual([{ kind: 'coin', count: 4 }])
    expect(qm.getRelation('Anna')).toBe(2)
  })

  it('leaves talk_to_npc_choice unresolved if the player closes without selecting', () => {
    const qm = new QuestManager([homeQuest('zaginiona-przesylka')], undefined, new Inventory())
    acceptOffer(qm, 'Kasia')
    qm.onInteractObjective(CAVE_REF)
    const dialog = qm.onInteract('Kasia')
    expect(dialog?.actions).toHaveLength(1)
    expect(qm.getState('zaginiona-przesylka')).toBe('active')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBeUndefined()
  })

  it('advances an exact cave objective only for the bound spawner id', () => {
    const def = runtimeAuthored(bindExactCaveQuests(
      [QUESTS.find((q) => q.id === 'sprawdz-szlak')!],
      { id: 'home:cave', directionPhrase: null },
    )[0]!)
    const qm = makeManager([def])
    acceptOffer(qm, 'Kasia')
    expect(qm.onInteractObjective({
      type: 'interact_spawner',
      spawnerType: 'rockDen',
      spawnerId: 'home:cave:bear',
    })).toBeNull()
    expect(qm.getState('sprawdz-szlak')).toBe('active')
    expect(qm.onInteractObjective({
      type: 'interact_spawner',
      spawnerType: 'rockDen',
      spawnerId: 'home:cave',
    })?.line).toContain('świeże ślady')
    expect(qm.getState('sprawdz-szlak')).toBe('ready_to_report')
  })

  it('restores a ready_to_report save with the new report action', () => {
    const initial: QuestManagerInitial = {
      progress: [{ id: 'simple', state: 'ready_to_report', stageIndex: 1 }],
      relations: {},
    }
    const qm = makeManager([simpleQuest], undefined, undefined, initial)
    expect(qm.getState('simple')).toBe('ready_to_report')
    const dialog = qm.onInteract('Anna')
    expect(dialog?.actions).toHaveLength(1)
    expect(selectAction(dialog)).toBe('report')
    expect(qm.getState('simple')).toBe('complete')
  })

  it('offers wilki-pod-osada without Anna trusted relation', () => {
    const def = homeQuest('wilki-pod-osada')
    const qm = makeManager([def], undefined, undefined, { progress: [], relations: {} })
    expect(qm.isQuestAvailable('wilki-pod-osada')).toBe(true)
    expect(qm.onInteract('Anna')?.line).toContain('Wilki')
    expect(qm.getState('wilki-pod-osada')).toBe('offered')
  })

  it('does not mark an unbound cave when the objective has a specific spawnerId', () => {
    const def = runtimeAuthored(bindExactCaveQuests(
      [QUESTS.find((q) => q.id === 'sprawdz-szlak')!],
      { id: 'home:cave', directionPhrase: null },
    )[0]!)
    const qm = makeManager([def])
    acceptOffer(qm, 'Kasia')
    expect(qm.spawnerMarker('rockDen', 'home:cave')).toBe('?')
    expect(qm.spawnerMarker('rockDen', 'home:cave:bear')).toBeNull()
  })
})

describe('QuestManager stable NPC identity (plan quests-progression-015)', () => {
  const janA = 'settlement-a:npc:3'
  const janB = 'settlement-b:npc:7'

  it('talk_to_npc completes only for the targeted id when two NPCs share a display name', () => {
    const def = quest({
      id: 'talk-jan',
      giverName: 'Anna',
      giver: { npcId: 'anna-id' },
      offerLine: 'offer',
      stages: [{
        objective: { type: 'talk_to_npc', npc: { npcId: janB } },
        description: 'talk',
        reminderLine: 'remind',
        progressLine: 'got it',
      }],
      reportLine: 'report',
    })
    const qm = makeManager([def])
    acceptOffer(qm, 'anna-id')
    expect(qm.getState('talk-jan')).toBe('active')
    expect(qm.onInteract(janA)).toBeNull()
    expect(qm.getState('talk-jan')).toBe('active')
    expect(selectAction(qm.onInteract(janB))).toBe('got it')
    expect(qm.getState('talk-jan')).toBe('ready_to_report')
  })

  it('does not offer or mark a same-name NPC as the giver', () => {
    const def = quest({
      id: 'giver-jan',
      giverName: 'Jan',
      giver: { npcId: janB },
      offerLine: 'offer from B',
      stages: [{ objective: { type: 'interact_well' }, description: 'well', reminderLine: 'remind' }],
      reportLine: 'report',
    })
    const qm = makeManager([def])
    expect(qm.onInteract(janA)).toBeNull()
    expect(qm.labelMarker(janA)).toBeNull()
    expect(qm.onInteract(janB)?.line).toBe('offer from B')
    expect(qm.labelMarker(janB)).toBe('!')
  })

  it('talk_to_npc_choice matches the authored id, not a duplicate display name', () => {
    const def = quest({
      id: 'choice-jan',
      giverName: 'Anna',
      giver: { npcId: 'anna-id' },
      offerLine: 'offer',
      stages: [{
        objective: {
          type: 'talk_to_npc_choice',
          choices: [
            { npc: { npcId: janA }, outcomeId: 'pick-a', playerLine: 'Talk to A' },
            { npc: { npcId: janB }, outcomeId: 'pick-b', playerLine: 'Talk to B' },
          ],
        },
        description: 'choose',
        reminderLine: 'remind',
      }],
      reportLine: 'report',
      outcomes: [
        { id: 'pick-a', state: 'complete', resultText: 'chose A' },
        { id: 'pick-b', state: 'complete', resultText: 'chose B' },
      ],
    })
    const qm = makeManager([def])
    acceptOffer(qm, 'anna-id')
    expect(qm.onInteract('other-jan')).toBeNull()
    expect(selectAction(qm.onInteract(janB))).toBe('chose B')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe('pick-b')
  })

  it('relation prerequisite and consequence use stable ids', () => {
    const setup = quest({
      id: 'setup',
      giverName: 'Jan',
      giver: { npcId: janB },
      offerLine: 'offer',
      stages: [{ objective: { type: 'interact_well' }, description: 'well', reminderLine: 'remind' }],
      reportLine: 'report',
      outcomes: [{
        id: 'complete',
        state: 'complete',
        consequences: { relations: [{ npc: { npcId: janB }, delta: 6 }] },
      }],
    })
    const gated = quest({
      id: 'gated-jan',
      giverName: 'Jan',
      giver: { npcId: janB },
      offerLine: 'offer gated',
      stages: [{ objective: { type: 'interact_tree' }, description: 'tree', reminderLine: 'remind' }],
      reportLine: 'report gated',
      availability: {
        prerequisites: [{ type: 'relation', npc: { npcId: janB }, minimum: 'trusted' }],
      },
    })
    const qm = makeManager([setup, gated])
    acceptOffer(qm, janB)
    qm.onInteractObjective({ type: 'interact_well' })
    speak(qm, janB)
    expect(qm.getRelation(janA)).toBe(0)
    expect(qm.getRelation(janB)).toBe(6)
    expect(qm.isQuestAvailable('gated-jan')).toBe(true)
  })

  it('puts a talk marker only on the matching id', () => {
    const def = quest({
      id: 'mark-jan',
      giverName: 'Anna',
      giver: { npcId: 'anna-id' },
      offerLine: 'offer',
      stages: [{
        objective: { type: 'talk_to_npc', npc: { npcId: janB } },
        description: 'talk',
        reminderLine: 'remind',
      }],
      reportLine: 'report',
    })
    const qm = makeManager([def])
    acceptOffer(qm, 'anna-id')
    expect(qm.labelMarker(janA)).toBeNull()
    expect(qm.labelMarker(janB)).toBe('?')
    expect(qm.labelMarker('anna-id')).toBe('…')
  })
})

describe('QuestManager world-driven settlement sources', () => {
  const sourceQuest = quest({
    id: 'world:wolf-den-pressure:home:wolfDen',
    giverName: 'Anna',
    offerLine: 'offer den',
    stages: [
      { objective: { type: 'destroy_spawn_point', spawnerId: 'home:wolfDen' }, description: 'destroy', reminderLine: 'remind' },
    ],
    reportLine: 'report den',
    outcomes: [
      { id: 'den_destroyed', state: 'complete', consequences: { relations: [{ npc: { npcId: 'Anna' }, delta: 2 }] } },
      { id: 'resolved_without_player', state: 'failed', resultText: 'gone' },
    ],
  })

  function sourceLookup(status: import('./QuestManager').WorldQuestSourceStatus) {
    return { getStatus: (questId: string) => questId === sourceQuest.id ? status : 'untracked' as const }
  }

  it('hides an unaccepted generated quest while the source problem is absent', () => {
    const qm = makeManager([sourceQuest], undefined, undefined, undefined, undefined, undefined, undefined, sourceLookup('absent'))
    expect(qm.isQuestAvailable(sourceQuest.id)).toBe(false)
    expect(qm.onInteract('Anna')).toBeNull()
    expect(qm.list()).toHaveLength(0)
    expect(qm.getState(sourceQuest.id)).toBe('not_offered')
  })

  it('offers a generated quest only while the source problem is present', () => {
    const qm = makeManager([sourceQuest], undefined, undefined, undefined, undefined, undefined, undefined, sourceLookup('present'))
    expect(qm.isQuestAvailable(sourceQuest.id)).toBe(true)
    expect(qm.onInteract('Anna')?.offer).toBeDefined()
  })

  it('drops an unaccepted offer when the source problem disappears', () => {
    let status: import('./QuestManager').WorldQuestSourceStatus = 'present'
    const qm = makeManager(
      [sourceQuest],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { getStatus: () => status },
    )
    expect(qm.onInteract('Anna')?.offer).toBeDefined()
    expect(qm.getState(sourceQuest.id)).toBe('offered')
    status = 'resolved'
    qm.pollWorldDrivenSources()
    expect(qm.getState(sourceQuest.id)).toBe('not_offered')
    expect(qm.list()).toHaveLength(0)
    expect(qm.onInteract('Anna')).toBeNull()
  })

  it('fails an accepted generated quest without reward when the source resolves externally', () => {
    const granted: string[] = []
    let status: import('./QuestManager').WorldQuestSourceStatus = 'present'
    const qm = makeManager(
      [sourceQuest],
      undefined,
      (kind) => granted.push(kind),
      undefined,
      undefined,
      undefined,
      undefined,
      { getStatus: () => status },
    )
    acceptOffer(qm, 'Anna')
    expect(qm.getState(sourceQuest.id)).toBe('active')
    status = 'resolved'
    qm.pollWorldDrivenSources()
    expect(qm.getState(sourceQuest.id)).toBe('failed')
    expect(qm.list()[0]?.resolvedOutcomeId).toBe('resolved_without_player')
    expect(granted).toEqual([])
    expect(qm.getRelation('Anna')).toBe(0)
  })

  it('lets a player destroy complete before external-resolution polling', () => {
    let status: import('./QuestManager').WorldQuestSourceStatus = 'present'
    const qm = makeManager(
      [sourceQuest],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { isPermanentlyDestroyed: () => true },
      { getStatus: () => status },
    )
    acceptOffer(qm, 'Anna')
    status = 'resolved'
    qm.pollDestroySpawnPointObjectives()
    qm.pollWorldDrivenSources()
    expect(qm.getState(sourceQuest.id)).toBe('ready_to_report')
    expect(speak(qm, 'Anna')).toBe('report den')
    expect(qm.getState(sourceQuest.id)).toBe('complete')
    expect(qm.getRelation('Anna')).toBe(2)
  })

  it('invalidates an active generated quest whose source binding is gone', () => {
    const qm = makeManager(
      [sourceQuest],
      undefined,
      undefined,
      { progress: [{ id: sourceQuest.id, state: 'active', stageIndex: 0 }], relations: {} },
      undefined,
      undefined,
      undefined,
      sourceLookup('absent'),
    )
    expect(qm.getState(sourceQuest.id)).toBe('active')
    qm.pollWorldDrivenSources()
    expect(qm.getState(sourceQuest.id)).toBe('invalidated')
  })

  it('restores persisted generated-quest progress when the same definition id is present', () => {
    const qm = makeManager(
      [sourceQuest],
      undefined,
      undefined,
      {
        progress: [{ id: sourceQuest.id, state: 'active', stageIndex: 0 }],
        relations: {},
      },
      undefined,
      undefined,
      undefined,
      sourceLookup('present'),
    )
    expect(qm.getState(sourceQuest.id)).toBe('active')
    expect(qm.list()[0]?.id).toBe(sourceQuest.id)
  })
})

describe('QuestManager lost livestock sources (fauna-024)', () => {
  const lostQuest = quest({
    id: 'world:lost-livestock:home:sheep-house0-0',
    giverName: 'Anna',
    offerLine: 'offer sheep',
    stages: [
      { objective: { type: 'recover_lost_livestock', animalId: 'sheep-house0-0' }, description: 'find', reminderLine: 'remind' },
    ],
    reportLine: 'report sheep',
    outcomes: [
      { id: 'live_return', state: 'complete', resultText: 'live' },
      { id: 'dead_confirmed', state: 'complete', resultText: 'dead' },
      { id: 'unavailable', state: 'failed', resultText: 'gone' },
    ],
  })

  function lostLookup(status: import('../fauna/animalStray').LostLivestockSourceStatus | 'untracked') {
    return { getSnapshot: (questId: string) => questId === lostQuest.id ? status : 'untracked' as const }
  }

  it('offers only while the world snapshot is still lost', () => {
    const qm = makeManager(
      [lostQuest],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      lostLookup('lost-alive'),
    )
    expect(qm.isQuestAvailable(lostQuest.id)).toBe(true)
    expect(qm.onInteract('Anna')?.offer).toBeDefined()
  })

  it('reads live return from world state, not quest flags', () => {
    const qm = makeManager(
      [lostQuest],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      lostLookup('lost-alive'),
    )
    qm.onInteract('Anna')?.offer?.onAccept()
    expect(qm.getState(lostQuest.id)).toBe('active')
    const polling = makeManager(
      [lostQuest],
      undefined,
      undefined,
      { progress: [{ id: lostQuest.id, state: 'active', stageIndex: 0 }], relations: {} },
      undefined,
      undefined,
      undefined,
      undefined,
      lostLookup('returned'),
    )
    polling.pollLostLivestockSources()
    expect(polling.getState(lostQuest.id)).toBe('complete')
    expect(polling.list()[0]?.resolvedOutcomeId).toBe('live_return')
  })

  it('fails from world unavailable, not a quest-local flag', () => {
    const qm = makeManager(
      [lostQuest],
      undefined,
      undefined,
      { progress: [{ id: lostQuest.id, state: 'active', stageIndex: 0 }], relations: {} },
      undefined,
      undefined,
      undefined,
      undefined,
      lostLookup('unavailable'),
    )
    qm.pollLostLivestockSources()
    expect(qm.getState(lostQuest.id)).toBe('failed')
    expect(qm.list()[0]?.resolvedOutcomeId).toBe('unavailable')
  })

  it('reads inspected corpse from world state', () => {
    const qm = makeManager(
      [lostQuest],
      undefined,
      undefined,
      { progress: [{ id: lostQuest.id, state: 'active', stageIndex: 0 }], relations: {} },
      undefined,
      undefined,
      undefined,
      undefined,
      lostLookup('corpse-inspected'),
    )
    qm.pollLostLivestockSources()
    expect(qm.getState(lostQuest.id)).toBe('complete')
    expect(qm.list()[0]?.resolvedOutcomeId).toBe('dead_confirmed')
  })
})

describe('QuestManager playtest reachability (plan quests-progression-018)', () => {
  const STAG_LIE = 'Tak, widziałem jelenia.'
  const STAG_HONEST = 'Nie widziałem jelenia.'
  const BOAR_TALK = 'Marek mówi, że przy szlaku kręci się duży dzik. Wiesz, gdzie go szukać?'
  const boarLookup = (renown: number): QuestSocialAvailabilityLookup => ({
    getReputationDimension: () => 0,
    getRenown: () => renown,
  })

  function labels(dialog: QuestDialogOverride | null): string[] {
    return dialog?.actions?.map((action) => action.label) ?? []
  }

  function selectLabel(dialog: QuestDialogOverride | null, label: string): string | undefined {
    return dialog?.actions?.find((action) => action.label === label)?.onSelect()
  }

  function startScoutAtStag(qm: QuestManager): void {
    acceptOffer(qm, 'Piotr')
    qm.onInteractObjective(CAVE_REF)
  }

  it('spot_animal stag still advances zwiadowca to stones without talking to Piotr', () => {
    const qm = new QuestManager([homeQuest('zwiadowca')], undefined, new Inventory())
    startScoutAtStag(qm)
    expect(qm.onInteractObjective({ type: 'spot_animal', kind: 'stag' })?.line).toContain('Jeleń zerwał się')
    expect(qm.exportProgress().find((entry) => entry.id === 'zwiadowca')?.stageIndex).toBe(2)
    expect(labels(qm.onInteract('Piotr'))).not.toContain(STAG_LIE)
    expect(qm.onInteract('Piotr')?.line).toBe('Masz już kamienie z gór?')
  })

  it('shows lie and honest replies while the stag stage is unresolved', () => {
    const qm = new QuestManager([homeQuest('zwiadowca')], undefined, new Inventory())
    startScoutAtStag(qm)
    const dialog = qm.onInteract('Piotr')
    expect(dialog?.line).toBe('Widziałeś już jelenia?')
    expect(labels(dialog)).toEqual([STAG_LIE, STAG_HONEST])
    expect(qm.getState('zwiadowca')).toBe('active')
    expect(qm.exportProgress()[0]?.stageIndex).toBe(1)
  })

  it('the lie advances only the stag stage and applies integrity once', () => {
    const consequences: SocialConsequence[] = []
    const qm = new QuestManager(
      [homeQuest('zwiadowca')],
      undefined,
      new Inventory(),
      undefined,
      undefined,
      undefined,
      undefined,
      (consequence) => consequences.push(consequence),
    )
    startScoutAtStag(qm)
    const dialog = qm.onInteract('Piotr')
    expect(selectLabel(dialog, STAG_LIE)).toBe('Skoro tak. Zostały kamienie z gór — przynieś dwa.')
    expect(qm.getState('zwiadowca')).toBe('active')
    expect(qm.exportProgress()[0]?.stageIndex).toBe(2)
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBeUndefined()
    expect(consequences).toEqual([{ settlementId: 'home', reputation: { integrity: -2 } }])
    expect(selectLabel(dialog, STAG_HONEST)).toBe('Masz już kamienie z gór?')
    expect(consequences).toHaveLength(1)
    expect(qm.exportProgress()[0]?.stageIndex).toBe(2)
  })

  it('the honest reply advances only the stag stage without an integrity penalty', () => {
    const consequences: SocialConsequence[] = []
    const qm = new QuestManager(
      [homeQuest('zwiadowca')],
      undefined,
      new Inventory(),
      undefined,
      undefined,
      undefined,
      undefined,
      (consequence) => consequences.push(consequence),
    )
    startScoutAtStag(qm)
    const dialog = qm.onInteract('Piotr')
    expect(selectLabel(dialog, STAG_HONEST)).toBe(
      'Trudno. Przynieś przynajmniej dwa kamienie z gór, żebym wiedział, że tam byłeś.',
    )
    expect(qm.getState('zwiadowca')).toBe('active')
    expect(qm.exportProgress()[0]?.stageIndex).toBe(2)
    expect(consequences).toEqual([])
  })

  it('does not let Piotr\'s giver reminder hide dzik-przy-szlaku talk_to_npc', () => {
    const qm = new QuestManager(
      [homeQuest('zwiadowca'), homeQuest('dzik-przy-szlaku')],
      undefined,
      new Inventory(),
      undefined,
      undefined,
      () => 'boar-1',
      undefined,
      undefined,
      boarLookup(10),
    )
    acceptOffer(qm, 'Piotr')
    acceptOffer(qm, 'Marek')
    expect(qm.exportProgress().find((entry) => entry.id === 'zwiadowca')?.stageIndex).toBe(0)
    const dialog = qm.onInteract('Piotr')
    expect(labels(dialog)).toEqual([BOAR_TALK])
    expect(selectLabel(dialog, BOAR_TALK)).toContain('Przy szlaku w lesie')
    expect(qm.exportProgress().find((entry) => entry.id === 'dzik-przy-szlaku')?.stageIndex).toBe(1)
    expect(qm.getState('zwiadowca')).toBe('active')
    expect(qm.exportProgress().find((entry) => entry.id === 'zwiadowca')?.stageIndex).toBe(0)
  })

  it('shows concurrent Piotr actions deterministically and selecting one does not fire the other', () => {
    const qm = new QuestManager(
      [homeQuest('zwiadowca'), homeQuest('dzik-przy-szlaku')],
      undefined,
      new Inventory(),
      undefined,
      undefined,
      () => 'boar-1',
      undefined,
      undefined,
      boarLookup(10),
    )
    startScoutAtStag(qm)
    acceptOffer(qm, 'Marek')
    const dialog = qm.onInteract('Piotr')
    expect(labels(dialog)).toEqual([STAG_LIE, STAG_HONEST, BOAR_TALK])
    expect(selectLabel(dialog, BOAR_TALK)).toContain('Przy szlaku w lesie')
    expect(qm.exportProgress().find((entry) => entry.id === 'zwiadowca')?.stageIndex).toBe(1)
    expect(qm.exportProgress().find((entry) => entry.id === 'dzik-przy-szlaku')?.stageIndex).toBe(1)
    expect(selectLabel(dialog, STAG_LIE)).toBe('Skoro tak. Zostały kamienie z gór — przynieś dwa.')
    expect(qm.exportProgress().find((entry) => entry.id === 'zwiadowca')?.stageIndex).toBe(2)
    expect(qm.exportProgress().find((entry) => entry.id === 'dzik-przy-szlaku')?.stageIndex).toBe(1)
    expect(qm.getState('zwiadowca')).toBe('active')
  })

  it('labelMarker prefers a required talk target over giver in-progress', () => {
    const qm = new QuestManager(
      [homeQuest('zwiadowca'), homeQuest('dzik-przy-szlaku')],
      undefined,
      new Inventory(),
      undefined,
      undefined,
      () => 'boar-1',
      undefined,
      undefined,
      boarLookup(10),
    )
    acceptOffer(qm, 'Piotr')
    acceptOffer(qm, 'Marek')
    expect(qm.labelMarker('Piotr')).toBe('?')
    expect(qm.labelMarker('Marek')).toBe('…')
  })

  it('marks Piotr as a talk target while zwiadowca stage dialogue actions are available', () => {
    const qm = new QuestManager([homeQuest('zwiadowca')], undefined, new Inventory())
    startScoutAtStag(qm)
    expect(qm.labelMarker('Piotr')).toBe('?')
  })

  it('keeps offer, report, talk choice, and completed fallback working', () => {
    const offerQm = makeManager([simpleQuest])
    expect(offerQm.onInteract('Anna')?.offer).toBeDefined()
    expect(offerQm.getState('simple')).toBe('offered')

    const reportQm = makeManager([simpleQuest])
    acceptOffer(reportQm, 'Anna')
    reportQm.onInteractObjective({ type: 'interact_well' })
    const report = reportQm.onInteract('Anna')
    expect(report?.actions).toHaveLength(1)
    expect(selectAction(report)).toBe('report')
    expect(reportQm.getState('simple')).toBe('complete')
    expect(reportQm.onInteract('Anna')).toEqual({ line: 'report' })

    const choiceQm = new QuestManager([homeQuest('zaginiona-przesylka')], undefined, new Inventory())
    acceptOffer(choiceQm, 'Kasia')
    choiceQm.onInteractObjective(CAVE_REF)
    expect(choiceQm.onInteract('Kasia')?.actions?.[0]?.label).toBe('Znalazłem przesyłkę. Proszę, jest twoja.')
    expect(choiceQm.getState('zaginiona-przesylka')).toBe('active')
  })

  it('turns in ziola-dla-anny herbs from inventory without a quest-specific purchase path', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const inventory = new Inventory()
    inventory.add('herb', 3)
    const qm = new QuestManager(
      [homeQuest('ziola-dla-anny')],
      undefined,
      inventory,
      undefined,
      (kind, count) => granted.push({ kind, count }),
    )
    acceptOffer(qm, 'Anna')
    expect(qm.onInteract('Anna')?.actions?.[0]?.label).toBe('Tak. Zebrałem trzy zioła — proszę.')
    expect(selectAction(qm.onInteract('Anna'))).toBe('Dziękuję, dokładnie tyle mi trzeba.')
    expect(inventory.count('herb')).toBe(0)
    expect(granted).toEqual([{ kind: 'coin', count: 8 }])
    expect(qm.getState('ziola-dla-anny')).toBe('complete')
  })
})
