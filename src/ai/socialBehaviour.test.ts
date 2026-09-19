import { describe, expect, it, vi } from 'vitest'
import type { NpcRelationships } from '../settlement/npcRelationships'
import type { NpcGender } from './characters'
import {
  advanceSocialPairing,
  conversationAttemptCooldownSec,
  conversationDurationSec,
  conversationOutcome,
  type ConversationVoiceCue,
  findConversationPartner,
  type SocialCandidateView,
  type SocialParticipant,
} from './socialBehaviour'

const NEUTRAL_PERSONALITY = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
}

describe('findConversationPartner', () => {
  const self: SocialCandidateView = { id: 'b', placeId: 'campfire:1' }

  it('null with no candidates', () => {
    expect(findConversationPartner(self, [])).toBeNull()
  })

  it('excludes self and candidates at a different Social Place', () => {
    const candidates: SocialCandidateView[] = [
      { id: 'b', placeId: 'campfire:1' }, // self, must be excluded
      { id: 'c', placeId: 'campfire:2' }, // other settlement's campfire
    ]
    expect(findConversationPartner(self, candidates)).toBeNull()
  })

  it('picks the lowest id among same-place eligible candidates (deterministic)', () => {
    const candidates: SocialCandidateView[] = [
      { id: 'z', placeId: 'campfire:1' },
      { id: 'a', placeId: 'campfire:1' },
      { id: 'm', placeId: 'campfire:1' },
    ]
    expect(findConversationPartner(self, candidates)).toBe('a')
  })
})

describe('conversationAttemptCooldownSec', () => {
  it('high extraversion retries sooner than low extraversion', () => {
    const neutralRng = () => 0.5
    const low = conversationAttemptCooldownSec(0, neutralRng)
    const high = conversationAttemptCooldownSec(1, neutralRng)
    expect(high).toBeLessThan(low)
  })
})

describe('conversationDurationSec', () => {
  it('converts the 2-5 game-minute range through dayLengthSec, same ratio as other game-time durations', () => {
    const dayLengthSec = 480
    const min = conversationDurationSec(dayLengthSec, () => 0)
    const max = conversationDurationSec(dayLengthSec, () => 0.999999)
    // 2 game-minutes / 1440 game-minutes-per-day * dayLengthSec
    expect(min).toBeCloseTo((2 / 1440) * dayLengthSec, 3)
    expect(max).toBeCloseTo((5 / 1440) * dayLengthSec, 2)
  })
})

describe('conversationOutcome', () => {
  it('higher combined agreeableness raises the positive chance for the same roll', () => {
    const roll = () => 0.6
    const disagreeable = conversationOutcome(
      { ...NEUTRAL_PERSONALITY, agreeableness: 0 },
      { ...NEUTRAL_PERSONALITY, agreeableness: 0 },
      0,
      roll,
    )
    const agreeable = conversationOutcome(
      { ...NEUTRAL_PERSONALITY, agreeableness: 1 },
      { ...NEUTRAL_PERSONALITY, agreeableness: 1 },
      0,
      roll,
    )
    expect(disagreeable.positive).toBe(false)
    expect(agreeable.positive).toBe(true)
  })

  it('positive outcome has a positive delta, negative outcome a negative delta', () => {
    const positive = conversationOutcome(NEUTRAL_PERSONALITY, NEUTRAL_PERSONALITY, 0, () => 0)
    const negative = conversationOutcome(NEUTRAL_PERSONALITY, NEUTRAL_PERSONALITY, 0, () => 0.999)
    expect(positive.positive).toBe(true)
    expect(positive.delta).toBeGreaterThan(0)
    expect(negative.positive).toBe(false)
    expect(negative.delta).toBeLessThan(0)
  })
})

function makeRelations(): NpcRelationships & { adjustCalls: [string, string, number][] } {
  const store = new Map<string, number>()
  const adjustCalls: [string, string, number][] = []
  return {
    adjustCalls,
    get: (a, b) => store.get(`${a}|${b}`) ?? store.get(`${b}|${a}`) ?? 0,
    adjust: (a, b, delta) => {
      adjustCalls.push([a, b, delta])
      store.set(`${a}|${b}`, (store.get(`${a}|${b}`) ?? store.get(`${b}|${a}`) ?? 0) + delta)
    },
    snapshot: () => [],
  }
}

