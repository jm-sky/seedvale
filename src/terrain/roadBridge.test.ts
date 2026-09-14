import { describe, expect, it } from 'vitest'
import { bridgeDeckYAt, isOnAnyBridgeDeck, isOnBridgeDeck, type RoadBridgeSpec } from './roadBridge'

function makeSpec(overrides: Partial<RoadBridgeSpec> = {}): RoadBridgeSpec {
  return {
    id: 'route#0',
    x: 100,
    z: 200,
    yaw: 0,
    dirX: 0,
    dirZ: 1,
    span: 20,
    width: 6,
    deckY: 12,
    deckThickness: 0.3,
    ...overrides,
  }
}

describe('isOnBridgeDeck', () => {
  it('accepts the deck center', () => {
    const spec = makeSpec()
    expect(isOnBridgeDeck(spec, spec.x, spec.z)).toBe(true)
  })

  it('accepts a point along the road axis within half the span', () => {
    const spec = makeSpec()
    // dir is (0, 1): "along" moves in +z.
    expect(isOnBridgeDeck(spec, spec.x, spec.z + spec.span * 0.5 - 0.01)).toBe(true)
  })

  it('rejects a point beyond half the span along the road axis', () => {
    const spec = makeSpec()
    expect(isOnBridgeDeck(spec, spec.x, spec.z + spec.span * 0.5 + 0.01)).toBe(false)
  })

  it('rejects a point beyond half the width across the road axis', () => {
    const spec = makeSpec()
    expect(isOnBridgeDeck(spec, spec.x + spec.width * 0.5 + 0.01, spec.z)).toBe(false)
  })

  it('accounts for a non-axis-aligned yaw/direction', () => {
    // 45 degree road direction.
    const s = Math.SQRT1_2
    const spec = makeSpec({ dirX: s, dirZ: s, span: 10, width: 4 })
    // Straight along the road direction from the center, within half-span.
    expect(isOnBridgeDeck(spec, spec.x + s * 4, spec.z + s * 4)).toBe(true)
    // Perpendicular offset beyond half-width.
    expect(isOnBridgeDeck(spec, spec.x + s * 3, spec.z - s * 3)).toBe(false)
  })
})

describe('bridgeDeckYAt', () => {
  it('returns the matching spec deck Y inside its footprint', () => {
    const spec = makeSpec({ deckY: 42 })
    expect(bridgeDeckYAt([spec], spec.x, spec.z)).toBe(42)
  })

  it('returns null outside every spec footprint', () => {
    const spec = makeSpec()
    expect(bridgeDeckYAt([spec], spec.x + 1000, spec.z + 1000)).toBeNull()
  })

  it('returns null for an empty spec list', () => {
    expect(bridgeDeckYAt([], 0, 0)).toBeNull()
  })

  it('is deterministic/repeatable for the same input', () => {
    const spec = makeSpec()
    const a = bridgeDeckYAt([spec], spec.x, spec.z)
    const b = bridgeDeckYAt([spec], spec.x, spec.z)
    expect(a).toBe(b)
  })
})

describe('isOnAnyBridgeDeck', () => {
  it('is true when any spec in the list matches', () => {
    const far = makeSpec({ id: 'a', x: -500, z: -500 })
    const near = makeSpec({ id: 'b', x: 10, z: 10 })
    expect(isOnAnyBridgeDeck(10, 10, [far, near])).toBe(true)
  })

  it('is false when no spec matches', () => {
    const specs = [makeSpec({ id: 'a', x: -500, z: -500 })]
    expect(isOnAnyBridgeDeck(10, 10, specs)).toBe(false)
  })
})
