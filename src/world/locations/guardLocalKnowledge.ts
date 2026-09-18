import type { NpcPlayerFollowUp, NpcWorldKnowledgeFollowUpSource } from '../../ai/npcPlayerFollowUp'
import type { NpcId } from '../../settlement/npcState'
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
/** Returned the moment research resolves and the authored delay is already
 *  satisfied — the actual locations are no longer revealed here (plan
 *  npc-050 §8); callers deliver through the shared follow-up seam instead
 *  and normally never surface this line to the player. */
export const GUARD_AREA_RESEARCH_READY =
  'Właśnie sobie przypomniałem, o co pytałeś.'

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

/** Per-npc keyed save shape (plan npc-050 §10) — each asking NPC owns its
 *  own request/resolution state; two NPCs can never share one in-flight
 *  request or resolved result. */
export type SaveGuardLocalKnowledgeByNpc = Record<NpcId, SaveGuardLocalKnowledge>

type GuardState =
  | { status: 'idle' }
  | SaveGuardLocalKnowledge

/**
 * Owner-keyed local-knowledge research service (plan quests-progression-047,
 * generalized to any asking NPC by npc-050). Owns only per-NPC dialogue
 * wait/selection state; discovery still goes through `LocationKnowledge`.
 * Once research resolves and the authored delay elapses, ownership of the
 * *deliverable* result transfers into the asking NPC's authoritative
 * `playerFollowUp` (via `armFollowUp`) — this service is never a second,
 * independent owner of an already-armed delivery.
 *
 * @domain world-locations
 */
export type GuardLocalKnowledge = {
  askAboutArea(npcId: NpcId, originX: number, originZ: number, source: NpcWorldKnowledgeFollowUpSource): string
  restore(saved: SaveGuardLocalKnowledgeByNpc | undefined): void
  serialize(): SaveGuardLocalKnowledgeByNpc | undefined
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
  /** Idempotently arms the asking NPC's one authoritative Player follow-up
   *  (`ai/npcPlayerFollowUp.ts`) once a result is ready to deliver. `null`
   *  when the NPC cannot currently receive one (dead/unknown) — the caller
   *  keeps its resolved research state and may retry on a later ask. */
  armFollowUp: (
    npcId: NpcId,
    followUp: { createdAtDays: number, source: NpcWorldKnowledgeFollowUpSource, selectedLocationIds: string[] },
  ) => NpcPlayerFollowUp | null
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
 * @domain world-locations
 */
export function createGuardLocalKnowledge(deps: GuardLocalKnowledgeDeps): GuardLocalKnowledge {
  const radius = deps.searchChunkRadius ?? GUARD_LOCAL_KNOWLEDGE_CHUNK_RADIUS
  const byNpc = new Map<NpcId, GuardState>()
  let epoch = 0
  const launching = new Set<NpcId>()

  const stateFor = (npcId: NpcId): GuardState => byNpc.get(npcId) ?? { status: 'idle' }

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

  const launch = (npcId: NpcId, originX: number, originZ: number): void => {
    if (launching.has(npcId)) return
    launching.add(npcId)
    const startedEpoch = epoch
    void deps.research.resolveMany(queryFor(originX, originZ)).then(
      (refs) => {
        launching.delete(npcId)
        if (startedEpoch !== epoch) return
        const current = stateFor(npcId)
        if (current.status !== 'requested') return
        byNpc.set(npcId, {
          ...current,
          status: 'resolved',
          selectedIds: pickSelectedIds(current.originX, current.originZ, refs),
        })
      },
      () => {
        launching.delete(npcId)
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
    askAboutArea(npcId, originX, originZ, source) {
      const state = stateFor(npcId)
      if (state.status === 'resolved') {
        if (deps.getElapsedDays() < state.revealAtDays) return GUARD_AREA_RESEARCH_PENDING
        const armed = deps.armFollowUp(npcId, {
          createdAtDays: deps.getElapsedDays(),
          source,
          selectedLocationIds: state.selectedIds,
        })
        if (!armed) return GUARD_AREA_RESEARCH_PENDING
        // Ownership transferred — this service is no longer the owner of the
        // deliverable result (plan npc-050 §8/§10).
        byNpc.set(npcId, { status: 'idle' })
        return GUARD_AREA_RESEARCH_READY
      }
      if (state.status === 'requested') {
        launch(npcId, state.originX, state.originZ)
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
      byNpc.set(npcId, {
        status: 'requested',
        requestedAtDays: now,
        revealAtDays: now + GUARD_LOCAL_KNOWLEDGE_DELAY_DAYS,
        originX,
        originZ,
      })
      launch(npcId, originX, originZ)
      return GUARD_AREA_RESEARCH_STARTED
    },
    restore(saved) {
      launching.clear()
      byNpc.clear()
      if (!saved) return
      for (const [npcId, entry] of Object.entries(saved)) {
        byNpc.set(npcId, entry)
        if (entry.status === 'requested') launch(npcId, entry.originX, entry.originZ)
      }
    },
    serialize() {
      if (byNpc.size === 0) return undefined
      const out: SaveGuardLocalKnowledgeByNpc = {}
      for (const [npcId, state] of byNpc) {
        if (state.status === 'idle') continue
        out[npcId] = state
      }
      return Object.keys(out).length > 0 ? out : undefined
    },
    reset() {
      epoch += 1
      launching.clear()
      byNpc.clear()
    },
    invalidate() {
      epoch += 1
      launching.clear()
      for (const [npcId, state] of byNpc) {
        if (state.status === 'requested') launch(npcId, state.originX, state.originZ)
      }
    },
  }
}

/** Also the legacy pre-npc-050 shape — one anonymous (home-guard-only)
 *  record, not yet keyed by NPC. `createApp.ts` recognises this shape at
 *  restore time and migrates it onto the stable home-guard id. */
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

export function isSaveGuardLocalKnowledgeByNpc(value: unknown): value is SaveGuardLocalKnowledgeByNpc {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every(isSaveGuardLocalKnowledge)
}

/**
 * Normalizes a loaded `SaveMap.guardLocalKnowledge` field onto the current
 * per-npc shape (plan npc-050 §10). A legacy pre-npc-050 save carries one
 * anonymous (home-guard-only) record — attributed onto the stable
 * `homeGuardNpcId` without losing an already-started delay or selected ids.
 * When no home guard can be resolved (e.g. no living home guard this save),
 * the legacy record has no owner to attach to and is dropped rather than
 * guessed.
 *
 * @domain world-locations
 */
export function normalizeSaveGuardLocalKnowledge(
  saved: SaveGuardLocalKnowledge | SaveGuardLocalKnowledgeByNpc | undefined,
  homeGuardNpcId: NpcId | undefined,
): SaveGuardLocalKnowledgeByNpc | undefined {
  if (!saved) return undefined
  if (isSaveGuardLocalKnowledge(saved)) {
    return homeGuardNpcId ? { [homeGuardNpcId]: saved } : undefined
  }
  return saved
}
