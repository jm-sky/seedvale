/** Plan quests-progression-027 — lost treasure expedition binding/content tests. */

import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import type { CaveContentAnchor } from '../world/caves/caveContentAnchors'
import type { DungeonChamber } from '../world/caves/dungeonChambers'
import type { SettlementOpportunityNpc } from './opportunities/settlementNpcMaterialization'
import { Inventory } from '../items/Inventory'
import { resolveCaveAdventureContentPolicy } from '../world/caves/caveAdventureContentPolicy'
import { createWorldGeneratedContainers } from '../world/worldGeneratedContainers'
import {
  DUNGEON_BANDIT_DEEP_RESERVATION_KEY,
  dungeonBanditCaveReservationRequests,
  resolveDungeonBanditTreasureBinding,
} from './dungeonBanditTreasure'
import {
  buildLostTreasureExpeditionQuest,
  createLostTreasureExpeditionJournalInstance,
  eligibleLostTreasureExpeditionCaves,
  isLostTreasureExpeditionJournalPackLooted,
  LOST_TREASURE_EXPEDITION_FINAL_RESERVATION_KEY,
  LOST_TREASURE_EXPEDITION_JOURNAL_TO_FAMILY_OUTCOME,
  LOST_TREASURE_EXPEDITION_JOURNAL_TO_SPONSOR_OUTCOME,
  LOST_TREASURE_EXPEDITION_KEEP_JOURNAL_OUTCOME,
  lostTreasureExpeditionCaveReservationRequests,
  lostTreasureExpeditionClaimsMatch,
  lostTreasureExpeditionContainerSpecs,
  lostTreasureExpeditionJournalInstanceId,
  resolveLostTreasureExpeditionBinding,
  selectLostTreasureExpeditionNpcs,
} from './lostTreasureExpedition'

function npc(
  id: string,
  role: SettlementOpportunityNpc['role'],
  householdId: string,
  child = false,
): SettlementOpportunityNpc {
  return { id, name: id, role, child, householdId, familyIndex: 0 }
}

function chamber(nodeId: string, cls: DungeonChamber['class']): DungeonChamber {
  return { nodeId, class: cls, position: { x: 0, y: 0, z: 0 }, targetWidth: 6, targetHeight: 3 }
}

const DUNGEON_ROUTE_CHAMBERS: DungeonChamber[] = [
  chamber('dungeon-chamber-1', 'entrance-adjacent'),
  chamber('dungeon-side-chamber-1', 'side'),
  chamber('dungeon-chamber-2', 'regular'),
  chamber('dungeon-side-chamber-2', 'side'),
  chamber('dungeon-chamber-3', 'regular'),
  chamber('dungeon-deep-chamber', 'deep'),
  chamber('dungeon-final-chamber', 'final'),
]

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

