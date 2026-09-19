import type { NpcRelationships } from '../settlement/npcRelationships'
import type { NpcGender } from './characters'
import type { BigFivePersonality } from './dialogue'
import { gameHoursToRealSeconds } from '../world/timeConversion'
import { resolveCampfireTalk } from './campfireTalk'

/** Per-participant presentation cue for a Social Place conversation
 *  (plan npc-045). Selected once per pair in `advanceSocialPairing` —
 *  questioner gets `delaySec: 0`, responder gets the authored answer delay. */
export type ConversationVoiceCue = {
  url: string
  delaySec: number
}

/**
 * Social Place conversation behaviour (plan 151) — small, pure/testable
 * helpers behind the `campfire` social activity's partner discovery,
 * reservation, timing and relationship outcome. Deliberately not a scoring
 * engine: partner selection stays "same place + available + not self", and
 * `extraversion` only ever changes how often an NPC attempts a conversation,
 * never which candidate it picks (see the implementation notes §9).
 *
 * `advanceSocialPairing` is the one non-pure entry point — it mutates the
 * two paired participants (via their own `beginConversation`) and the shared
 * `NpcRelationships` store (via each pair's own `applyOutcomeOnce`), but the
 * search/selection/timing/outcome it uses are all pure functions below,
 * independently unit-testable without a real `NpcAgent`.
 */

/** Structural view `NpcAgent` already satisfies (`id`/`personality` are
 *  public readonly fields; the three methods are added by this plan) — kept
 *  narrow and NpcAgent-agnostic so tests can pair plain mock objects instead
 *  of constructing real agents. */
export type SocialParticipant = {
  readonly id: string
  readonly gender: NpcGender
  readonly personality: BigFivePersonality
  /** Side-effect-free read of whether this participant's per-NPC retry
   *  cooldown has elapsed at the current simulation clock. Used by
   *  `advanceSocialPairing` for an idle fast path only — authoritative
   *  eligibility remains `socialCandidate()`. @domain npc */
  socialAttemptDue: () => boolean
  /** `null` unless this participant is currently settled at its own Social
   *  Place, unreserved, alive, in social wander, and its extraversion-scaled
   *  retry cooldown has elapsed. A truthy return reschedules the next
   *  allowed attempt; calls while still on cooldown or otherwise ineligible
   *  do not advance the cooldown. */
  socialCandidate: () => SocialCandidateView | null
  /** Starts the shared `conversation` action on this participant alone —
   *  `advanceSocialPairing` calls it once per side of a pair. Optional
   *  `voiceCue` is presentation-only (campfire spoken exchange, plan
   *  npc-045) — omitted when no compatible authored pair exists. */
  beginConversation: (
    partnerId: string,
    durationSec: number,
    applyOutcomeOnce: () => void,
    onEarlyExit: () => void,
    voiceCue?: ConversationVoiceCue,
  ) => void
  /** Called on this participant when its *partner* leaves the conversation
   *  early (critical need, vigor collapse, death) — tears down this side
   *  without applying any relationship delta and without calling back. */
  releaseConversationPartner: () => void
}

export type SocialCandidateView = {
  id: string
  placeId: string
}

/**
 * V1 partner selection (plan 151 §"Partner selection"): same Social Place +
 * available + not self → candidate, no ranking by personality/traits/role/
 * relationship/family/interests/memory. Deterministic tie-break (lowest id)
 * so the same candidate set always resolves the same way — this is a
 * reproducibility requirement, not a preference ordering.
 */
export function findConversationPartner(
  self: SocialCandidateView,
  candidates: readonly SocialCandidateView[],
): string | null {
  let best: SocialCandidateView | null = null
  for (const candidate of candidates) {
    if (candidate.id === self.id || candidate.placeId !== self.placeId) continue
    if (!best || candidate.id < best.id) best = candidate
  }
  return best?.id ?? null
}

/** Real-seconds retry cooldown between this NPC's own conversation attempts
 *  (implementation notes §9) — `extraversion` only ever changes *how often*
 *  an attempt happens, never candidate selection. High extraversion tries
 *  again soon; low extraversion waits much longer. Same order of magnitude
 *  as other idle-loop cooldowns in `NpcAgent.ts` (small, real seconds, not
 *  game-time). */
const SOCIAL_ATTEMPT_COOLDOWN_RANGE: readonly [number, number] = [15, 90]
/** +/-20% jitter so many NPCs with the same extraversion don't all retry in
 *  perfect lockstep. */
const SOCIAL_ATTEMPT_COOLDOWN_JITTER = 0.2

export function conversationAttemptCooldownSec(
  extraversion: number,
  rng: () => number = Math.random,
): number {
  const [low, high] = SOCIAL_ATTEMPT_COOLDOWN_RANGE
  const base = high - (high - low) * clamp01(extraversion)
  const jitter = 1 + (rng() * 2 - 1) * SOCIAL_ATTEMPT_COOLDOWN_JITTER
  return base * jitter
}

/** World-time span of one conversation (plan §"Conversation": "2-5 minut
 *  czasu świata") converted to real seconds via the same `dayLengthSec`
 *  ratio every other game-time duration in this codebase uses
 *  (`world/timeConversion.ts`) — both participants must receive this exact
 *  same value, generated once by the caller (`advanceSocialPairing`), never
 *  independently re-sampled per participant. */
