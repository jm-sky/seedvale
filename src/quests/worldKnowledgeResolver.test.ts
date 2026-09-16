import { describe, expect, it, vi } from 'vitest'
import type { QuestDef } from './quests'
import { WORLD_KNOWLEDGE_HOUR_DAYS } from './quests'
import { createQuestWorldKnowledgeResolver } from './worldKnowledgeResolver'

const def: QuestDef = {
  id: 'slad-przy-monolicie',
  title: 'Ślad',
  description: 'd',
  giverName: 'Anna',
  giver: { npcId: 'home:npc:0' },
  offerLine: 'o',
  reportLine: 'r',
  worldKnowledge: [{
    id: 'target',
    revealDelayDays: WORLD_KNOWLEDGE_HOUR_DAYS,
    bind: { type: 'landmark', kind: 'monolith' },
    pendingPhrase: 'p',
    unavailablePhrase: 'u',
    unavailablePolicy: 'fail',
  }],
  stages: [],
  settlementId: '0_0',
  outcomes: [{ id: 'complete', state: 'complete' }],
}

describe('createQuestWorldKnowledgeResolver (plan quests-progression-047)', () => {
  it('resolves an unbound landmark through the research service, not findLandmarkNear', async () => {
    const findLandmarkNear = vi.fn()
    const resolve = vi.fn(async () => ({
      type: 'landmark' as const,
      id: 'monolith:4:-7:0:3f',
      kind: 'monolith' as const,
      x: 12,
      z: -8,
    }))
    const resolver = createQuestWorldKnowledgeResolver({
      getHost: () => ({
        chunkManager: { findLandmarkNear },
        settlementsManager: {
          getHomeDef: () => ({ id: '0_0', x: 0, z: 0, name: 'Lipowa' }),
          peekDef: () => null,
        },
      }),
      getDefs: () => [def],
      searchRadius: 10,
      chunkSize: 64,
      getChronicleSearch: () => null,
      research: {
        resolve,
        resolveMany: async () => [],
        invalidate() {},
        dispose() {},
      },
    })
    await expect(resolver.resolve('slad-przy-monolicie', 'target')).resolves.toEqual({
      kind: 'landmark',
      landmarkId: 'monolith:4:-7:0:3f',
      landmarkKind: 'monolith',
      x: 12,
      z: -8,
    })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(findLandmarkNear).not.toHaveBeenCalled()
  })
})
