import { describe, expect, it } from 'vitest'
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
