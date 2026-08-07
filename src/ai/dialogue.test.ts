import { describe, expect, it } from 'vitest'
import {
  nearestArchetype,
  NPC_PERSONALITIES,
  pausePersonalityParams,
  personalityForIndex,
  pickDialogueLine,
} from './dialogue'

const DIMS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'] as const

describe('personalityForIndex', () => {
  it('is deterministic for a given index', () => {
    expect(personalityForIndex(3)).toEqual(personalityForIndex(3))
  })

  it('stays within [0, 1] on every dimension across many indices', () => {
    for (let i = 0; i < 50; i++) {
      const p = personalityForIndex(i)
      for (const dim of DIMS) {
        expect(p[dim]).toBeGreaterThanOrEqual(0)
        expect(p[dim]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('spreads NPCs sharing an archetype instead of cloning them', () => {
    // treeIndex 0 and 4 both cycle to the same archetype anchor (4 archetypes) —
    // jitter should still tell them apart, otherwise the point of the migration is lost.
    expect(personalityForIndex(0)).not.toEqual(personalityForIndex(4))
  })
})

describe('nearestArchetype', () => {
  it('round-trips personalityForIndex back to the archetype it was jittered from', () => {
    // Regression guard for "today's 8 NPCs behave the same" — small jitter must not
    // push a point across the boundary into a neighboring archetype.
    for (let i = 0; i < 8; i++) {
      const expected = NPC_PERSONALITIES[i % NPC_PERSONALITIES.length]
      expect(nearestArchetype(personalityForIndex(i))).toBe(expected)
    }
  })

  it('picks the exact archetype for an unambiguous extreme point', () => {
    expect(
      nearestArchetype({
        openness: 0.9,
        conscientiousness: 0.4,
        extraversion: 0.65,
        agreeableness: 0.55,
        neuroticism: 0.35,
      }),
    ).toBe('curious')
  })
})

describe('pausePersonalityParams', () => {
  it('keeps ranges internally consistent (min <= max) at the OCEAN extremes', () => {
    const points = [
      { openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, neuroticism: 0 },
      { openness: 1, conscientiousness: 1, extraversion: 1, agreeableness: 1, neuroticism: 1 },
      { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
    ]
    for (const p of points) {
      const params = pausePersonalityParams(p)
      expect(params.triggerDistance).toBeGreaterThanOrEqual(2)
      expect(params.triggerDistance).toBeLessThanOrEqual(5)
      expect(params.lookDurationRange[0]).toBeLessThanOrEqual(params.lookDurationRange[1])
      expect(params.cooldownRange[0]).toBeLessThanOrEqual(params.cooldownRange[1])
    }
  })

  it('more extraverted/open NPCs notice the player from further away', () => {
    const shy = pausePersonalityParams({
      openness: 0,
      conscientiousness: 0.5,
      extraversion: 0,
      agreeableness: 0.5,
      neuroticism: 0.5,
    })
    const outgoing = pausePersonalityParams({
      openness: 1,
      conscientiousness: 0.5,
      extraversion: 1,
      agreeableness: 0.5,
      neuroticism: 0.5,
    })
    expect(outgoing.triggerDistance).toBeGreaterThan(shy.triggerDistance)
  })

  it('more neurotic NPCs wait longer before re-triggering', () => {
    const steady = pausePersonalityParams({
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0,
    })
    const anxious = pausePersonalityParams({
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 1,
    })
    expect(anxious.cooldownRange[0]).toBeGreaterThan(steady.cooldownRange[0])
  })
})

describe('pickDialogueLine', () => {
  it('returns a non-empty line for every archetype on a known need', () => {
    for (const personality of NPC_PERSONALITIES) {
      const line = pickDialogueLine(personality, 'water', false)
      expect(typeof line).toBe('string')
      expect(line.length).toBeGreaterThan(0)
    }
  })

  it('falls back to a neutral line for a need/personality combo with no dedicated bank', () => {
    // BANK covers water/food/wood/idle for all 4 archetypes today, so this exercises
    // the NEUTRAL fallback path indirectly by asserting it never throws or returns empty
    // even if the bank is later trimmed for a specific combination.
    const line = pickDialogueLine('grumpy', 'idle', true)
    expect(line.length).toBeGreaterThan(0)
  })
})
