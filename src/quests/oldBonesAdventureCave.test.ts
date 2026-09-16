import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import type { CaveContentAnchor } from '../world/caves/caveContentAnchors'
import type { SettlementOpportunityNpc } from './opportunities/settlementNpcMaterialization'
import { caveTreasureContainerSpecs } from '../app/worldBundle'
import { Inventory } from '../items/Inventory'
import { settlementNpcId } from '../settlement/npcIdentity'
import { resolveCaveAdventureContentPolicy } from '../world/caves/caveAdventureContentPolicy'
import { createWorldGeneratedContainers } from '../world/worldGeneratedContainers'
import { QuestManager } from './QuestManager'
import { validateQuestDefinitions } from './quests'
import {
  buildOldBonesAdventureCaveQuest,
  createOldBonesSignetInstance,
  eligibleOldBonesAdventureAnchors,
  isOldBonesRemainsLooted,
  OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME,
  OLD_BONES_KEEP_SIGNET_OUTCOME,
  OLD_BONES_RESERVATION_KEY,
  OLD_BONES_RETURN_TO_FIRST_CLAIMANT_OUTCOME,
  oldBonesCaveReservationRequests,
  oldBonesRemainsContainerId,
  oldBonesRemainsContainerSpec,
  oldBonesSignetInstanceId,
  resolveOldBonesAdventureCaveBinding,
  selectOldBonesNpcs,
} from './oldBonesAdventureCave'

function npc(
  id: string,
  role: SettlementOpportunityNpc['role'],
  child: boolean,
  householdId: string,
  familyIndex: number,
): SettlementOpportunityNpc {
  return {
    id,
    name: id,
    role,
    child,
    householdId,
    familyIndex,
  }
}

function adventureAnchor(
  caveId: string,
  role: 'sideTreasure' | 'finalTreasure',
  offset = 0,
): CaveContentAnchor {
  return {
    id: `${caveId}:${role}`,
    caveId,
    role,
    x: 10 + offset,
    y: -4 + offset,
    z: 20 + offset,
    yaw: 0.5,
  }
}

