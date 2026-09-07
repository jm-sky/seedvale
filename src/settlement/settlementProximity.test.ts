import { describe, expect, it } from 'vitest'
import type { SettlementCell, SettlementDef } from './settlementGenerator'
import { cellKey, SETTLEMENT_GRID_STEP } from './settlementGenerator'
import { isNearSettlement, NEAR_SETTLEMENT_DISTANCE } from './settlementProximity'

/** Minimal fake `peekDef` over an explicit `{cell -> {x,z}}` map — only the
 *  fields `isNearSettlement` actually reads. */
function fakePeekDef(sites: Record<string, { x: number, z: number }>): (cell: SettlementCell) => SettlementDef | null {
  return (cell) => {
    const site = sites[cellKey(cell)]
    return site ? ({ x: site.x, z: site.z } as SettlementDef) : null
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
