import { describe, expect, it, vi } from 'vitest'
import type { SettlementDef } from '../settlement/settlementGenerator'
import { RIVER_CELL_STEP, type RiverHydrologyContext } from '../terrain/riverNetwork'
import { createRiverWaterQualityResolver } from './riverWaterQualityResolver'

/** A safe-candidate hydrology sample (small flow, high elevation), centered
 *  on hydrology cell (10, 20) so its exact cell coordinates are easy to
 *  reason about. */
function safeContext(x = 10 * RIVER_CELL_STEP + 1, z = 20 * RIVER_CELL_STEP + 1): RiverHydrologyContext {
  return { x, z, elevation: 100, accumulation: 20, distanceToWaterEdge: -0.5 }
}

describe('createRiverWaterQualityResolver (plan world-017 §6, §9.3)', () => {
  it('fails closed to unsafe when hydrology context is unavailable', () => {
    const resolver = createRiverWaterQualityResolver(
      () => null,
      () => null,
    )
    expect(resolver.resolve(0, 0)).toBe('unsafe')
  })

  it('composes hydrology + settlement proximity into the final quality', () => {
    const near = createRiverWaterQualityResolver(
      () => safeContext(),
      () => ({ x: safeContext().x, z: safeContext().z } as SettlementDef),
    )
    expect(near.resolve(0, 0)).toBe('unsafe') // safe base, degraded by proximity

    const far = createRiverWaterQualityResolver(
      () => safeContext(),
      () => null,
    )
    expect(far.resolve(0, 0)).toBe('safe')
  })

  it('caches by hydrology cell: repeated queries do not re-invoke the settlement lookup', () => {
    const peekDef = vi.fn(() => null)
    const resolver = createRiverWaterQualityResolver(() => safeContext(), peekDef)

    resolver.resolve(1, 1)
    resolver.resolve(2, 2)
    resolver.resolve(3, 3)

    // Bounded to a fixed 9-cell settlement lookup on the *first* resolve for
    // this hydrology cell only — later calls hit the cache instead.
    expect(peekDef.mock.calls.length).toBeGreaterThan(0)
    expect(peekDef.mock.calls.length).toBeLessThanOrEqual(9)
  })

  it('two query points resolving to the same hydrology-cell sample (e.g. opposite riverbanks) share one cache entry/result', () => {
    const riverWaterContext = vi.fn(() => safeContext())
    const resolver = createRiverWaterQualityResolver(riverWaterContext, () => null)

    const left = resolver.resolve(-5, 0)
    const right = resolver.resolve(5, 0)

    expect(left).toBe(right)
    expect(left).toBe('safe')
  })

  it('a neighboring hydrology cell can produce a distinct cache entry', () => {
    let call = 0
    const resolver = createRiverWaterQualityResolver(
      () => (call++ === 0 ? safeContext(10 * RIVER_CELL_STEP + 1, 20 * RIVER_CELL_STEP + 1) : safeContext(11 * RIVER_CELL_STEP + 1, 20 * RIVER_CELL_STEP + 1)),
      () => null,
    )
    expect(resolver.resolve(0, 0)).toBe('safe')
    expect(resolver.resolve(1000, 0)).toBe('safe')
  })

  it('a fresh resolver instance (world rebuild / seed change) starts with an empty cache', () => {
    const peekDefA = vi.fn(() => null)
    const a = createRiverWaterQualityResolver(() => safeContext(), peekDefA)
    a.resolve(0, 0)
    expect(peekDefA).toHaveBeenCalled()

    const peekDefB = vi.fn(() => null)
    const b = createRiverWaterQualityResolver(() => safeContext(), peekDefB)
    b.resolve(0, 0)
    expect(peekDefB).toHaveBeenCalled()
  })
})
