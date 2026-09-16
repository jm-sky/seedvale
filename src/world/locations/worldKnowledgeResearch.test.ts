import { describe, expect, it } from 'vitest'
import type { WorldKnowledgeWorkerParams } from '../../terrain/worldKnowledgeScan'
import { HeightmapGenerationCancelledError } from '../../terrain/chunkWorkerPool'
import { createWorldKnowledgeResearch, type WorldKnowledgeQuery } from './worldKnowledgeResearch'

const query: WorldKnowledgeQuery = {
  kind: 'nearest-landmark',
  landmarkKinds: ['monolith'],
  originX: 10,
  originZ: 20,
  maxChunkRadius: 3,
}

function dummyParams(query: WorldKnowledgeQuery): WorldKnowledgeWorkerParams {
  return {
    queryKind: query.kind,
    landmarkKinds: query.landmarkKinds,
    originX: query.originX,
    originZ: query.originZ,
    maxChunkRadius: query.maxChunkRadius,
    terrain: {
      chunkSize: 64,
      resolution: 17,
      seed: 1,
      heightScale: 18,
      waterLevel: 0.45,
      noiseScale: 120,
      detailAmplitude: 0.55,
      hillsScale: 420,
      hillsAmplitude: 0.28,
      hillsFbm: { octaves: 1, persistence: 0.5, lacunarity: 2, exponentiation: 1 },
      fbm: { octaves: 1, persistence: 0.5, lacunarity: 2, exponentiation: 1 },
      biome: { noiseScale: 96, fbm: { octaves: 1, persistence: 0.5, lacunarity: 2, exponentiation: 1 } },
      region: {} as WorldKnowledgeWorkerParams['terrain']['region'],
      vegetationSpeciesCount: { tree: 1, bush: 1, cactus: 1, reed: 1, fern: 1, lily: 1, seaweed: 1 },
      homeChunks: [],
      cemeterySettlements: [],
      cemeteryRoadSegments: [],
      cemeteryClearings: [],
      roadSegments: [],
      clearings: [],
      regional: [],
    },
  }
}

describe('createWorldKnowledgeResearch (plan quests-progression-047)', () => {
  it('deduplicates equivalent in-flight queries and keeps distinct origins separate', async () => {
    let calls = 0
    const pending: Array<(hits: { hits: [] }) => void> = []
    const research = createWorldKnowledgeResearch({
      buildParams: dummyParams,
      fingerprint: () => 'seed-1',
      request: () => {
        calls += 1
        return new Promise((resolve) => pending.push(resolve))
      },
      cancel: () => {},
    })
    const a = research.resolve(query)
    const b = research.resolve({ ...query })
    const c = research.resolve({ ...query, originX: 99 })
    expect(calls).toBe(2)
    pending[0]!({ hits: [] })
    pending[1]!({ hits: [] })
    expect(await a).toBeNull()
    expect(await b).toBeNull()
    expect(await c).toBeNull()
    research.dispose()
  })

  it('ignores a stale completion after invalidate / world epoch change', async () => {
    let resolveFirst: ((hits: { hits: [{ type: 'landmark', id: string, kind: 'monolith', x: number, z: number }] }) => void) | undefined
    const research = createWorldKnowledgeResearch({
      buildParams: dummyParams,
      fingerprint: () => 'seed-1',
      request: () => new Promise((resolve) => {
        resolveFirst = resolve
      }),
      cancel: () => {},
    })
    const pending = research.resolve(query)
    research.invalidate()
    resolveFirst!({ hits: [{ type: 'landmark', id: 'monolith:0:0:0:a', kind: 'monolith', x: 1, z: 2 }] })
    expect(await pending).toBeNull()
    research.dispose()
  })

  it('returns cancelled work as empty rather than binding a result', async () => {
    const research = createWorldKnowledgeResearch({
      buildParams: dummyParams,
      fingerprint: () => 'seed-1',
      request: () => Promise.reject(new HeightmapGenerationCancelledError()),
      cancel: () => {},
    })
    await expect(research.resolve(query)).resolves.toBeNull()
    research.dispose()
  })

  it('surfaces a worker error so a later resolve can retry', async () => {
    let fail = true
    const research = createWorldKnowledgeResearch({
      buildParams: dummyParams,
      fingerprint: () => 'seed-1',
      request: async () => {
        if (fail) {
          fail = false
          throw new Error('worker boom')
        }
        return {
          hits: [{ type: 'landmark' as const, id: 'monolith:1:1:0:b', kind: 'monolith' as const, x: 4, z: 5 }],
        }
      },
      cancel: () => {},
    })
    await expect(research.resolve(query)).rejects.toThrow('worker boom')
    await expect(research.resolve(query)).resolves.toEqual({
      type: 'landmark',
      id: 'monolith:1:1:0:b',
      kind: 'monolith',
      x: 4,
      z: 5,
    })
    research.dispose()
  })

  it('skips unsupported landmark kinds without dispatching a worker job', async () => {
    let calls = 0
    const research = createWorldKnowledgeResearch({
      buildParams: dummyParams,
      fingerprint: () => 'seed-1',
      request: async () => {
        calls += 1
        return { hits: [] }
      },
      cancel: () => {},
    })
    await expect(research.resolve({ ...query, landmarkKinds: ['tower', 'shipwreck'] })).resolves.toBeNull()
    expect(calls).toBe(0)
    research.dispose()
  })

  it('dispose rejects further completions and cancels in-flight keys', async () => {
    const cancelled: string[] = []
    let resolveJob: ((hits: { hits: [] }) => void) | undefined
    const research = createWorldKnowledgeResearch({
      buildParams: dummyParams,
      fingerprint: () => 'seed-1',
      request: () => new Promise((resolve) => {
        resolveJob = resolve
      }),
      cancel: (key) => cancelled.push(key),
    })
    const pending = research.resolve(query)
    research.dispose()
    expect(cancelled.length).toBe(1)
    resolveJob!({ hits: [] })
    expect(await pending).toBeNull()
  })
})
