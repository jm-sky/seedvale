import type { NpcAuthoritativeState, NpcGraveVisitRecord, NpcId } from '../settlement/npcState'
import type { NpcGraves } from '../world/npcGraves'
import { graveIdForDeceased } from '../world/npcGraves'

/**
 * Settlement-local grave-visit pressure (plan npc-026) — a low optional
 * pressure producer competing in `NpcAgent.choose()` as a `'visitGrave'`
 * decision target, not a fake `NeedId`.
 *
 * @domain npc
 */

export type GraveVisitCandidate = {
  deceasedNpcId: NpcId
  graveId: string
  x: number
  z: number
  yaw: number
}

export type NpcGraveVisitHooks = {
  familyNpcIds: (visitorId: NpcId) => readonly NpcId[]
  getNpcState: (id: NpcId) => NpcAuthoritativeState | undefined
  graves: NpcGraves
}

/** Per-deceased revisit spacing — absolute simulation days. */
export const GRAVE_VISIT_COOLDOWN_DAYS = 14
/** Low optional pressure — should beat idle but lose to real needs/heal/weather. */
export const GRAVE_VISIT_PRESSURE = 0.38
export const GRAVE_VISIT_OPPORTUNITY_BUCKET_DAYS = 3
/** Only the top ~28% of deterministic bucket rolls permit a visit. */
export const GRAVE_VISIT_OPPORTUNITY_THRESHOLD = 0.72

const GRAVE_VISIT_OPPORTUNITY_SALT = 0x47524156
const MAX_GRAVE_VISIT_HISTORY = 8

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function hash01(a: number, b: number, salt: number): number {
  let h = Math.imul(a ^ salt, 2654435761) ^ Math.imul(b + 0x9e3779b9, 1597334677)
  h ^= h >>> 15
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

export function graveVisitOpportunity(visitorId: string, deceasedId: string, nowDays: number): boolean {
  const bucket = Math.floor(nowDays / GRAVE_VISIT_OPPORTUNITY_BUCKET_DAYS)
  const roll = hash01(
    hashString(visitorId),
    hashString(deceasedId) ^ bucket,
    GRAVE_VISIT_OPPORTUNITY_SALT,
  )
  return roll >= GRAVE_VISIT_OPPORTUNITY_THRESHOLD
}

export function getLastGraveVisitAtDays(
  graveVisits: readonly NpcGraveVisitRecord[],
  deceasedNpcId: string,
): number | null {
  for (const entry of graveVisits) {
    if (entry.deceasedNpcId === deceasedNpcId) return entry.lastVisitedAtDays
  }
  return null
}

export function isGraveVisitCooldownExpired(
  graveVisits: readonly NpcGraveVisitRecord[],
  deceasedNpcId: string,
  nowDays: number,
): boolean {
  const last = getLastGraveVisitAtDays(graveVisits, deceasedNpcId)
  return last == null || nowDays - last >= GRAVE_VISIT_COOLDOWN_DAYS
}

export function recordGraveVisit(
  graveVisits: NpcGraveVisitRecord[],
  deceasedNpcId: NpcId,
  atDays: number,
): void {
  const existing = graveVisits.findIndex((e) => e.deceasedNpcId === deceasedNpcId)
  if (existing >= 0) {
    graveVisits[existing]!.lastVisitedAtDays = atDays
    return
  }
  graveVisits.push({ deceasedNpcId, lastVisitedAtDays: atDays })
  if (graveVisits.length > MAX_GRAVE_VISIT_HISTORY) {
    graveVisits.sort((a, b) => a.lastVisitedAtDays - b.lastVisitedAtDays)
    graveVisits.shift()
  }
}

export type GraveVisitPressureResult = {
  score: number
  candidate: GraveVisitCandidate | null
}

export function resolveGraveVisitPressure(
  visitorId: NpcId,
  visitorState: NpcAuthoritativeState,
  hooks: NpcGraveVisitHooks,
  nowDays: number,
): GraveVisitPressureResult {
  if (visitorState.health.dead) return { score: 0, candidate: null }

  const eligible: GraveVisitCandidate[] = []
  for (const deceasedId of hooks.familyNpcIds(visitorId)) {
    const deceasedState = hooks.getNpcState(deceasedId)
    if (!deceasedState?.health.dead) continue
    if (!hooks.graves.hasForDeceased(deceasedId)) continue
    if (!isGraveVisitCooldownExpired(visitorState.graveVisits, deceasedId, nowDays)) continue

    const graveId = graveIdForDeceased(deceasedId)
    const grave = hooks.graves.get(graveId)
    if (!grave || grave.deceasedNpcId !== deceasedId) continue

    eligible.push({
      deceasedNpcId: deceasedId,
      graveId,
      x: grave.x,
      z: grave.z,
      yaw: grave.yaw,
    })
  }

  if (eligible.length === 0) return { score: 0, candidate: null }
  eligible.sort((a, b) => a.deceasedNpcId.localeCompare(b.deceasedNpcId))

  for (const candidate of eligible) {
    if (!graveVisitOpportunity(visitorId, candidate.deceasedNpcId, nowDays)) continue
    return { score: GRAVE_VISIT_PRESSURE, candidate }
  }

  return { score: 0, candidate: null }
}

/** Re-resolve stable grave identity before dispatch/completion. */
export function revalidateGraveVisitCandidate(
  candidate: GraveVisitCandidate,
  hooks: NpcGraveVisitHooks,
): GraveVisitCandidate | null {
  const grave = hooks.graves.get(candidate.graveId)
  if (!grave || grave.deceasedNpcId !== candidate.deceasedNpcId) return null
  if (!hooks.getNpcState(candidate.deceasedNpcId)?.health.dead) return null
  return {
    deceasedNpcId: candidate.deceasedNpcId,
    graveId: candidate.graveId,
    x: grave.x,
    z: grave.z,
    yaw: grave.yaw,
  }
}
