import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import type { CaveContentAnchor } from '../world/caves/caveContentAnchors'
import type { OpportunityNpc } from './opportunities/worldQuestOpportunityTypes'
import { Inventory } from '../items/Inventory'
import { CaveAuthoredAnchorClaims } from '../world/caves/caveAuthoredAnchorClaims'
import { createWorldGeneratedContainers } from '../world/worldGeneratedContainers'
import { materializeRpgQuestOpportunity } from './opportunities/rpgQuestMaterialization'
import {
  collectSuspiciousTransportCandidate,
  rpgQuestId,
} from './opportunities/rpgQuestMatrices'
import { QuestManager } from './QuestManager'
import { validateQuestDefinitions } from './quests'
import {
  buildSuspiciousTransportCaveCacheQuest,
  createSuspiciousTransportEvidenceInstance,
  isSuspiciousTransportCacheLooted,
  resolveSuspiciousTransportCaveCacheBinding,
  SUSPICIOUS_TRANSPORT_EVIDENCE_KIND,
  SUSPICIOUS_TRANSPORT_KEEP_GOODS_OUTCOME,
  SUSPICIOUS_TRANSPORT_KEEP_QUIET_OUTCOME,
  SUSPICIOUS_TRANSPORT_REPORT_IT_OUTCOME,
  suspiciousTransportCacheContainerId,
  suspiciousTransportCacheContainerSpec,
  suspiciousTransportEvidenceInstanceId,
} from './suspiciousTransportCaveCache'

const trader: OpportunityNpc = { id: 'home:npc:0', name: 'Kasia', role: 'trader', child: false }
const hunter: OpportunityNpc = { id: 'home:npc:1', name: 'Jan', role: 'hunter', child: false }
const guard: OpportunityNpc = { id: 'home:npc:2', name: 'Marek', role: 'guard', child: false }
const child: OpportunityNpc = { id: 'home:npc:3', name: 'Olek', role: 'farmer', child: true }
const homeNpcs = [trader, hunter, child, guard]

const neighborAdult: OpportunityNpc = { id: '1_0:npc:0', name: 'Anna', role: 'farmer', child: false }
const neighborHunter: OpportunityNpc = { id: '1_0:npc:1', name: 'Jan', role: 'hunter', child: false }
const neighborGuard: OpportunityNpc = { id: '1_0:npc:2', name: 'Marek', role: 'guard', child: false }
const neighborNpcs = [neighborAdult, neighborHunter, neighborGuard]

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
    y: 11,
    z: 6,
    yaw: 0.2,
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
    x: 8,
    y: 13,
    z: 9,
    yaw: 0.5,
  },
]

function speak(qm: QuestManager, npcId: string, actionIndex = 0): void {
  const override = qm.onInteract(npcId)
  override?.actions?.[actionIndex]?.onSelect()
}

function accept(qm: QuestManager, npcId: string): void {
  qm.onInteract(npcId)?.offer?.onAccept()
}

