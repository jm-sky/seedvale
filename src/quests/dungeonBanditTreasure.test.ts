/** Plan quests-progression-026 — dungeon bandit treasure binding/content tests. */

import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import type { CaveContentAnchor } from '../world/caves/caveContentAnchors'
import type { OpportunityNpc } from './opportunities/worldQuestOpportunityTypes'
import type { QuestSocialAvailabilityLookup } from './QuestManager'
import { Inventory } from '../items/Inventory'
import { resolveCaveAdventureContentPolicy } from '../world/caves/caveAdventureContentPolicy'
import { DUNGEON_DEEP_CHAMBER_NODE_ID } from '../world/caves/dungeonTopology'
import { createPlacedContainers } from '../world/createPlacedContainers'
import { createWorldGeneratedContainers } from '../world/worldGeneratedContainers'
import {
  buildDungeonBanditTreasureQuest,
  createDungeonBanditLedgerInstance,
  createDungeonBanditMarkedValuableInstance,
  DUNGEON_BANDIT_GIVE_EVIDENCE_TO_GUARD_OUTCOME,
  DUNGEON_BANDIT_KEEP_MARKED_PROPERTY_OUTCOME,
  DUNGEON_BANDIT_RETURN_MARKED_PROPERTY_OUTCOME,
  dungeonBanditCaveReservationRequests,
  dungeonBanditClaimsMatch,
  dungeonBanditContainerId,
  dungeonBanditContainerSpecs,
  dungeonBanditDeepReservationKey,
  dungeonBanditLedgerInstanceId,
  dungeonBanditMarkedValuableInstanceId,
  dungeonBanditOrphanedInstances,
  dungeonBanditSideReservationKey,
  eligibleDungeonBanditCaves,
  isDungeonBanditDeepStashLooted,
  resolveDungeonBanditTreasureBinding,
  selectDungeonBanditNpcs,
} from './dungeonBanditTreasure'
import { QuestManager } from './QuestManager'
import { validateQuestDefinitions } from './quests'

function npc(
  id: string,
  role: OpportunityNpc['role'],
  child = false,
): OpportunityNpc {
  return { id, name: id, role, child }
}

function dungeonAnchor(
  caveId: string,
  role: CaveContentAnchor['role'],
  sourceNodeId: string,
  offset = 0,
): CaveContentAnchor {
  return {
    id: `${caveId}:${role}:${sourceNodeId}`,
    caveId,
    role,
    sourceNodeId,
    x: 10 + offset,
    y: -6 + offset,
    z: 20 + offset,
    yaw: 0.25,
  }
}

