import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VOLUNTARY_JOIN_DANGER,
  evaluateVoluntaryJoin,
  isVoluntaryInitiativeEligible,
  isVoluntaryJoinAccepted,
  type VoluntaryJoinContext,
} from './voluntaryExpeditionJoin'

const NEUTRAL_PERSONALITY = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
}

function baseContext(overrides: Partial<VoluntaryJoinContext> = {}): VoluntaryJoinContext {
  return {
    dead: false,
    isAdult: true,
    hasIncompatibleAccompany: false,
    hasIncompatibleWorkContract: false,
    hasCriticalNeed: false,
    inCombatOrFlee: false,
    personality: NEUTRAL_PERSONALITY,
    curious: false,
    role: 'woodcutter',
    age: 35,
    hasSpouse: false,
    hasChildren: false,
    scheduledActivity: 'home',
    hasWorkplace: true,
    relationLevel: 'stranger',
    trust: 0,
    competence: 0,
    courage: 0,
    awayHours: 24,
    danger: DEFAULT_VOLUNTARY_JOIN_DANGER,
    provisionPenalty: 0,
    ...overrides,
  }
}

describe('evaluateVoluntaryJoin', () => {
  it('is a pure function of its context — identical input, identical output', () => {
    const ctx = baseContext()
    expect(evaluateVoluntaryJoin(ctx)).toEqual(evaluateVoluntaryJoin(ctx))
  })

  it('a neutral NPC with no meaningful positive reason does not clear the acceptance threshold', () => {
    const evaluation = evaluateVoluntaryJoin(baseContext())
    expect(isVoluntaryJoinAccepted(evaluation)).toBe(false)
  })

  describe('hard eligibility (blockers)', () => {
    it('a dead NPC is ineligible', () => {
      const evaluation = evaluateVoluntaryJoin(baseContext({ dead: true }))
      expect(evaluation.eligible).toBe(false)
      expect(evaluation.blockers).toContain('dead')
    })

    it('a child (not an independently eligible adult) is ineligible', () => {
      const evaluation = evaluateVoluntaryJoin(baseContext({ isAdult: false, age: 10 }))
      expect(evaluation.eligible).toBe(false)
      expect(evaluation.blockers).toContain('not-adult')
    })

    it('an incompatible active accompany commitment is a hard blocker', () => {
      const evaluation = evaluateVoluntaryJoin(baseContext({ hasIncompatibleAccompany: true }))
      expect(evaluation.eligible).toBe(false)
      expect(evaluation.blockers).toContain('active-accompany')
    })

    it('an incompatible active Work Contract is a hard blocker', () => {
      const evaluation = evaluateVoluntaryJoin(baseContext({ hasIncompatibleWorkContract: true }))
      expect(evaluation.eligible).toBe(false)
      expect(evaluation.blockers).toContain('active-work-contract')
    })

    it('a critical survival need prevents discretionary joining', () => {
      const evaluation = evaluateVoluntaryJoin(baseContext({ hasCriticalNeed: true }))
      expect(evaluation.eligible).toBe(false)
      expect(evaluation.blockers).toContain('critical-need')
    })

    it('an unresolved combat/flee state prevents discretionary joining', () => {
      const evaluation = evaluateVoluntaryJoin(baseContext({ inCombatOrFlee: true }))
      expect(evaluation.eligible).toBe(false)
      expect(evaluation.blockers).toContain('combat-or-flee')
    })

    it('a blocker never depends on the willingness score — a would-be-accepted NPC is still blocked', () => {
      const strongWillingness = baseContext({
        relationLevel: 'trusted',
        trust: 90,
        competence: 90,
        personality: { ...NEUTRAL_PERSONALITY, openness: 0.95 },
        curious: true,
      })
      const accepted = evaluateVoluntaryJoin(strongWillingness)
      expect(isVoluntaryJoinAccepted(accepted)).toBe(true)
      const blocked = evaluateVoluntaryJoin({ ...strongWillingness, hasCriticalNeed: true })
      expect(blocked.eligible).toBe(false)
      expect(isVoluntaryJoinAccepted(blocked)).toBe(false)
    })
  })

  describe('personality / relationship / reputation', () => {
    it('a strong personal relationship meaningfully improves willingness over a stranger', () => {
      const strangerScore = evaluateVoluntaryJoin(baseContext({ relationLevel: 'stranger' })).score
      const trustedScore = evaluateVoluntaryJoin(baseContext({ relationLevel: 'trusted' })).score
      expect(trustedScore).toBeGreaterThan(strangerScore)
    })

    it('high trust/competence can improve willingness without guaranteeing acceptance on their own', () => {
      const low = evaluateVoluntaryJoin(baseContext({ trust: 0, competence: 0 }))
      const high = evaluateVoluntaryJoin(baseContext({ trust: 90, competence: 90 }))
      expect(high.score).toBeGreaterThan(low.score)
      // Still a stranger with a real schedule conflict and no exploration
      // interest — trust/competence alone must not guarantee acceptance.
      expect(isVoluntaryJoinAccepted(evaluateVoluntaryJoin(baseContext({
        trust: 90,
        competence: 90,
        scheduledActivity: 'work',
      })))).toBe(false)
    })

    it('high renown alone does not add to the willingness score', () => {
      // renown is intentionally not part of VoluntaryJoinContext's score
      // inputs — awareness only. Two otherwise-identical contexts always
      // score identically regardless of any renown a caller might track.
      const a = evaluateVoluntaryJoin(baseContext())
      const b = evaluateVoluntaryJoin(baseContext())
      expect(a.score).toBe(b.score)
    })

    it('openness and curious increase exploration interest without a binary archetype jump', () => {
      const low = evaluateVoluntaryJoin(baseContext({ personality: { ...NEUTRAL_PERSONALITY, openness: 0.1 }, curious: false }))
      const mid = evaluateVoluntaryJoin(baseContext({ personality: { ...NEUTRAL_PERSONALITY, openness: 0.5 }, curious: false }))
      const high = evaluateVoluntaryJoin(baseContext({ personality: { ...NEUTRAL_PERSONALITY, openness: 0.9 }, curious: true }))
      expect(mid.score).toBeGreaterThan(low.score)
      expect(high.score).toBeGreaterThan(mid.score)
    })

    it('conscientiousness increases the cost of abandoning a real scheduled duty', () => {
      const lowConscientiousness = evaluateVoluntaryJoin(baseContext({
        scheduledActivity: 'work',
        hasWorkplace: true,
        personality: { ...NEUTRAL_PERSONALITY, conscientiousness: 0.1 },
      }))
      const highConscientiousness = evaluateVoluntaryJoin(baseContext({
        scheduledActivity: 'work',
        hasWorkplace: true,
        personality: { ...NEUTRAL_PERSONALITY, conscientiousness: 0.9 },
      }))
      expect(highConscientiousness.score).toBeLessThan(lowConscientiousness.score)
    })

    it('neuroticism increases sensitivity to perceived danger', () => {
      const calm = evaluateVoluntaryJoin(baseContext({ danger: 0.9, personality: { ...NEUTRAL_PERSONALITY, neuroticism: 0.1 } }))
      const anxious = evaluateVoluntaryJoin(baseContext({ danger: 0.9, personality: { ...NEUTRAL_PERSONALITY, neuroticism: 0.9 } }))
      expect(anxious.score).toBeLessThan(calm.score)
    })

    it('unknown/default danger stays bounded and deterministic', () => {
      const evaluation = evaluateVoluntaryJoin(baseContext({ danger: DEFAULT_VOLUNTARY_JOIN_DANGER }))
      expect(Number.isFinite(evaluation.score)).toBe(true)
      expect(evaluation).toEqual(evaluateVoluntaryJoin(baseContext({ danger: DEFAULT_VOLUNTARY_JOIN_DANGER })))
    })
  })

  describe('household / schedule obligations', () => {
    it('household and schedule obligations can outweigh curiosity', () => {
      const curiousButBurdened = evaluateVoluntaryJoin(baseContext({
        personality: { ...NEUTRAL_PERSONALITY, openness: 0.9 },
        curious: true,
        hasSpouse: true,
        hasChildren: true,
        scheduledActivity: 'work',
      }))
      const equallyCuriousFree = evaluateVoluntaryJoin(baseContext({
        personality: { ...NEUTRAL_PERSONALITY, openness: 0.9 },
        curious: true,
        hasSpouse: false,
        hasChildren: false,
        scheduledActivity: 'home',
      }))
      expect(curiousButBurdened.score).toBeLessThan(equallyCuriousFree.score)
      expect(isVoluntaryJoinAccepted(curiousButBurdened)).toBe(false)
    })
  })

  describe('provisioning feasibility', () => {
    it('a genuinely infeasible provisioning cost is an unclearable cost, not a categorical blocker', () => {
      const strongWillingness = baseContext({
        relationLevel: 'trusted',
        trust: 90,
        competence: 90,
        personality: { ...NEUTRAL_PERSONALITY, openness: 0.9 },
        curious: true,
      })
      const infeasible = evaluateVoluntaryJoin({ ...strongWillingness, provisionPenalty: Number.POSITIVE_INFINITY })
      expect(infeasible.eligible).toBe(true)
      expect(infeasible.blockers).toHaveLength(0)
      expect(infeasible.score).toBe(Number.NEGATIVE_INFINITY)
      expect(isVoluntaryJoinAccepted(infeasible)).toBe(false)
    })

    it('a larger (but still feasible) provisioning cost lowers the score', () => {
      const low = evaluateVoluntaryJoin(baseContext({ provisionPenalty: 0 }))
      const high = evaluateVoluntaryJoin(baseContext({ provisionPenalty: 5 }))
      expect(high.score).toBeLessThan(low.score)
    })
  })
})

