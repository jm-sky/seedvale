import { describe, expect, it } from 'vitest'
import {
  ACTIVE_OBSERVER_RADIUS_M,
  animalBehaviourIntervalSec,
  animalCadencePhase01,
  type AnimalCadenceSignals,
  animalPresentationIntervalSec,
  IMMEDIATE_OBSERVER_RADIUS_M,
  isCadenceDue,
  MAX_THROTTLED_STEP_M,
  resolveAnimalUpdateImportance,
} from './animalUpdateCadence'

/** A far-away, idle, uncoupled animal — the only shape that may be throttled. */
function routineSignals(overrides: Partial<AnimalCadenceSignals> = {}): AnimalCadenceSignals {
  return {
    highPriorityBranch: false,
    engaged: false,
    playerCoupled: false,
    committedTraversal: false,
    swimming: false,
    oneShotAnimActive: false,
    observerDistance: 200,
    ...overrides,
  }
}

describe('animalUpdateCadence', () => {
  describe('resolveAnimalUpdateImportance', () => {
    it('classifies a far, idle, uncoupled animal as routine', () => {
      expect(resolveAnimalUpdateImportance(routineSignals())).toBe('routine')
    })

    it('classifies an ordinary animal inside the shadow radius as active', () => {
      expect(resolveAnimalUpdateImportance(routineSignals({ observerDistance: ACTIVE_OBSERVER_RADIUS_M })))
        .toBe('active')
      expect(resolveAnimalUpdateImportance(routineSignals({ observerDistance: ACTIVE_OBSERVER_RADIUS_M + 0.1 })))
        .toBe('routine')
    })

    it('classifies an animal within direct-interaction range as immediate', () => {
      expect(resolveAnimalUpdateImportance(routineSignals({ observerDistance: IMMEDIATE_OBSERVER_RADIUS_M })))
        .toBe('immediate')
    })

    // Each of these is one of the "must stay frame-responsive" cases from the
    // plan: combat/threat/flee, a committed hunt, a player-coupled animal, a
    // committed trip/cave route, critical water traversal, a one-shot clip.
    const immediateSignals: (keyof AnimalCadenceSignals)[] = [
      'highPriorityBranch',
      'engaged',
      'playerCoupled',
      'committedTraversal',
      'swimming',
      'oneShotAnimActive',
    ]
    for (const signal of immediateSignals) {
      it(`treats ${signal} alone as immediate even at maximum distance`, () => {
        expect(resolveAnimalUpdateImportance(routineSignals({ [signal]: true }))).toBe('immediate')
      })
    }
  })

  describe('animalBehaviourIntervalSec', () => {
    it('is 0 for immediate — byte-for-byte the pre-cadence behaviour', () => {
      expect(animalBehaviourIntervalSec('immediate', 3)).toBe(0)
      expect(animalBehaviourIntervalSec('immediate', 3, 0.9)).toBe(0)
    })

    it('is coarser for routine than for active', () => {
      expect(animalBehaviourIntervalSec('routine', 1)).toBeGreaterThan(animalBehaviourIntervalSec('active', 1))
    })

    it('never lets a throttled step exceed MAX_THROTTLED_STEP_M, at any walk speed', () => {
      for (const walkSpeed of [1.8, 2.6, 3.5, 10.5, 40]) {
        for (const importance of ['active', 'routine'] as const) {
          for (const phase of [0, 0.5, 0.999]) {
            const interval = animalBehaviourIntervalSec(importance, walkSpeed, phase)
            expect(walkSpeed * interval).toBeLessThanOrEqual(MAX_THROTTLED_STEP_M + 1e-9)
          }
        }
      }
    })

    it('falls back to the base interval for a non-positive walk speed', () => {
      expect(animalBehaviourIntervalSec('routine', 0)).toBeGreaterThan(0)
    })

    it('only ever shortens an interval with the per-agent phase', () => {
      const base = animalBehaviourIntervalSec('routine', 1, 0)
      expect(animalBehaviourIntervalSec('routine', 1, 0.99)).toBeLessThan(base)
      expect(animalBehaviourIntervalSec('routine', 1, 0.99)).toBeGreaterThan(0)
    })
  })

  describe('animalPresentationIntervalSec', () => {
    it('is full-rate for immediate and inside the readable-label radius', () => {
      expect(animalPresentationIntervalSec('immediate', 500)).toBe(0)
      expect(animalPresentationIntervalSec('routine', 20)).toBe(0)
    })

    it('gets coarser with distance once the label has faded', () => {
      const mid = animalPresentationIntervalSec('active', ACTIVE_OBSERVER_RADIUS_M)
      const far = animalPresentationIntervalSec('routine', ACTIVE_OBSERVER_RADIUS_M + 1)
      expect(mid).toBeGreaterThan(0)
      expect(far).toBeGreaterThan(mid)
    })
  })

  describe('isCadenceDue', () => {
    it('is always due at interval 0', () => {
      expect(isCadenceDue(0, 0)).toBe(true)
    })

    it('is due once the accumulator reaches the interval', () => {
      expect(isCadenceDue(0.04, 0.05)).toBe(false)
      expect(isCadenceDue(0.05, 0.05)).toBe(true)
    })
  })

  describe('animalCadencePhase01', () => {
    it('is deterministic and inside [0, 1)', () => {
      for (const id of ['wolf-a', 'deer-17', 'cow-house0-2', '']) {
        const phase = animalCadencePhase01(id)
        expect(phase).toBe(animalCadencePhase01(id))
        expect(phase).toBeGreaterThanOrEqual(0)
        expect(phase).toBeLessThan(1)
      }
    })

    it('spreads a population across the interval rather than clustering it', () => {
      const phases = new Set<number>()
      for (let i = 0; i < 40; i++) phases.add(animalCadencePhase01(`deer-${i}`))
      expect(phases.size).toBeGreaterThan(30)
    })
  })
})
