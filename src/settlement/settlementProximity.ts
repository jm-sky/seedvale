import { cellsWithinRadius, SETTLEMENT_GRID_STEP, type SettlementCell, type SettlementDef, worldToCell } from './settlementGenerator'

/**
 * Bounded settlement-proximity lookup (plan world-017 §4) — deliberately
 * separate from any water-quality classifier so that classifier can stay pure
 * and testable without a settlement dependency.
 *
 * @domain settlement
 * @system settlement-proximity
 * @role Cheap, bounded "is this world point near a settlement" check, built
 *  on the existing settlement grid instead of loaded/streamed settlements.
 */

/** Half the settlement grid spacing (plan world-017 §4.2) — derived from the
 *  existing grid scale rather than an independent magic number: local enough
 *  that the space between two neighboring settlements doesn't all read as
 *  contaminated, while still covering a river passing through a settlement's
 *  immediate surroundings. */
export const NEAR_SETTLEMENT_DISTANCE = SETTLEMENT_GRID_STEP / 2

/** True when some settlement (loaded or not) sits within `maxDistance` of
 *  `(x, z)`. Bounded to the `3x3` grid cells around `(x, z)` (plan world-017
 *  §4.1) — a settlement site can drift inside its own cell via deterministic
 *  offset + local site search, so checking only `worldToCell(x, z)` itself
 *  isn't enough near a cell boundary. `radius 1` is a fixed, small cost (at
 *  most 9 `peekDef` calls) and covers every settlement that could plausibly
 *  sit this close, so it never needs to expand.
 *
 *  `peekDef` resolves through the canonical settlement plan cache without
 *  loading meshes, so this works identically whether the settlement is
 *  currently streamed in or not (`SettlementsManager.peekDef`). */
export function isNearSettlement(
  peekDef: (cell: SettlementCell) => SettlementDef | null,
  x: number,
  z: number,
  maxDistance: number = NEAR_SETTLEMENT_DISTANCE,
): boolean {
  const center = worldToCell(x, z)
  for (const cell of cellsWithinRadius(center, 1)) {
    const def = peekDef(cell)
    if (!def) continue
    if (Math.hypot(def.x - x, def.z - z) <= maxDistance) return true
  }
  return false
}
