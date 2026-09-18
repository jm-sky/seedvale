/**
 * Transient presentation-only bark admission (npc-049). Owns cooldown /
 * rolling-window / episode accounting — never NPC simulation state.
 *
 * @domain npc
 */

import {
  longestNpcBarkRetentionSec,
  NPC_OPTIONAL_BARK_AREA_WINDOW_SEC,
  NPC_OPTIONAL_BARK_MAX_PER_AREA,
  type NpcBarkIntent,
  type NpcBarkPolicy,
  npcBarkPolicyFor,
} from './npcBarkPolicies'

export type NpcBarkAdmitRequest = {
  npcId: string
  areaKey: string
  intent: NpcBarkIntent
  /** Simulation clock seconds (`NpcAgent.simClock`). */
  nowSim: number
  episodeKey?: string
}

export type NpcBarkRejectReason =
  | 'npc-cooldown'
  | 'area-intent-budget'
  | 'optional-global-budget'
  | 'episode-already-spoken'
  | 'unknown-intent'

export type NpcBarkAdmitDecision =
  | { accepted: true }
  | { accepted: false; reason: NpcBarkRejectReason }

type TimestampList = number[]

/**
 * One shared world limiter. Keys are settlement/local area ids — budgets are
 * never world-global. State is transient and pruned lazily on request.
 *
 * @domain npc
 */
export class NpcBarkLimiter {
  private readonly npcIntentLast = new Map<string, number>()
  private readonly areaIntentTimes = new Map<string, TimestampList>()
  private readonly areaOptionalTimes = new Map<string, TimestampList>()
  private readonly episodeSpoken = new Map<string, number>()
  private readonly retentionSec = longestNpcBarkRetentionSec()

  /**
   * Decide whether a bark may be presented. Does not play audio. Call only
   * after a voice URL has been resolved so missing assets never spend budget.
   */
  tryAdmit(request: NpcBarkAdmitRequest): NpcBarkAdmitDecision {
    const policy = npcBarkPolicyFor(request.intent)
    if (!policy) return { accepted: false, reason: 'unknown-intent' }

    this.prune(request.nowSim)

    const npcKey = `${request.npcId}|${request.intent}`
    const lastNpc = this.npcIntentLast.get(npcKey)
    if (lastNpc != null && request.nowSim - lastNpc < policy.npcCooldownSec) {
      return { accepted: false, reason: 'npc-cooldown' }
    }

    if (policy.episodeScoped && request.episodeKey) {
      const episodeKey = `${request.areaKey}|${request.intent}|${request.episodeKey}`
      if (this.episodeSpoken.has(episodeKey)) {
        return { accepted: false, reason: 'episode-already-spoken' }
      }
    }

    const areaIntentKey = `${request.areaKey}|${request.intent}`
    const areaTimes = this.areaIntentTimes.get(areaIntentKey) ?? []
    const areaInWindow = countInWindow(areaTimes, request.nowSim, policy.areaWindowSec)
    if (areaInWindow >= policy.maxPerAreaWindow) {
      return { accepted: false, reason: 'area-intent-budget' }
    }

    if (policy.usesOptionalBudget) {
      const optionalTimes = this.areaOptionalTimes.get(request.areaKey) ?? []
      const optionalInWindow = countInWindow(
        optionalTimes,
        request.nowSim,
        NPC_OPTIONAL_BARK_AREA_WINDOW_SEC,
      )
      if (optionalInWindow >= NPC_OPTIONAL_BARK_MAX_PER_AREA) {
        return { accepted: false, reason: 'optional-global-budget' }
      }
    }

    this.recordAccepted(request, policy)
    return { accepted: true }
  }

  private recordAccepted(request: NpcBarkAdmitRequest, policy: NpcBarkPolicy): void {
    const npcKey = `${request.npcId}|${request.intent}`
    this.npcIntentLast.set(npcKey, request.nowSim)

    const areaIntentKey = `${request.areaKey}|${request.intent}`
    const areaTimes = this.areaIntentTimes.get(areaIntentKey) ?? []
    areaTimes.push(request.nowSim)
    this.areaIntentTimes.set(areaIntentKey, areaTimes)

    if (policy.usesOptionalBudget) {
      const optionalTimes = this.areaOptionalTimes.get(request.areaKey) ?? []
      optionalTimes.push(request.nowSim)
      this.areaOptionalTimes.set(request.areaKey, optionalTimes)
    }

    if (policy.episodeScoped && request.episodeKey) {
      const episodeKey = `${request.areaKey}|${request.intent}|${request.episodeKey}`
      this.episodeSpoken.set(episodeKey, request.nowSim)
    }
  }

  private prune(nowSim: number): void {
    const cutoff = nowSim - this.retentionSec
    for (const [key, ts] of this.npcIntentLast) {
      if (ts < cutoff) this.npcIntentLast.delete(key)
    }
    for (const [key, times] of this.areaIntentTimes) {
      const kept = times.filter((t) => t >= cutoff)
      if (kept.length === 0) this.areaIntentTimes.delete(key)
      else this.areaIntentTimes.set(key, kept)
    }
    for (const [key, times] of this.areaOptionalTimes) {
      const kept = times.filter((t) => t >= cutoff)
      if (kept.length === 0) this.areaOptionalTimes.delete(key)
      else this.areaOptionalTimes.set(key, kept)
    }
    for (const [key, ts] of this.episodeSpoken) {
      if (ts < cutoff) this.episodeSpoken.delete(key)
    }
  }
}

function countInWindow(times: readonly number[], nowSim: number, windowSec: number): number {
  const cutoff = nowSim - windowSec
  let count = 0
  for (const t of times) {
    if (t >= cutoff) count += 1
  }
  return count
}
