import type { LandmarkKind } from '../../terrain/chunkEnvironment'
import type { WorldKnowledgeScanHit, WorldKnowledgeWorkerParams } from '../../terrain/worldKnowledgeScan'
import {
  cancelChunkWorldKnowledge,
  isChunkWorkerCancelledError,
  requestChunkWorldKnowledge,
} from '../../terrain/chunkWorkerPool'
import { isLightweightUnloadedLandmark } from '../../terrain/unloadedLandmarkLookup'

export type WorldKnowledgeQuery = {
  kind: 'nearest-landmark' | 'nearby-landmarks'
  landmarkKinds: readonly LandmarkKind[]
  originX: number
  originZ: number
  maxChunkRadius: number
}

export type WorldKnowledgeRef = {
  type: 'landmark'
  id: string
  kind: LandmarkKind
  x: number
  z: number
}

export type WorldKnowledgeResearch = {
  resolve(query: WorldKnowledgeQuery): Promise<WorldKnowledgeRef | null>
  resolveMany(query: WorldKnowledgeQuery): Promise<readonly WorldKnowledgeRef[]>
  /** Drop in-flight completions after New Game or a WorldBundle rebuild. */
  invalidate(): void
  dispose(): void
}

export type WorldKnowledgeResearchHost = {
  buildParams: (query: WorldKnowledgeQuery) => WorldKnowledgeWorkerParams
  fingerprint: () => string
  request?: (key: string, params: WorldKnowledgeWorkerParams) => Promise<{ hits: readonly WorldKnowledgeScanHit[] }>
  cancel?: (key: string) => void
}

function queryKey(fingerprint: string, query: WorldKnowledgeQuery): string {
  const kinds = [...query.landmarkKinds].sort().join(',')
  return [
    fingerprint,
    query.kind,
    kinds,
    query.originX.toFixed(3),
    query.originZ.toFixed(3),
    String(query.maxChunkRadius),
  ].join('|')
}

function hitToRef(hit: WorldKnowledgeScanHit): WorldKnowledgeRef {
  return { type: 'landmark', id: hit.id, kind: hit.kind, x: hit.x, z: hit.z }
}

/**
 * World-owned deferred static-world lookup. Deduplicates equivalent in-flight
 * requests, dispatches one bounded worker job, and ignores completions from a
 * previous world epoch. Does not know quests, dialogue or UI.
 *
 * @domain world-locations
 */
export function createWorldKnowledgeResearch(host: WorldKnowledgeResearchHost): WorldKnowledgeResearch {
  const request = host.request ?? requestChunkWorldKnowledge
  const cancel = host.cancel ?? cancelChunkWorldKnowledge
  const inflight = new Map<string, { epoch: number, promise: Promise<readonly WorldKnowledgeRef[]> }>()
  let epoch = 0
  let disposed = false

  const settleIfCurrent = (
    key: string,
    startedEpoch: number,
    hits: readonly WorldKnowledgeScanHit[],
  ): readonly WorldKnowledgeRef[] => {
    const current = inflight.get(key)
    if (current && current.epoch === startedEpoch) inflight.delete(key)
    if (disposed || startedEpoch !== epoch) return []
    return hits.map(hitToRef)
  }

  const dispatch = (query: WorldKnowledgeQuery): Promise<readonly WorldKnowledgeRef[]> => {
    if (disposed) return Promise.resolve([])
    const kinds = query.landmarkKinds.filter(isLightweightUnloadedLandmark)
    if (kinds.length === 0) return Promise.resolve([])
    const fingerprint = host.fingerprint()
    const key = queryKey(fingerprint, { ...query, landmarkKinds: kinds })
    const existing = inflight.get(key)
    if (existing && existing.epoch === epoch) return existing.promise
    const startedEpoch = epoch
    const params = host.buildParams({ ...query, landmarkKinds: kinds })
    const promise = request(key, params).then(
      (result) => settleIfCurrent(key, startedEpoch, result.hits),
      (error: unknown) => {
        const current = inflight.get(key)
        if (current && current.epoch === startedEpoch) inflight.delete(key)
        if (disposed || startedEpoch !== epoch || isChunkWorkerCancelledError(error)) return []
        throw error
      },
    )
    inflight.set(key, { epoch: startedEpoch, promise })
    return promise
  }

  const dropInflight = (): void => {
    const keys = [...inflight.keys()]
    inflight.clear()
    for (const key of keys) cancel(key)
  }

  return {
    async resolve(query) {
      const hits = await dispatch({ ...query, kind: 'nearest-landmark' })
      return hits[0] ?? null
    },
    resolveMany(query) {
      return dispatch({ ...query, kind: query.kind === 'nearest-landmark' ? 'nearest-landmark' : 'nearby-landmarks' })
    },
    invalidate() {
      epoch += 1
      dropInflight()
    },
    dispose() {
      disposed = true
      epoch += 1
      dropInflight()
    },
  }
}
