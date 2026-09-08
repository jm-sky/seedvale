import { describe, expect, it } from 'vitest'
import type { SocialConsequence } from '../reputation/ReputationManager'
import type { QuestManagerInitial } from './QuestManager'
import type { QuestDef } from './quests'
import { WOLF_DEN_ID } from '../fauna/AnimalSpawner'
import { Inventory } from '../items/Inventory'
import { QuestManager } from './QuestManager'
import { QUESTS, relationToLevel } from './quests'

function quest(
  partial: Omit<QuestDef, 'title' | 'description' | 'outcomes'> & Partial<Pick<QuestDef, 'title' | 'description' | 'outcomes'>>,
): QuestDef {
  return {
    ...partial,
    title: partial.title ?? partial.id,
    description: partial.description ?? partial.offerLine,
    outcomes: partial.outcomes ?? [{
      id: 'complete',
      state: 'complete',
      consequences: { relations: [{ npcName: partial.giverName, delta: 1 }] },
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
  availability: { relation: { npcName: 'Anna', minimum: 'trusted' } },
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
    consequences: { relations: [{ npcName: 'Kasia', delta: 3 }] },
  }],
})

function makeManager(
  defs: readonly QuestDef[],
  resolveAnimalTarget?: (kind: string) => string | undefined,
  grantItem?: (kind: string, count: number) => void,
): QuestManager {
  return new QuestManager(defs, undefined, new Inventory(), undefined, grantItem, resolveAnimalTarget)
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
    const boosted = quest({
      ...simpleQuest,
      outcomes: [{
        id: 'complete',
        state: 'complete',
        consequences: { relations: [{ npcName: 'Anna', delta: 6 }] },
      }],
    })
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

describe('QuestManager outcomes', () => {
  it('does not apply an implicit giver relation when consequences omit relations', () => {
    const noRelation = quest({
      ...simpleQuest,
      outcomes: [{ id: 'complete', state: 'complete' }],
    })
    const qm = makeManager([noRelation])
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'interact_well' })
    qm.onInteract('Anna')
    expect(qm.getRelation('Anna')).toBe(0)
    expect(qm.getState('simple')).toBe('complete')
  })

  it('applies authored relation consequences exactly once', () => {
    const qm = makeManager([effectsQuest])
    acceptOffer(qm, 'Kasia')
    qm.onInteractObjective({ type: 'interact_well' })
    const result = qm.onInteract('Kasia')
    expect(result?.line).toBe('report effects')
    expect(qm.getRelation('Kasia')).toBe(3)
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe('complete')
    qm.onInteract('Kasia')
    expect(qm.getRelation('Kasia')).toBe(3)
  })

  it('does not bump a talk_to_npc target unless the outcome names them', () => {
    const relay = quest({
      id: 'relay',
      giverName: 'Anna',
      offerLine: 'offer',
      stages: [
        { objective: { type: 'talk_to_npc', npcName: 'Piotr' }, description: 'talk', reminderLine: 'remind', progressLine: 'got it' },
      ],
      reportLine: 'report',
      outcomes: [{
        id: 'delivered',
        state: 'complete',
        consequences: { relations: [{ npcName: 'Anna', delta: 1 }] },
      }],
    })
    const qm = makeManager([relay])
    acceptOffer(qm, 'Anna')
    qm.onInteract('Piotr')
    qm.onInteract('Anna')
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
    qm.onInteract('Anna') // report -> complete
    expect(qm.getState('wolf')).toBe('complete')
    // Re-reporting a death for the same id afterward must not affect anything.
    expect(qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })).toBeNull()
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
    qm.onInteract('Kasia')
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
    { id: 'found_and_reported', state: 'complete', consequences: { relations: [{ npcName: 'Anna', delta: 1 }] } },
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
  const groznyWilkDef: QuestDef = { ...QUESTS.find((d) => d.id === 'grozny-wilk')!, settlementId: 'home' }
  const wilczaJamaDef: QuestDef = { ...QUESTS.find((d) => d.id === 'wilcza-jama')!, settlementId: 'home' }

  /** Both wolf quests gate on `Anna: trusted` — pre-seed the relation via
   *  `QuestManagerInitial` instead of accepting/completing an earlier quest. */
  function makeTrustedManager(
    defs: readonly QuestDef[],
    onConsequence: (c: SocialConsequence) => void,
    resolveAnimalTarget?: (kind: string) => string | undefined,
  ): QuestManager {
    const initial: QuestManagerInitial = { progress: [], relations: { Anna: 6 } }
    return new QuestManager(defs, undefined, new Inventory(), initial, undefined, resolveAnimalTarget, undefined, onConsequence)
  }

  it('applies exactly grozny-wilk\'s calibrated deltas, once, on completion', () => {
    const consequences: SocialConsequence[] = []
    const qm = makeTrustedManager([groznyWilkDef], (c) => consequences.push(c), () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' }) // -> ready_to_report
    qm.onInteract('Anna') // report -> complete, applies consequence
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
    const qm = makeTrustedManager([wilczaJamaDef], (c) => consequences.push(c))
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'wolf_den_cleared', denId: WOLF_DEN_ID })
    qm.onInteract('Anna')
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
    qm.onInteract('Anna')
    expect(consequences).toHaveLength(0)
  })

  it('does not apply a consequence for a quest with authored deltas but no resolved settlementId', () => {
    const { settlementId: _settlementId, ...unresolved } = groznyWilkDef
    const consequences: SocialConsequence[] = []
    const qm = makeTrustedManager([unresolved], (c) => consequences.push(c), () => 'wolf-1')
    acceptOffer(qm, 'Anna')
    qm.onInteractObjective({ type: 'animal_died', animalId: 'wolf-1' })
    qm.onInteract('Anna')
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
    qm.onInteract('Anna')
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
    qm.onInteract('Anna')
    expect(granted).toEqual([{ kind: 'coin', count: 5 }, { kind: 'shell', count: 2 }])
    qm.onInteract('Anna')
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
        consequences: { relations: [{ npcName: 'Anna', delta: 1 }] },
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
        { id: 'a', state: 'complete', consequences: { relations: [{ npcName: 'Anna', delta: 1 }] } },
        { id: 'b', state: 'complete', consequences: { relations: [{ npcName: 'Anna', delta: 2 }] } },
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
    qm.onInteract('Anna')
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
  const sheepDef = QUESTS.find((d) => d.id === 'zagubiona-owca')!

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
    qm.onInteract('Anna')
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
    const def = QUESTS.find((d) => d.id === 'drewno-na-naprawe')!
    const inventory = new Inventory()
    inventory.add('branch', 5)
    const qm = new QuestManager([def], undefined, inventory, undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Piotr')
    qm.onInteract('Piotr')
    expect(qm.getState('drewno-na-naprawe')).toBe('complete')
    expect(granted).toEqual([{ kind: 'coin', count: 8 }])
    expect(qm.getRelation('Piotr')).toBe(0)
  })

  it('woda-dla-marka grants five coins instead of a sword', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const def = QUESTS.find((d) => d.id === 'woda-dla-marka')!
    const qm = new QuestManager([def], undefined, new Inventory(), undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Marek')
    qm.onInteractObjective({ type: 'interact_well' })
    qm.onInteract('Marek')
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
      { objective: { type: 'interact_spawner', spawnerType: 'cave' }, description: 'cave', reminderLine: 'remind cave', progressLine: 'cave done' },
    ],
    reportLine: 'report multi',
    outcomes: [{ id: 'reported', state: 'complete', consequences: { relations: [{ npcName: 'Piotr', delta: 1 }] } }],
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
    qm.onInteract('Anna')
    expect(inventory.count('herb')).toBe(0)
    expect(qm.getState('gather-coins')).toBe('complete')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe('delivered')
    expect(granted).toEqual([{ kind: 'coin', count: 8 }])
    qm.onInteract('Anna')
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
    expect(qm.onInteract('Piotr')?.line).toBe('remind cave')
    expect(inventory.count('stone')).toBe(0)
    expect(qm.getState('multi-gather')).toBe('active')
    expect(qm.getState('multi-gather')).not.toBe('ready_to_report')
    expect(granted).toEqual([])
  })
})

