import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import type { CaveContentAnchor } from '../world/caves/caveContentAnchors'
import type { SettlementOpportunityNpc } from './opportunities/settlementNpcMaterialization'
import { Inventory } from '../items/Inventory'
import { CaveAuthoredAnchorClaims } from '../world/caves/caveAuthoredAnchorClaims'
import { createWorldGeneratedContainers } from '../world/worldGeneratedContainers'
import {
  buildLostHunterNaturalCaveQuest,
  createLostHunterBowInstance,
  isLostHunterPackLooted,
  LOST_HUNTER_KEEP_BOW_OUTCOME,
  LOST_HUNTER_RETURN_BOW_OUTCOME,
  lostHunterBowInstanceId,
  lostHunterPackContainerId,
  resolveLostHunterNaturalCaveBinding,
  selectLostHunterNpcs,
} from './lostHunterNaturalCave'
import { QuestManager } from './QuestManager'
import { validateQuestDefinitions } from './quests'

function npc(
  id: string,
  role: SettlementOpportunityNpc['role'],
  child: boolean,
  householdId: string,
): SettlementOpportunityNpc {
  return {
    id,
    name: id,
    role,
    child,
    householdId,
    familyIndex: Number(householdId.slice(1)),
  }
}

describe('lost hunter natural cave (plan quests-progression-023)', () => {
  const anchors: CaveContentAnchor[] = [
    {
      id: 'cave-a:storyFind:chamber',
      caveId: 'cave-a',
      role: 'storyFind',
      x: 1,
      y: 2,
      z: 3,
      yaw: 0,
    },
    {
      id: 'cave-a:loot:chamber',
      caveId: 'cave-a',
      role: 'loot',
      x: 4,
      y: 5,
      z: 6,
      yaw: 0,
    },
    {
      id: 'cave-b:storyFind:chamber',
      caveId: 'cave-b',
      role: 'storyFind',
      x: 1,
      y: 2,
      z: 3,
      yaw: 0,
    },
    {
      id: 'cave-b:loot:chamber',
      caveId: 'cave-b',
      role: 'loot',
      x: 4,
      y: 5,
      z: 6,
      yaw: 0,
    },
  ]

  it('selects giver and witness with hunter → woodcutter → adult fallback', () => {
    const npcs = [
      npc('s:npc:0', 'farmer', false, 'f0'),
      npc('s:npc:1', 'hunter', false, 'f1'),
      npc('s:npc:2', 'woodcutter', false, 'f2'),
      npc('s:npc:3', 'farmer', true, 'f0'),
    ]
    const pick = selectLostHunterNpcs(npcs, 's', 42)
    expect(pick?.giver.child).toBe(false)
    expect(pick?.witness.child).toBe(false)
    expect(pick?.witness.id).toBe('s:npc:1')
    expect(pick?.giver.id).not.toBe(pick?.witness.id)
  })

  it('binds deterministically and skips claimed natural cave anchors', () => {
    const claims = new CaveAuthoredAnchorClaims()
    claims.tryClaimNaturalStoryPair('cave-a:storyFind:chamber', 'cave-a:loot:chamber')
    const npcs = [
      npc('home:npc:0', 'farmer', false, 'f0'),
      npc('home:npc:1', 'farmer', false, 'f0'),
      npc('home:npc:2', 'hunter', false, 'f1'),
    ]
    const input = {
      worldSeed: 99,
      settlementDef: { id: 'home', families: [{ id: 'f0', members: [] }, { id: 'f1', members: [] }] },
      caveIds: ['cave-a', 'cave-b'],
      archetypeOf: (caveId: string) => (caveId === 'cave-a' || caveId === 'cave-b' ? 'natural' : 'adventure'),
      contentAnchors: anchors,
      claims,
      npcs,
    }
    const first = resolveLostHunterNaturalCaveBinding(input)
    const replayClaims = new CaveAuthoredAnchorClaims()
    replayClaims.tryClaimNaturalStoryPair('cave-a:storyFind:chamber', 'cave-a:loot:chamber')
    const second = resolveLostHunterNaturalCaveBinding({ ...input, claims: replayClaims })
    expect(first?.caveId).toBe('cave-b')
    expect(second).toEqual(first)
    expect(first?.bowInstanceId).toBe(lostHunterBowInstanceId('cave-b'))
    expect(first?.packContainerId).toBe(lostHunterPackContainerId('cave-b:loot:chamber'))
  })

  it('witness stage carries reveal_location effect', () => {
    const binding = resolveLostHunterNaturalCaveBinding({
      worldSeed: 1,
      settlementDef: { id: 'home', families: [{ id: 'f0', members: [] }, { id: 'f1', members: [] }] },
      caveIds: ['cave-a'],
      archetypeOf: () => 'natural',
      contentAnchors: anchors,
      claims: new CaveAuthoredAnchorClaims(),
      npcs: [
        npc('home:npc:0', 'farmer', false, 'f0'),
        npc('home:npc:1', 'farmer', false, 'f0'),
        npc('home:npc:2', 'hunter', false, 'f1'),
      ],
    })
    expect(binding).not.toBeNull()
    const quest = buildLostHunterNaturalCaveQuest(binding!, [
      npc('home:npc:0', 'farmer', false, 'f0'),
      npc('home:npc:1', 'farmer', false, 'f0'),
      npc('home:npc:2', 'hunter', false, 'f1'),
    ], 'Osada', 'mała jaskinia na północ od osady')
    expect(quest.stages[0]?.effects).toEqual([{
      type: 'reveal_location',
      locationId: 'cave:cave-a',
      setNavigation: true,
    }])
    expect(quest.stages[0]?.progressLine).toContain('mała jaskinia na północ od osady')
    expect(quest.stages[0]?.progressLine).not.toMatch(/konkretn|dokładny loch|natural cave|adventure cave/)
    expect(quest.stages[3]?.dialogueActions?.[1]?.requireItemInstanceId).toBe(binding!.bowInstanceId)
    expect(quest.outcomes.find((outcome) => outcome.id === 'return_bow_to_family')?.effects).toEqual([{
      type: 'transfer_item_instance',
      instanceId: binding!.bowInstanceId,
      toNpc: { npcId: binding!.giverNpcId },
    }])
  })

  it('does not let authored player lines claim a confirmed death (plan quests-progression-051)', () => {
    const binding = resolveLostHunterNaturalCaveBinding({
      worldSeed: 1,
      settlementDef: { id: 'home', families: [{ id: 'f0', members: [] }, { id: 'f1', members: [] }] },
      caveIds: ['cave-a'],
      archetypeOf: () => 'natural',
      contentAnchors: anchors,
      claims: new CaveAuthoredAnchorClaims(),
      npcs: [
        npc('home:npc:0', 'farmer', false, 'f0'),
        npc('home:npc:1', 'farmer', false, 'f0'),
        npc('home:npc:2', 'hunter', false, 'f1'),
      ],
    })
    expect(binding).not.toBeNull()
    const quest = buildLostHunterNaturalCaveQuest(binding!, [
      npc('home:npc:0', 'farmer', false, 'f0'),
      npc('home:npc:1', 'farmer', false, 'f0'),
      npc('home:npc:2', 'hunter', false, 'f1'),
    ], 'Osada', 'mała jaskinia na północ od osady')
    const playerLines = [
      quest.offerLine,
      ...quest.stages.flatMap((stage) => [
        stage.playerLine,
        ...(stage.dialogueActions?.map((action) => action.playerLine) ?? []),
      ]),
      quest.reportPlayerLine,
    ].filter((line): line is string => Boolean(line))
    for (const line of playerLines) {
      expect(line).not.toMatch(/martw|ciało|zginął|umarł/i)
    }
  })

  it('uses initialInstances only for a fresh world container', () => {
    const bow = createLostHunterBowInstance('cave-a')
    const scene = new Scene()
    const containers = createWorldGeneratedContainers(scene, () => 0, [{
      id: 'pack-test',
      kind: 'chest',
      x: 0,
      z: 0,
      yaw: 0,
      initialCounts: { coin: 1 },
      initialInstances: [bow],
      y: 1,
      spatialContext: { kind: 'cave', caveId: 'cave-a' },
    }])
    expect(containers.containerInstances('pack-test', 'hunting_bow')).toEqual([bow])
    const looted = createWorldGeneratedContainers(scene, () => 0, [{
      id: 'pack-test',
      kind: 'chest',
      x: 0,
      z: 0,
      yaw: 0,
      initialCounts: { coin: 1 },
      initialInstances: [bow],
      y: 1,
      spatialContext: { kind: 'cave', caveId: 'cave-a' },
    }], [{
      id: 'pack-test',
      x: 0,
      z: 0,
      yaw: 0,
      counts: { coin: 1 },
      instances: [],
    }])
    expect(looted.containerInstances('pack-test', 'hunting_bow')).toEqual([])
    containers.dispose()
    looted.dispose()
  })

  it('tracks pack loot by distinctive bow instance id', () => {
    const bowId = lostHunterBowInstanceId('cave-a')
    const bow = createLostHunterBowInstance('cave-a')
    expect(isLostHunterPackLooted([bow], bowId)).toBe(false)
    expect(isLostHunterPackLooted([], bowId)).toBe(true)
    const other = { id: 'quest:lost-hunter:other:bow', kind: 'hunting_bow' as const }
    expect(isLostHunterPackLooted([other], bowId)).toBe(true)
  })

  it('persists identity-only bow instances through inventory serialization', () => {
    const bow = createLostHunterBowInstance('cave-a')
    const inv = new Inventory({}, 100, [bow])
    const json = inv.instancesToJSON()
    const restored = Inventory.instancesFromJSON(json)
    expect(restored).toEqual([bow])
  })
})

