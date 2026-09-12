import { describe, expect, it } from 'vitest'
import {
  type AnimalScareContext,
  type AnimalScareStimulus,
  scareFleeOrigin,
  scareProbability,
  scareRoll,
  shouldScare,
} from './animalScare'

const stimulus: AnimalScareStimulus = {
  source: 'thunder',
  eventId: 'lightning:1:0:0',
  strength: 0.8,
  simulatedDistanceM: 200,
}

function ctx(overrides: Partial<AnimalScareContext> = {}): AnimalScareContext {
  return {
    animalId: 'cow-1',
    x: 0,
    z: 0,
    home: { x: 80, z: 0 },
    fearBaseline: 0.7,
    ownerNearby: false,
    herdmatesNearby: 0,
    ...overrides,
  }
}

describe('scareRoll', () => {
  it('is stable for the same (eventId, animalId) pair', () => {
    expect(scareRoll('e1', 'a1')).toBe(scareRoll('e1', 'a1'))
    expect(scareRoll('e1', 'a1')).not.toBe(scareRoll('e1', 'a2'))
    expect(scareRoll('e1', 'a1')).not.toBe(scareRoll('e2', 'a1'))
  })
})

describe('scareProbability', () => {
  it('rises with strength and closer simulated distance', () => {
    const far = scareProbability({ ...stimulus, simulatedDistanceM: 1400 }, ctx())
    const near = scareProbability({ ...stimulus, simulatedDistanceM: 100 }, ctx())
    const weak = scareProbability({ ...stimulus, strength: 0.2 }, ctx())
    const strong = scareProbability({ ...stimulus, strength: 1 }, ctx())
    expect(near).toBeGreaterThan(far)
    expect(strong).toBeGreaterThan(weak)
    expect(near).toBeGreaterThanOrEqual(0)
    expect(near).toBeLessThanOrEqual(1)
  })

  it('falls when the animal is near home, a caretaker, or herdmates', () => {
    const exposed = scareProbability(stimulus, ctx({ home: { x: 80, z: 0 }, ownerNearby: false }))
    const atHome = scareProbability(stimulus, ctx({ home: { x: 0, z: 0 } }))
    const withOwner = scareProbability(stimulus, ctx({ ownerNearby: true }))
    const withHerd = scareProbability(stimulus, ctx({ herdmatesNearby: 3 }))
    expect(atHome).toBeLessThan(exposed)
    expect(withOwner).toBeLessThan(exposed)
    expect(withHerd).toBeLessThan(exposed)
  })

  it('is higher for a more fearful species baseline', () => {
    const chicken = scareProbability(stimulus, ctx({ fearBaseline: 0.88 }))
    const cow = scareProbability(stimulus, ctx({ fearBaseline: 0.4 }))
    expect(chicken).toBeGreaterThan(cow)
  })
})

describe('shouldScare', () => {
  it('agrees with the stable roll against the computed probability', () => {
    const input = ctx({ animalId: 'sheep-7' })
    expect(shouldScare(stimulus, input)).toBe(
      scareRoll(stimulus.eventId, input.animalId) < scareProbability(stimulus, input),
    )
  })
})

describe('scareFleeOrigin', () => {
  it('is stable and independent of caller position drift for the same ids', () => {
    const a = scareFleeOrigin('e1', 'chicken-1', 10, 4)
    const b = scareFleeOrigin('e1', 'chicken-1', 10, 4)
    const c = scareFleeOrigin('e1', 'chicken-2', 10, 4)
    expect(a).toEqual(b)
    expect(c).not.toEqual(a)
    expect(Math.hypot(10 - a.x, 4 - a.z)).toBeCloseTo(20, 5)
  })
})
