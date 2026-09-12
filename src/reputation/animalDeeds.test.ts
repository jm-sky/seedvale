import { describe, expect, it } from 'vitest'
import type { PlayerAnimalKillContext } from './animalDeeds'
import {
  FULL_ANIMAL_DEED_EFFECT_DISTANCE,
  MAX_ANIMAL_DEED_INFLUENCE_DISTANCE,
  renownFactor,
  reputationFactor,
  resolveAnimalDeedConsequences,
} from './animalDeeds'

function kill(overrides: Partial<PlayerAnimalKillContext> = {}): PlayerAnimalKillContext {
  return {
    animalId: 'wolf-1',
    animalKind: 'wolf',
    dangerSignificance: 1,
    position: { x: 0, z: 0 },
    ...overrides,
  }
}

const home = { id: 'home', x: 0, z: 0 }

function magnitude(consequence: { reputation?: Partial<Record<string, number>>, renown?: number }): number {
  const reputationSum = Object.values(consequence.reputation ?? {})
    .reduce((sum: number, v) => sum + Math.abs(v ?? 0), 0)
  return reputationSum + Math.abs(consequence.renown ?? 0)
}

describe('reputationFactor / renownFactor (plan quests-progression-019 §6)', () => {
  it('are both 1.0 up to FULL_ANIMAL_DEED_EFFECT_DISTANCE', () => {
    expect(reputationFactor(0)).toBe(1)
    expect(reputationFactor(FULL_ANIMAL_DEED_EFFECT_DISTANCE)).toBe(1)
    expect(renownFactor(0)).toBe(1)
    expect(renownFactor(FULL_ANIMAL_DEED_EFFECT_DISTANCE)).toBe(1)
  })

  it('reputation reaches exactly 0 by 1500m and stays there beyond MAX_ANIMAL_DEED_INFLUENCE_DISTANCE', () => {
    expect(reputationFactor(1500)).toBe(0)
    expect(reputationFactor(2000)).toBe(0)
    expect(reputationFactor(MAX_ANIMAL_DEED_INFLUENCE_DISTANCE)).toBe(0)
    expect(reputationFactor(MAX_ANIMAL_DEED_INFLUENCE_DISTANCE + 1)).toBe(0)
  })

  it('renown decays strictly slower than reputation in the 500..1500m overlap, and only reaches 0 at MAX_ANIMAL_DEED_INFLUENCE_DISTANCE', () => {
    const mid = 1000
    expect(renownFactor(mid)).toBeGreaterThan(reputationFactor(mid))
    expect(reputationFactor(1500)).toBe(0)
    expect(renownFactor(1500)).toBeGreaterThan(0)
    expect(renownFactor(MAX_ANIMAL_DEED_INFLUENCE_DISTANCE)).toBe(0)
    expect(renownFactor(MAX_ANIMAL_DEED_INFLUENCE_DISTANCE + 1)).toBe(0)
  })

  it('are continuous at both boundaries (no jump just before/after)', () => {
    expect(reputationFactor(1499.999)).toBeCloseTo(reputationFactor(1500), 3)
    expect(reputationFactor(500.001)).toBeCloseTo(reputationFactor(499.999), 3)
    expect(renownFactor(2999.999)).toBeCloseTo(renownFactor(3000), 3)
  })

  it('are clamped to 0..1 and never negative for out-of-range distances', () => {
    expect(reputationFactor(999999)).toBe(0)
    expect(renownFactor(999999)).toBe(0)
    expect(reputationFactor(0)).toBeLessThanOrEqual(1)
  })
})

describe('resolveAnimalDeedConsequences — species classification (plan §4)', () => {
  it('deer is an explicit zero case, even with significance > 1', () => {
    expect(resolveAnimalDeedConsequences(kill({ animalKind: 'deer', dangerSignificance: 1 }), [home])).toEqual([])
    expect(resolveAnimalDeedConsequences(kill({ animalKind: 'deer', dangerSignificance: 5 }), [home])).toEqual([])
  })

  it('harmless/livestock kinds absent from the baseline table give no generic reward', () => {
    for (const kind of ['sheep', 'chicken', 'cow', 'horse', 'donkey', 'rabbit', 'duck', 'boar', 'stag', 'dog', 'rat'] as const) {
      expect(resolveAnimalDeedConsequences(kill({ animalKind: kind }), [home])).toEqual([])
    }
  })

  it('a normal wolf kill produces a consequence with baseline significance at full effect distance', () => {
    const [consequence] = resolveAnimalDeedConsequences(kill({ animalKind: 'wolf', dangerSignificance: 1 }), [home])
    expect(consequence).toEqual({ settlementId: 'home', reputation: { competence: 2, courage: 2 }, renown: 2 })
  })

  it('an alpha wolf (dangerSignificance > 1) produces a strictly larger consequence than a normal wolf at the same distance', () => {
    const [normal] = resolveAnimalDeedConsequences(kill({ animalKind: 'wolf', dangerSignificance: 1 }), [home])
    const [alpha] = resolveAnimalDeedConsequences(kill({ animalKind: 'wolf', dangerSignificance: 1.75 }), [home])
    expect(magnitude(alpha!)).toBeGreaterThan(magnitude(normal!))
  })

  it('alpha is still classified as plain wolf — no separate species-table entry is consulted for it', () => {
    // Same species baseline consumed for both — only dangerSignificance differs (fauna-022 owns the variant table, not this resolver).
    const [normal] = resolveAnimalDeedConsequences(kill({ animalKind: 'wolf', dangerSignificance: 1 }), [home])
    const [scaled] = resolveAnimalDeedConsequences(kill({ animalKind: 'wolf', dangerSignificance: 2 }), [home])
    expect(scaled!.reputation?.competence).toBe((normal!.reputation?.competence ?? 0) * 2)
  })

  it('NPC/predator/environment deaths never reach this resolver — it only ever receives a confirmed player kill context', () => {
    // Documented via the type contract: PlayerAnimalKillContext has no "cause" field,
    // so a non-player death simply never gets captured into one (see gameLoop.ts).
    expect(resolveAnimalDeedConsequences(kill(), [home]).length).toBeGreaterThan(0)
  })

  it('orders fox < wolf < alpha wolf < bear by overall consequence magnitude at the same distance', () => {
    const fox = magnitude(resolveAnimalDeedConsequences(kill({ animalKind: 'fox', dangerSignificance: 1 }), [home])[0]!)
    const wolf = magnitude(resolveAnimalDeedConsequences(kill({ animalKind: 'wolf', dangerSignificance: 1 }), [home])[0]!)
    const alphaWolf = magnitude(resolveAnimalDeedConsequences(kill({ animalKind: 'wolf', dangerSignificance: 1.75 }), [home])[0]!)
    const bear = magnitude(resolveAnimalDeedConsequences(kill({ animalKind: 'bear', dangerSignificance: 1 }), [home])[0]!)
    expect(fox).toBeLessThan(wolf)
    expect(wolf).toBeLessThan(alphaWolf)
    expect(alphaWolf).toBeLessThan(bear)
  })
})