describe('suspicious transport natural cave cache (plan quests-progression-024)', () => {
  it('reconstructs the same variant, giver, receiver, cave, anchor and container ids', () => {
    const input = {
      worldSeed: 99,
      settlementId: 'home',
      npcs: homeNpcs,
      caveIds: ['cave-a', 'cave-b'],
      archetypeOf: (caveId: string) => (
        caveId === 'cave-a' || caveId === 'cave-b' ? 'natural' as const : 'adventure' as const
      ),
      contentAnchors: anchors,
      claims: new CaveAuthoredAnchorClaims(),
    }
    const first = resolveSuspiciousTransportCaveCacheBinding(input)
    const second = resolveSuspiciousTransportCaveCacheBinding({
      ...input,
      claims: new CaveAuthoredAnchorClaims(),
    })
    expect(first).not.toBeNull()
    expect(second).toEqual(first)
    expect(first?.questId).toBe(rpgQuestId('suspicious-transport', 'home', guard.id))
    expect(first?.giverNpcId).toBe(trader.id)
    expect(first?.counterpartNpcId).toBe(guard.id)
    expect(first?.cacheContainerId).toBe(suspiciousTransportCacheContainerId(first!.lootAnchorId))
    expect(first?.evidenceInstanceId).toBe(suspiciousTransportEvidenceInstanceId(first!.caveId))
    expect(first?.caveLocationId).toBe(`cave:${first!.caveId}`)
  })

  it('uses only natural loot anchors and skips 023 story+loot claims', () => {
    const claims = new CaveAuthoredAnchorClaims()
    claims.tryClaimNaturalStoryPair('cave-a:storyFind:chamber', 'cave-a:loot:chamber')
    const binding = resolveSuspiciousTransportCaveCacheBinding({
      worldSeed: 1,
      settlementId: 'home',
      npcs: homeNpcs,
      caveIds: ['cave-a', 'cave-b', 'cave-adv'],
      archetypeOf: (caveId) => (caveId === 'cave-adv' ? 'adventure' : 'natural'),
      contentAnchors: [
        ...anchors,
        {
          id: 'cave-adv:loot:chamber',
          caveId: 'cave-adv',
          role: 'loot',
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
        },
      ],
      claims,
    })
    expect(binding?.caveId).toBe('cave-b')
    expect(binding?.lootAnchorId).toBe('cave-b:loot:chamber')
    expect(claims.isClaimed('cave-b:loot:chamber')).toBe(true)
  })

  it('skips the variant when every natural loot anchor is already claimed', () => {
    const claims = new CaveAuthoredAnchorClaims()
    claims.tryClaimNaturalStoryPair('cave-a:storyFind:chamber', 'cave-a:loot:chamber')
    claims.tryClaimAnchor('cave-b:loot:chamber')
    expect(resolveSuspiciousTransportCaveCacheBinding({
      worldSeed: 1,
      settlementId: 'home',
      npcs: homeNpcs,
      caveIds: ['cave-a', 'cave-b'],
      archetypeOf: () => 'natural',
      contentAnchors: anchors,
      claims,
    })).toBeNull()
  })

  it('creates the cache at exact cave Y before acceptance', () => {
    const binding = resolveSuspiciousTransportCaveCacheBinding({
      worldSeed: 1,
      settlementId: 'home',
      npcs: homeNpcs,
      caveIds: ['cave-a'],
      archetypeOf: () => 'natural',
      contentAnchors: anchors,
      claims: new CaveAuthoredAnchorClaims(),
    })!
    const loot = anchors.find((anchor) => anchor.id === binding.lootAnchorId)!
    const spec = suspiciousTransportCacheContainerSpec(binding, loot)
    expect(spec.y).toBe(loot.y)
    expect(spec.spatialContext).toEqual({ kind: 'cave', caveId: binding.caveId })
    expect(spec.initialCounts).toEqual({ iron_rod: 2, bandage: 1 })
    expect(spec.initialInstances).toEqual([createSuspiciousTransportEvidenceInstance(binding.caveId)])
  })

  it('does not reseed a saved or early-looted cache', () => {
    const evidence = createSuspiciousTransportEvidenceInstance('cave-a')
    const scene = new Scene()
    const spec = {
      id: 'cache-test',
      kind: 'chest' as const,
      x: 0,
      z: 0,
      yaw: 0,
      initialCounts: { iron_rod: 2 },
      initialInstances: [evidence],
      y: 11,
      spatialContext: { kind: 'cave' as const, caveId: 'cave-a' },
    }
    const fresh = createWorldGeneratedContainers(scene, () => 0, [spec])
    expect(fresh.containerInstances('cache-test', SUSPICIOUS_TRANSPORT_EVIDENCE_KIND)).toEqual([evidence])
    const looted = createWorldGeneratedContainers(scene, () => 0, [spec], [{
      id: 'cache-test',
      x: 0,
      z: 0,
      yaw: 0,
      counts: { iron_rod: 2 },
      instances: [],
    }])
    expect(looted.containerInstances('cache-test', SUSPICIOUS_TRANSPORT_EVIDENCE_KIND)).toEqual([])
    fresh.dispose()
    looted.dispose()
  })

  it('tracks loot by the distinctive evidence instance', () => {
    const evidenceId = suspiciousTransportEvidenceInstanceId('cave-a')
    const evidence = createSuspiciousTransportEvidenceInstance('cave-a')
    expect(isSuspiciousTransportCacheLooted([evidence], evidenceId)).toBe(false)
    expect(isSuspiciousTransportCacheLooted([], evidenceId)).toBe(true)
    expect(isSuspiciousTransportCacheLooted(
      [{ id: 'quest:suspicious-transport:other:damascus_knife' }],
      evidenceId,
    )).toBe(true)
  })

  it('keeps the same matrix quest id and reveal_location on the trader stage', () => {
    const candidate = collectSuspiciousTransportCandidate({
      settlementId: 'home',
      npcs: homeNpcs,
    })!
    const binding = resolveSuspiciousTransportCaveCacheBinding({
      worldSeed: 1,
      settlementId: 'home',
      npcs: homeNpcs,
      caveIds: ['cave-a'],
      archetypeOf: () => 'natural',
      contentAnchors: anchors,
      claims: new CaveAuthoredAnchorClaims(),
    })!
    expect(candidate.id).toBe(binding.questId)
    const caveDef = materializeRpgQuestOpportunity(candidate, homeNpcs, 'Dolina', {
      npcsBySettlement: new Map(),
      settlementNameById: new Map(),
      suspiciousTransportCaveCache: binding,
    })!
    expect(() => validateQuestDefinitions([caveDef])).not.toThrow()
    expect(caveDef.id).toBe(candidate.id)
    expect(caveDef.stages[0]?.effects).toEqual([{
      type: 'reveal_location',
      locationId: 'cave:cave-a',
      setNavigation: true,
    }])
    expect(caveDef.stages[1]?.objective).toEqual({
      type: 'loot_world_container',
      containerId: binding.cacheContainerId,
    })
    expect(caveDef.outcomes.map((outcome) => outcome.id)).toEqual([
      SUSPICIOUS_TRANSPORT_KEEP_QUIET_OUTCOME,
      SUSPICIOUS_TRANSPORT_REPORT_IT_OUTCOME,
      SUSPICIOUS_TRANSPORT_KEEP_GOODS_OUTCOME,
    ])
    const terminal = caveDef.stages[2]
    expect(terminal?.dialogueActions?.[0]?.playerLine).toBe(
      'Oddaję ci przesyłkę i zataję ten układ. Nikomu nie powiem.',
    )
    expect(terminal?.dialogueActions?.[1]?.playerLine).toBe(
      'Znalazłem przesyłkę Kasia. Oddaję ci dowód i zgłaszam ten układ.',
    )
  })

  it('leaves the dialogue-only matrix unchanged when no cave binding matches', () => {
    const candidate = collectSuspiciousTransportCandidate({
      settlementId: '1_0',
      npcs: neighborNpcs,
    })!
    const def = materializeRpgQuestOpportunity(candidate, neighborNpcs, 'Lasowa')!
    expect(def.id).toBe(candidate.id)
    expect(def.stages[0]?.objective).toEqual({ type: 'talk_to_npc', npc: { npcId: neighborGuard.id } })
    expect(def.stages[1]?.objective.type).toBe('talk_to_npc_choice')
    expect(def.outcomes.map((outcome) => outcome.id)).toEqual(['keep_quiet', 'report_it'])
  })

  it('reveals cave:<caveId> once and catches up an already-looted cache', () => {
    const binding = resolveSuspiciousTransportCaveCacheBinding({
      worldSeed: 1,
      settlementId: 'home',
      npcs: homeNpcs,
      caveIds: ['cave-a'],
      archetypeOf: () => 'natural',
      contentAnchors: anchors,
      claims: new CaveAuthoredAnchorClaims(),
    })!
    const def = buildSuspiciousTransportCaveCacheQuest(binding, trader, guard, 'Dolina')
    const revealed: string[] = []
    const inventory = new Inventory()
    const qm = new QuestManager(
      [def],
      undefined,
      inventory,
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
      {
        hasReadItem: () => false,
        hasDiscoveredLocation: () => false,
        isWorldContainerLooted: (containerId) => containerId === binding.cacheContainerId,
        hasResolvedHiddenFindSpot: () => false,
        hasAcquiredPortableContainer: () => false,
      },
      undefined,
      undefined,
      undefined,
      undefined,
      { canResolve: () => false, onResolve: () => {} },
      { revealLocation: (locationId) => revealed.push(locationId) },
    )
    accept(qm, trader.id)
    speak(qm, trader.id)
    expect(revealed).toEqual(['cave:cave-a'])
    // Talking again on the `loot_world_container` stage doesn't re-reveal —
    // this stage has no talk-driven action, only the generic active-quest
    // opt-out (plan quests-progression-033), which this poke must not select.
    qm.onInteract(trader.id)
    expect(revealed).toEqual(['cave:cave-a'])
    qm.pollWorldProgressionObjectives()
    expect(qm.exportProgress()[0]?.stageIndex).toBe(2)
    expect(qm.getState(def.id)).toBe('active')
  })

  it('cannot resolve a hand-in without the physical evidence instance', () => {
    const binding = resolveSuspiciousTransportCaveCacheBinding({
      worldSeed: 1,
      settlementId: 'home',
      npcs: homeNpcs,
      caveIds: ['cave-a'],
      archetypeOf: () => 'natural',
      contentAnchors: anchors,
      claims: new CaveAuthoredAnchorClaims(),
    })!
    const def = buildSuspiciousTransportCaveCacheQuest(binding, trader, guard, 'Dolina')
    const inventory = new Inventory()
    const transferred: string[] = []
    const qm = new QuestManager(
      [def],
      undefined,
      inventory,
      {
        progress: [{ id: def.id, state: 'active', stageIndex: 2 }],
        relations: {},
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
      {
        canResolve: (_questId, _outcomeId, context) => {
          const requiredId = context.requireItemInstanceId ?? binding.evidenceInstanceId
          return inventory.getInstance(requiredId)?.kind === SUSPICIOUS_TRANSPORT_EVIDENCE_KIND
        },
        onResolve: (_questId, outcomeId) => {
          if (outcomeId === SUSPICIOUS_TRANSPORT_KEEP_GOODS_OUTCOME) return
          const evidence = inventory.getInstance(binding.evidenceInstanceId)
          if (!evidence) return
          inventory.removeInstance(evidence.id)
          transferred.push(outcomeId)
        },
      },
    )
    expect(qm.onInteract(trader.id)?.actions).toBeUndefined()
    expect(qm.onInteract(guard.id)?.actions).toBeUndefined()
    inventory.addInstance(createSuspiciousTransportEvidenceInstance(binding.caveId))
    const traderActions = qm.onInteract(trader.id)
    expect(traderActions?.actions?.map((action) => action.label)).toEqual([
      'Oddaję ci przesyłkę i zataję ten układ. Nikomu nie powiem.',
      'Zostawiam tę rzecz sobie. Nikomu jej nie oddam.',
    ])
    traderActions?.actions?.[0]?.onSelect()
    expect(qm.getState(def.id)).toBe('complete')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe(SUSPICIOUS_TRANSPORT_KEEP_QUIET_OUTCOME)
    expect(inventory.getInstance(binding.evidenceInstanceId)).toBeNull()
    expect(transferred).toEqual([SUSPICIOUS_TRANSPORT_KEEP_QUIET_OUTCOME])
  })

  it('keep_goods preserves the exact instance and does not duplicate a reward', () => {
    const binding = resolveSuspiciousTransportCaveCacheBinding({
      worldSeed: 1,
      settlementId: 'home',
      npcs: homeNpcs,
      caveIds: ['cave-a'],
      archetypeOf: () => 'natural',
      contentAnchors: anchors,
      claims: new CaveAuthoredAnchorClaims(),
    })!
    const def = buildSuspiciousTransportCaveCacheQuest(binding, trader, guard, 'Dolina')
    const evidence = createSuspiciousTransportEvidenceInstance(binding.caveId)
    const inventory = new Inventory({}, Infinity, [evidence])
    const granted: Array<{ kind: string, count: number }> = []
    const qm = new QuestManager(
      [def],
      undefined,
      inventory,
      {
        progress: [{ id: def.id, state: 'active', stageIndex: 2 }],
        relations: {},
      },
      (kind, count) => granted.push({ kind, count }),
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
      {
        canResolve: () => inventory.getInstance(binding.evidenceInstanceId)?.kind === SUSPICIOUS_TRANSPORT_EVIDENCE_KIND,
        onResolve: () => {},
      },
    )
    const keep = qm.onInteract(guard.id)?.actions?.find(
      (action) => action.label === 'Zostawiam tę rzecz sobie. Nikomu jej nie oddam.',
    )
    keep?.onSelect()
    expect(qm.getState(def.id)).toBe('complete')
    expect(qm.exportProgress()[0]?.resolvedOutcomeId).toBe(SUSPICIOUS_TRANSPORT_KEEP_GOODS_OUTCOME)
    expect(inventory.getInstance(binding.evidenceInstanceId)).toEqual(evidence)
    expect(granted).toEqual([])
  })
})
