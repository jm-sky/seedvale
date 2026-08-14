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

function makeManager(defs: readonly QuestDef[]): QuestManager {
  return new QuestManager(defs, undefined, new Inventory())
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
