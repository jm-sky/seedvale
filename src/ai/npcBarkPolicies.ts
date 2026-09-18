/**
 * Data-driven bark policies for contextual NPC life/world voice (npc-049).
 * Presentation tuning only — never authoritative simulation rules.
 *
 * @domain npc
 */

import type { NpcVoiceSemanticIntent } from './npcVoiceLines'

/** Whether a bark competes for the shared ambient optional budget. */
export type NpcBarkPriority = 'required' | 'optional'

/**
 * Per-intent throttling policy. All times are simulation seconds
 * (`NpcAgent.simClock`), not wall-clock milliseconds.
 */
export type NpcBarkPolicy = {
  priority: NpcBarkPriority
  /** Minimum sim-seconds between accepted barks of this intent for one NPC. */
  npcCooldownSec: number
  /** Rolling window length for the per-area intent budget. */
  areaWindowSec: number
  /** Max accepted barks of this intent per area inside `areaWindowSec`. */
  maxPerAreaWindow: number
  /** When true, also consumes the shared optional ambient budget. */
  usesOptionalBudget: boolean
  /** When true, repeated requests with the same episode key are suppressed. */
  episodeScoped: boolean
}

/** Shared optional/ambient bark budget per settlement area (sim seconds). */
export const NPC_OPTIONAL_BARK_AREA_WINDOW_SEC = 300
export const NPC_OPTIONAL_BARK_MAX_PER_AREA = 4

/** Bark intents owned by the npc-049 limiter (subset of voice semantics). */
export type NpcBarkIntent =
  | 'exhausted'
  | 'hungry'
  | 'weather_shelter'
  | 'danger_alert'
  | 'combat_start'
  | 'call_for_help'
  | 'livestock_danger'
  | 'guard_response'
  | 'work_finished'

const NPC_BARK_POLICIES: Readonly<Record<NpcBarkIntent, NpcBarkPolicy>> = {
  exhausted: {
    priority: 'optional',
    npcCooldownSec: 1200,
    areaWindowSec: 300,
    maxPerAreaWindow: 2,
    usesOptionalBudget: true,
    episodeScoped: false,
  },
  hungry: {
    priority: 'optional',
    npcCooldownSec: 1200,
    areaWindowSec: 300,
    maxPerAreaWindow: 2,
    usesOptionalBudget: true,
    episodeScoped: false,
  },
  weather_shelter: {
    priority: 'optional',
    npcCooldownSec: 900,
    areaWindowSec: 300,
    maxPerAreaWindow: 2,
    usesOptionalBudget: true,
    episodeScoped: false,
  },
  work_finished: {
    priority: 'optional',
    npcCooldownSec: 1200,
    areaWindowSec: 300,
    maxPerAreaWindow: 1,
    usesOptionalBudget: true,
    episodeScoped: false,
  },
  danger_alert: {
    priority: 'required',
    npcCooldownSec: 60,
    areaWindowSec: 60,
    maxPerAreaWindow: 2,
    usesOptionalBudget: false,
    episodeScoped: true,
  },
  call_for_help: {
    priority: 'required',
    npcCooldownSec: 60,
    areaWindowSec: 60,
    maxPerAreaWindow: 1,
    usesOptionalBudget: false,
    episodeScoped: true,
  },
  livestock_danger: {
    priority: 'required',
    npcCooldownSec: 60,
    areaWindowSec: 60,
    maxPerAreaWindow: 1,
    usesOptionalBudget: false,
    episodeScoped: true,
  },
  guard_response: {
    priority: 'required',
    npcCooldownSec: 60,
    areaWindowSec: 60,
    maxPerAreaWindow: 2,
    usesOptionalBudget: false,
    episodeScoped: true,
  },
  combat_start: {
    priority: 'required',
    npcCooldownSec: 60,
    areaWindowSec: 60,
    maxPerAreaWindow: 2,
    usesOptionalBudget: false,
    episodeScoped: true,
  },
}

/** Resolve the policy for a bark intent, or `null` if the intent is not a bark. */
export function npcBarkPolicyFor(intent: NpcVoiceSemanticIntent): NpcBarkPolicy | null {
  if (!isNpcBarkIntent(intent)) return null
  return NPC_BARK_POLICIES[intent]
}

export function isNpcBarkIntent(intent: NpcVoiceSemanticIntent): intent is NpcBarkIntent {
  return Object.prototype.hasOwnProperty.call(NPC_BARK_POLICIES, intent)
}

/** Longest rolling window retained by the limiter (for lazy pruning). */
export function longestNpcBarkRetentionSec(): number {
  let max = NPC_OPTIONAL_BARK_AREA_WINDOW_SEC
  for (const policy of Object.values(NPC_BARK_POLICIES)) {
    max = Math.max(max, policy.npcCooldownSec, policy.areaWindowSec)
  }
  return max
}
