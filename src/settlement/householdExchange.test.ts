import { describe, expect, it } from 'vitest'
import { createHousehold } from './household'
import { createHouseholdExchangeHooks, selectHouseholdSurplusSource } from './householdExchange'

function householdWithFood(id: string, amount: number) {
  const household = createHousehold(id, 's', `home:${id}`)
  household.items.remove('bread', household.items.count('bread'))
  if (amount > 0) household.depositFood('carrot', amount)
  return household
}

describe('selectHouseholdSurplusSource', () => {
  it('returns null when no candidate has surplus', () => {
    const candidates = [
      { household: householdWithFood('a', 1), position: { x: 0, z: 0 } },
      { household: householdWithFood('b', 2), position: { x: 5, z: 0 } },
    ]
    expect(selectHouseholdSurplusSource(candidates, 'x', 'food', { x: 0, z: 0 })).toBeNull()
  })

  it('excludes the requesting household even if it has surplus', () => {
    const self = householdWithFood('self', 20)
    const candidates = [{ household: self, position: { x: 0, z: 0 } }]
    expect(selectHouseholdSurplusSource(candidates, 'self', 'food', { x: 0, z: 0 })).toBeNull()
  })

  it('picks the nearest surplus source', () => {
    const far = householdWithFood('far', 20)
    const near = householdWithFood('near', 20)
    const candidates = [
      { household: far, position: { x: 100, z: 0 } },
      { household: near, position: { x: 5, z: 0 } },
    ]
    const picked = selectHouseholdSurplusSource(candidates, 'requester', 'food', { x: 0, z: 0 })
    expect(picked?.household.id).toBe('near')
  })

  it('breaks equal-distance ties by household id, never randomly', () => {
    const b = householdWithFood('b', 20)
    const a = householdWithFood('a', 20)
    const candidates = [
      { household: b, position: { x: 5, z: 0 } },
      { household: a, position: { x: 5, z: 0 } },
    ]
    const picked1 = selectHouseholdSurplusSource(candidates, 'requester', 'food', { x: 0, z: 0 })
    const picked2 = selectHouseholdSurplusSource([...candidates].reverse(), 'requester', 'food', { x: 0, z: 0 })
    expect(picked1?.household.id).toBe('a')
    expect(picked2?.household.id).toBe('a')
  })

  it('skips a candidate whose surplus has since been claimed by another actor', () => {
    const source = householdWithFood('source', 20)
    const candidates = [{ household: source, position: { x: 0, z: 0 } }]
    expect(selectHouseholdSurplusSource(candidates, 'requester', 'food', { x: 0, z: 0 })?.household.id).toBe('source')
    source.items.remove('carrot', source.items.count('carrot'))
    expect(selectHouseholdSurplusSource(candidates, 'requester', 'food', { x: 0, z: 0 })).toBeNull()
  })
})

describe('createHouseholdExchangeHooks', () => {
  it('wraps selectHouseholdSurplusSource behind findSurplusSource', () => {
    const source = householdWithFood('source', 20)
    const hooks = createHouseholdExchangeHooks([{ household: source, position: { x: 3, z: 4 } }])
    const found = hooks.findSurplusSource('requester', 'food', { x: 0, z: 0 })
    expect(found?.household.id).toBe('source')
    expect(found?.position).toEqual({ x: 3, z: 4 })
  })
})
