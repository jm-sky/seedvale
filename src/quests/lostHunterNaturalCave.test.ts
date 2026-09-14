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
  lostHunterBowInstanceId,
  lostHunterPackContainerId,
  resolveLostHunterNaturalCaveBinding,
  selectLostHunterNpcs,
} from './lostHunterNaturalCave'

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
    ], 'Osada')
    expect(quest.stages[0]?.effects).toEqual([{
      type: 'reveal_location',
      locationId: 'cave:cave-a',
      setNavigation: true,
    }])
    expect(quest.stages[3]?.dialogueActions?.[1]?.requireItemInstanceId).toBe(binding!.bowInstanceId)
    expect(quest.outcomes.find((outcome) => outcome.id === 'return_bow_to_family')?.effects).toEqual([{
      type: 'transfer_item_instance',
      instanceId: binding!.bowInstanceId,
      toNpc: { npcId: binding!.giverNpcId },
    }])
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
