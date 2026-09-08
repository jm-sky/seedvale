import { describe, expect, it } from 'vitest'
import type { QuestDef } from './quests'
import {
  buildLandmarkQuests,
  QuestDefinitionValidationError,
  QUESTS,
  validateQuestDefinitions,
} from './quests'

describe('buildLandmarkQuests', () => {
  it('omits a landmark kind the resolver has no candidate for', () => {
    const quests = buildLandmarkQuests(() => undefined)
    expect(quests).toHaveLength(0)
  })

  it('builds one quest per resolved kind, binding its stage to the resolved landmarkId', () => {
    const quests = buildLandmarkQuests((kind) => `${kind}:resolved`)
    expect(quests).toHaveLength(3)
    for (const quest of quests) {
      const objective = quest.stages[0]!.objective
      expect(objective.type).toBe('interact_landmark')
      if (objective.type === 'interact_landmark') {
        expect(objective.landmarkId.endsWith(':resolved')).toBe(true)
      }
    }
  })

  it('resolves each expected landmark kind exactly once', () => {
    const requested: string[] = []
    buildLandmarkQuests((kind) => {
      requested.push(kind)
      return `${kind}:id`
    })
    expect(requested.sort()).toEqual(['cemetery', 'monolith', 'smallRuins'])
  })

  it('produces quest ids that are stable and distinct', () => {
    const quests = buildLandmarkQuests((kind) => `${kind}:id`)
    const ids = quests.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(quests.every((q) => Boolean(q.giverName))).toBe(true)
  })
})

