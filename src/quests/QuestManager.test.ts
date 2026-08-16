import { describe, expect, it } from 'vitest'
import type { QuestManagerInitial } from './QuestManager'
import type { QuestDef } from './quests'
import { Inventory } from '../items/Inventory'
import { QuestManager } from './QuestManager'
import { relationToLevel } from './quests'

const simpleQuest: QuestDef = {
  id: 'simple',
  giverName: 'Anna',
  offerLine: 'offer',
  stages: [
    { objective: { type: 'interact_well' }, description: 'well', reminderLine: 'remind' },
  ],
  reportLine: 'report',
}

const gatedQuest: QuestDef = {
  id: 'gated',
  giverName: 'Anna',
  offerLine: 'offer gated',
  stages: [
    { objective: { type: 'interact_tree' }, description: 'tree', reminderLine: 'remind' },
  ],
  reportLine: 'report gated',
  availability: { relation: { npcName: 'Anna', minimum: 'trusted' } },
}

const effectsQuest: QuestDef = {
  id: 'effects',
  giverName: 'Kasia',
  offerLine: 'offer effects',
  stages: [
    { objective: { type: 'interact_well' }, description: 'well', reminderLine: 'remind' },
  ],
  reportLine: 'report effects',
  effects: { relation: 3, exp: 25 },
}

function makeManager(
  defs: readonly QuestDef[],
  resolveAnimalTarget?: (kind: string) => string | undefined,
): QuestManager {
  return new QuestManager(defs, undefined, new Inventory(), undefined, undefined, resolveAnimalTarget)
}

const wolfQuest: QuestDef = {
  id: 'wolf',
  giverName: 'Anna',
  offerLine: 'offer wolf',
  stages: [
    { objective: { type: 'kill_target_animal', kind: 'wolf' }, description: 'kill wolf', reminderLine: 'remind' },
  ],
  reportLine: 'report wolf',
}

/** Talks to `npcName` and accepts the offer, moving the matching quest to `active`. */
function acceptOffer(qm: QuestManager, npcName: string): void {
  const offer = qm.onInteract(npcName)
  offer?.offer?.onAccept()
}

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
    qm.onInteract('Anna') // report -> complete, +1 relation
    expect(qm.getRelation('Anna')).toBe(1)
    expect(qm.isQuestAvailable('gated')).toBe(false)
  })

  it('unlocks a gated quest once relation crosses the threshold via effects', () => {
    const boosted: QuestDef = { ...simpleQuest, effects: { relation: 6, exp: 0 } }
    const qm = makeManager([boosted, gatedQuest])
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    qm.onInteract('Anna')
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

describe('QuestManager effects', () => {
  it('applies default v2 relation/exp reward when effects is absent', () => {
    const qm = makeManager([simpleQuest])
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    qm.onInteract('Anna')
    expect(qm.getExp()).toBe(10)
    expect(qm.getRelation('Anna')).toBe(1)
  })

  it('applies custom effects exactly once', () => {
    const qm = makeManager([effectsQuest])
    acceptOffer(qm, 'Kasia')
    qm.onInteractObjective({ type: 'interact_well' })
    const result = qm.onInteract('Kasia')
    expect(result?.line).toBe('report effects')
    expect(qm.getExp()).toBe(25)
    expect(qm.getRelation('Kasia')).toBe(3)
    // Talking again after completion must not re-apply effects.
    qm.onInteract('Kasia')
    expect(qm.getExp()).toBe(25)
    expect(qm.getRelation('Kasia')).toBe(3)
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
    qm.onInteract('Anna') // report -> complete
    expect(qm.getState('wolf')).toBe('complete')
    // Re-reporting a death for the same id afterward must not affect anything.
    expect(qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })).toBeNull()
  })
})

describe('QuestManager find_animal binding', () => {
  const sheepQuest: QuestDef = {
    id: 'sheep',
    giverName: 'Anna',
    offerLine: 'offer sheep',
    stages: [
      { objective: { type: 'find_animal', kind: 'sheep' }, description: 'find sheep', reminderLine: 'remind' },
    ],
    reportLine: 'report sheep',
  }

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

describe('QuestManager clear_wolf_den', () => {
  const denQuest: QuestDef = {
    id: 'den',
    giverName: 'Anna',
    offerLine: 'offer den',
    stages: [
      { objective: { type: 'clear_wolf_den', denId: 'wolf-den' }, description: 'clear den', reminderLine: 'remind' },
    ],
    reportLine: 'report den',
  }

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
  const landmarkQuest: QuestDef = {
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
  }

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
  it('clears relation, exp and progress back to fresh state', () => {
    const qm = makeManager([effectsQuest])
    acceptOffer(qm, 'Kasia')
    qm.onInteractObjective({ type: 'interact_well' })
    qm.onInteract('Kasia')
    expect(qm.getExp()).toBeGreaterThan(0)
    qm.reset()
    expect(qm.getExp()).toBe(0)
    expect(qm.getRelation('Kasia')).toBe(0)
    expect(qm.getState('effects')).toBe('not_offered')
  })
})

const sheepQuest: QuestDef = {
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
}

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
    expect(qm.getExp()).toBe(0)
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
  const wolfDef: QuestDef = {
    id: 'wolf',
    giverName: 'Anna',
    offerLine: 'offer wolf',
    stages: [
      { objective: { type: 'kill_target_animal', kind: 'wolf' }, description: 'kill wolf', reminderLine: 'remind' },
    ],
    reportLine: 'report wolf',
  }

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
      exp: 0,
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
      exp: 0,
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
      exp: 5,
      relations: { Anna: 2 },
    }
    const qm = makeRestoredManager([simpleQuest], initial, () => undefined)
    expect(qm.getState('simple')).toBe('ready_to_report')
    expect(qm.getExp()).toBe(5)
    expect(qm.getRelation('Anna')).toBe(2)
  })
})

describe('QuestManager dangerous trait binding', () => {
  const dangerousWolfQuest: QuestDef = {
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
  }

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
