import type { LocationKnowledge } from './locationKnowledge'
import type { WorldKnowledgeQuery, WorldKnowledgeRef, WorldKnowledgeResearch } from './worldKnowledgeResearch'
import type { WorldLocation } from './worldLocationTypes'
import { aboutAreaLine } from '../../ai/dialogueTemplates'
import { WORLD_KNOWLEDGE_HOUR_DAYS } from '../../quests/quests'
import { createSeededRandom } from '../parseSeed'
import {
  GUARD_LANDMARK_POOL_SIZE,
  GUARD_REVEAL_MAX,
  GUARD_REVEAL_MIN,
  MEDIUM_RANGE_KM,
  worldUnitsToKm,
} from './locationConfig'
import { pickRandomReveal, weightedTopN } from './locationDiscovery'

export const GUARD_AREA_RESEARCH_STARTED =
  'Muszę przejrzeć meldunki i przypomnieć sobie szlaki. Wróć za godzinę.'
export const GUARD_AREA_RESEARCH_PENDING =
  'Wciąż przeglądam meldunki i szlaki. Wróć trochę później.'

const GUARD_RESEARCH_KINDS = ['cemetery', 'ruins'] as const
export const GUARD_LOCAL_KNOWLEDGE_DELAY_DAYS = WORLD_KNOWLEDGE_HOUR_DAYS
export const GUARD_LOCAL_KNOWLEDGE_CHUNK_RADIUS = 10

export type SaveGuardLocalKnowledge =
  | {
      status: 'requested'
      requestedAtDays: number
      revealAtDays: number
      originX: number
      originZ: number
    }
  | {
      status: 'resolved'
      requestedAtDays: number
      revealAtDays: number
      originX: number
      originZ: number
      selectedIds: string[]
    }

type GuardState =
  | { status: 'idle' }
  | SaveGuardLocalKnowledge

export type GuardLocalKnowledge = {
  askAboutArea(originX: number, originZ: number): string
  restore(saved: SaveGuardLocalKnowledge | undefined): void
  serialize(): SaveGuardLocalKnowledge | undefined
  reset(): void
  invalidate(): void
}

export type GuardLocalKnowledgeDeps = {
  research: WorldKnowledgeResearch
  getElapsedDays: () => number
  getWorldSeed: () => number
  locationKnowledge: LocationKnowledge
  getLocation: (id: string) => WorldLocation | null
  listStableLocations: (originX: number, originZ: number, maxKm: number) => readonly WorldLocation[]
  nearestSettlements: (originX: number, originZ: number, maxKm: number) => readonly WorldLocation[]
  homeLocationId: () => string | null
  searchChunkRadius?: number
}

function locationInRange(location: WorldLocation, originX: number, originZ: number, maxKm: number): boolean {
  return worldUnitsToKm(Math.hypot(location.x - originX, location.z - originZ)) <= maxKm
}

function hashSeed(seed: number, ids: readonly string[]): number {
  let h = seed >>> 0
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  return h >>> 0
}

/**
 * Home-guard local-knowledge pilot of `WorldKnowledgeResearch`. Owns only
 * dialogue wait/selection state; discovery still goes through LocationKnowledge.
 *
 * @domain world-locations
 */