describe('lost hunter socially consequential dialogue (plan quests-progression-052)', () => {
  const binding = {
    questId: 'world:lost-hunter:home:cave-a',
    settlementId: 'home',
    giverNpcId: 's:npc:0',
    witnessNpcId: 's:npc:1',
    caveId: 'cave-a',
    caveLocationId: 'cave:cave-a',
    storyAnchorId: 'cave-a:storyFind:chamber',
    lootAnchorId: 'cave-a:loot:chamber',
    packContainerId: lostHunterPackContainerId('cave-a:loot:chamber'),
    bowInstanceId: lostHunterBowInstanceId('cave-a'),
  }
  const npcs = [
    npc('s:npc:0', 'farmer', false, 'f0'),
    npc('s:npc:1', 'hunter', false, 'f1'),
  ]

  function build() {
    return buildLostHunterNaturalCaveQuest(binding, npcs, 'Osada', 'jaskinia na północ')
  }

  function terminalManager(relations: Record<string, number>) {
    const def = build()
    const inventory = new Inventory({}, Infinity, [createLostHunterBowInstance(binding.caveId)])
    const qm = new QuestManager(
      [def],
      undefined,
      inventory,
      { progress: [{ id: def.id, state: 'active', stageIndex: 3 }], relations },
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
    )
    return { def, qm }
  }

  it('keeps return/keep outcomes, bow instance gate and does not claim confirmed death', () => {
    const def = build()
    expect(() => validateQuestDefinitions([def])).not.toThrow()
    const copy = JSON.stringify(def)
    expect(copy).not.toMatch(/martw/i)
    expect(copy).not.toContain('znalazłem go martwego')
    const actions = def.stages[3]?.dialogueActions ?? []
    expect(actions.map((action) => action.physicalOutcomeId)).toEqual([
      LOST_HUNTER_RETURN_BOW_OUTCOME,
      LOST_HUNTER_KEEP_BOW_OUTCOME,
    ])
    expect(actions.every((action) => action.requireItemInstanceId === binding.bowInstanceId)).toBe(true)
    expect(def.outcomes.find((outcome) => outcome.id === LOST_HUNTER_RETURN_BOW_OUTCOME)?.consequences)
      .toEqual({
        relations: [{ npc: { npcId: binding.giverNpcId }, delta: 3 }],
        social: { reputation: { trust: 5, benevolence: 6, integrity: 3 }, renown: 4 },
      })
  })

  it('selects bow-hand-in replies from live giver relation without extra return reward', () => {
    const returnLow = terminalManager({})
    expect(returnLow.qm.onInteract(binding.giverNpcId)?.actions?.[0]?.onSelect())
      .toBe('Dziękuję. Chociaż tyle wróciło do domu.')
    expect(returnLow.qm.getRelation(binding.giverNpcId)).toBe(3)

    const returnWarm = terminalManager({ [binding.giverNpcId]: 3 })
    expect(returnWarm.qm.onInteract(binding.giverNpcId)?.actions?.[0]?.onSelect())
      .toBe('Wiedziałem, że jeśli go znajdziesz, nie zostawisz go gdzieś po drodze.')
    expect(returnWarm.qm.getRelation(binding.giverNpcId)).toBe(6)

    const keepLow = terminalManager({})
    expect(keepLow.qm.onInteract(binding.giverNpcId)?.actions?.[1]?.onSelect())
      .toBe('Nie będę się z tobą o niego szarpać. Ale liczyłem, że go oddasz.')
    expect(keepLow.qm.getRelation(binding.giverNpcId)).toBe(1)

    const keepTrusted = terminalManager({ [binding.giverNpcId]: 6 })
    expect(keepTrusted.qm.onInteract(binding.giverNpcId)?.actions?.[1]?.onSelect())
      .toBe('Prosiłem cię o wieści, nie o to, żebyś zabrał jego rzeczy.')
    expect(keepTrusted.qm.getRelation(binding.giverNpcId)).toBe(6)
    expect(keepTrusted.qm.exportProgress()[0]?.resolvedOutcomeId).toBe(LOST_HUNTER_KEEP_BOW_OUTCOME)
  })
})
