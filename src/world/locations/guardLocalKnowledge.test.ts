import { describe, expect, it } from 'vitest'
import type { NpcPlayerFollowUp, NpcWorldKnowledgeFollowUpSource } from '../../ai/npcPlayerFollowUp'
import type { WorldKnowledgeRef, WorldKnowledgeResearch } from './worldKnowledgeResearch'
import type { WorldLocation } from './worldLocationTypes'
import { aboutAreaLine } from '../../ai/dialogueTemplates'
import { armNpcPlayerFollowUp } from '../../ai/npcPlayerFollowUp'
import {
  createGuardLocalKnowledge,
  GUARD_AREA_RESEARCH_PENDING,
  GUARD_AREA_RESEARCH_READY,
  GUARD_AREA_RESEARCH_STARTED,
  GUARD_LOCAL_KNOWLEDGE_DELAY_DAYS,
} from './guardLocalKnowledge'
import { createLocationKnowledge } from './locationKnowledge'

const GUARD_SOURCE: NpcWorldKnowledgeFollowUpSource = { kind: 'guard' }
const NPC_A = 'settlement:home:npc:0'
const NPC_B = 'settlement:home:npc:1'

function loc(id: string, kind: WorldLocation['kind'] = 'cemetery'): WorldLocation {
  return { id, kind, x: 10, z: 20, name: id, discoveryWeight: 0.8 }
}

function fakeResearch(hits: WorldKnowledgeRef[] | (() => Promise<WorldKnowledgeRef[]>)): WorldKnowledgeResearch & { calls: number } {
  const research = {
    calls: 0,
    resolve: async () => hits instanceof Array ? hits[0] ?? null : (await hits())[0] ?? null,
    resolveMany: async () => {
      research.calls += 1
      return hits instanceof Array ? hits : hits()
    },
    invalidate() {},
    dispose() {},
  }
  return research
}

/** Minimal in-memory authoritative-state stand-in so `armFollowUp` can be
 *  exercised without constructing a full `NpcStateRegistry`. */
function fakeFollowUpHost(npcIds: readonly string[]) {
  const byId = new Map(npcIds.map((id) => [id, { playerFollowUp: null as NpcPlayerFollowUp | null, health: { dead: false }, postDeath: null }]))
  return {
    armFollowUp: (
      npcId: string,
      followUp: { createdAtDays: number, source: NpcWorldKnowledgeFollowUpSource, selectedLocationIds: string[] },
    ) => {
      const state = byId.get(npcId)
      if (!state) return null
      return armNpcPlayerFollowUp(state, { kind: 'deliver_world_knowledge', ...followUp }, npcId)
    },
    get: (npcId: string) => byId.get(npcId),
  }
}

