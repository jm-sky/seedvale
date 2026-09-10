import { describe, expect, it } from 'vitest'
import type { AuthoredQuestDef, QuestDef } from './quests'
import { materializeAuthoredQuestDefs } from './materializeAuthoredQuests'
import {
  bindExactCaveQuests,
  buildLandmarkQuests,
  QuestDefinitionValidationError,
  QUESTS,
  validateQuestDefinitions,
} from './quests'

const NAME_AS_ID = (['Anna', 'Piotr', 'Kasia', 'Marek'] as const).map((name) => ({ id: name, name }))

function runtimeAuthored(def: AuthoredQuestDef): QuestDef {
  return materializeAuthoredQuestDefs(
    [{ ...def, settlementId: def.settlementId ?? 'home' }],
    NAME_AS_ID,
  )[0]!
}

function runtimeQuest(
  partial: Omit<QuestDef, 'giver'> & Partial<Pick<QuestDef, 'giver'>>,
): QuestDef {
  return {
    ...partial,
    giver: partial.giver ?? { npcId: partial.giverName },
    settlementId: partial.settlementId ?? 'home',
  }
}

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
    expect(withConsequence.map((q) => q.id).sort()).toEqual([
      'dzik-przy-szlaku',
      'grozny-wilk',
      'lis-przy-osadzie',
      'plaga-szcurow',
      'sporne-drewno',
      'wilcza-jama',
      'wilki-pod-osada',
      'zaginiona-przesylka',
    ])
  })
})

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
    const grozny = runtimeAuthored(QUESTS.find((q) => q.id === 'grozny-wilk')!)
    const den = runtimeAuthored(QUESTS.find((q) => q.id === 'wilcza-jama')!)
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

  it('rejects talk_to_npc_choice with fewer than two choices', () => {
    const bad = runtimeQuest({
      ...baseQuest,
      stages: [{
        objective: { type: 'talk_to_npc_choice', choices: [{ npc: { npcId: 'Anna' }, outcomeId: 'done', playerLine: 'Oddaję to tobie.' }] },
        description: 'choose',
        reminderLine: 'remind',
      }],
    })
    expect(() => validateQuestDefinitions([bad])).toThrow(/at least 2 choices/)
  })

  it('rejects talk_to_npc_choice with duplicate npcName', () => {
    const bad = runtimeQuest({
      ...baseQuest,
      stages: [{
        objective: {
          type: 'talk_to_npc_choice',
          choices: [
            { npc: { npcId: 'Anna' }, outcomeId: 'done', playerLine: 'Oddaję to Annie.' },
            { npc: { npcId: 'Anna' }, outcomeId: 'done', playerLine: 'Oddaję to Annie jeszcze raz.' },
          ],
        },
        description: 'choose',
        reminderLine: 'remind',
      }],
    })
    expect(() => validateQuestDefinitions([bad])).toThrow(/duplicate npcId/)
  })

  it('rejects talk_to_npc_choice that references an unknown outcome', () => {
    const bad = runtimeQuest({
      ...baseQuest,
      stages: [{
        objective: {
          type: 'talk_to_npc_choice',
          choices: [
            { npc: { npcId: 'Anna' }, outcomeId: 'done', playerLine: 'Oddaję to Annie.' },
            { npc: { npcId: 'Piotr' }, outcomeId: 'missing', playerLine: 'Oddaję to Piotrowi.' },
          ],
        },
        description: 'choose',
        reminderLine: 'remind',
      }],
    })
    expect(() => validateQuestDefinitions([bad])).toThrow(/unknown outcome/)
  })

  it('accepts authored RPG quests once settlementId is bound', () => {
    const ids = [
      'zaginiona-przesylka',
      'sporne-drewno',
      'drewno-dla-anny',
      'drewno-dla-piotra',
      'dzik-przy-szlaku',
    ]
    const defs = ids.map((id) => runtimeAuthored(QUESTS.find((q) => q.id === id)!))
    expect(() => validateQuestDefinitions(defs)).not.toThrow()
  })
})