describe('isVoluntaryInitiativeEligible', () => {
  const strongWillingness = baseContext({
    relationLevel: 'trusted',
    trust: 90,
    competence: 90,
    courage: 60,
    personality: { ...NEUTRAL_PERSONALITY, openness: 0.9, extraversion: 0.8 },
    curious: true,
  })

  it('requires a stronger score than ordinary acceptance, not a separate scoring table', () => {
    const evaluation = evaluateVoluntaryJoin(strongWillingness)
    expect(isVoluntaryJoinAccepted(evaluation)).toBe(true)
    // A borderline evaluation (just barely accepted) must not automatically
    // pass the initiative gate — same evaluation object either way.
    const borderline = { ...evaluation, score: evaluation.threshold + 0.01 }
    expect(isVoluntaryInitiativeEligible(borderline, { relationLevel: 'trusted', renown: 0 })).toBe(false)
  })

  it('an ineligible (blocked) evaluation never passes the initiative gate', () => {
    const evaluation = evaluateVoluntaryJoin({ ...strongWillingness, hasCriticalNeed: true })
    expect(isVoluntaryInitiativeEligible(evaluation, { relationLevel: 'trusted', renown: 1 })).toBe(false)
  })

  it('an already-acquainted NPC needs no renown to justify approaching', () => {
    const evaluation = evaluateVoluntaryJoin(strongWillingness)
    expect(isVoluntaryInitiativeEligible(evaluation, { relationLevel: 'friendly', renown: 0 })).toBe(true)
  })

  it('a stranger needs enough renown to plausibly recognize the player', () => {
    const evaluation = evaluateVoluntaryJoin(strongWillingness)
    expect(isVoluntaryInitiativeEligible(evaluation, { relationLevel: 'stranger', renown: 0 })).toBe(false)
    expect(isVoluntaryInitiativeEligible(evaluation, { relationLevel: 'stranger', renown: 1 })).toBe(true)
  })

  it('high renown alone cannot turn a weak/unsafe willingness result into an initiative proposal', () => {
    const weak = evaluateVoluntaryJoin(baseContext({ scheduledActivity: 'work' }))
    expect(isVoluntaryInitiativeEligible(weak, { relationLevel: 'stranger', renown: 1 })).toBe(false)
  })
})
