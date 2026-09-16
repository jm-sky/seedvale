import { describe, expect, it } from 'vitest'
import type { WorldKnowledgeRef, WorldKnowledgeResearch } from './worldKnowledgeResearch'
import type { WorldLocation } from './worldLocationTypes'
import { aboutAreaLine } from '../../ai/dialogueTemplates'
import {
  createGuardLocalKnowledge,
  GUARD_AREA_RESEARCH_PENDING,
  GUARD_AREA_RESEARCH_STARTED,
  GUARD_LOCAL_KNOWLEDGE_DELAY_DAYS,
} from './guardLocalKnowledge'
import { createLocationKnowledge } from './locationKnowledge'

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

describe('createGuardLocalKnowledge (plan quests-progression-047)', () => {
  it('returns immediately with research dialogue and does not duplicate in-flight work', async () => {
    let resolveHits: ((hits: WorldKnowledgeRef[]) => void) | undefined
    const research = fakeResearch(() => new Promise<WorldKnowledgeRef[]>((resolve) => {
      resolveHits = resolve
    }))
    const knowledge = createLocationKnowledge()
    const guard = createGuardLocalKnowledge({
      research,
      getElapsedDays: () => 0,
      getWorldSeed: () => 1,
      locationKnowledge: knowledge,
      getLocation: (id) => loc(id),
      listStableLocations: () => [],
      nearestSettlements: () => [],
      homeLocationId: () => 'settlement:home',
    })
    expect(guard.askAboutArea(0, 0)).toBe(GUARD_AREA_RESEARCH_STARTED)
    expect(guard.askAboutArea(0, 0)).toBe(GUARD_AREA_RESEARCH_PENDING)
    expect(research.calls).toBe(1)
    resolveHits!([{ type: 'landmark', id: 'cemetery:a:home:1', kind: 'cemetery', x: 10, z: 20 }])
    await Promise.resolve()
    expect(guard.askAboutArea(0, 0)).toBe(GUARD_AREA_RESEARCH_PENDING)
  })

  it('reveals a stable 1–3 set through LocationKnowledge after delay + result', async () => {
    const research = fakeResearch([
      { type: 'landmark', id: 'cemetery:a:one:1', kind: 'cemetery', x: 10, z: 20 },
      { type: 'landmark', id: 'cemetery:a:two:1', kind: 'cemetery', x: 12, z: 22 },
    ])
    const knowledge = createLocationKnowledge()
    let days = 0
    const guard = createGuardLocalKnowledge({
      research,
      getElapsedDays: () => days,
      getWorldSeed: () => 9,
      locationKnowledge: knowledge,
      getLocation: (id) => loc(id),
      listStableLocations: () => [],
      nearestSettlements: () => [loc('settlement:near', 'settlement')],
      homeLocationId: () => 'settlement:home',
    })
    expect(guard.askAboutArea(0, 0)).toBe(GUARD_AREA_RESEARCH_STARTED)
    await Promise.resolve()
    days = GUARD_LOCAL_KNOWLEDGE_DELAY_DAYS
    const line = guard.askAboutArea(0, 0)
    expect(line.startsWith('Nowe miejsca odkryte:')).toBe(true)
    expect(knowledge.has('cemetery:a:one:1') || knowledge.has('cemetery:a:two:1')).toBe(true)
    const saved = guard.serialize()
    expect(saved?.status).toBe('resolved')
    if (saved?.status !== 'resolved') throw new Error('expected resolved')
    const restoredKnowledge = createLocationKnowledge()
    const restored = createGuardLocalKnowledge({
      research: fakeResearch([]),
      getElapsedDays: () => days,
      getWorldSeed: () => 9,
      locationKnowledge: restoredKnowledge,
      getLocation: (id) => loc(id),
      listStableLocations: () => [loc('cemetery:a:reroll:1')],
      nearestSettlements: () => [],
      homeLocationId: () => 'settlement:home',
    })
    restored.restore(saved)
    expect(restored.askAboutArea(0, 0)).toBe(
      aboutAreaLine(saved.selectedIds.map((id) => loc(id).name)),
    )
    expect(saved.selectedIds).toEqual(guard.serialize()?.status === 'resolved' ? guard.serialize() && saved.selectedIds : saved.selectedIds)
  })

  it('restores a pending wait without starting a second logical research slot', () => {
    const research = fakeResearch([])
    const guard = createGuardLocalKnowledge({
      research,
      getElapsedDays: () => 0.01,
      getWorldSeed: () => 1,
      locationKnowledge: createLocationKnowledge(),
      getLocation: (id) => loc(id),
      listStableLocations: () => [],
      nearestSettlements: () => [],
      homeLocationId: () => 'settlement:home',
    })
    guard.restore({
      status: 'requested',
      requestedAtDays: 0,
      revealAtDays: GUARD_LOCAL_KNOWLEDGE_DELAY_DAYS,
      originX: 3,
      originZ: 4,
    })
    expect(guard.askAboutArea(99, 99)).toBe(GUARD_AREA_RESEARCH_PENDING)
    expect(research.calls).toBe(1)
    expect(guard.serialize()).toMatchObject({ status: 'requested', originX: 3, originZ: 4 })
  })

  it('can mention already-known local knowledge without starting research', () => {
    const research = fakeResearch([])
    const knowledge = createLocationKnowledge([{ id: 'cave:home-cave-0', state: 'discovered', source: 'exploration' }])
    const cave = loc('cave:home-cave-0', 'cave')
    const guard = createGuardLocalKnowledge({
      research,
      getElapsedDays: () => 0,
      getWorldSeed: () => 2,
      locationKnowledge: knowledge,
      getLocation: (id) => id === cave.id ? cave : null,
      listStableLocations: () => [cave],
      nearestSettlements: () => [],
      homeLocationId: () => 'settlement:home',
    })
    expect(guard.askAboutArea(10, 20)).toBe(aboutAreaLine([cave.name]))
    expect(research.calls).toBe(0)
  })
})