describe('dungeon bandit treasure (plan quests-progression-026)', () => {
  const dungeonId = 'cave:dungeon-a'
  const anchors: CaveContentAnchor[] = [
    dungeonAnchor(dungeonId, 'sideTreasure', 'side-1', 0),
    dungeonAnchor(dungeonId, 'sideTreasure', 'side-2', 1),
    dungeonAnchor(dungeonId, 'sideTreasure', 'side-3', 2),
    dungeonAnchor(dungeonId, 'loot', DUNGEON_DEEP_CHAMBER_NODE_ID, 3),
    dungeonAnchor(dungeonId, 'finalTreasure', 'dungeon-final-chamber', 4),
    dungeonAnchor(dungeonId, 'loot', 'regular-chamber', 5),
    dungeonAnchor('cave:natural', 'loot', 'chamber', 6),
  ]

  it('selects guard giver and home trader claimant', () => {
    const pick = selectDungeonBanditNpcs([
      npc('home:npc:0', 'farmer'),
      npc('home:npc:1', 'trader'),
      npc('home:npc:2', 'guard'),
      npc('home:npc:3', 'farmer', true),
    ])
    expect(pick?.giver.id).toBe('home:npc:2')
    expect(pick?.claimant.id).toBe('home:npc:1')
  })

  it('falls back to hunter giver and neighbor trader claimant', () => {
    const pick = selectDungeonBanditNpcs(
      [npc('home:npc:0', 'hunter'), npc('home:npc:1', 'farmer')],
      new Map([['1_0', [npc('1_0:npc:0', 'trader'), npc('1_0:npc:1', 'farmer')]]]),
    )
    expect(pick?.giver.id).toBe('home:npc:0')
    expect(pick?.claimant.id).toBe('1_0:npc:0')
  })

  it('requires dungeon deep loot and never claims finalTreasure', () => {
    const eligible = eligibleDungeonBanditCaves(
      [dungeonId, 'cave:natural'],
      (caveId) => (caveId === dungeonId ? 'dungeon' : 'natural'),
      anchors,
    )
    expect(eligible).toHaveLength(1)
    expect(eligible[0]!.deepLootAnchor.id).toBe(
      `${dungeonId}:loot:${DUNGEON_DEEP_CHAMBER_NODE_ID}`,
    )
    expect(eligible[0]!.sideTreasureAnchors).toHaveLength(2)
    expect(eligible[0]!.sideTreasureAnchors.every((a) => a.role === 'sideTreasure')).toBe(true)

    const binding = resolveDungeonBanditTreasureBinding({
      worldSeed: 7,
      settlementId: 'home',
      homeNpcs: [
        npc('home:npc:0', 'guard'),
        npc('home:npc:1', 'trader'),
      ],
      caveIds: [dungeonId, 'cave:natural'],
      archetypeOf: (caveId) => (caveId === dungeonId ? 'dungeon' : 'natural'),
      contentAnchors: anchors,
    })
    expect(binding).not.toBeNull()
    const claims = dungeonBanditCaveReservationRequests(binding!).anchorClaims ?? []
    expect(claims.some((claim) => claim.anchorId.includes('finalTreasure'))).toBe(false)
    expect(claims.map((claim) => claim.reservationKey).sort()).toEqual([
      dungeonBanditDeepReservationKey(),
      ...binding!.sideTreasureAnchorIds.map(dungeonBanditSideReservationKey).sort(),
    ].sort())
  })

  it('resolves deterministically and allows optional zero side caches', () => {
    const deepOnly: CaveContentAnchor[] = [
      dungeonAnchor(dungeonId, 'loot', DUNGEON_DEEP_CHAMBER_NODE_ID, 0),
      dungeonAnchor(dungeonId, 'finalTreasure', 'dungeon-final-chamber', 1),
    ]
    const input = {
      worldSeed: 11,
      settlementId: 'home',
      homeNpcs: [npc('home:npc:0', 'guard'), npc('home:npc:1', 'trader')],
      caveIds: [dungeonId],
      archetypeOf: () => 'dungeon' as const,
      contentAnchors: deepOnly,
    }
    const first = resolveDungeonBanditTreasureBinding(input)
    const second = resolveDungeonBanditTreasureBinding(input)
    expect(first).toEqual(second)
    expect(first?.sideTreasureAnchorIds).toEqual([])
    expect(first?.deepLootAnchorId).toBe(`${dungeonId}:loot:${DUNGEON_DEEP_CHAMBER_NODE_ID}`)
  })

  it('materializes deep stash instances and suppresses reseed from saved state', () => {
    const binding = resolveDungeonBanditTreasureBinding({
      worldSeed: 3,
      settlementId: 'home',
      homeNpcs: [npc('home:npc:0', 'guard'), npc('home:npc:1', 'trader')],
      caveIds: [dungeonId],
      archetypeOf: () => 'dungeon',
      contentAnchors: anchors,
    })!
    const specs = dungeonBanditContainerSpecs(binding, anchors)
    expect(specs.some((spec) => spec.id === binding.deepContainerId)).toBe(true)
    expect(specs.every((spec) => !spec.id.includes('finalTreasure'))).toBe(true)

    const deepSpec = specs.find((spec) => spec.id === binding.deepContainerId)!
    expect(deepSpec.initialInstances?.map((instance) => instance.id).sort()).toEqual([
      dungeonBanditLedgerInstanceId(binding.caveId),
      dungeonBanditMarkedValuableInstanceId(binding.caveId),
    ].sort())

    const scene = new Scene()
    const fresh = createWorldGeneratedContainers(scene, () => 0, [deepSpec])
    expect(fresh.containerInstances(deepSpec.id, 'marked_valuable')[0]?.id).toBe(
      binding.markedValuableInstanceId,
    )
    const looted = createWorldGeneratedContainers(scene, () => 0, [deepSpec], [{
      id: deepSpec.id,
      x: deepSpec.x,
      z: deepSpec.z,
      yaw: deepSpec.yaw,
      counts: { coin: 1 },
      instances: [],
    }])
    expect(looted.containerInstances(deepSpec.id, 'marked_valuable')).toEqual([])
    expect(looted.containerInstances(deepSpec.id, 'bandit_ledger')).toEqual([])
    fresh.dispose()
    looted.dispose()
  })

  it('tracks deep loot by marked valuable instance and keeps exact identity', () => {
    const valuableId = dungeonBanditMarkedValuableInstanceId(dungeonId)
    const valuable = createDungeonBanditMarkedValuableInstance(dungeonId)
    const ledger = createDungeonBanditLedgerInstance(dungeonId)
    expect(isDungeonBanditDeepStashLooted([valuable, ledger], valuableId)).toBe(false)
    expect(isDungeonBanditDeepStashLooted([ledger], valuableId)).toBe(true)

    const player = new Inventory({}, 100, [valuable, ledger])
    expect(player.getInstance(valuableId)?.kind).toBe('marked_valuable')
    expect(player.getInstance(dungeonBanditLedgerInstanceId(dungeonId))?.kind).toBe('bandit_ledger')
  })

  it('builds return / guard / keep outcomes and deep loot objective', () => {
    const binding = resolveDungeonBanditTreasureBinding({
      worldSeed: 5,
      settlementId: 'home',
      homeNpcs: [npc('home:npc:0', 'guard'), npc('home:npc:1', 'trader')],
      caveIds: [dungeonId],
      archetypeOf: () => 'dungeon',
      contentAnchors: anchors,
    })!
    const def = buildDungeonBanditTreasureQuest(binding, [
      npc('home:npc:0', 'guard'),
      npc('home:npc:1', 'trader'),
    ], 'Osada', 'stary loch na wschód od osady')
    expect(def.offerLine).toContain('stary loch na wschód od osady')
    expect(`${def.offerLine} ${def.stages[0]?.progressLine}`).not.toMatch(/konkretn|dokładny loch/)
    expect(def.outcomes.map((outcome) => outcome.id)).toEqual([
      DUNGEON_BANDIT_RETURN_MARKED_PROPERTY_OUTCOME,
      DUNGEON_BANDIT_GIVE_EVIDENCE_TO_GUARD_OUTCOME,
      DUNGEON_BANDIT_KEEP_MARKED_PROPERTY_OUTCOME,
    ])
    expect(def.stages.some((stage) => (
      stage.objective.type === 'loot_world_container'
      && stage.objective.containerId === binding.deepContainerId
    ))).toBe(true)
    expect(def.stages.every((stage) => (
      stage.objective.type !== 'loot_world_container'
      || !binding.sideContainerIds.includes(stage.objective.containerId)
    ))).toBe(true)
    expect(binding.deepContainerId).toBe(dungeonBanditContainerId(binding.deepLootAnchorId))
  })

  it('activates only when shared policy claims match and coexist with 027 finalTreasure', () => {
    const binding = resolveDungeonBanditTreasureBinding({
      worldSeed: 9,
      settlementId: 'home',
      homeNpcs: [npc('home:npc:0', 'guard'), npc('home:npc:1', 'trader')],
      caveIds: [dungeonId],
      archetypeOf: () => 'dungeon',
      contentAnchors: anchors,
    })!
    const finalId = `${dungeonId}:finalTreasure:dungeon-final-chamber`
    const policy = resolveCaveAdventureContentPolicy([], anchors, {
      anchorClaims: [
        ...(dungeonBanditCaveReservationRequests(binding).anchorClaims ?? []),
        { reservationKey: 'quests-progression-027:final', anchorId: finalId },
      ],
    })
    expect(dungeonBanditClaimsMatch(binding, (key) => policy.claimOf(key))).toBe(true)
    expect(policy.claimOf('quests-progression-027:final')?.anchorId).toBe(finalId)
    expect(policy.unresolved).toEqual([])
  })
})

