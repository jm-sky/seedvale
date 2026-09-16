import { describe, expect, it } from 'vitest'
import type { AuthoredQuestDef, QuestDef, QuestOfferRankSignal } from './quests'
import { materializeAuthoredQuestDefs } from './materializeAuthoredQuests'
import {
  bindDarkForestTreasureQuest,
  bindExactCaveQuests,
  buildDarkForestTreasureQuest,
  buildLandmarkQuests,
  externalResolutionOutcome,
  QuestDefinitionValidationError,
  QUESTS,
  rankQuestOfferCandidates,
  RESOLVED_WITHOUT_PLAYER_OUTCOME,
  uniqueOutcomeForState,
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
  it('still offers slad-przy-monolicie when eager landmark lookup misses', () => {
    const quests = buildLandmarkQuests(() => undefined)
    expect(quests.map((quest) => quest.id)).toEqual(['slad-przy-monolicie'])
    expect(quests[0]?.stages[0]?.objective.type).toBe('receive_world_knowledge')
    expect(quests[0]?.stages[1]?.objective.type).toBe('interact_bound_landmark')
  })

  it('builds immediate landmark quests with concrete ids and defers the monolith research quest', () => {
    const quests = buildLandmarkQuests((kind) => `${kind}:resolved`)
    expect(quests).toHaveLength(5)
    const slad = quests.find((quest) => quest.id === 'slad-przy-monolicie')
    expect(slad?.stages[0]?.objective.type).toBe('receive_world_knowledge')
    expect(slad?.worldKnowledge?.[0]?.bind).toEqual({ type: 'landmark', kind: 'monolith' })
    for (const quest of quests.filter((entry) => entry.id !== 'slad-przy-monolicie')) {
      const objective = quest.stages[0]!.objective
      expect(objective.type).toBe('interact_landmark')
      if (objective.type === 'interact_landmark') {
        expect(objective.landmarkId.endsWith(':resolved')).toBe(true)
      }
    }
  })

  it('does not eagerly resolve monolith for slad-przy-monolicie', () => {
    const requested: string[] = []
    buildLandmarkQuests((kind) => {
      requested.push(kind)
      return `${kind}:id`
    })
    expect(requested.sort()).toEqual(['cemetery', 'shipwreck', 'smallRuins', 'tower'])
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
      spawnerType: 'rockDen',
      spawnerId: 'home:cave',
    })
    expect(lost.stages[0]?.objective).toEqual({
      type: 'interact_spawner',
      spawnerType: 'rockDen',
      spawnerId: 'home:cave',
    })
    expect(scout.stages[0]?.objective).toEqual({ type: 'interact_spawner', spawnerType: 'rockDen' })
    expect(check.offerLine).toContain('na północny wschód od osady')
    expect(check.offerLine).toContain('skalnej grocie')
    expect(check.offerLine).not.toContain('{cavePlace}')
    expect(lost.stages[0]?.reminderLine).toContain('na północny wschód od osady')
    expect(lost.stages[0]?.reminderLine).toContain('Skalna grota')
  })

  it('binds mapa-do-skarbu prose to the concrete map source place', () => {
    const bound = bindDarkForestTreasureQuest(buildDarkForestTreasureQuest(), {
      kind: 'cave',
      directionPhrase: 'na północny zachód od osady',
    })
    expect(bound.offerLine).toContain('w jaskini na północny zachód od osady')
    expect(bound.offerLine).not.toContain('{mapSourcePlace}')
    expect(bound.stages[0]?.description).toContain('w jaskini na północny zachód od osady')
    expect(bound.stages[0]?.reminderLine).toBe('Mapa miała być ukryta w jaskini na północny zachód od osady.')
  })

  it('uses cemetery phrasing when the map source is a cemetery', () => {
    const bound = bindDarkForestTreasureQuest(buildDarkForestTreasureQuest(), {
      kind: 'cemetery',
      directionPhrase: 'na wschód od osady',
    })
    expect(bound.offerLine).toContain('na cmentarzu na wschód od osady')
    expect(bound.stages[0]?.reminderLine).toContain('na cmentarzu na wschód od osady')
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

describe('quest stage dialogue actions (plan quests-progression-018)', () => {
  it('authors Piotr lie/honest replies on zwiadowca stag without replacing spot_animal', () => {
    const scout = QUESTS.find((q) => q.id === 'zwiadowca')!
    expect(scout.stages[1]?.objective).toEqual({ type: 'spot_animal', kind: 'stag', range: 16 })
    expect(scout.stages[1]?.dialogueActions).toEqual([
      {
        npcName: 'Piotr',
        playerLine: 'Tak, widziałem jelenia.',
        npcLine: 'Skoro tak. Zostały kamienie z gór — przynieś dwa.',
        consequences: { social: { reputation: { integrity: -2 } } },
      },
      {
        npcName: 'Piotr',
        playerLine: 'Nie widziałem jelenia.',
        npcLine: 'Trudno. Przynieś przynajmniej dwa kamienie z gór, żebym wiedział, że tam byłeś.',
      },
    ])
    expect(scout.stages[2]?.objective).toEqual({ type: 'gather_item', kind: 'stone', count: 2 })
  })

  it('keeps ziola-dla-anny on gather_item herb ×3', () => {
    const herbs = QUESTS.find((q) => q.id === 'ziola-dla-anny')!
    expect(herbs.stages[0]?.objective).toEqual({ type: 'gather_item', kind: 'herb', count: 3 })
  })

  it('rejects an empty stage dialogue playerLine', () => {
    const bad = runtimeQuest({
      ...runtimeAuthored(QUESTS.find((q) => q.id === 'zwiadowca')!),
      id: 'stage-action-empty-line',
      stages: [{
        objective: { type: 'spot_animal', kind: 'stag', range: 16 },
        description: 'spot',
        reminderLine: 'remind',
        dialogueActions: [{ npc: { npcId: 'Piotr' }, playerLine: '   ' }],
      }],
    })
    expect(() => validateQuestDefinitions([bad])).toThrow(/playerLine/)
  })

  it('rejects an empty stage dialogueActions list', () => {
    const bad = runtimeQuest({
      ...runtimeAuthored(QUESTS.find((q) => q.id === 'relay-anna-piotr')!),
      id: 'stage-action-empty-list',
      stages: [{
        objective: { type: 'spot_animal', kind: 'stag' },
        description: 'spot',
        reminderLine: 'remind',
        dialogueActions: [],
      }],
    })
    expect(() => validateQuestDefinitions([bad])).toThrow(/dialogueActions is empty/)
  })
})

describe('validateQuestDefinitions nonlinear stages (plan quests-progression-032)', () => {
  const base = runtimeQuest({
    ...runtimeAuthored(QUESTS.find((q) => q.id === 'relay-anna-piotr')!),
    id: 'nonlinear',
    outcomes: [
      { id: 'complete', state: 'complete' },
      { id: 'failed', state: 'failed' },
    ],
  })

  function nonlinear(partial: Partial<typeof base> & { stages: typeof base.stages }): QuestDef {
    return runtimeQuest({ ...base, ...partial })
  }

  it('accepts a valid any-stage with forward transitions', () => {
    expect(() => validateQuestDefinitions([nonlinear({
      stages: [
        {
          objective: { type: 'interact_well' },
          objectives: [
            { id: 'well', objective: { type: 'interact_well' }, resultId: 'well' },
            { id: 'tree', objective: { type: 'interact_tree' }, resultId: 'tree' },
          ],
          mode: 'any',
          transitions: [
            { resultId: 'well', toStageId: 'after-well' },
            { resultId: 'tree', toOutcomeId: 'failed' },
          ],
          description: 'choose',
          reminderLine: 'r',
        },
        {
          id: 'after-well',
          objective: { type: 'interact_tree' },
          description: 'next',
          reminderLine: 'r',
        },
      ],
    })])).not.toThrow()
  })

  it('rejects duplicate objective slot ids', () => {
    expect(() => validateQuestDefinitions([nonlinear({
      stages: [{
        objective: { type: 'interact_well' },
        objectives: [
          { id: 'well', objective: { type: 'interact_well' } },
          { id: 'well', objective: { type: 'interact_tree' } },
        ],
        mode: 'all',
        description: 'd',
        reminderLine: 'r',
      }],
    })])).toThrow(/duplicate objective slot id/)
  })

  it('rejects a multi-objective stage without mode', () => {
    expect(() => validateQuestDefinitions([nonlinear({
      stages: [{
        objective: { type: 'interact_well' },
        objectives: [
          { id: 'well', objective: { type: 'interact_well' } },
          { id: 'tree', objective: { type: 'interact_tree' } },
        ],
        description: 'd',
        reminderLine: 'r',
      }],
    })])).toThrow(/requires mode/)
  })

  it('rejects an unknown transition stage target', () => {
    expect(() => validateQuestDefinitions([nonlinear({
      stages: [{
        objective: { type: 'interact_well' },
        transitions: [{ toStageId: 'missing' }],
        description: 'd',
        reminderLine: 'r',
      }],
    })])).toThrow(/unknown stage/)
  })

  it('rejects an unknown transition outcome', () => {
    expect(() => validateQuestDefinitions([nonlinear({
      stages: [{
        objective: { type: 'interact_well' },
        transitions: [{ toOutcomeId: 'nope' }],
        description: 'd',
        reminderLine: 'r',
      }],
    })])).toThrow(/unknown outcome/)
  })

  it('rejects backward and self stage transitions', () => {
    expect(() => validateQuestDefinitions([nonlinear({
      stages: [
        {
          id: 'first',
          objective: { type: 'interact_well' },
          description: 'd',
          reminderLine: 'r',
        },
        {
          id: 'second',
          objective: { type: 'interact_tree' },
          transitions: [{ toStageId: 'first' }],
          description: 'd',
          reminderLine: 'r',
        },
      ],
    })])).toThrow(/not forward-only/)

    expect(() => validateQuestDefinitions([nonlinear({
      stages: [{
        id: 'only',
        objective: { type: 'interact_well' },
        transitions: [{ toStageId: 'only' }],
        description: 'd',
        reminderLine: 'r',
      }],
    })])).toThrow(/not forward-only/)
  })
})

describe('validateQuestDefinitions deferred world knowledge (plan quests-progression-047)', () => {
  const knowledgeQuest = (patch: Partial<QuestDef>): QuestDef => runtimeQuest({
    id: 'research',
    title: 'Research',
    description: 'desc',
    giverName: 'Anna',
    offerLine: 'offer',
    worldKnowledge: [{
      id: 'target',
      revealDelayDays: 1 / 24,
      bind: { type: 'landmark', kind: 'monolith' },
      pendingPhrase: 'pending',
      unavailablePhrase: 'gone',
      unavailablePolicy: 'fail',
      unavailableOutcomeId: 'lost',
    }],
    acceptEffects: [{ type: 'request_world_knowledge', knowledgeId: 'target' }],
    stages: [
      {
        objective: { type: 'receive_world_knowledge', knowledgeId: 'target', npc: { npcId: 'Anna' } },
        description: 'wait',
        reminderLine: 'pending',
        playerLine: 'ready?',
      },
      {
        objective: { type: 'interact_bound_landmark', knowledgeId: 'target' },
        description: 'go',
        reminderLine: 'go?',
      },
    ],
    reportLine: 'done',
    outcomes: [
      { id: 'done', state: 'complete' },
      { id: 'lost', state: 'failed' },
    ],
    ...patch,
  })

  it('accepts a well-formed research quest', () => {
    expect(() => validateQuestDefinitions([knowledgeQuest({})])).not.toThrow()
  })

  it('rejects duplicate knowledge ids', () => {
    const slot = knowledgeQuest({}).worldKnowledge![0]!
    expect(() => validateQuestDefinitions([knowledgeQuest({
      worldKnowledge: [slot, { ...slot }],
    })])).toThrow(/duplicate world-knowledge/)
  })

  it('rejects a negative research delay', () => {
    const slot = knowledgeQuest({}).worldKnowledge![0]!
    expect(() => validateQuestDefinitions([knowledgeQuest({
      worldKnowledge: [{ ...slot, revealDelayDays: -1 }],
    })])).toThrow(/revealDelayDays/)
  })

  it('rejects a bound-landmark objective without a receive stage', () => {
    expect(() => validateQuestDefinitions([knowledgeQuest({
      stages: [{
        objective: { type: 'interact_bound_landmark', knowledgeId: 'target' },
        description: 'go',
        reminderLine: 'go?',
      }],
    })])).toThrow(/no receive_world_knowledge/)
  })

  it('rejects an unknown knowledge id on request_world_knowledge', () => {
    expect(() => validateQuestDefinitions([knowledgeQuest({
      acceptEffects: [{ type: 'request_world_knowledge', knowledgeId: 'missing' }],
    })])).toThrow(/unknown knowledge/)
  })
})

describe('rankQuestOfferCandidates (plan quests-progression-033)', () => {
  function candidate(
    id: string,
    overrides: Partial<Omit<QuestOfferRankSignal, 'def'>> = {},
  ): QuestOfferRankSignal {
    return {
      def: { id } as QuestDef,
      urgency: 'normal',
      isStoryContinuation: false,
      relation: 0,
      priority: 0,
      ...overrides,
    }
  }

  it('ranks urgent above normal regardless of other signals', () => {
    const normal = candidate('normal', { priority: 100 })
    const urgent = candidate('urgent', { urgency: 'urgent', priority: -100 })
    expect(rankQuestOfferCandidates([normal, urgent]).map((d) => d.id)).toEqual(['urgent', 'normal'])
  })

  it('ranks a story continuation above a fresh candidate of equal urgency', () => {
    const fresh = candidate('fresh')
    const continuation = candidate('continuation', { isStoryContinuation: true })
    expect(rankQuestOfferCandidates([fresh, continuation]).map((d) => d.id)).toEqual(['continuation', 'fresh'])
  })

  it('breaks a relation tie by authored priority, then by a stable id tie-break', () => {
    const low = candidate('low-priority', { priority: 1 })
    const high = candidate('high-priority', { priority: 5 })
    expect(rankQuestOfferCandidates([low, high]).map((d) => d.id)).toEqual(['high-priority', 'low-priority'])

    const b = candidate('b')
    const a = candidate('a')
    expect(rankQuestOfferCandidates([b, a]).map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('is deterministic — never reorders equal candidates randomly across repeated calls', () => {
    const candidates = [candidate('x'), candidate('y'), candidate('z')]
    const first = rankQuestOfferCandidates(candidates).map((d) => d.id)
    const second = rankQuestOfferCandidates(candidates).map((d) => d.id)
    expect(first).toEqual(second)
    expect(first).toEqual(['x', 'y', 'z'])
  })
})

describe('externalResolutionOutcome (plan quests-progression-030)', () => {
  it('prefers resolved_without_player over a unique-failed guess when both exist', () => {
    const def = runtimeQuest({
      id: 'wolf',
      title: 'wolf',
      description: 'wolf',
      giverName: 'Anna',
      offerLine: 'offer',
      reportLine: 'report',
      stages: [{ objective: { type: 'interact_well' }, description: 'well', reminderLine: 'r' }],
      outcomes: [
        { id: RESOLVED_WITHOUT_PLAYER_OUTCOME, state: 'failed', resultText: 'gone' },
        { id: 'other_failed', state: 'failed', resultText: 'other' },
      ],
    })
    expect(uniqueOutcomeForState(def, 'failed')).toBeUndefined()
    expect(externalResolutionOutcome(def)?.id).toBe(RESOLVED_WITHOUT_PLAYER_OUTCOME)
  })

  it('falls back to the unique failed outcome when the named id is absent', () => {
    const def = runtimeQuest({
      id: 'simple-fail',
      title: 'simple',
      description: 'simple',
      giverName: 'Anna',
      offerLine: 'offer',
      reportLine: 'report',
      stages: [{ objective: { type: 'interact_well' }, description: 'well', reminderLine: 'r' }],
      outcomes: [{ id: 'only_failed', state: 'failed', resultText: 'gone' }],
    })
    expect(externalResolutionOutcome(def)?.id).toBe('only_failed')
  })
})
