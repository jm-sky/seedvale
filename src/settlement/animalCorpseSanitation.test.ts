import { describe, expect, it } from 'vitest'
import type { AnimalCorpseView } from './animalCorpseSanitation'
import {
  collectAnimalCorpseCleanupCandidates,
  isInsideSettlementInfluence,
  resolveResponsibleHousehold,
} from './animalCorpseSanitation'

const influence = { x: 0, z: 0, radius: 40 }

function view(overrides: Partial<AnimalCorpseView> = {}): AnimalCorpseView {
  return {
    animalId: 'rat-1',
    kind: 'rat',
    x: 2,
    z: 0,
    dead: true,
    buried: false,
    held: false,
    meatHarvested: false,
    readyToRemove: false,
    phase: 'fresh',
    foodClaimed: false,
    cleanupClaimantNpcId: null,
    ...overrides,
  }
}

describe('resolveResponsibleHousehold (plan settlements-npcs-029)', () => {
  it('picks the nearest household home anchor', () => {
    const anchors = [
      { id: 'h-a', x: 10, z: 0 },
      { id: 'h-b', x: 30, z: 0 },
    ]
    expect(resolveResponsibleHousehold(11, 0, anchors, influence)).toBe('h-a')
    expect(resolveResponsibleHousehold(29, 0, anchors, influence)).toBe('h-b')
  })

  it('breaks equal distances deterministically by household id', () => {
    const anchors = [
      { id: 'h-b', x: 5, z: 0 },
      { id: 'h-a', x: -5, z: 0 },
    ]
    expect(resolveResponsibleHousehold(0, 0, anchors, influence)).toBe('h-a')
    expect(resolveResponsibleHousehold(0, 0, [...anchors].reverse(), influence)).toBe('h-a')
  })

  it('returns null outside settlement influence', () => {
    const anchors = [{ id: 'h-a', x: 0, z: 0 }]
    expect(isInsideSettlementInfluence(100, 0, influence)).toBe(false)
    expect(resolveResponsibleHousehold(100, 0, anchors, influence)).toBeNull()
  })

  it('returns null when no household exists', () => {
    expect(resolveResponsibleHousehold(0, 0, [], influence)).toBeNull()
  })
})

describe('collectAnimalCorpseCleanupCandidates', () => {
  const anchors = [
    { id: 'h-a', x: 0, z: 0 },
    { id: 'h-b', x: 20, z: 0 },
  ]

  it('covers rat, livestock and nearby wild corpses on the same path', () => {
    const candidates = collectAnimalCorpseCleanupCandidates(
      [
        view({ animalId: 'rat-1', kind: 'rat', x: 1, z: 0 }),
        view({ animalId: 'cow-1', kind: 'cow', x: 2, z: 0 }),
        view({ animalId: 'wolf-1', kind: 'wolf', x: 3, z: 0 }),
      ],
      anchors,
      influence,
    )
    expect(candidates.map((c) => c.animalId)).toEqual(['rat-1', 'cow-1', 'wolf-1'])
    expect(new Set(candidates.map((c) => c.responsibleHouseholdId))).toEqual(new Set(['h-a']))
  })

  it('skips live, buried, ready-to-remove and out-of-influence corpses', () => {
    const candidates = collectAnimalCorpseCleanupCandidates(
      [
        view({ animalId: 'live', dead: false }),
        view({ animalId: 'buried', buried: true }),
        view({ animalId: 'gone', readyToRemove: true }),
        view({ animalId: 'far', x: 100, z: 0 }),
        view({ animalId: 'ok', x: 1, z: 0 }),
      ],
      anchors,
      influence,
    )
    expect(candidates.map((c) => c.animalId)).toEqual(['ok'])
  })
})