describe('QUESTS rewards (plan quests-progression-002)', () => {
  it('grants the rarest high-quality swords from existing world-problem quests', () => {
    const wolf = QUESTS.find((q) => q.id === 'grozny-wilk')
    const den = QUESTS.find((q) => q.id === 'wilcza-jama')
    const well = QUESTS.find((q) => q.id === 'woda-dla-marka')
    expect(wolf?.outcomes[0]?.reward).toEqual({ visibility: 'shown', items: [{ kind: 'damascus_long_sword', count: 1 }] })
    expect(den?.outcomes[0]?.reward).toEqual({ visibility: 'shown', items: [{ kind: 'obsidian_sword', count: 1 }] })
    expect(well?.outcomes[0]?.reward).toEqual({ visibility: 'shown', items: [{ kind: 'coin', count: 5 }] })
  })

  it('requires identity and at least one outcome on every authored quest', () => {
    for (const quest of [...QUESTS, ...buildLandmarkQuests((kind) => `${kind}:id`)]) {
      expect(quest.title.length).toBeGreaterThan(0)
      expect(quest.description.length).toBeGreaterThan(0)
      expect(quest.outcomes.length).toBeGreaterThan(0)
      const ids = quest.outcomes.map((o) => o.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('QUESTS social consequence calibration (plan quests-progression-001 §6)', () => {
  it('grozny-wilk matches its authored magnitude calibration exactly', () => {
    const wolf = QUESTS.find((q) => q.id === 'grozny-wilk')
    expect(wolf?.outcomes[0]?.consequences?.social).toEqual({
      reputation: { competence: 10, courage: 12, benevolence: 4 },
      renown: 15,
    })
  })

  it('wilcza-jama matches its authored magnitude calibration exactly', () => {
    const den = QUESTS.find((q) => q.id === 'wilcza-jama')
    expect(den?.outcomes[0]?.consequences?.social).toEqual({
      reputation: { competence: 15, courage: 18, benevolence: 6 },
      renown: 25,
    })
  })

  it('neither wolf quest changes trust or integrity', () => {
    const wolf = QUESTS.find((q) => q.id === 'grozny-wilk')
    const den = QUESTS.find((q) => q.id === 'wilcza-jama')
    expect(wolf?.outcomes[0]?.consequences?.social?.reputation?.trust).toBeUndefined()
    expect(wolf?.outcomes[0]?.consequences?.social?.reputation?.integrity).toBeUndefined()
    expect(den?.outcomes[0]?.consequences?.social?.reputation?.trust).toBeUndefined()
    expect(den?.outcomes[0]?.consequences?.social?.reputation?.integrity).toBeUndefined()
  })

  it('no quest authors social consequence without a defined magnitude source (no accidental defaults)', () => {
    const withConsequence = QUESTS.filter((q) => q.outcomes.some((o) => o.consequences?.social))
    expect(withConsequence.map((q) => q.id).sort()).toEqual(['grozny-wilk', 'lis-przy-osadzie', 'wilcza-jama'])
  })
})

function runtimeQuest(partial: QuestDef): QuestDef {
  return { ...partial, settlementId: partial.settlementId ?? 'home' }
}

describe('validateQuestDefinitions (plan quests-progression-004)', () => {
  const baseQuest = runtimeQuest({
    id: 'base',
    title: 'Base',
    description: 'desc',
    giverName: 'Anna',
    offerLine: 'offer',
    stages: [{ objective: { type: 'interact_well' }, description: 'well', reminderLine: 'remind' }],
    reportLine: 'done',
    outcomes: [{ id: 'done', state: 'complete' }],
  })

  const prereqQuest = runtimeQuest({
    id: 'follow-up',
    title: 'Follow up',
    description: 'desc',
    giverName: 'Anna',
    offerLine: 'offer',
    stages: [{ objective: { type: 'interact_tree' }, description: 'tree', reminderLine: 'remind' }],
    reportLine: 'done',
    outcomes: [{ id: 'done', state: 'complete' }],
    availability: {
      prerequisites: [{ type: 'quest_outcome', questId: 'base', outcomeIds: ['done'] }],
    },
  })

  it('accepts authored wolf-chain prerequisites once settlementId is bound', () => {
    const grozny = runtimeQuest({ ...QUESTS.find((q) => q.id === 'grozny-wilk')! })
    const den = runtimeQuest({ ...QUESTS.find((q) => q.id === 'wilcza-jama')! })
    expect(() => validateQuestDefinitions([grozny, den])).not.toThrow()
  })

  it('rejects unknown quest references', () => {
    const bad = runtimeQuest({
      ...prereqQuest,
      availability: { prerequisites: [{ type: 'quest_outcome', questId: 'missing', outcomeIds: ['done'] }] },
    })
    expect(() => validateQuestDefinitions([baseQuest, bad])).toThrow(QuestDefinitionValidationError)
  })

  it('rejects empty outcomeIds', () => {
    const bad = runtimeQuest({
      ...prereqQuest,
      availability: { prerequisites: [{ type: 'quest_outcome', questId: 'base', outcomeIds: [] }] },
    })
    expect(() => validateQuestDefinitions([baseQuest, bad])).toThrow(/empty quest_outcome/)
  })

  it('rejects unknown outcome ids on the referenced quest', () => {
    const bad = runtimeQuest({
      ...prereqQuest,
      availability: { prerequisites: [{ type: 'quest_outcome', questId: 'base', outcomeIds: ['nope'] }] },
    })
    expect(() => validateQuestDefinitions([baseQuest, bad])).toThrow(/unknown outcome/)
  })

  it('rejects direct self-dependency', () => {
    const bad = runtimeQuest({
      ...baseQuest,
      availability: { prerequisites: [{ type: 'quest_outcome', questId: 'base', outcomeIds: ['done'] }] },
    })
    expect(() => validateQuestDefinitions([bad])).toThrow(/own outcome/)
  })

  it('rejects social prerequisites without settlementId', () => {
    const bad: QuestDef = {
      ...baseQuest,
      settlementId: undefined,
      availability: { prerequisites: [{ type: 'renown', minimum: 5 }] },
    }
    expect(() => validateQuestDefinitions([bad])).toThrow(/no settlementId/)
  })

  it('rejects out-of-range reputation and renown thresholds', () => {
    const badReputation = runtimeQuest({
      ...baseQuest,
      availability: { prerequisites: [{ type: 'reputation', dimension: 'trust', minimum: 101 }] },
    })
    const badRenown = runtimeQuest({
      ...baseQuest,
      availability: { prerequisites: [{ type: 'renown', minimum: -1 }] },
    })
    expect(() => validateQuestDefinitions([badReputation])).toThrow(/reputation minimum/)
    expect(() => validateQuestDefinitions([badRenown])).toThrow(/renown minimum/)
  })
})
