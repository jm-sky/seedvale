import { describe, expect, it } from 'vitest'
import { resolveExpeditionDestinationPoint } from './expedition'

describe('resolveExpeditionDestinationPoint', () => {
  it('resolves a settlement ref through the injected lookup', () => {
    const point = resolveExpeditionDestinationPoint(
      { kind: 'settlement', settlementId: '1_0' },
      {
        settlementAt: (id) => id === '1_0' ? { x: 12, z: -4 } : null,
        locationAt: () => ({ x: 99, z: 99 }),
      },
    )
    expect(point).toEqual({ x: 12, z: -4 })
  })

  it('resolves a location ref through the injected lookup', () => {
    const point = resolveExpeditionDestinationPoint(
      { kind: 'location', locationId: 'cave:mine' },
      {
        settlementAt: () => ({ x: 0, z: 0 }),
        locationAt: (id) => id === 'cave:mine' ? { x: 400, z: -20 } : null,
      },
    )
    expect(point).toEqual({ x: 400, z: -20 })
  })

  it('returns null when the destination is missing or non-finite', () => {
    expect(resolveExpeditionDestinationPoint(
      { kind: 'location', locationId: 'missing' },
      { settlementAt: () => ({ x: 1, z: 1 }), locationAt: () => null },
    )).toBeNull()
    expect(resolveExpeditionDestinationPoint(
      { kind: 'settlement', settlementId: '1_0' },
      { settlementAt: () => ({ x: Number.NaN, z: 0 }), locationAt: () => ({ x: 1, z: 1 }) },
    )).toBeNull()
  })
})
