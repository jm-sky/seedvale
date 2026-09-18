import { describe, expect, it } from 'vitest'
import type { Household } from './household'
import {
  pastureTroughCanFill,
  pastureTroughPromptLabel,
  pastureWellTroughDistance,
  resolvePastureWaterHousehold,
} from './pastureWater'

function fakeHousehold(id: string, current: number, capacity = 10): Household {
  return { id, water: { current, capacity } } as unknown as Household
}

describe('pastureWellTroughDistance', () => {
  it('is the straight-line center-to-center distance', () => {
    expect(pastureWellTroughDistance({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5)
  })
})

describe('resolvePastureWaterHousehold (plan settlements-npcs-046)', () => {
  it('prefers the shepherd household when one is staffed', () => {
    const households = [fakeHousehold('h0', 5), fakeHousehold('h1', 5), fakeHousehold('h2', 5)]
    expect(resolvePastureWaterHousehold(households, 1)).toBe(households[1])
  })

  it('falls back to the first household when there is no shepherd', () => {
    const households = [fakeHousehold('h0', 5), fakeHousehold('h1', 5)]
    expect(resolvePastureWaterHousehold(households, null)).toBe(households[0])
  })

  it('falls back to the first household when the shepherd index is out of range', () => {
    const households = [fakeHousehold('h0', 5)]
    expect(resolvePastureWaterHousehold(households, 3)).toBe(households[0])
  })

  it('is undefined for a settlement with no households', () => {
    expect(resolvePastureWaterHousehold([], null)).toBeUndefined()
  })
})

describe('pasture trough fill eligibility (plan settlements-npcs-046)', () => {
  it('can fill while the canonical household reserve has room', () => {
    const household = fakeHousehold('h', 4, 10)
    expect(pastureTroughCanFill(household)).toBe(true)
    expect(pastureTroughPromptLabel(household)).toBe('[E] Napełnij koryto')
  })

  it('cannot fill once the canonical household reserve is at capacity', () => {
    const household = fakeHousehold('h', 10, 10)
    expect(pastureTroughCanFill(household)).toBe(false)
    expect(pastureTroughPromptLabel(household)).toBe('Koryto pełne')
  })
})