describe('createGuardLocalKnowledge (plan quests-progression-047 / npc-050)', () => {
  it('returns immediately with research dialogue and does not duplicate in-flight work', async () => {
    let resolveHits: ((hits: WorldKnowledgeRef[]) => void) | undefined
    const research = fakeResearch(() => new Promise<WorldKnowledgeRef[]>((resolve) => {
      resolveHits = resolve
    }))
    const knowledge = createLocationKnowledge()
    const host = fakeFollowUpHost([NPC_A])
    const guard = createGuardLocalKnowledge({
      research,
      getElapsedDays: () => 0,
      getWorldSeed: () => 1,
      locationKnowledge: knowledge,
      getLocation: (id) => loc(id),
      listStableLocations: () => [],
      nearestSettlements: () => [],
      homeLocationId: () => 'settlement:home',
      armFollowUp: host.armFollowUp,
    })
    expect(guard.askAboutArea(NPC_A, 0, 0, GUARD_SOURCE)).toBe(GUARD_AREA_RESEARCH_STARTED)
    expect(guard.askAboutArea(NPC_A, 0, 0, GUARD_SOURCE)).toBe(GUARD_AREA_RESEARCH_PENDING)
    expect(research.calls).toBe(1)
    resolveHits!([{ type: 'landmark', id: 'cemetery:a:home:1', kind: 'cemetery', x: 10, z: 20 }])
    await Promise.resolve()
    expect(guard.askAboutArea(NPC_A, 0, 0, GUARD_SOURCE)).toBe(GUARD_AREA_RESEARCH_PENDING)
  })

  it('arms the asking NPC follow-up instead of revealing directly once research + delay resolve', async () => {
    const research = fakeResearch([
      { type: 'landmark', id: 'cemetery:a:one:1', kind: 'cemetery', x: 10, z: 20 },
      { type: 'landmark', id: 'cemetery:a:two:1', kind: 'cemetery', x: 12, z: 22 },
    ])
    const knowledge = createLocationKnowledge()
    let days = 0
    const host = fakeFollowUpHost([NPC_A])
    const guard = createGuardLocalKnowledge({
      research,
      getElapsedDays: () => days,
      getWorldSeed: () => 9,
      locationKnowledge: knowledge,
      getLocation: (id) => loc(id),
      listStableLocations: () => [],
      nearestSettlements: () => [],
      homeLocationId: () => 'settlement:home',
      armFollowUp: host.armFollowUp,
    })
    expect(guard.askAboutArea(NPC_A, 0, 0, GUARD_SOURCE)).toBe(GUARD_AREA_RESEARCH_STARTED)
    await Promise.resolve()
    // Worker resolved but the authored delay has not elapsed yet — must not arm.
    expect(guard.askAboutArea(NPC_A, 0, 0, GUARD_SOURCE)).toBe(GUARD_AREA_RESEARCH_PENDING)
    expect(host.get(NPC_A)?.playerFollowUp).toBeNull()
    expect(knowledge.list()).toHaveLength(0)

    days = GUARD_LOCAL_KNOWLEDGE_DELAY_DAYS
    expect(guard.askAboutArea(NPC_A, 0, 0, GUARD_SOURCE)).toBe(GUARD_AREA_RESEARCH_READY)
    // Locations are not revealed by this service — delivery owns that.
    expect(knowledge.list()).toHaveLength(0)
    const armed = host.get(NPC_A)?.playerFollowUp
    expect(armed?.kind).toBe('deliver_world_knowledge')
    expect(armed?.selectedLocationIds.length).toBeGreaterThan(0)

    // Idempotent — a second ask before delivery does not re-arm/duplicate.
    const before = armed
    guard.askAboutArea(NPC_A, 0, 0, GUARD_SOURCE)
    expect(host.get(NPC_A)?.playerFollowUp).toEqual(before)
  })

  it('the authored delay elapsing before the worker resolves does not arm early', async () => {
    let resolveHits: ((hits: WorldKnowledgeRef[]) => void) | undefined
    const research = fakeResearch(() => new Promise<WorldKnowledgeRef[]>((resolve) => {
      resolveHits = resolve
    }))
    let days = 0
    const host = fakeFollowUpHost([NPC_A])
    const guard = createGuardLocalKnowledge({
      research,
      getElapsedDays: () => days,
      getWorldSeed: () => 1,
      locationKnowledge: createLocationKnowledge(),
      getLocation: (id) => loc(id),
      listStableLocations: () => [],
      nearestSettlements: () => [],
      homeLocationId: () => 'settlement:home',
      armFollowUp: host.armFollowUp,
    })
    guard.askAboutArea(NPC_A, 0, 0, GUARD_SOURCE)
    days = GUARD_LOCAL_KNOWLEDGE_DELAY_DAYS + 1
    // Still requested — worker has not resolved yet.
    expect(guard.askAboutArea(NPC_A, 0, 0, GUARD_SOURCE)).toBe(GUARD_AREA_RESEARCH_PENDING)
    expect(host.get(NPC_A)?.playerFollowUp).toBeNull()
    resolveHits!([{ type: 'landmark', id: 'cemetery:a:one:1', kind: 'cemetery', x: 10, z: 20 }])
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(guard.askAboutArea(NPC_A, 0, 0, GUARD_SOURCE)).toBe(GUARD_AREA_RESEARCH_READY)
    expect(host.get(NPC_A)?.playerFollowUp).not.toBeNull()
  })

  it('two different asking NPCs never share one request/result', async () => {
    const research = fakeResearch([{ type: 'landmark', id: 'cemetery:a:one:1', kind: 'cemetery', x: 10, z: 20 }])
    let days = 0
    const host = fakeFollowUpHost([NPC_A, NPC_B])
    const guard = createGuardLocalKnowledge({
      research,
      getElapsedDays: () => days,
      getWorldSeed: () => 1,
      locationKnowledge: createLocationKnowledge(),
      getLocation: (id) => loc(id),
      listStableLocations: () => [],
      nearestSettlements: () => [],
      homeLocationId: () => 'settlement:home',
      armFollowUp: host.armFollowUp,
    })
    expect(guard.askAboutArea(NPC_A, 0, 0, GUARD_SOURCE)).toBe(GUARD_AREA_RESEARCH_STARTED)
    await Promise.resolve()
    days = GUARD_LOCAL_KNOWLEDGE_DELAY_DAYS
    expect(guard.askAboutArea(NPC_A, 0, 0, GUARD_SOURCE)).toBe(GUARD_AREA_RESEARCH_READY)
    expect(host.get(NPC_A)?.playerFollowUp).not.toBeNull()
    expect(host.get(NPC_B)?.playerFollowUp).toBeNull()
    // NPC B's own cold ask starts its own independent request.
    expect(guard.askAboutArea(NPC_B, 5, 5, { kind: 'hunter' })).toBe(GUARD_AREA_RESEARCH_STARTED)
  })

  it('restores a pending wait without starting a second logical research slot', () => {
    const research = fakeResearch([])
    const host = fakeFollowUpHost([NPC_A])
    const guard = createGuardLocalKnowledge({
      research,
      getElapsedDays: () => 0.01,
      getWorldSeed: () => 1,
      locationKnowledge: createLocationKnowledge(),
      getLocation: (id) => loc(id),
      listStableLocations: () => [],
      nearestSettlements: () => [],
      homeLocationId: () => 'settlement:home',
      armFollowUp: host.armFollowUp,
    })
    guard.restore({
      [NPC_A]: {
        status: 'requested',
        requestedAtDays: 0,
        revealAtDays: GUARD_LOCAL_KNOWLEDGE_DELAY_DAYS,
        originX: 3,
        originZ: 4,
      },
    })
    expect(guard.askAboutArea(NPC_A, 99, 99, GUARD_SOURCE)).toBe(GUARD_AREA_RESEARCH_PENDING)
    expect(research.calls).toBe(1)
    expect(guard.serialize()).toMatchObject({ [NPC_A]: { status: 'requested', originX: 3, originZ: 4 } })
  })

  it('can mention already-known local knowledge without starting research', () => {
    const research = fakeResearch([])
    const knowledge = createLocationKnowledge([{ id: 'cave:home-cave-0', state: 'discovered', source: 'exploration' }])
    const cave = loc('cave:home-cave-0', 'cave')
    const host = fakeFollowUpHost([NPC_A])
    const guard = createGuardLocalKnowledge({
      research,
      getElapsedDays: () => 0,
      getWorldSeed: () => 2,
      locationKnowledge: knowledge,
      getLocation: (id) => id === cave.id ? cave : null,
      listStableLocations: () => [cave],
      nearestSettlements: () => [],
      homeLocationId: () => 'settlement:home',
      armFollowUp: host.armFollowUp,
    })
    expect(guard.askAboutArea(NPC_A, 10, 20, GUARD_SOURCE)).toBe(aboutAreaLine([cave.name]))
    expect(research.calls).toBe(0)
  })
})