describe('lost treasure expedition (plan quests-progression-027)', () => {
  const dungeonId = 'cave:dungeon-a'
  const dungeonChambersOf = (caveId: string): readonly DungeonChamber[] => (
    caveId === dungeonId ? DUNGEON_ROUTE_CHAMBERS : []
  )
  const anchors: CaveContentAnchor[] = [
    dungeonAnchor(dungeonId, 'storyFind', 'dungeon-chamber-2', 0),
    dungeonAnchor(dungeonId, 'storyFind', 'dungeon-chamber-3', 1),
    dungeonAnchor(dungeonId, 'storyFind', 'dungeon-deep-chamber', 2),
    dungeonAnchor(dungeonId, 'storyFind', 'dungeon-final-chamber', 3),
    dungeonAnchor(dungeonId, 'loot', 'dungeon-deep-chamber', 4),
    dungeonAnchor(dungeonId, 'finalTreasure', 'dungeon-final-chamber', 5),
    dungeonAnchor('cave:natural', 'storyFind', 'chamber', 6),
  ]

  it('selects a trader sponsor and a different-household stakeholder', () => {
    const pick = selectLostTreasureExpeditionNpcs([
      npc('home:npc:0', 'farmer', 'house-a'),
      npc('home:npc:1', 'trader', 'house-b'),
      npc('home:npc:2', 'guard', 'house-a'),
    ])
    expect(pick?.sponsor.id).toBe('home:npc:1')
    expect(pick?.stakeholder?.id).toBe('home:npc:0')
  })

  it('falls back to a miner sponsor and a neighbor stakeholder', () => {
    const pick = selectLostTreasureExpeditionNpcs(
      [npc('home:npc:0', 'miner', 'house-a'), npc('home:npc:1', 'farmer', 'house-a')],
      new Map([['1_0', [npc('1_0:npc:0', 'farmer', 'house-x')]]]),
    )
    expect(pick?.sponsor.id).toBe('home:npc:0')
    expect(pick?.stakeholder?.id).toBe('1_0:npc:0')
  })

  it('exposes only two outcomes when no distinct-household stakeholder exists', () => {
    const pick = selectLostTreasureExpeditionNpcs([
      npc('home:npc:0', 'trader', 'house-a'),
      npc('home:npc:1', 'farmer', 'house-a'),
    ])
    expect(pick?.sponsor.id).toBe('home:npc:0')
    expect(pick?.stakeholder).toBeUndefined()
  })

  it('orders the storyFind trail from shallow to deep and requires an unclaimed finalTreasure', () => {
    const eligible = eligibleLostTreasureExpeditionCaves(
      [dungeonId, 'cave:natural'],
      (caveId) => (caveId === dungeonId ? 'dungeon' : 'natural'),
      dungeonChambersOf,
      anchors,
    )
    expect(eligible).toHaveLength(1)
    expect(eligible[0]!.campAnchor.sourceNodeId).toBe('dungeon-chamber-2')
    expect(eligible[0]!.journalAnchor.sourceNodeId).toBe('dungeon-chamber-3')
    expect(eligible[0]!.evidenceAnchor.sourceNodeId).toBe('dungeon-final-chamber')
    expect(eligible[0]!.finalTreasureAnchor.role).toBe('finalTreasure')
  })

  it('is ineligible when the storyFind trail is too short', () => {
    const shortAnchors = anchors.filter((a) => (
      a.role !== 'storyFind' || (a.sourceNodeId !== 'dungeon-final-chamber' && a.sourceNodeId !== 'dungeon-deep-chamber')
    ))
    const eligible = eligibleLostTreasureExpeditionCaves(
      [dungeonId],
      () => 'dungeon',
      dungeonChambersOf,
      shortAnchors,
    )
    expect(eligible).toHaveLength(0)
  })

  it('resolves deterministically', () => {
    const input = {
      worldSeed: 13,
      settlementId: 'home',
      homeNpcs: [npc('home:npc:0', 'trader', 'house-a'), npc('home:npc:1', 'farmer', 'house-b')],
      caveIds: [dungeonId],
      archetypeOf: () => 'dungeon' as const,
      dungeonChambersOf,
      contentAnchors: anchors,
    }
    const first = resolveLostTreasureExpeditionBinding(input)
    const second = resolveLostTreasureExpeditionBinding(input)
    expect(first).toEqual(second)
    expect(first?.caveId).toBe(dungeonId)
    expect(first?.stakeholderNpcId).toBe('home:npc:1')
  })

  it('materializes journal instance only in the leader-pack container and suppresses reseed', () => {
    const binding = resolveLostTreasureExpeditionBinding({
      worldSeed: 3,
      settlementId: 'home',
      homeNpcs: [npc('home:npc:0', 'trader', 'house-a'), npc('home:npc:1', 'farmer', 'house-b')],
      caveIds: [dungeonId],
      archetypeOf: () => 'dungeon',
      dungeonChambersOf,
      contentAnchors: anchors,
    })!
    const specs = lostTreasureExpeditionContainerSpecs(binding, anchors)
    expect(specs).toHaveLength(4)
    const journalSpec = specs.find((spec) => spec.id === binding.journalContainerId)!
    expect(journalSpec.initialInstances?.map((i) => i.id)).toEqual([binding.journalInstanceId])
    expect(specs.filter((spec) => spec.id !== binding.journalContainerId)
      .every((spec) => !spec.initialInstances?.length)).toBe(true)

    const scene = new Scene()
    const fresh = createWorldGeneratedContainers(scene, () => 0, [journalSpec])
    expect(fresh.containerInstances(journalSpec.id, 'expedition_journal')[0]?.id).toBe(binding.journalInstanceId)
    const looted = createWorldGeneratedContainers(scene, () => 0, [journalSpec], [{
      id: journalSpec.id,
      x: journalSpec.x,
      z: journalSpec.z,
      yaw: journalSpec.yaw,
      counts: { coin: 1 },
      instances: [],
    }])
    expect(looted.containerInstances(journalSpec.id, 'expedition_journal')).toEqual([])
    fresh.dispose()
    looted.dispose()
  })

  it('tracks the journal by exact instance identity', () => {
    const journalId = lostTreasureExpeditionJournalInstanceId(dungeonId)
    const journal = createLostTreasureExpeditionJournalInstance(dungeonId)
    expect(isLostTreasureExpeditionJournalPackLooted([journal], journalId)).toBe(false)
    expect(isLostTreasureExpeditionJournalPackLooted([], journalId)).toBe(true)

    const player = new Inventory({}, 100, [journal])
    expect(player.getInstance(journalId)?.kind).toBe('expedition_journal')
  })

  it('builds family / sponsor / keep outcomes and the ordered loot stages', () => {
    const binding = resolveLostTreasureExpeditionBinding({
      worldSeed: 5,
      settlementId: 'home',
      homeNpcs: [npc('home:npc:0', 'trader', 'house-a'), npc('home:npc:1', 'farmer', 'house-b')],
      caveIds: [dungeonId],
      archetypeOf: () => 'dungeon',
      dungeonChambersOf,
      contentAnchors: anchors,
    })!
    const def = buildLostTreasureExpeditionQuest(binding, [
      npc('home:npc:0', 'trader', 'house-a'),
      npc('home:npc:1', 'farmer', 'house-b'),
    ], 'Osada', 'stary loch na wschód od osady')
    expect(def.offerLine).toContain('stary loch na wschód od osady')
    expect(`${def.offerLine} ${def.description} ${def.stages[0]?.progressLine}`).not.toMatch(/konkretn|dokładny loch/)
    expect(def.outcomes.map((outcome) => outcome.id)).toEqual([
      LOST_TREASURE_EXPEDITION_JOURNAL_TO_FAMILY_OUTCOME,
      LOST_TREASURE_EXPEDITION_JOURNAL_TO_SPONSOR_OUTCOME,
      LOST_TREASURE_EXPEDITION_KEEP_JOURNAL_OUTCOME,
    ])
    const lootContainerIds = def.stages
      .map((stage) => stage.objective)
      .filter((objective) => objective.type === 'loot_world_container')
      .map((objective) => (objective as { containerId: string }).containerId)
    expect(lootContainerIds).toEqual([
      binding.campContainerId,
      binding.journalContainerId,
      binding.evidenceContainerId,
      binding.finalTreasureContainerId,
    ])
  })

  it('reduces to sponsor / keep outcomes when no second stakeholder exists', () => {
    const binding = resolveLostTreasureExpeditionBinding({
      worldSeed: 5,
      settlementId: 'home',
      homeNpcs: [npc('home:npc:0', 'trader', 'house-a')],
      caveIds: [dungeonId],
      archetypeOf: () => 'dungeon',
      dungeonChambersOf,
      contentAnchors: anchors,
    })!
    expect(binding.stakeholderNpcId).toBeUndefined()
    const def = buildLostTreasureExpeditionQuest(binding, [npc('home:npc:0', 'trader', 'house-a')], 'Osada', 'stary loch poza osadą')
    expect(def.outcomes.map((outcome) => outcome.id)).toEqual([
      LOST_TREASURE_EXPEDITION_JOURNAL_TO_SPONSOR_OUTCOME,
      LOST_TREASURE_EXPEDITION_KEEP_JOURNAL_OUTCOME,
    ])
  })

  it('coexists with quest 026 on the same dungeon through disjoint anchor claims', () => {
    const banditBinding = resolveDungeonBanditTreasureBinding({
      worldSeed: 9,
      settlementId: 'home',
      homeNpcs: [npc('home:npc:0', 'guard', 'house-a'), npc('home:npc:1', 'trader', 'house-b')],
      caveIds: [dungeonId],
      archetypeOf: () => 'dungeon',
      contentAnchors: anchors,
    })!
    const expeditionBinding = resolveLostTreasureExpeditionBinding({
      worldSeed: 9,
      settlementId: 'home',
      homeNpcs: [npc('home:npc:0', 'guard', 'house-a'), npc('home:npc:1', 'trader', 'house-b')],
      caveIds: [dungeonId],
      archetypeOf: () => 'dungeon',
      dungeonChambersOf,
      contentAnchors: anchors,
    })!
    const policy = resolveCaveAdventureContentPolicy([], anchors, {
      anchorClaims: [
        ...(dungeonBanditCaveReservationRequests(banditBinding).anchorClaims ?? []),
        ...(lostTreasureExpeditionCaveReservationRequests(expeditionBinding).anchorClaims ?? []),
      ],
    })
    expect(policy.unresolved).toEqual([])
    expect(policy.claimOf(DUNGEON_BANDIT_DEEP_RESERVATION_KEY)?.anchorId).toBe(banditBinding.deepLootAnchorId)
    expect(policy.claimOf(LOST_TREASURE_EXPEDITION_FINAL_RESERVATION_KEY)?.anchorId).toBe(
      expeditionBinding.finalTreasureAnchorId,
    )
    expect(lostTreasureExpeditionClaimsMatch(expeditionBinding, (key) => policy.claimOf(key))).toBe(true)
  })
})
