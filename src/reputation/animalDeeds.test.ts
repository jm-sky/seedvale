import { describe, expect, it } from 'vitest'
import type { PlayerAnimalKillContext } from './animalDeeds'
import {
  FULL_ANIMAL_DEED_EFFECT_DISTANCE,
  MAX_ANIMAL_DEED_INFLUENCE_DISTANCE,
  renownFactor,
  reputationFactor,
  resolveAnimalDeedSignal,
} from './animalDeeds'

function kill(overrides: Partial<PlayerAnimalKillContext> = {}): PlayerAnimalKillContext {
  return {
    animalId: 'wolf-1',
    animalKind: 'wolf',
    variant: 'normal',
    dangerSignificance: 1,
    position: { x: 0, z: 0 },
    ...overrides,
  }
}

function magnitude(signal: { reputation: Partial<Record<string, number>>, renown: number } | null): number {
  if (!signal) return 0
  const reputationSum = Object.values(signal.reputation)
    .reduce((sum: number, v) => sum + Math.abs(v ?? 0), 0)
  return reputationSum + Math.abs(signal.renown)
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

describe('resolveAnimalDeedSignal — species classification (plan §4)', () => {
  it('deer is an explicit zero case, even with significance > 1', () => {
    expect(resolveAnimalDeedSignal(kill({ animalKind: 'deer', dangerSignificance: 1 }))).toBeNull()
    expect(resolveAnimalDeedSignal(kill({ animalKind: 'deer', dangerSignificance: 5 }))).toBeNull()
  })

  it('harmless/livestock kinds absent from the baseline table give no generic signal', () => {
    for (const kind of ['sheep', 'chicken', 'cow', 'horse', 'donkey', 'rabbit', 'duck', 'boar', 'stag', 'dog', 'rat'] as const) {
      expect(resolveAnimalDeedSignal(kill({ animalKind: kind }))).toBeNull()
    }
  })

  it('a normal wolf kill produces the baseline signal, unattenuated by any distance', () => {
    const signal = resolveAnimalDeedSignal(kill({ animalKind: 'wolf', dangerSignificance: 1 }))
    expect(signal).toEqual({ reputation: { competence: 2, courage: 2 }, renown: 2 })
  })

  it('an alpha wolf (dangerSignificance > 1) produces a strictly larger signal than a normal wolf', () => {
    const normal = resolveAnimalDeedSignal(kill({ animalKind: 'wolf', dangerSignificance: 1 }))
    const alpha = resolveAnimalDeedSignal(kill({ animalKind: 'wolf', dangerSignificance: 1.75 }))
    expect(magnitude(alpha)).toBeGreaterThan(magnitude(normal))
  })

  it('alpha is still classified as plain wolf — no separate species-table entry is consulted for it', () => {
    // Same species baseline consumed for both — only dangerSignificance differs (fauna-022 owns the variant table, not this resolver).
    const normal = resolveAnimalDeedSignal(kill({ animalKind: 'wolf', dangerSignificance: 1 }))
    const scaled = resolveAnimalDeedSignal(kill({ animalKind: 'wolf', dangerSignificance: 2 }))
    expect(scaled!.reputation.competence).toBe((normal!.reputation.competence ?? 0) * 2)
  })

  it('NPC/predator/environment deaths never reach this resolver — it only ever receives a confirmed player kill context', () => {
    // Documented via the type contract: PlayerAnimalKillContext has no "cause" field,
    // so a non-player death simply never gets captured into one (see gameLoop.ts).
    expect(resolveAnimalDeedSignal(kill())).not.toBeNull()
  })

  it('orders fox < wolf < alpha wolf < bear by overall signal magnitude', () => {
    const fox = magnitude(resolveAnimalDeedSignal(kill({ animalKind: 'fox', dangerSignificance: 1 })))
    const wolf = magnitude(resolveAnimalDeedSignal(kill({ animalKind: 'wolf', dangerSignificance: 1 })))
    const alphaWolf = magnitude(resolveAnimalDeedSignal(kill({ animalKind: 'wolf', dangerSignificance: 1.75 })))
    const bear = magnitude(resolveAnimalDeedSignal(kill({ animalKind: 'bear', dangerSignificance: 1 })))
    expect(fox).toBeLessThan(wolf)
    expect(wolf).toBeLessThan(alphaWolf)
    expect(alphaWolf).toBeLessThan(bear)
  })
})

describe('resolveAnimalDeedSignal — quest ownership suppression (plan §2)', () => {
  it('socialOutcomeClaimed suppresses the generic deed entirely, even for an alpha wolf', () => {
    const result = resolveAnimalDeedSignal(
      kill({ animalKind: 'wolf', dangerSignificance: 1.75 }),
      { socialOutcomeClaimed: true },
    )
    expect(result).toBeNull()
  })

  it('does not suppress when socialOutcomeClaimed is false/absent', () => {
    expect(resolveAnimalDeedSignal(kill(), { socialOutcomeClaimed: false })).not.toBeNull()
    expect(resolveAnimalDeedSignal(kill())).not.toBeNull()
  })
})

describe('resolveAnimalDeedSignal — purity', () => {
  it('never mutates the kill context it is given', () => {
    const k = kill()
    const kSnapshot = JSON.parse(JSON.stringify(k))
    resolveAnimalDeedSignal(k)
    expect(k).toEqual(kSnapshot)
  })
})