const CONVERSATION_DURATION_GAME_MINUTES_RANGE: readonly [number, number] = [2, 5]

export function conversationDurationSec(dayLengthSec: number, rng: () => number = Math.random): number {
  const [min, max] = CONVERSATION_DURATION_GAME_MINUTES_RANGE
  const minutes = min + rng() * (max - min)
  return gameHoursToRealSeconds(minutes / 60, dayLengthSec)
}

export type ConversationOutcome = {
  positive: boolean
  delta: number
}

/** Symmetric relation delta applied on a positive/negative outcome — same
 *  order of magnitude as `QuestManager`'s `QUEST_RELATION_REWARD` (1), so a
 *  conversation reads as comparably significant to a quest turn-in. */
const RELATION_POSITIVE_DELTA = 1
const RELATION_NEGATIVE_DELTA = -1

/**
 * V1 conversation outcome (implementation notes §8 "Conversation outcome") —
 * a small, deliberately simple deterministic-given-`rng` roll, not a
 * compatibility engine. Higher combined agreeableness raises the chance of a
 * positive outcome; an already-positive existing relation nudges it further
 * (a passing acquaintance is more likely to have another pleasant chat), an
 * already-negative one nudges the other way.
 */
export function conversationOutcome(
  personalityA: BigFivePersonality,
  personalityB: BigFivePersonality,
  existingRelation: number,
  rng: () => number = Math.random,
): ConversationOutcome {
  const agreeableness = (personalityA.agreeableness + personalityB.agreeableness) / 2
  const relationNudge = clamp(existingRelation, -3, 3) * 0.03
  const positiveChance = clamp01(0.5 + (agreeableness - 0.5) * 0.6 + relationNudge)
  const positive = rng() < positiveChance
  return { positive, delta: positive ? RELATION_POSITIVE_DELTA : RELATION_NEGATIVE_DELTA }
}

/**
 * One settlement-local pairing pass (implementation notes §4/§5/§6) — reuses
 * the settlement's own NPC list (the caller already has it, see
 * `Settlement.update()`), never a global registry. For every participant
 * that is currently an available `socialCandidate()`, atomically pairs it
 * with the lowest-id other available candidate at the same Social Place:
 * both reservations, the one shared duration, and the one shared outcome
 * closure are set up before either participant's `beginConversation` runs,
 * so a third participant can never be offered either NPC mid-pairing.
 */
export function advanceSocialPairing(
  participants: readonly SocialParticipant[],
  relations: NpcRelationships,
  dayLengthSec: number,
  rng: () => number = Math.random,
): void {
  let anyAttemptDue = false
  for (const participant of participants) {
    if (participant.socialAttemptDue()) {
      anyAttemptDue = true
      break
    }
  }
  if (!anyAttemptDue) return

  const entries: { participant: SocialParticipant, view: SocialCandidateView }[] = []
  for (const participant of participants) {
    const view = participant.socialCandidate()
    if (view) entries.push({ participant, view })
  }

  const taken = new Set<string>()
  for (const entry of entries) {
    if (taken.has(entry.view.id)) continue
    let partnerEntry: (typeof entries)[number] | null = null
    for (const other of entries) {
      if (other === entry) continue
      if (taken.has(other.view.id)) continue
      if (other.view.placeId !== entry.view.placeId) continue
      if (!partnerEntry || other.view.id < partnerEntry.view.id) partnerEntry = other
    }
    if (!partnerEntry) continue

    taken.add(entry.view.id)
    taken.add(partnerEntry.view.id)

    const durationSec = conversationDurationSec(dayLengthSec, rng)
    const outcome = conversationOutcome(
      entry.participant.personality,
      partnerEntry.participant.personality,
      relations.get(entry.view.id, partnerEntry.view.id),
      rng,
    )
    let applied = false
    const applyOutcomeOnce = (): void => {
      if (applied) return
      applied = true
      relations.adjust(entry.view.id, partnerEntry.view.id, outcome.delta)
    }

    // One shared spoken exchange per pair (plan npc-045) — entry is the
    // questioner, partnerEntry the responder. Same-gender / missing catalog
    // yields no cues; simulation conversation still proceeds.
    const talk = resolveCampfireTalk(
      entry.participant.gender,
      partnerEntry.participant.gender,
      rng,
    )

    const questionCue: ConversationVoiceCue | undefined = talk
      ? { url: talk.questionUrl, delaySec: 0 }
      : undefined
    const answerCue: ConversationVoiceCue | undefined = talk
      ? { url: talk.answerUrl, delaySec: talk.answerDelaySec }
      : undefined

    entry.participant.beginConversation(
      partnerEntry.view.id,
      durationSec,
      applyOutcomeOnce,
      () => partnerEntry.participant.releaseConversationPartner(),
      questionCue,
    )
    partnerEntry.participant.beginConversation(
      entry.view.id,
      durationSec,
      applyOutcomeOnce,
      () => entry.participant.releaseConversationPartner(),
      answerCue,
    )
  }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x))
}
