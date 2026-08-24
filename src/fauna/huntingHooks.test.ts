import { describe, expect, it } from 'vitest'
import type { AnimalKind } from './AnimalAgent'
import { huntPreferenceRank, shouldSkipForPopulationProtection } from './huntingHooks'

describe('huntPreferenceRank', () => {
  it('ranks the plan-178 preferred species in order (rabbit, deer, stag, boar)', () => {
    expect(huntPreferenceRank('rabbit')).toBeLessThan(huntPreferenceRank('deer'))
    expect(huntPreferenceRank('deer')).toBeLessThan(huntPreferenceRank('stag'))
    expect(huntPreferenceRank('stag')).toBeLessThan(huntPreferenceRank('boar'))
  })

  it('never prefers a predator/livestock kind over any preferred species', () => {
    for (const kind of ['wolf', 'fox', 'bear', 'cow', 'sheep', 'chicken'] as const) {
      expect(huntPreferenceRank(kind)).toBeGreaterThan(huntPreferenceRank('boar'))
    }
  })
})

type TestAgent = {
  animalId: string
  isDead: () => boolean
  def: { kind: AnimalKind }
  spawnPointId?: string
  mesh: { position: { x: number, z: number } }
}

function agent(
  animalId: string,
  kind: AnimalKind,
  spawnPointId: string | undefined,
  x = 0,
  z = 0,
  dead = false,
): TestAgent {
  return { animalId, isDead: () => dead, def: { kind }, spawnPointId, mesh: { position: { x, z } } }
}

describe('shouldSkipForPopulationProtection', () => {
  const spawner = { id: 'sp1', kind: 'deer' as AnimalKind, x: 0, z: 0 }

  it('never skips an animal with no spawnPointId (ring spawns have no population to protect)', () => {
    const target = agent('deer-1', 'deer', undefined)
    expect(shouldSkipForPopulationProtection(target, 'deer', [target], [spawner], 1)).toBe(false)
  })

  it('never skips when the spawn point still has more than one living animal nearby', () => {
    const a = agent('deer-1', 'deer', 'sp1', 1, 1)
    const b = agent('deer-2', 'deer', 'sp1', 2, 2)
    expect(shouldSkipForPopulationProtection(a, 'deer', [a, b], [spawner], 1)).toBe(false)
  })

  it('is deterministic — same animal id/kind/day bucket always rolls the same outcome', () => {
    const solo = agent('deer-42', 'deer', 'sp1', 1, 1)
    const first = shouldSkipForPopulationProtection(solo, 'deer', [solo], [spawner], 5)
    const second = shouldSkipForPopulationProtection(solo, 'deer', [solo], [spawner], 5)
    expect(first).toBe(second)
  })

  it('varies across different animal ids for the same single-animal situation (not an always-skip rule)', () => {
    const outcomes = new Set<boolean>()
    for (let i = 0; i < 20; i++) {
      const solo = agent(`deer-${i}`, 'deer', 'sp1', 1, 1)
      outcomes.add(shouldSkipForPopulationProtection(solo, 'deer', [solo], [spawner], 1))
    }
    // A real 50/50 seeded roll across 20 distinct ids should hit both outcomes.
    expect(outcomes.size).toBe(2)
  })

  it('ignores dead animals when counting nearby population', () => {
    const dead = agent('deer-dead', 'deer', 'sp1', 1, 1, true)
    // Only one living animal nearby (the candidate itself) despite two agents in the list.
    const outcomes = new Set<boolean>()
    for (let i = 0; i < 20; i++) {
      const solo = agent(`deer-${i}`, 'deer', 'sp1', 1, 1)
      outcomes.add(shouldSkipForPopulationProtection(solo, 'deer', [solo, dead], [spawner], 1))
    }
    expect(outcomes.size).toBe(2)
  })
})
