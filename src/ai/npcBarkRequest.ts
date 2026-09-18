/**
 * Shared NPC bark request boundary (npc-049): resolve voice → admit via
 * limiter → spatial playback. Simulation callers own *when*; this owns
 * throttling, asset lookup, and presentation. Denial is always a silent
 * no-op for simulation.
 *
 * @domain npc
 */

import type { WorldSoundPosition } from '../audio/createWorldAudio'
import { playNpcVoiceAt } from '../audio/npcVoicePlayback'
import { type NpcBarkLimiter, type NpcBarkRejectReason } from './npcBarkLimiter'
import { isNpcBarkIntent, type NpcBarkIntent } from './npcBarkPolicies'
import {
  type NpcVoiceResolveInput,
  type NpcVoiceSemanticIntent,
  resolveNpcVoiceLine,
} from './npcVoiceLines'

export type NpcBarkRequest = {
  npc: Pick<NpcVoiceResolveInput, 'id' | 'gender' | 'role' | 'age' | 'voiceProfileId'>
  position: WorldSoundPosition
  areaKey: string
  intent: NpcBarkIntent
  /** Simulation clock seconds (`NpcAgent.simClock`). */
  nowSim: number
  episodeKey?: string
}

export type NpcBarkDecision =
  | { accepted: true; url: string }
  | { accepted: false; reason: NpcBarkRejectReason | 'no-voice-asset' }

export type RequestNpcBark = (request: NpcBarkRequest) => NpcBarkDecision

/**
 * World-composition wiring (same shape as `configureNpcPlayerReactionAudio`) —
 * avoids threading the bark requester through the settlements positional DI
 * chain. Per-agent `deps.requestNpcBark` overrides this when set.
 */
let sharedRequestNpcBark: RequestNpcBark | null = null

/** Wire (or clear) the shared bark request function used by loaded NPCs. */
export function configureRequestNpcBark(request: RequestNpcBark | null): void {
  sharedRequestNpcBark = request
}

export function getSharedRequestNpcBark(): RequestNpcBark | null {
  return sharedRequestNpcBark
}

/**
 * Resolve a bark URL for the requested intent. Shepherd `livestock_danger`
 * falls back to `danger_alert` when no livestock-specific asset exists —
 * explicit request-layer alias, not a generic resolver rewrite.
 */
export function resolveNpcBarkVoiceUrl(
  npc: NpcBarkRequest['npc'],
  intent: NpcBarkIntent,
): { url: string; resolvedIntent: NpcVoiceSemanticIntent } | undefined {
  const primary = resolveNpcVoiceLine(npc, intent)
  if (primary) return { url: primary, resolvedIntent: intent }
  if (intent === 'livestock_danger') {
    const fallback = resolveNpcVoiceLine(npc, 'danger_alert')
    if (fallback) return { url: fallback, resolvedIntent: 'danger_alert' }
  }
  return undefined
}

/**
 * Build a `RequestNpcBark` bound to one shared limiter instance.
 *
 * Order: resolve asset first (missing file does not spend budget) → admit →
 * play. Playback failure after admission is still a presentation-only event.
 */
export function createRequestNpcBark(limiter: NpcBarkLimiter): RequestNpcBark {
  return (request) => {
    if (!isNpcBarkIntent(request.intent)) {
      return { accepted: false, reason: 'unknown-intent' }
    }

    const resolved = resolveNpcBarkVoiceUrl(request.npc, request.intent)
    if (!resolved) return { accepted: false, reason: 'no-voice-asset' }

    const decision = limiter.tryAdmit({
      npcId: request.npc.id,
      areaKey: request.areaKey,
      intent: request.intent,
      nowSim: request.nowSim,
      episodeKey: request.episodeKey,
    })
    if (!decision.accepted) return decision

    playNpcVoiceAt(request.position, resolved.url)
    return { accepted: true, url: resolved.url }
  }
}
