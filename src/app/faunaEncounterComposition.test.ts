import { describe, expect, it } from 'vitest'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import { buildHuntableLivestock } from './faunaEncounterComposition'

/** Narrow fake covering only what `buildHuntableLivestock` reads. */
function fakeAnimal(
  animalId: string,
  role: 'predator' | 'prey' | 'livestock' = 'livestock',
  dead = false,
): AnimalAgent {
  return {
    animalId,
    def: { role },
    health: { dead },
  } as unknown as AnimalAgent
}

describe('buildHuntableLivestock (plan fauna-026 §1/§2/§8)', () => {
  it('collects live agents from loaded settlements\' livestock', () => {
    const sheep = fakeAnimal('sheep-1')
    const cow = fakeAnimal('cow-1')
    const result = buildHuntableLivestock(
      [{ livestock: [sheep, cow] }],
      [],
    )
    expect(result).toEqual([sheep, cow])
  })

  it('adds detached livestock alongside loaded-settlement livestock', () => {
    const sheep = fakeAnimal('sheep-1')
    const horse = fakeAnimal('horse-1')
    const result = buildHuntableLivestock(
      [{ livestock: [sheep] }],
      [horse],
    )
    expect(result).toEqual([sheep, horse])
  })

  it('dedupes the same animalId seen from both sources', () => {
    const sheep = fakeAnimal('sheep-1')
    const result = buildHuntableLivestock(
      [{ livestock: [sheep] }],
      [sheep],
    )
    expect(result).toEqual([sheep])
  })

  it('never returns a dead candidate', () => {
    const dead = fakeAnimal('sheep-dead', 'livestock', true)
    const alive = fakeAnimal('sheep-alive')
    const result = buildHuntableLivestock([{ livestock: [dead, alive] }], [])
    expect(result).toEqual([alive])
  })

  it('does not require role:\'livestock\' — sheep/chicken/rooster keep role:\'prey\' in animalDefs.ts', () => {
    const sheep = fakeAnimal('sheep-1', 'prey')
    const result = buildHuntableLivestock([{ livestock: [sheep] }], [])
    expect(result).toEqual([sheep])
  })

  it('defensively excludes a role:\'predator\' entry even if one somehow appeared in the livestock array', () => {
    const wolf = fakeAnimal('wolf-1', 'predator')
    const result = buildHuntableLivestock([{ livestock: [wolf] }], [])
    expect(result).toEqual([])
  })

  it('reuses caller-supplied scratch buffers across calls instead of allocating', () => {
    const into: AnimalAgent[] = []
    const seen = new Set<string>()
    const first = buildHuntableLivestock([{ livestock: [fakeAnimal('sheep-1')] }], [], into, seen)
    expect(first).toBe(into)
    const second = buildHuntableLivestock([{ livestock: [fakeAnimal('sheep-2')] }], [], into, seen)
    expect(second).toBe(into)
    expect(second.map((a) => a.animalId)).toEqual(['sheep-2'])
  })

  it('returns an empty list with no loaded/detached livestock', () => {
    expect(buildHuntableLivestock([], [])).toEqual([])
  })
})