describe('dungeon bandit socially consequential dialogue (plan quests-progression-052)', () => {
  const binding = {
    questId: 'world:dungeon-bandit:home:cave',
    settlementId: 'home',
    giverNpcId: 'home:npc:0',
    claimantNpcId: 'home:npc:1',
    caveId: 'cave:dungeon-a',
    caveLocationId: 'cave:cave:dungeon-a',
    deepLootAnchorId: 'deep',
    sideTreasureAnchorIds: [] as readonly string[],
    deepContainerId: 'deep-box',
    sideContainerIds: [] as readonly string[],
    ledgerInstanceId: dungeonBanditLedgerInstanceId('cave:dungeon-a'),
    markedValuableInstanceId: dungeonBanditMarkedValuableInstanceId('cave:dungeon-a'),
  }
  const npcs = [npc('home:npc:0', 'guard'), npc('home:npc:1', 'trader')]

  function build() {
    return buildDungeonBanditTreasureQuest(binding, npcs, 'Osada', 'stary loch')
  }

  function terminalManager(
    relations: Record<string, number>,
    social?: QuestSocialAvailabilityLookup,
  ) {
    const def = build()
    const inventory = new Inventory({}, Infinity, [
      createDungeonBanditMarkedValuableInstance(binding.caveId),
    ])
    const qm = new QuestManager(
      [def],
      undefined,
      inventory,
      { progress: [{ id: def.id, state: 'active', stageIndex: 2 }], relations },
      undefined,
      undefined,
      undefined,
      undefined,
      social,
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

  function standing(integrity: number, competence = 0): QuestSocialAvailabilityLookup {
    return {
      getReputationDimension: (_settlementId, dimension) => {
        if (dimension === 'integrity') return integrity
        if (dimension === 'competence') return competence
        return 0
      },
      getRenown: () => 0,
    }
  }

  it('keeps return/guard/keep outcomes and the marked-valuable gate', () => {
    const def = build()
    expect(() => validateQuestDefinitions([def])).not.toThrow()
    const actions = def.stages[2]?.dialogueActions ?? []
    expect(actions.map((action) => action.physicalOutcomeId)).toEqual([
      DUNGEON_BANDIT_RETURN_MARKED_PROPERTY_OUTCOME,
      DUNGEON_BANDIT_GIVE_EVIDENCE_TO_GUARD_OUTCOME,
      DUNGEON_BANDIT_KEEP_MARKED_PROPERTY_OUTCOME,
    ])
    expect(actions.every((action) => action.requireItemInstanceId === binding.markedValuableInstanceId)).toBe(true)
    expect(def.outcomes.map((outcome) => outcome.consequences)).toEqual([
      {
        relations: [{ npc: { npcId: binding.claimantNpcId }, delta: 3 }],
        social: { reputation: { trust: 4, integrity: 5, benevolence: 4 }, renown: 2 },
      },
      {
        relations: [{ npc: { npcId: binding.claimantNpcId }, delta: 1 }],
        social: { reputation: { competence: 5, integrity: 4 }, renown: 4 },
      },
      {
        relations: [{ npc: { npcId: binding.claimantNpcId }, delta: -2 }],
        social: { reputation: { trust: -2, integrity: -4 }, renown: 1 },
      },
    ])
  })

  it('varies claimant and guard replies at relation and reputation thresholds', () => {
    const returnLow = terminalManager({})
    expect(returnLow.qm.onInteract(binding.claimantNpcId)?.actions?.[0]?.onSelect())
      .toBe('Dziękuję. Przynajmniej coś z tamtego napadu wraca do domu.')
    expect(returnLow.qm.getRelation(binding.claimantNpcId)).toBe(3)

    const returnWarm = terminalManager({ [binding.claimantNpcId]: 3 })
    expect(returnWarm.qm.onInteract(binding.claimantNpcId)?.actions?.[0]?.onSelect())
      .toBe('Poznałem go od razu. Dobrze, że trafił właśnie do ciebie.')
    expect(returnWarm.qm.getRelation(binding.claimantNpcId)).toBe(7)

    const evidenceNeutral = terminalManager({}, standing(0, 0))
    expect(evidenceNeutral.qm.onInteract(binding.giverNpcId)?.actions?.[0]?.onSelect())
      .toBe('Zostaw wszystko tutaj. Sprawdzę rejestr i właściciela.')
    expect(evidenceNeutral.qm.exportProgress()[0]?.resolvedOutcomeId)
      .toBe(DUNGEON_BANDIT_GIVE_EVIDENCE_TO_GUARD_OUTCOME)

    const evidenceCompetence = terminalManager({}, standing(0, 5))
    expect(evidenceCompetence.qm.onInteract(binding.giverNpcId)?.actions?.[0]?.onSelect())
      .toBe('Dobrze to rozegrałeś. Zostaw rejestr i klejnot — zajmę się resztą.')

    const evidenceIntegrity = terminalManager({}, standing(5, 0))
    expect(evidenceIntegrity.qm.onInteract(binding.giverNpcId)?.actions?.[0]?.onSelect())
      .toBe('Dobrze to rozegrałeś. Zostaw rejestr i klejnot — zajmę się resztą.')

    const keepHigh = terminalManager({}, standing(5))
    expect(keepHigh.qm.onInteract(binding.giverNpcId)?.actions?.[1]?.onSelect())
      .toBe('Naprawdę chcesz zatrzymać rzecz z cudzym znakiem?')
    expect(keepHigh.qm.exportProgress()[0]?.resolvedOutcomeId)
      .toBe(DUNGEON_BANDIT_KEEP_MARKED_PROPERTY_OUTCOME)

    const keepLow = terminalManager({}, standing(0))
    expect(keepLow.qm.onInteract(binding.giverNpcId)?.actions?.[1]?.onSelect())
      .toBe('No tak. Czyli jednak po klejnot tam poszedłeś.')
  })
})

describe('dungeon bandit exact-instance acquisition gating (plan quests-progression-056)', () => {
  const caveId = 'cave:dungeon-a'
  const binding = {
    questId: 'world:dungeon-bandit:home:cave',
    settlementId: 'home',
    giverNpcId: 'home:npc:0',
    claimantNpcId: 'home:npc:1',
    caveId,
    caveLocationId: 'cave:cave:dungeon-a',
    deepLootAnchorId: 'deep',
    sideTreasureAnchorIds: [] as readonly string[],
    deepContainerId: 'deep-box',
    sideContainerIds: [] as readonly string[],
    ledgerInstanceId: dungeonBanditLedgerInstanceId(caveId),
    markedValuableInstanceId: dungeonBanditMarkedValuableInstanceId(caveId),
  }
  const npcs = [npc('home:npc:0', 'guard'), npc('home:npc:1', 'trader')]

  function acquisitionManager(instances: ReturnType<typeof createDungeonBanditLedgerInstance>[]) {
    const def = buildDungeonBanditTreasureQuest(binding, npcs, 'Osada', 'stary loch')
    const inventory = new Inventory({}, Infinity, instances)
    const qm = new QuestManager(
      [def],
      undefined,
      inventory,
      { progress: [{ id: def.id, state: 'active', stageIndex: 1 }], relations: {} },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        hasReadItem: () => false,
        hasDiscoveredLocation: () => false,
        isWorldContainerLooted: () => true,
        hasResolvedHiddenFindSpot: () => false,
        hasAcquiredPortableContainer: () => false,
      },
    )
    return { def, qm }
  }

  it('does not advance past acquisition when only the marked valuable is owned', () => {
    const { qm, def } = acquisitionManager([createDungeonBanditMarkedValuableInstance(caveId)])
    expect(qm.exportProgress().find((entry) => entry.id === def.id)?.stageIndex).toBe(1)
    expect(qm.getState(def.id)).toBe('active')
  })

  it('does not advance past acquisition when only the ledger is owned', () => {
    const { qm, def } = acquisitionManager([createDungeonBanditLedgerInstance(caveId)])
    expect(qm.exportProgress().find((entry) => entry.id === def.id)?.stageIndex).toBe(1)
    expect(qm.getState(def.id)).toBe('active')
  })

  it('advances to the decision stage only once both exact instances are owned and the stash is looted', () => {
    const { qm, def } = acquisitionManager([
      createDungeonBanditLedgerInstance(caveId),
      createDungeonBanditMarkedValuableInstance(caveId),
    ])
    // `catchUpActiveWorldObjectives` completes at most one newly satisfied
    // slot per call (mirrors real play, where `gameLoop.ts` re-polls every
    // tick) — matches the existing idiom in suspiciousTransportCaveCache.test.ts.
    for (let i = 0; i < 3; i++) qm.pollWorldProgressionObjectives()
    expect(qm.exportProgress().find((entry) => entry.id === def.id)?.stageIndex).toBe(2)
  })

  it('final reminder truthfully asks for both carried items', () => {
    const def = buildDungeonBanditTreasureQuest(binding, npcs, 'Osada', 'stary loch')
    expect(def.stages[2]?.reminderLine).toBe(
      'Do rozstrzygnięcia sprawy musisz mieć przy sobie oznaczony klejnot i bandycki rejestr.',
    )
  })
})

describe('dungeon bandit story-item recovery ownership scan (plan quests-progression-056)', () => {
  const caveId = 'cave:dungeon-a'
  const binding = {
    questId: 'world:dungeon-bandit:home:cave',
    settlementId: 'home',
    giverNpcId: 'home:npc:0',
    claimantNpcId: 'home:npc:1',
    caveId,
    caveLocationId: 'cave:cave:dungeon-a',
    deepLootAnchorId: 'deep',
    sideTreasureAnchorIds: [] as readonly string[],
    deepContainerId: 'deep-box',
    sideContainerIds: [] as readonly string[],
    ledgerInstanceId: dungeonBanditLedgerInstanceId(caveId),
    markedValuableInstanceId: dungeonBanditMarkedValuableInstanceId(caveId),
  }
  const activeContext = { questState: 'active' as const, questStageIndex: 2, acquisitionStageIndex: 1 }

  function emptyDomains(scene: Scene) {
    const worldGeneratedContainers = createWorldGeneratedContainers(scene, () => 0, [
      { id: binding.deepContainerId, kind: 'chest', x: 0, z: 0, yaw: 0, initialCounts: {} },
    ])
    const placedContainers = createPlacedContainers(scene, () => 0)
    return { worldGeneratedContainers, placedContainers }
  }

  it('does not recreate an instance already owned by Player Inventory', () => {
    const scene = new Scene()
    const { worldGeneratedContainers, placedContainers } = emptyDomains(scene)
    const inventory = new Inventory({}, Infinity, [
      createDungeonBanditLedgerInstance(caveId),
      createDungeonBanditMarkedValuableInstance(caveId),
    ])
    const orphaned = dungeonBanditOrphanedInstances(
      binding,
      activeContext,
      { playerInventory: inventory, worldGeneratedContainers, placedContainers },
    )
    expect(orphaned).toEqual([])
    worldGeneratedContainers.dispose()
    placedContainers.dispose()
  })

  it('does not recreate an instance still in the original deep stash', () => {
    const scene = new Scene()
    const worldGeneratedContainers = createWorldGeneratedContainers(scene, () => 0, [
      {
        id: binding.deepContainerId,
        kind: 'chest',
        x: 0,
        z: 0,
        yaw: 0,
        initialCounts: {},
        initialInstances: [
          createDungeonBanditLedgerInstance(caveId),
          createDungeonBanditMarkedValuableInstance(caveId),
        ],
      },
    ])
    const placedContainers = createPlacedContainers(scene, () => 0)
    const inventory = new Inventory({}, Infinity, [])
    const orphaned = dungeonBanditOrphanedInstances(
      binding,
      activeContext,
      { playerInventory: inventory, worldGeneratedContainers, placedContainers },
    )
    expect(orphaned).toEqual([])
    worldGeneratedContainers.dispose()
    placedContainers.dispose()
  })

  it('does not recreate an instance in another world-generated container', () => {
    const scene = new Scene()
    const otherId = 'other-container'
    const worldGeneratedContainers = createWorldGeneratedContainers(scene, () => 0, [
      { id: binding.deepContainerId, kind: 'chest', x: 0, z: 0, yaw: 0, initialCounts: {} },
      { id: otherId, kind: 'chest', x: 1, z: 1, yaw: 0, initialCounts: {} },
    ])
    worldGeneratedContainers.depositInstance(otherId, createDungeonBanditLedgerInstance(caveId))
    worldGeneratedContainers.depositInstance(otherId, createDungeonBanditMarkedValuableInstance(caveId))
    const placedContainers = createPlacedContainers(scene, () => 0)
    const inventory = new Inventory({}, Infinity, [])
    const orphaned = dungeonBanditOrphanedInstances(
      binding,
      activeContext,
      { playerInventory: inventory, worldGeneratedContainers, placedContainers },
    )
    expect(orphaned).toEqual([])
    worldGeneratedContainers.dispose()
    placedContainers.dispose()
  })

  it('does not recreate an instance in Player placed storage', () => {
    const scene = new Scene()
    const { worldGeneratedContainers, placedContainers } = emptyDomains(scene)
    const record = placedContainers.place('chest', 0, 0, 0)
    placedContainers.depositInstance(record.id, createDungeonBanditLedgerInstance(caveId))
    placedContainers.depositInstance(record.id, createDungeonBanditMarkedValuableInstance(caveId))
    const inventory = new Inventory({}, Infinity, [])
    const orphaned = dungeonBanditOrphanedInstances(
      binding,
      activeContext,
      { playerInventory: inventory, worldGeneratedContainers, placedContainers },
    )
    expect(orphaned).toEqual([])
    worldGeneratedContainers.dispose()
    placedContainers.dispose()
  })

  it('does not recreate an instance in the currently carried Player container', () => {
    const scene = new Scene()
    const { worldGeneratedContainers, placedContainers } = emptyDomains(scene)
    const record = placedContainers.place('chest', 0, 0, 0)
    placedContainers.depositInstance(record.id, createDungeonBanditLedgerInstance(caveId))
    placedContainers.depositInstance(record.id, createDungeonBanditMarkedValuableInstance(caveId))
    expect(placedContainers.pickUp(record.id)).toBe(true)
    const inventory = new Inventory({}, Infinity, [])
    const orphaned = dungeonBanditOrphanedInstances(
      binding,
      activeContext,
      { playerInventory: inventory, worldGeneratedContainers, placedContainers },
    )
    expect(orphaned).toEqual([])
    worldGeneratedContainers.dispose()
    placedContainers.dispose()
  })

  it('recreates a genuinely absent instance into the bound deep stash exactly once, then stays idempotent', () => {
    const scene = new Scene()
    const { worldGeneratedContainers, placedContainers } = emptyDomains(scene)
    const inventory = new Inventory({}, Infinity, [])
    const domains = { playerInventory: inventory, worldGeneratedContainers, placedContainers }

    const orphaned = dungeonBanditOrphanedInstances(binding, activeContext, domains)
    expect(orphaned.map((instance) => instance.id).sort()).toEqual([
      binding.ledgerInstanceId,
      binding.markedValuableInstanceId,
    ].sort())
    for (const instance of orphaned) worldGeneratedContainers.depositInstance(binding.deepContainerId, instance)
    expect(worldGeneratedContainers.containerInstances(binding.deepContainerId, 'bandit_ledger')[0]?.id)
      .toBe(binding.ledgerInstanceId)
    expect(worldGeneratedContainers.containerInstances(binding.deepContainerId, 'marked_valuable')[0]?.id)
      .toBe(binding.markedValuableInstanceId)

    const repeat = dungeonBanditOrphanedInstances(binding, activeContext, domains)
    expect(repeat).toEqual([])
    worldGeneratedContainers.dispose()
    placedContainers.dispose()
  })

  it('does not recreate anything for a terminal quest', () => {
    const scene = new Scene()
    const { worldGeneratedContainers, placedContainers } = emptyDomains(scene)
    const inventory = new Inventory({}, Infinity, [])
    const orphaned = dungeonBanditOrphanedInstances(
      binding,
      { questState: 'complete', questStageIndex: 2, acquisitionStageIndex: 1 },
      { playerInventory: inventory, worldGeneratedContainers, placedContainers },
    )
    expect(orphaned).toEqual([])
    worldGeneratedContainers.dispose()
    placedContainers.dispose()
  })

  it('does not recreate anything before the acquisition boundary', () => {
    const scene = new Scene()
    const { worldGeneratedContainers, placedContainers } = emptyDomains(scene)
    const inventory = new Inventory({}, Infinity, [])
    const orphaned = dungeonBanditOrphanedInstances(
      binding,
      { questState: 'active', questStageIndex: 0, acquisitionStageIndex: 1 },
      { playerInventory: inventory, worldGeneratedContainers, placedContainers },
    )
    expect(orphaned).toEqual([])
    worldGeneratedContainers.dispose()
    placedContainers.dispose()
  })
})