type MockParticipant = SocialParticipant & {
  beginConversationCalls: {
    partnerId: string
    durationSec: number
    applyOutcomeOnce: () => void
    onEarlyExit: () => void
    voiceCue?: ConversationVoiceCue
  }[]
  releaseCalls: number
}

function makeParticipant(
  id: string,
  view: SocialCandidateView | null,
  gender: NpcGender = 'male',
  options?: { attemptDue?: boolean },
): MockParticipant & { socialCandidateCalls: number } {
  const beginConversationCalls: MockParticipant['beginConversationCalls'] = []
  let socialCandidateCalls = 0
  const attemptDue = options?.attemptDue ?? view != null
  return {
    id,
    gender,
    personality: NEUTRAL_PERSONALITY,
    socialAttemptDue: () => attemptDue,
    socialCandidate: () => {
      socialCandidateCalls += 1
      return view
    },
    beginConversation: (partnerId, durationSec, applyOutcomeOnce, onEarlyExit, voiceCue) => {
      beginConversationCalls.push({ partnerId, durationSec, applyOutcomeOnce, onEarlyExit, voiceCue })
    },
    releaseConversationPartner: vi.fn(),
    beginConversationCalls,
    get socialCandidateCalls() {
      return socialCandidateCalls
    },
    get releaseCalls() {
      return (this.releaseConversationPartner as ReturnType<typeof vi.fn>).mock.calls.length
    },
  }
}

