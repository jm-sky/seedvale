import { describe, expect, it } from 'vitest'
import {
  gardenClearingRadius,
  gardenPlotRadius,
  gardenUnitsFromHouses,
  packGardenScales,
} from './gardenScale'

describe('gardenScale', () => {
  it('gardenUnitsFromHouses uses ceil(n/3) with min 1', () => {
    expect(gardenUnitsFromHouses(0)).toBe(1)
    expect(gardenUnitsFromHouses(1)).toBe(1)
    expect(gardenUnitsFromHouses(3)).toBe(1)
    expect(gardenUnitsFromHouses(4)).toBe(2)
    expect(gardenUnitsFromHouses(6)).toBe(2)
    expect(gardenUnitsFromHouses(7)).toBe(3)
    expect(gardenUnitsFromHouses(9)).toBe(3)
  })

  it('packGardenScales packs L then M then S, largest first', () => {
    expect(packGardenScales(1)).toEqual(['S'])
    expect(packGardenScales(2)).toEqual(['M'])
    expect(packGardenScales(3)).toEqual(['L'])
    expect(packGardenScales(4)).toEqual(['L', 'S'])
    expect(packGardenScales(5)).toEqual(['L', 'M'])
    expect(packGardenScales(6)).toEqual(['L', 'L'])
    expect(packGardenScales(0)).toEqual(['S'])
  })

  it('gardenClearingRadius hugs the tiled beds (plan 100)', () => {
    expect(gardenClearingRadius('S')).toBeCloseTo(3.68, 1)
    expect(gardenClearingRadius('M')).toBeCloseTo(6.03, 1)
    expect(gardenClearingRadius('L')).toBeCloseTo(8.52, 1)
    expect(gardenClearingRadius('S')).toBeLessThan(gardenPlotRadius('S'))
    expect(gardenClearingRadius('M')).toBeLessThan(gardenPlotRadius('M'))
    expect(gardenClearingRadius('L')).toBeLessThanOrEqual(gardenPlotRadius('L') + 0.2)
  })
})