describe('resolveAnimalDeedConsequences — distance and attenuation (plan §5/§6)', () => {
  it('is unaffected within FULL_ANIMAL_DEED_EFFECT_DISTANCE', () => {
    const near = { id: 'near', x: FULL_ANIMAL_DEED_EFFECT_DISTANCE, z: 0 }
    const [consequence] = resolveAnimalDeedConsequences(kill(), [near])
    expect(consequence).toEqual({ settlementId: 'near', reputation: { competence: 2, courage: 2 }, renown: 2 })
  })

  it('drops reputation but can keep renown between 1500 and 3000m', () => {
    const far = { id: 'far', x: 2000, z: 0 }
    const [consequence] = resolveAnimalDeedConsequences(kill({ animalKind: 'bear' }), [far])
    expect(consequence?.reputation).toBeUndefined()
    expect(consequence?.renown).toBeGreaterThan(0)
  })

  it('produces nothing beyond MAX_ANIMAL_DEED_INFLUENCE_DISTANCE', () => {
    const tooFar = { id: 'too-far', x: MAX_ANIMAL_DEED_INFLUENCE_DISTANCE + 1, z: 0 }
    expect(resolveAnimalDeedConsequences(kill(), [tooFar])).toEqual([])
  })

  it('exactly at MAX_ANIMAL_DEED_INFLUENCE_DISTANCE may still round to zero and is dropped, not emitted as an empty consequence', () => {
    const edge = { id: 'edge', x: MAX_ANIMAL_DEED_INFLUENCE_DISTANCE, z: 0 }
    const result = resolveAnimalDeedConsequences(kill({ animalKind: 'fox' }), [edge])
    expect(result).toEqual([])
  })

  it('never emits a consequence whose reputation/renown deltas are all zero after rounding', () => {
    for (const distance of [1400, 1450, 1499, 2900, 2950, 2999]) {
      const settlement = { id: 's', x: distance, z: 0 }
      for (const consequence of resolveAnimalDeedConsequences(kill({ animalKind: 'fox' }), [settlement])) {
        const total = Object.values(consequence.reputation ?? {}).reduce((sum, v) => sum + Math.abs(v ?? 0), 0)
          + Math.abs(consequence.renown ?? 0)
        expect(total).toBeGreaterThan(0)
      }
    }
  })

  it('gives different results to multiple settlements at different distances from one kill', () => {
    const near = { id: 'near', x: 0, z: 0 }
    const far = { id: 'far', x: 1200, z: 0 }
    const consequences = resolveAnimalDeedConsequences(kill({ animalKind: 'bear' }), [near, far])
    expect(consequences).toHaveLength(2)
    const nearC = consequences.find((c) => c.settlementId === 'near')!
    const farC = consequences.find((c) => c.settlementId === 'far')!
    expect(magnitude(nearC)).toBeGreaterThan(magnitude(farC))
  })
})

describe('resolveAnimalDeedConsequences — quest ownership suppression (plan §2)', () => {
  it('socialOutcomeClaimed suppresses the generic deed entirely, even for an alpha wolf', () => {
    const result = resolveAnimalDeedConsequences(
      kill({ animalKind: 'wolf', dangerSignificance: 1.75 }),
      [home],
      { socialOutcomeClaimed: true },
    )
    expect(result).toEqual([])
  })

  it('does not suppress when socialOutcomeClaimed is false/absent', () => {
    expect(resolveAnimalDeedConsequences(kill(), [home], { socialOutcomeClaimed: false }).length).toBeGreaterThan(0)
    expect(resolveAnimalDeedConsequences(kill(), [home]).length).toBeGreaterThan(0)
  })
})

describe('resolveAnimalDeedConsequences — purity', () => {
  it('never mutates the kill context or settlement candidates it is given', () => {
    const k = kill()
    const settlements = [home, { id: 'other', x: 500, z: 500 }]
    const kSnapshot = JSON.parse(JSON.stringify(k))
    const settlementsSnapshot = JSON.parse(JSON.stringify(settlements))
    resolveAnimalDeedConsequences(k, settlements)
    expect(k).toEqual(kSnapshot)
    expect(settlements).toEqual(settlementsSnapshot)
  })
})
