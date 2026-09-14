import { describe, expect, it } from 'vitest'
import {
  minimumHouseholdWellCount,
  resolveNearestWaterWellTarget,
  selectHouseholdWellFamilyIndices,
} from './householdWells'

function family(memberCount: number): { members: { length: number } } {
  return { members: { length: memberCount } }
}

describe('minimumHouseholdWellCount', () => {
  it('is floor(population / 6)', () => {
    expect(minimumHouseholdWellCount(5)).toBe(0)
    expect(minimumHouseholdWellCount(6)).toBe(1)
    expect(minimumHouseholdWellCount(12)).toBe(2)
    expect(minimumHouseholdWellCount(18)).toBe(3)
  })
})

describe('selectHouseholdWellFamilyIndices', () => {
  it('always selects households with 3+ members', () => {
    expect(selectHouseholdWellFamilyIndices([family(3), family(4), family(1)], 1)).toEqual([0, 1])
  })

  it('two-person households roll a deterministic 50%', () => {
    const families = [family(2)]
    const selectedSeeds: number[] = []
    const missedSeeds: number[] = []
    for (let seed = 0; seed < 80; seed++) {
      const selected = selectHouseholdWellFamilyIndices(families, seed)
      if (selected.includes(0)) selectedSeeds.push(seed)
      else missedSeeds.push(seed)
    }
    expect(selectedSeeds.length).toBeGreaterThan(0)
    expect(missedSeeds.length).toBeGreaterThan(0)
    expect(selectHouseholdWellFamilyIndices(families, selectedSeeds[0]!)).toEqual([0])
    expect(selectHouseholdWellFamilyIndices(families, missedSeeds[0]!)).toEqual([])
    expect(selectHouseholdWellFamilyIndices(families, selectedSeeds[0]!)).toEqual(
      selectHouseholdWellFamilyIndices(families, selectedSeeds[0]!),
    )
  })

  it('enforces population fallback of 1/2/3 extra wells at 6/12/18 residents', () => {
    expect(selectHouseholdWellFamilyIndices(Array.from({ length: 6 }, () => family(1)), 7)).toEqual([0])
    expect(selectHouseholdWellFamilyIndices(Array.from({ length: 12 }, () => family(1)), 7)).toEqual([0, 1])
    expect(selectHouseholdWellFamilyIndices(Array.from({ length: 18 }, () => family(1)), 7)).toEqual([0, 1, 2])
  })

  it('promotes missed two-person households before singles', () => {
    const families = [family(1), family(2), family(1), family(1), family(1), family(1)]
    let seed = 0
    let selected: number[] = []
    for (; seed < 200; seed++) {
      selected = selectHouseholdWellFamilyIndices(families, seed)
      if (!selectHouseholdWellFamilyIndices([family(2)], seed).includes(0)) break
    }
    expect(seed).toBeLessThan(200)
    expect(selected).toEqual([1])
  })

  it('never selects the same family twice', () => {
    const selected = selectHouseholdWellFamilyIndices(
      [family(3), family(3), family(2), family(1)],
      11,
    )
    expect(new Set(selected).size).toBe(selected.length)
  })

  it('returns the same set for the same seed and families', () => {
    const families = [family(3), family(2), family(1), family(2), family(4)]
    expect(selectHouseholdWellFamilyIndices(families, 42)).toEqual(
      selectHouseholdWellFamilyIndices(families, 42),
    )
  })
})

describe('resolveNearestWaterWellTarget', () => {
  const home = { x: 0, z: 0 }
  const central = { position: { x: 10, y: 1, z: 0 }, queueId: 's:well' }
  const household = { position: { x: 2, y: 1, z: 0 }, queueId: 's:well:household:0' }

  it('picks the nearest settlement well from home and returns its queue id', () => {
    expect(resolveNearestWaterWellTarget({
      home,
      settlementWells: [central, household],
      playerWell: null,
    })).toEqual({
      position: { x: 2, y: 1, z: 0 },
      queueId: 's:well:household:0',
      isSettlementWell: true,
    })
  })

  it('still prefers a closer completed player-built well', () => {
    expect(resolveNearestWaterWellTarget({
      home,
      settlementWells: [central, household],
      playerWell: { x: 0.5, y: 2, z: 0 },
    })).toEqual({
      position: { x: 0.5, y: 2, z: 0 },
      queueId: null,
      isSettlementWell: false,
    })
  })

  it('keeps the settlement well when the player well is farther', () => {
    expect(resolveNearestWaterWellTarget({
      home,
      settlementWells: [household],
      playerWell: { x: 20, y: 2, z: 0 },
    }).queueId).toBe('s:well:household:0')
  })
})