describe('QUESTS authored RPG pack (plan quests-progression-005)', () => {
  it('authors three stories as five definitions with the planned givers and outcomes', () => {
    const lost = QUESTS.find((q) => q.id === 'zaginiona-przesylka')
    const dispute = QUESTS.find((q) => q.id === 'sporne-drewno')
    const forAnna = QUESTS.find((q) => q.id === 'drewno-dla-anny')
    const forPiotr = QUESTS.find((q) => q.id === 'drewno-dla-piotra')
    const boar = QUESTS.find((q) => q.id === 'dzik-przy-szlaku')
    expect(lost?.giverName).toBe('Kasia')
    expect(dispute?.giverName).toBe('Anna')
    expect(forAnna?.giverName).toBe('Anna')
    expect(forPiotr?.giverName).toBe('Piotr')
    expect(boar?.giverName).toBe('Marek')
    expect(lost?.outcomes.map((o) => o.id)).toEqual(['returned_sealed', 'turned_over_to_guard'])
    expect(dispute?.outcomes.map((o) => o.id)).toEqual(['support_anna', 'support_piotr'])
    expect(forAnna?.availability?.prerequisites).toEqual([
      { type: 'quest_outcome', questId: 'sporne-drewno', outcomeIds: ['support_anna'] },
    ])
    expect(forPiotr?.availability?.prerequisites).toEqual([
      { type: 'quest_outcome', questId: 'sporne-drewno', outcomeIds: ['support_piotr'] },
    ])
    expect(boar?.availability?.prerequisites).toEqual([{ type: 'renown', minimum: 10 }])
  })

  it('does not invent a sealed_package item or gather stage for zaginiona-przesylka', () => {
    const lost = QUESTS.find((q) => q.id === 'zaginiona-przesylka')!
    expect(lost.stages.some((stage) => stage.objective.type === 'gather_item')).toBe(false)
    const kinds = lost.outcomes.flatMap((outcome) => outcome.reward?.items?.map((item) => item.kind) ?? [])
    expect(kinds).not.toContain('sealed_package')
  })

  it('gives every authored RPG outcome a resultText rather than relying on the raw id', () => {
    const ids = [
      'zaginiona-przesylka',
      'sporne-drewno',
      'drewno-dla-anny',
      'drewno-dla-piotra',
      'dzik-przy-szlaku',
    ]
    for (const id of ids) {
      const def = QUESTS.find((q) => q.id === id)!
      for (const outcome of def.outcomes) {
        expect(outcome.resultText && outcome.resultText.length).toBeGreaterThan(0)
        expect(outcome.resultText).not.toBe(outcome.id)
      }
    }
  })

  it('keeps dzik-przy-szlaku on a non-dangerous boar and a hidden defense book', () => {
    const boar = QUESTS.find((q) => q.id === 'dzik-przy-szlaku')!
    const kill = boar.stages[1]?.objective
    expect(kill).toEqual({ type: 'kill_target_animal', kind: 'boar' })
    expect(boar.outcomes[0]?.reward).toEqual({
      visibility: 'hidden',
      items: [{ kind: 'book_defense_intermediate', count: 1 }],
    })
  })
})

describe('quest dialogue lines and cave binding (plan quests-progression-014)', () => {
  it('rejects an empty talk_to_npc_choice playerLine', () => {
    const bad = runtimeQuest({
      ...runtimeAuthored(QUESTS.find((q) => q.id === 'relay-anna-piotr')!),
      id: 'choice-empty-line',
      stages: [{
        objective: {
          type: 'talk_to_npc_choice',
          choices: [
            { npc: { npcId: 'Anna' }, outcomeId: 'delivered', playerLine: '   ' },
            { npc: { npcId: 'Piotr' }, outcomeId: 'delivered', playerLine: 'Oddaję to Piotrowi.' },
          ],
        },
        description: 'choose',
        reminderLine: 'remind',
      }],
    })
    expect(() => validateQuestDefinitions([bad])).toThrow(/playerLine/)
  })

  it('rejects an empty reportPlayerLine', () => {
    const bad = runtimeQuest({
      ...runtimeAuthored(QUESTS.find((q) => q.id === 'relay-anna-piotr')!),
      reportPlayerLine: ' ',
    })
    expect(() => validateQuestDefinitions([bad])).toThrow(/reportPlayerLine/)
  })

  it('binds exact cave identity and cheap direction prose onto authored cave quests', () => {
    const bound = bindExactCaveQuests(QUESTS, {
      id: 'home:cave',
      directionPhrase: 'na północny wschód od osady',
    })
    const check = bound.find((q) => q.id === 'sprawdz-szlak')!
    const lost = bound.find((q) => q.id === 'zaginiona-przesylka')!
    const scout = bound.find((q) => q.id === 'zwiadowca')!
    expect(check.stages[0]?.objective).toEqual({
      type: 'interact_spawner',
      spawnerType: 'cave',
      spawnerId: 'home:cave',
    })
    expect(lost.stages[0]?.objective).toEqual({
      type: 'interact_spawner',
      spawnerType: 'cave',
      spawnerId: 'home:cave',
    })
    expect(scout.stages[0]?.objective).toEqual({ type: 'interact_spawner', spawnerType: 'cave' })
    expect(check.offerLine).toContain('na północny wschód od osady')
    expect(check.offerLine).not.toContain('{cavePlace}')
    expect(lost.stages[0]?.reminderLine).toContain('na północny wschód od osady')
  })

  it('uses the neutral cave-place fallback when no direction is available', () => {
    const bound = bindExactCaveQuests(
      QUESTS.filter((q) => q.id === 'sprawdz-szlak'),
      { id: 'home:cave', directionPhrase: null },
    )
    expect(bound[0]?.stages[0]?.reminderLine).toContain('poza osadą')
    expect(bound[0]?.stages[0]?.reminderLine).not.toContain('{cavePlace}')
  })

  it('does not gate wilki-pod-osada on Anna trusted or grozny-wilk', () => {
    const wolves = QUESTS.find((q) => q.id === 'wilki-pod-osada')!
    expect(wolves.availability).toBeUndefined()
  })
})