describe('advanceSocialPairing', () => {
  it('returns immediately without calling socialCandidate when no participant is attempt-due', () => {
    const a = makeParticipant('a', { id: 'a', placeId: 'campfire:1' }, 'male', { attemptDue: false })
    const b = makeParticipant('b', { id: 'b', placeId: 'campfire:1' }, 'male', { attemptDue: false })
    const relations = makeRelations()

    advanceSocialPairing([a, b], relations, 480)

    expect(a.socialCandidateCalls).toBe(0)
    expect(b.socialCandidateCalls).toBe(0)
    expect(a.beginConversationCalls).toHaveLength(0)
  })

  it('still runs authoritative socialCandidate when at least one participant is attempt-due', () => {
    const a = makeParticipant('a', { id: 'a', placeId: 'campfire:1' }, 'male', { attemptDue: true })
    const b = makeParticipant('b', null, 'male', { attemptDue: false })
    const relations = makeRelations()

    advanceSocialPairing([a, b], relations, 480)

    expect(a.socialCandidateCalls).toBe(1)
    expect(b.socialCandidateCalls).toBe(1)
    expect(a.beginConversationCalls).toHaveLength(0)
  })

  it('does not pair when attempt-due but socialCandidate rejects eligibility', () => {
    const a = makeParticipant('a', null, 'male', { attemptDue: true })
    const b = makeParticipant('b', null, 'male', { attemptDue: true })
    const relations = makeRelations()

    advanceSocialPairing([a, b], relations, 480)

    expect(a.socialCandidateCalls).toBe(1)
    expect(b.socialCandidateCalls).toBe(1)
    expect(a.beginConversationCalls).toHaveLength(0)
  })

  it('pairs two available NPCs at the same Social Place with one shared duration', () => {
    const a = makeParticipant('a', { id: 'a', placeId: 'campfire:1' })
    const b = makeParticipant('b', { id: 'b', placeId: 'campfire:1' })
    const relations = makeRelations()

    advanceSocialPairing([a, b], relations, 480, () => 0.4)

    expect(a.beginConversationCalls).toHaveLength(1)
    expect(b.beginConversationCalls).toHaveLength(1)
    expect(a.beginConversationCalls[0]!.partnerId).toBe('b')
    expect(b.beginConversationCalls[0]!.partnerId).toBe('a')
    expect(a.beginConversationCalls[0]!.durationSec).toBe(b.beginConversationCalls[0]!.durationSec)
  })

  it('does not pair candidates at different Social Places', () => {
    const a = makeParticipant('a', { id: 'a', placeId: 'campfire:1' })
    const b = makeParticipant('b', { id: 'b', placeId: 'campfire:2' })
    const relations = makeRelations()

    advanceSocialPairing([a, b], relations, 480)

    expect(a.beginConversationCalls).toHaveLength(0)
    expect(b.beginConversationCalls).toHaveLength(0)
  })

  it('skips NPCs that are not currently an available candidate', () => {
    const a = makeParticipant('a', { id: 'a', placeId: 'campfire:1' })
    const b = makeParticipant('b', null) // reserved/mid-conversation/not settled
    const relations = makeRelations()

    advanceSocialPairing([a, b], relations, 480)

    expect(a.beginConversationCalls).toHaveLength(0)
  })

  it('a third available NPC at the same place is left unpaired once two are reserved (atomic reservation)', () => {
    const a = makeParticipant('a', { id: 'a', placeId: 'campfire:1' })
    const b = makeParticipant('b', { id: 'b', placeId: 'campfire:1' })
    const c = makeParticipant('c', { id: 'c', placeId: 'campfire:1' })
    const relations = makeRelations()

    advanceSocialPairing([a, b, c], relations, 480)

    // a pairs with the lowest-id candidate (b); c is left without a partner
    // this pass rather than a third NPC ever joining an already-formed pair.
    expect(a.beginConversationCalls).toHaveLength(1)
    expect(b.beginConversationCalls).toHaveLength(1)
    expect(c.beginConversationCalls).toHaveLength(0)
  })

  it('applies exactly one symmetric relationship delta even if both onComplete closures fire', () => {
    const a = makeParticipant('a', { id: 'a', placeId: 'campfire:1' })
    const b = makeParticipant('b', { id: 'b', placeId: 'campfire:1' })
    const relations = makeRelations()

    advanceSocialPairing([a, b], relations, 480, () => 0.1)

    const applyA = a.beginConversationCalls[0]!.applyOutcomeOnce
    const applyB = b.beginConversationCalls[0]!.applyOutcomeOnce
    expect(applyA).toBe(applyB)
    applyA()
    applyB()
    applyA()
    expect(relations.adjustCalls).toHaveLength(1)
  })

  it('an early-exit callback releases the other participant', () => {
    const a = makeParticipant('a', { id: 'a', placeId: 'campfire:1' })
    const b = makeParticipant('b', { id: 'b', placeId: 'campfire:1' })
    const relations = makeRelations()

    advanceSocialPairing([a, b], relations, 480)

    a.beginConversationCalls[0]!.onEarlyExit()
    expect(b.releaseCalls).toBe(1)
    b.beginConversationCalls[0]!.onEarlyExit()
    expect(a.releaseCalls).toBe(1)
  })

  it('shares one campfire exchange: questioner delay 0, responder authored delay', () => {
    const a = makeParticipant('a', { id: 'a', placeId: 'campfire:1' }, 'female')
    const b = makeParticipant('b', { id: 'b', placeId: 'campfire:1' }, 'male')
    const relations = makeRelations()

    // duration + outcome each consume one rng(); talk selection uses the third.
    let calls = 0
    const rng = () => {
      calls += 1
      return calls === 3 ? 0 : 0.4
    }
    advanceSocialPairing([a, b], relations, 480, rng)

    const qCue = a.beginConversationCalls[0]!.voiceCue
    const aCue = b.beginConversationCalls[0]!.voiceCue
    expect(qCue).toBeDefined()
    expect(aCue).toBeDefined()
    expect(qCue!.delaySec).toBe(0)
    expect(aCue!.delaySec).toBeGreaterThan(0)
    expect(qCue!.url).toContain('campfire_female_')
    expect(qCue!.url).toContain('_question_')
    expect(aCue!.url).toContain('campfire_male_')
    expect(aCue!.url).toContain('_answer_')
  })

  it('begins simulation conversation with no structured cues for same-gender pairs', () => {
    const a = makeParticipant('a', { id: 'a', placeId: 'campfire:1' }, 'male')
    const b = makeParticipant('b', { id: 'b', placeId: 'campfire:1' }, 'male')
    const relations = makeRelations()

    advanceSocialPairing([a, b], relations, 480, () => 0.4)

    expect(a.beginConversationCalls).toHaveLength(1)
    expect(b.beginConversationCalls).toHaveLength(1)
    expect(a.beginConversationCalls[0]!.voiceCue).toBeUndefined()
    expect(b.beginConversationCalls[0]!.voiceCue).toBeUndefined()
  })
})