export function createGuardLocalKnowledge(deps: GuardLocalKnowledgeDeps): GuardLocalKnowledge {
  const radius = deps.searchChunkRadius ?? GUARD_LOCAL_KNOWLEDGE_CHUNK_RADIUS
  let state: GuardState = { status: 'idle' }
  let epoch = 0
  let launching = false

  const revealSelected = (ids: readonly string[]): string => {
    const homeId = deps.homeLocationId()
    const originX = state.status === 'idle' ? 0 : state.originX
    const originZ = state.status === 'idle' ? 0 : state.originZ
    const revealedLandmarks = ids
      .map((id) => deps.getLocation(id))
      .filter((location): location is WorldLocation => location != null)
      .filter((location) => deps.locationKnowledge.reveal(location.id, 'discovered', 'npc'))
    const revealedSettlements = deps.nearestSettlements(originX, originZ, MEDIUM_RANGE_KM)
      .filter((location) => location.id !== homeId)
      .slice(0, 3)
      .filter((location) => deps.locationKnowledge.reveal(location.id, 'discovered', 'npc'))
    return aboutAreaLine([...revealedLandmarks, ...revealedSettlements].map((location) => location.name))
  }

  const pickSelectedIds = (
    originX: number,
    originZ: number,
    refs: readonly WorldKnowledgeRef[],
  ): string[] => {
    const fromWorker = refs
      .map((ref) => deps.getLocation(ref.id))
      .filter((location): location is WorldLocation => location != null)
    const merged = new Map<string, WorldLocation>()
    for (const location of [...fromWorker, ...deps.listStableLocations(originX, originZ, MEDIUM_RANGE_KM)]) {
      merged.set(location.id, location)
    }
    const pool = weightedTopN([...merged.values()], GUARD_LANDMARK_POOL_SIZE)
    const rng = createSeededRandom(hashSeed(deps.getWorldSeed(), pool.map((location) => location.id)))
    return pickRandomReveal(pool, GUARD_REVEAL_MIN, GUARD_REVEAL_MAX, rng).map((location) => location.id)
  }

  const queryFor = (originX: number, originZ: number): WorldKnowledgeQuery => ({
    kind: 'nearby-landmarks',
    landmarkKinds: GUARD_RESEARCH_KINDS,
    originX,
    originZ,
    maxChunkRadius: radius,
  })

  const launch = (originX: number, originZ: number): void => {
    if (launching) return
    launching = true
    const startedEpoch = epoch
    void deps.research.resolveMany(queryFor(originX, originZ)).then(
      (refs) => {
        launching = false
        if (startedEpoch !== epoch) return
        if (state.status !== 'requested') return
        state = {
          ...state,
          status: 'resolved',
          selectedIds: pickSelectedIds(state.originX, state.originZ, refs),
        }
      },
      () => {
        launching = false
      },
    )
  }

  const alreadyKnownInRange = (originX: number, originZ: number): WorldLocation[] => {
    const homeId = deps.homeLocationId()
    return deps.locationKnowledge.list()
      .map((entry) => deps.getLocation(entry.id))
      .filter((location): location is WorldLocation => location != null)
      .filter((location) => location.id !== homeId && location.kind !== 'settlement')
      .filter((location) => locationInRange(location, originX, originZ, MEDIUM_RANGE_KM))
  }

  return {
    askAboutArea(originX, originZ) {
      if (state.status === 'resolved') {
        if (deps.getElapsedDays() < state.revealAtDays) return GUARD_AREA_RESEARCH_PENDING
        return revealSelected(state.selectedIds)
      }
      if (state.status === 'requested') {
        if (!launching) launch(state.originX, state.originZ)
        return GUARD_AREA_RESEARCH_PENDING
      }
      const known = alreadyKnownInRange(originX, originZ)
      if (known.length > 0) {
        const rng = createSeededRandom(hashSeed(deps.getWorldSeed(), known.map((location) => location.id)))
        const picked = pickRandomReveal(
          weightedTopN(known, GUARD_LANDMARK_POOL_SIZE),
          GUARD_REVEAL_MIN,
          GUARD_REVEAL_MAX,
          rng,
        )
        for (const location of picked) {
          deps.locationKnowledge.reveal(location.id, 'discovered', 'npc')
        }
        return aboutAreaLine(picked.map((location) => location.name))
      }
      const now = deps.getElapsedDays()
      state = {
        status: 'requested',
        requestedAtDays: now,
        revealAtDays: now + GUARD_LOCAL_KNOWLEDGE_DELAY_DAYS,
        originX,
        originZ,
      }
      launch(originX, originZ)
      return GUARD_AREA_RESEARCH_STARTED
    },
    restore(saved) {
      launching = false
      if (!saved) {
        state = { status: 'idle' }
        return
      }
      state = saved
      if (saved.status === 'requested') launch(saved.originX, saved.originZ)
    },
    serialize() {
      return state.status === 'idle' ? undefined : state
    },
    reset() {
      epoch += 1
      launching = false
      state = { status: 'idle' }
    },
    invalidate() {
      epoch += 1
      launching = false
      if (state.status === 'requested') launch(state.originX, state.originZ)
    },
  }
}

export function isSaveGuardLocalKnowledge(value: unknown): value is SaveGuardLocalKnowledge {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  if (typeof entry.requestedAtDays !== 'number' || !Number.isFinite(entry.requestedAtDays)) return false
  if (typeof entry.revealAtDays !== 'number' || !Number.isFinite(entry.revealAtDays)) return false
  if (typeof entry.originX !== 'number' || !Number.isFinite(entry.originX)) return false
  if (typeof entry.originZ !== 'number' || !Number.isFinite(entry.originZ)) return false
  if (entry.status === 'requested') return true
  if (entry.status !== 'resolved') return false
  return Array.isArray(entry.selectedIds) && entry.selectedIds.every((id) => typeof id === 'string')
}