describe('QuestManager paid quest definitions', () => {
  it('ziola-dla-anny delivers herb ×3 for 8 coins without relation', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const def = QUESTS.find((d) => d.id === 'ziola-dla-anny')!
    const inventory = new Inventory()
    inventory.add('herb', 3)
    const qm = new QuestManager([def], undefined, inventory, undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Anna')
    qm.onInteract('Anna')
    expect(granted).toEqual([{ kind: 'coin', count: 8 }])
    expect(qm.getRelation('Anna')).toBe(0)
    expect(qm.list().find((e) => e.id === 'ziola-dla-anny')?.promisedReward).toBeNull()
  })

  it('kamienie-dla-piotra delivers stone ×6 for 9 coins without relation', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const def = QUESTS.find((d) => d.id === 'kamienie-dla-piotra')!
    const inventory = new Inventory()
    inventory.add('stone', 6)
    const qm = new QuestManager([def], undefined, inventory, undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Piotr')
    qm.onInteract('Piotr')
    expect(granted).toEqual([{ kind: 'coin', count: 9 }])
    expect(qm.getRelation('Piotr')).toBe(0)
  })

  it('sprawdz-szlak pays 12 coins after cave interaction without relation', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const def = QUESTS.find((d) => d.id === 'sprawdz-szlak')!
    const qm = new QuestManager([def], undefined, new Inventory(), undefined, (kind, count) => granted.push({ kind, count }))
    acceptOffer(qm, 'Kasia')
    qm.onInteractObjective({ type: 'interact_spawner', spawnerType: 'cave' })
    qm.onInteract('Kasia')
    expect(granted).toEqual([{ kind: 'coin', count: 12 }])
    expect(qm.getRelation('Kasia')).toBe(0)
  })

  it('lis-przy-osadzie binds a fox, ignores other deaths, and applies social consequence once', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const consequences: SocialConsequence[] = []
    const def: QuestDef = { ...QUESTS.find((d) => d.id === 'lis-przy-osadzie')!, settlementId: 'home' }
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
    qm.onInteract('Marek')
    expect(granted).toEqual([{ kind: 'coin', count: 20 }])
    expect(consequences).toEqual([{ settlementId: 'home', reputation: { competence: 3, courage: 3 }, renown: 3 }])
    expect(qm.getRelation('Marek')).toBe(0)
    qm.onInteract('Marek')
    expect(granted).toHaveLength(1)
    expect(consequences).toHaveLength(1)
  })

  it('does not pay reward again after terminal restore of a completed paid quest', () => {
    const granted: Array<{ kind: string, count: number }> = []
    const def = QUESTS.find((d) => d.id === 'ziola-dla-anny')!
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
