import { describe, expect, it } from 'vitest'
import type { SettlementCell, SettlementDef } from './settlementGenerator'
import { cellKey, SETTLEMENT_GRID_STEP } from './settlementGenerator'
import { isNearSettlement, NEAR_SETTLEMENT_DISTANCE, settlementsWithinDistance } from './settlementProximity'

/** Minimal fake `peekDef` over an explicit `{cell -> {id,x,z}}` map — only the
 *  fields `isNearSettlement`/`settlementsWithinDistance` actually read. */
function fakePeekDef(
  sites: Record<string, { id?: string, x: number, z: number }>,
): (cell: SettlementCell) => SettlementDef | null {
  return (cell) => {
    const key = cellKey(cell)
    const site = sites[key]
    return site ? ({ id: site.id ?? key, x: site.x, z: site.z } as SettlementDef) : null
  }
}

describe('isNearSettlement (plan world-017 §4.1/§4.2/§9.2)', () => {
  it('finds a settlement sitting in cell (0,0) itself', () => {
    const peekDef = fakePeekDef({ '0_0': { x: 5, z: 5 } })
    expect(isNearSettlement(peekDef, 5, 5)).toBe(true)
  })

  it('is false when no settlement resolves anywhere in the 3x3 lookup', () => {
    const peekDef = fakePeekDef({})
    expect(isNearSettlement(peekDef, 0, 0)).toBe(false)
  })

  it('finds a settlement registered under a neighboring grid cell (radius-1 lookup) close enough in world distance', () => {
    // Query point at world origin, cell (0,0). The settlement resolves under
    // cell (1,0) — proving the bounded 3x3 search checks neighboring cells,
    // not just worldToCell(query) — while its actual site position is still
    // within NEAR_SETTLEMENT_DISTANCE of the query point.
    const peekDef = fakePeekDef({ '1_0': { x: NEAR_SETTLEMENT_DISTANCE - 1, z: 0 } })
    expect(isNearSettlement(peekDef, 0, 0)).toBe(true)
  })

  it('boundary: exactly at NEAR_SETTLEMENT_DISTANCE counts as near (<=)', () => {
    const peekDef = fakePeekDef({ '0_0': { x: NEAR_SETTLEMENT_DISTANCE, z: 0 } })
    expect(isNearSettlement(peekDef, 0, 0)).toBe(true)
  })

  it('boundary: just past NEAR_SETTLEMENT_DISTANCE counts as far', () => {
    const peekDef = fakePeekDef({ '0_0': { x: NEAR_SETTLEMENT_DISTANCE + 0.01, z: 0 } })
    expect(isNearSettlement(peekDef, 0, 0)).toBe(false)
  })

  it('boundary: just under NEAR_SETTLEMENT_DISTANCE counts as near', () => {
    const peekDef = fakePeekDef({ '0_0': { x: NEAR_SETTLEMENT_DISTANCE - 0.01, z: 0 } })
    expect(isNearSettlement(peekDef, 0, 0)).toBe(true)
  })

  it('does not find a settlement two grid cells away', () => {
    const peekDef = fakePeekDef({ '2_0': { x: 2 * SETTLEMENT_GRID_STEP, z: 0 } })
    expect(isNearSettlement(peekDef, 0, 0)).toBe(false)
  })

  it('gives the same result whether the settlement def is "streamed in" or not — peekDef has no such notion', () => {
    const peekDef = fakePeekDef({ '0_0': { x: 10, z: 10 } })
    expect(isNearSettlement(peekDef, 0, 0)).toBe(isNearSettlement(peekDef, 0, 0))
  })
})

describe('settlementsWithinDistance (plan quests-progression-019 §7)', () => {
  it('returns every settlement within maxDistance, not just the first match', () => {
    const peekDef = fakePeekDef({
      '0_0': { id: 'home', x: 0, z: 0 },
      '1_0': { id: 'east', x: SETTLEMENT_GRID_STEP, z: 0 },
    })
    const results = settlementsWithinDistance(peekDef, 0, 0, SETTLEMENT_GRID_STEP + 1)
    expect(results.map((r) => r.id).sort()).toEqual(['east', 'home'])
  })

  it('excludes a settlement whose cell is scanned but whose real distance exceeds maxDistance', () => {
    const peekDef = fakePeekDef({ '5_0': { id: 'far', x: 5 * SETTLEMENT_GRID_STEP, z: 0 } })
    const results = settlementsWithinDistance(peekDef, 0, 0, 1000)
    expect(results).toEqual([])
  })

  it('boundary: exactly at maxDistance counts as within range (<=)', () => {
    const peekDef = fakePeekDef({ '0_0': { id: 'edge', x: 1000, z: 0 } })
    expect(settlementsWithinDistance(peekDef, 0, 0, 1000)).toEqual([{ id: 'edge', x: 1000, z: 0 }])
  })

  it('boundary: just past maxDistance is excluded', () => {
    const peekDef = fakePeekDef({ '0_0': { id: 'edge', x: 1000.01, z: 0 } })
    expect(settlementsWithinDistance(peekDef, 0, 0, 1000)).toEqual([])
  })

  it('is identical regardless of streaming state, since peekDef has no such notion', () => {
    const peekDef = fakePeekDef({ '0_0': { id: 'home', x: 0, z: 0 } })
    expect(settlementsWithinDistance(peekDef, 0, 0, 500)).toEqual(settlementsWithinDistance(peekDef, 0, 0, 500))
  })

  it('scans far enough to find a settlement near the far edge of a large maxDistance (e.g. 3000)', () => {
    const peekDef = fakePeekDef({ '10_0': { id: 'edge-of-3km', x: 10 * SETTLEMENT_GRID_STEP, z: 0 } })
    const results = settlementsWithinDistance(peekDef, 0, 0, 3000)
    expect(results.map((r) => r.id)).toEqual(['edge-of-3km'])
  })
})