describe('old bones adventure cave (plan quests-progression-025)', () => {
  const anchors: CaveContentAnchor[] = [
    adventureAnchor('cave-a', 'sideTreasure', 0),
    adventureAnchor('cave-a', 'finalTreasure', 1),
    adventureAnchor('cave-b', 'finalTreasure', 2),
    adventureAnchor('cave-c', 'sideTreasure', 3),
  ]

  it('selects a two-adult family for claimants and a separate hunter giver', () => {
    const npcs = [
      npc('s:npc:0', 'farmer', false, 'f0', 0),
      npc('s:npc:1', 'farmer', false, 'f0', 0),
      npc('s:npc:2', 'hunter', false, 'f1', 1),
      npc('s:npc:3', 'farmer', true, 'f0', 0),
    ]
    const pick = selectOldBonesNpcs(npcs)
    expect(pick?.claimantA.id).toBe('s:npc:0')
    expect(pick?.claimantB?.id).toBe('s:npc:1')
    expect(pick?.giver.id).toBe('s:npc:2')
  })

  it('omits claimant B when the preferred family has only one adult', () => {
    const npcs = [
      npc('s:npc:0', 'farmer', false, 'f0', 0),
      npc('s:npc:1', 'farmer', true, 'f0', 0),
      npc('s:npc:2', 'woodcutter', false, 'f1', 1),
    ]
    const pick = selectOldBonesNpcs(npcs)
    expect(pick?.claimantA.id).toBe('s:npc:0')
    expect(pick?.claimantB).toBeUndefined()
    expect(pick?.giver.id).toBe('s:npc:2')
  })

  it('keeps settlementNpcId flattened order for selected adults', () => {
    const settlementId = 'home'
    const npcs = [
      npc(settlementNpcId(settlementId, 0), 'farmer', false, 'f0', 0),
      npc(settlementNpcId(settlementId, 1), 'farmer', false, 'f0', 0),
      npc(settlementNpcId(settlementId, 2), 'hunter', false, 'f1', 1),
    ]
    const pick = selectOldBonesNpcs(npcs)
    expect(pick?.claimantA.id).toBe(`${settlementId}:npc:0`)
    expect(pick?.claimantB?.id).toBe(`${settlementId}:npc:1`)
    expect(pick?.giver.id).toBe(`${settlementId}:npc:2`)
  })

  it('prefers sideTreasure and skips reserved adventure caves', () => {
    const eligible = eligibleOldBonesAdventureAnchors(
      ['cave-a', 'cave-b', 'cave-c'],
      anchors,
      new Set(['cave-a']),
    )
    expect(eligible.map((entry) => entry.anchor.id)).toEqual([
      'cave-b:finalTreasure',
      'cave-c:sideTreasure',
    ])
  })

  it('binds deterministically with EMPTY reservation and matching claim', () => {
    const npcs = [
      npc('home:npc:0', 'farmer', false, 'f0', 0),
      npc('home:npc:1', 'farmer', false, 'f0', 0),
      npc('home:npc:2', 'hunter', false, 'f1', 1),
    ]
    const input = {
      worldSeed: 42,
      settlementDef: { id: 'home', families: [{ id: 'f0', members: [] }, { id: 'f1', members: [] }] },
      adventureCaveIds: ['cave-a', 'cave-b', 'cave-c'],
      contentAnchors: anchors,
      npcs,
      reservedCaveIds: new Set(['cave-a']),
    }
    const first = resolveOldBonesAdventureCaveBinding(input)
    const second = resolveOldBonesAdventureCaveBinding(input)
    expect(first).not.toBeNull()
    expect(second).toEqual(first)
    expect(first?.caveId).not.toBe('cave-a')
    expect(first?.signetInstanceId).toBe(oldBonesSignetInstanceId(first!.caveId))
    expect(first?.containerId).toBe(oldBonesRemainsContainerId(first!.anchorId))

    const policy = resolveCaveAdventureContentPolicy(
      input.adventureCaveIds,
      anchors,
      oldBonesCaveReservationRequests(first!),
    )
    expect(policy.profileOf(first!.caveId)).toBe('EMPTY')
    expect(policy.claimOf(OLD_BONES_RESERVATION_KEY)).toEqual({
      reservationKey: OLD_BONES_RESERVATION_KEY,
      anchorId: first!.anchorId,
      caveId: first!.caveId,
    })
    expect(caveTreasureContainerSpecs(anchors, 42, policy)).toEqual([])
  })

  it('does not collide with an already reserved QUEST_TREASURE cave', () => {
    const npcs = [
      npc('home:npc:0', 'farmer', false, 'f0', 0),
      npc('home:npc:1', 'hunter', false, 'f1', 1),
    ]
    const binding = resolveOldBonesAdventureCaveBinding({
      worldSeed: 7,
      settlementDef: { id: 'home', families: [{ id: 'f0', members: [] }, { id: 'f1', members: [] }] },
      adventureCaveIds: ['cave-a', 'cave-c'],
      contentAnchors: anchors,
      npcs,
      reservedCaveIds: new Set(['cave-a']),
    })
    expect(binding?.caveId).toBe('cave-c')
    const policy = resolveCaveAdventureContentPolicy(
      ['cave-a', 'cave-c'],
      anchors,
      {
        profileReservations: [
          { reservationKey: 'quests-progression-008', caveId: 'cave-a', profile: 'QUEST_TREASURE' },
          ...oldBonesCaveReservationRequests(binding!).profileReservations!,
        ],
        anchorClaims: oldBonesCaveReservationRequests(binding!).anchorClaims,
      },
    )
    expect(policy.profileOf('cave-a')).toBe('QUEST_TREASURE')
    expect(policy.profileOf('cave-c')).toBe('EMPTY')
    expect(policy.unresolved).toEqual([])
  })

  it('materializes remains cache with exact cave pose and signet instance', () => {
    const binding = resolveOldBonesAdventureCaveBinding({
      worldSeed: 1,
      settlementDef: { id: 'home', families: [{ id: 'f0', members: [] }, { id: 'f1', members: [] }] },
      adventureCaveIds: ['cave-a'],
      contentAnchors: anchors,
      npcs: [
        npc('home:npc:0', 'farmer', false, 'f0', 0),
        npc('home:npc:1', 'hunter', false, 'f1', 1),
      ],
    })!
    const anchor = anchors.find((entry) => entry.id === binding.anchorId)!
    const spec = oldBonesRemainsContainerSpec(binding, anchor)
    expect(spec).toMatchObject({
      id: binding.containerId,
      x: anchor.x,
      y: anchor.y,
      z: anchor.z,
      yaw: anchor.yaw,
      spatialContext: { kind: 'cave', caveId: binding.caveId },
      initialInstances: [createOldBonesSignetInstance(binding.caveId)],
    })

    const scene = new Scene()
    const fresh = createWorldGeneratedContainers(scene, () => 0, [spec])
    expect(fresh.containerInstances(spec.id, 'signet_ring')).toEqual([
      createOldBonesSignetInstance(binding.caveId),
    ])
    const looted = createWorldGeneratedContainers(scene, () => 0, [spec], [{
      id: spec.id,
      x: spec.x,
      z: spec.z,
      yaw: spec.yaw,
      counts: { coin: 4 },
      instances: [],
    }])
    expect(looted.containerInstances(spec.id, 'signet_ring')).toEqual([])
    fresh.dispose()
    looted.dispose()
  })

  it('tracks loot and hand-over by exact signet instance id', () => {
    const signetId = oldBonesSignetInstanceId('cave-a')
    const signet = createOldBonesSignetInstance('cave-a')
    expect(isOldBonesRemainsLooted([signet], signetId)).toBe(false)
    expect(isOldBonesRemainsLooted([], signetId)).toBe(true)
    expect(isOldBonesRemainsLooted([{ id: 'quest:old-bones:other:signet' }], signetId)).toBe(true)

    const player = new Inventory({}, 100, [signet])
    expect(player.getInstance(signetId)?.kind).toBe('signet_ring')
    expect(player.getInstance('quest:old-bones:other:signet')).toBeNull()
    const json = player.instancesToJSON()
    expect(Inventory.instancesFromJSON(json)).toEqual([signet])
  })

  it('exposes A/B/keep outcomes only when claimant B exists', () => {
    const withB = buildOldBonesAdventureCaveQuest({
      questId: 'world:old-bones:home:cave-a',
      settlementId: 'home',
      giverNpcId: 'home:npc:2',
      claimantANpcId: 'home:npc:0',
      claimantBNpcId: 'home:npc:1',
      caveId: 'cave-a',
      caveLocationId: 'cave:cave-a',
      anchorId: 'cave-a:sideTreasure',
      containerId: 'world-container:quests-progression-025:cave-a:sideTreasure',
      signetInstanceId: oldBonesSignetInstanceId('cave-a'),
    }, [
      npc('home:npc:0', 'farmer', false, 'f0', 0),
      npc('home:npc:1', 'farmer', false, 'f0', 0),
      npc('home:npc:2', 'hunter', false, 'f1', 1),
    ], 'Osada', 'głęboka jaskinia na północ od osady')
    expect(withB.offerLine).toContain('głęboka jaskinia na północ od osady')
    expect(`${withB.offerLine} ${withB.stages[0]?.reminderLine} ${withB.stages[0]?.progressLine}`).not.toMatch(/konkretn/)
    expect(withB.outcomes.map((outcome) => outcome.id)).toEqual([
      OLD_BONES_RETURN_TO_FIRST_CLAIMANT_OUTCOME,
      OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME,
      OLD_BONES_KEEP_SIGNET_OUTCOME,
    ])
    const finalStage = withB.stages[withB.stages.length - 1]!
    expect(finalStage.dialogueActions?.some((action) => (
      action.physicalOutcomeId === OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME
    ))).toBe(true)

    const withoutB = buildOldBonesAdventureCaveQuest({
      questId: 'world:old-bones:home:cave-a',
      settlementId: 'home',
      giverNpcId: 'home:npc:1',
      claimantANpcId: 'home:npc:0',
      caveId: 'cave-a',
      caveLocationId: 'cave:cave-a',
      anchorId: 'cave-a:sideTreasure',
      containerId: 'world-container:quests-progression-025:cave-a:sideTreasure',
      signetInstanceId: oldBonesSignetInstanceId('cave-a'),
    }, [
      npc('home:npc:0', 'farmer', false, 'f0', 0),
      npc('home:npc:1', 'hunter', false, 'f1', 1),
    ], 'Osada', 'głęboka jaskinia na północ od osady')
    expect(withoutB.outcomes.map((outcome) => outcome.id)).toEqual([
      OLD_BONES_RETURN_TO_FIRST_CLAIMANT_OUTCOME,
      OLD_BONES_KEEP_SIGNET_OUTCOME,
    ])
    expect(withoutB.outcomes.some((outcome) => (
      outcome.id === OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME
    ))).toBe(false)
  })
})

