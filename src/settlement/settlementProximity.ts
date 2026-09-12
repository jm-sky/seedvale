import { cellsWithinRadius, SETTLEMENT_GRID_STEP, type SettlementCell, type SettlementDef, worldToCell } from './settlementGenerator'

/**
 * Bounded settlement-proximity lookup (plan world-017 §4) — deliberately
 * separate from any water-quality classifier so that classifier can stay pure
 * and testable without a settlement dependency.
 *
 * @domain settlement
 * @system settlement-proximity
 * @role Cheap, bounded "which settlements are near this world point" checks,
 *  built on the existing settlement grid instead of loaded/streamed
 *  settlements — `isNearSettlement`'s fixed-radius boolean check, and
 *  `settlementsWithinDistance`'s larger-radius full candidate list.
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

/** Every settlement (loaded or not) whose site sits within `maxDistance` of
 *  `(x, z)` — same non-streaming `peekDef` grid walk as `isNearSettlement`,
 *  generalized for a much larger `maxDistance` (plan quests-progression-019
 *  §7, animal-deed reputation exposure): returns every match instead of
 *  short-circuiting on the first one, and derives the cell search radius
 *  from `maxDistance` instead of a fixed `1`. The `+1` cell of margin covers
 *  a site's deterministic offset/local-site-search drift within its own
 *  cell (see `SETTLEMENT_GRID_STEP`'s doc), so a settlement just inside
 *  `maxDistance` near a cell boundary is never missed. Exact-filtered by
 *  real world distance afterward, so the result never depends on the grid
 *  step choice, only on `maxDistance` itself. */
export function settlementsWithinDistance(
  peekDef: (cell: SettlementCell) => SettlementDef | null,
  x: number,
  z: number,
  maxDistance: number,
): { id: string, x: number, z: number }[] {
  const center = worldToCell(x, z)
  const cellRadius = Math.ceil(maxDistance / SETTLEMENT_GRID_STEP) + 1
  const results: { id: string, x: number, z: number }[] = []
  for (const cell of cellsWithinRadius(center, cellRadius)) {
    const def = peekDef(cell)
    if (!def) continue
    if (Math.hypot(def.x - x, def.z - z) <= maxDistance) results.push({ id: def.id, x: def.x, z: def.z })
  }
  return results
}