describe('old bones socially consequential dialogue (plan quests-progression-052)', () => {
  const npcs = [
    npc('home:npc:0', 'farmer', false, 'f0', 0),
    npc('home:npc:1', 'farmer', false, 'f0', 0),
    npc('home:npc:2', 'hunter', false, 'f1', 1),
  ]
  const withBBinding = {
    questId: 'world:old-bones:home:cave-a',
    settlementId: 'home',
    giverNpcId: 'home:npc:2',
    claimantANpcId: 'home:npc:0',
    claimantBNpcId: 'home:npc:1',
    caveId: 'cave-a',
    caveLocationId: 'cave:cave-a',
    anchorId: 'cave-a:sideTreasure',
    containerId: 'world-container:quests-progression-025:cave-a:sideTreasure',
    signetInstanceId: oldBonesSignetInstanceId('cave-a'),
  }
  const withoutBBinding = {
    questId: 'world:old-bones:home:cave-a',
    settlementId: 'home',
    giverNpcId: 'home:npc:1',
    claimantANpcId: 'home:npc:0',
    caveId: 'cave-a',
    caveLocationId: 'cave:cave-a',
    anchorId: 'cave-a:sideTreasure',
    containerId: 'world-container:quests-progression-025:cave-a:sideTreasure',
    signetInstanceId: oldBonesSignetInstanceId('cave-a'),
  }

  function terminalManager(
    binding: typeof withBBinding | typeof withoutBBinding,
    relations: Record<string, number>,
    npcList: SettlementOpportunityNpc[],
  ) {
    const def = buildOldBonesAdventureCaveQuest(binding, npcList, 'Osada', 'głęboka jaskinia na północ od osady')
    const inventory = new Inventory({}, Infinity, [createOldBonesSignetInstance(binding.caveId)])
    const qm = new QuestManager(
      [def],
      undefined,
      inventory,
      {
        progress: [{ id: def.id, state: 'active', stageIndex: def.stages.length - 1 }],
        relations,
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
      undefined,
      undefined,
      undefined,
      undefined,
      { canResolve: () => true, onResolve: () => {} },
    )
    return { def, qm }
  }

  it('keeps A/B/keep outcomes, exact signet gate and claimant-B-absent materialization', () => {
    const withB = buildOldBonesAdventureCaveQuest(withBBinding, npcs, 'Osada', 'jaskinia')
    const withoutB = buildOldBonesAdventureCaveQuest(withoutBBinding, [
      npc('home:npc:0', 'farmer', false, 'f0', 0),
      npc('home:npc:1', 'hunter', false, 'f1', 1),
    ], 'Osada', 'jaskinia')
    expect(() => validateQuestDefinitions([withB, withoutB])).not.toThrow()
    const withBActions = withB.stages[withB.stages.length - 1]?.dialogueActions ?? []
    expect(withBActions.map((action) => action.physicalOutcomeId)).toEqual([
      OLD_BONES_RETURN_TO_FIRST_CLAIMANT_OUTCOME,
      OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME,
      OLD_BONES_KEEP_SIGNET_OUTCOME,
    ])
    expect(withBActions.every((action) => action.requireItemInstanceId === withBBinding.signetInstanceId)).toBe(true)
    const withoutBActions = withoutB.stages[withoutB.stages.length - 1]?.dialogueActions ?? []
    expect(withoutBActions.map((action) => action.physicalOutcomeId)).toEqual([
      OLD_BONES_RETURN_TO_FIRST_CLAIMANT_OUTCOME,
      OLD_BONES_KEEP_SIGNET_OUTCOME,
    ])
    expect(withoutBActions[1]?.reactions?.[0]?.when).toEqual([
      { type: 'relation', npc: { npcId: 'home:npc:0' }, minimum: 'trusted' },
    ])
  })

  it('selects claimant replies from live relation without blocking outcomes', () => {
    const giveA = terminalManager(withBBinding, {}, npcs)
    expect(giveA.qm.onInteract('home:npc:0')?.actions?.[0]?.onSelect())
      .toBe('Dziękuję. Chociaż tyle z tamtej historii wraca.')
    expect(giveA.qm.getRelation('home:npc:0')).toBe(3)

    const giveAWarm = terminalManager(withBBinding, { 'home:npc:0': 3 }, npcs)
    expect(giveAWarm.qm.onInteract('home:npc:0')?.actions?.[0]?.onSelect())
      .toBe('Wiedziałem, że go nie zatrzymasz. Dziękuję.')
    expect(giveAWarm.qm.getRelation('home:npc:0')).toBe(7)

    const giveB = terminalManager(withBBinding, { 'home:npc:0': 3 }, npcs)
    expect(giveB.qm.onInteract('home:npc:1')?.actions?.[0]?.onSelect())
      .toBe('Wiedziałem, że mógłbyś stanąć po jego stronie. Tym bardziej dziękuję, że sygnet trafił do mnie.')
    expect(giveB.qm.getRelation('home:npc:0')).toBe(1)
    expect(giveB.qm.exportProgress()[0]?.resolvedOutcomeId).toBe(OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME)

    const keep = terminalManager(withoutBBinding, {}, [
      npc('home:npc:0', 'farmer', false, 'f0', 0),
      npc('home:npc:1', 'hunter', false, 'f1', 1),
    ])
    expect(keep.qm.onInteract('home:npc:0')?.actions?.[1]?.onSelect())
      .toBe('Przynosisz nam historię, a pamiątkę bierzesz ze sobą. Rozumiem.')
    expect(keep.qm.getRelation('home:npc:0')).toBe(-1)
  })

  it('journals the trusted keep-signet reaction line once', () => {
    const { qm } = terminalManager(withBBinding, { 'home:npc:0': 6 }, npcs)
    expect(qm.onInteract('home:npc:0')?.actions?.[1]?.onSelect())
      .toBe('Tobie mówiłem o tym jak komuś swojemu. A sygnet zabierasz ze sobą.')
    expect(qm.getRelation('home:npc:0')).toBe(3)
    expect(qm.list().find((entry) => entry.id === withBBinding.questId)?.notes.map((note) => note.text))
      .toContain('Tobie mówiłem o tym jak komuś swojemu. A sygnet zabierasz ze sobą.')
    expect(qm.exportProgress()[0]?.journal?.some((event) => event.dialogueReactionIndex === 0)).toBe(true)
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe(OLD_BONES_KEEP_SIGNET_OUTCOME)
  })
})
