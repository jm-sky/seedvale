/**
 * Deterministic, bounded nearest-candidate search shared by every
 * `debug.locations.*Nearest()` query (plan `ui-input-001`). One shared
 * algorithm — ring order, in-ring point order, and the "first qualifying
 * candidate wins" contract — so no individual query invents its own search
 * policy or fallback behavior. Domain modules (`locationQueries.ts`) only
 * supply how to enumerate candidates (`worldRingSteps`/`cellRingSteps`) and
 * how to test one (`probe`); this file has no dependency on
 * `WorldBundle`/`WorldContext`/the browser, so it's fully unit-testable
 * without a live world.
 */

export type RingStep<C> = { readonly points: readonly C[] }

/**
 * Walks `steps` in order (nearest ring first); within a step, probes points
 * in the fixed order the step provides — never re-sorted by measured
 * distance, so two candidates in the same ring always resolve to the same
 * one regardless of floating-point rounding. Returns the first candidate for
 * which `probe` returns non-`null`, or `null` once every step is exhausted —
 * "nearest-by-ring", not "globally nearest by exact distance", and always
 * bounded by however many steps the caller supplied (no arbitrary fallback).
 */
export function searchNearest<C, T>(
  steps: readonly RingStep<C>[],
  probe: (point: C) => T | null,
): { point: C, data: T } | null {
  for (const step of steps) {
    for (const point of step.points) {
      const data = probe(point)
      if (data !== null) return { point, data }
    }
  }
  return null
}

export type WorldPoint = { x: number, z: number }

/**
 * Continuous world-space expanding rings around `origin`: ring 0 is the
 * origin point itself; ring N (N>=1) has `baseDirections * N` points evenly
 * spaced around a circle of radius `N * stepSize`, in fixed angle order
 * (angle 0 -> 2π). Angular sample count scales with ring index so outer,
 * longer-circumference rings still get reasonable coverage without the
 * innermost ring wastefully oversampling a single point.
 */
export function worldRingSteps(
  origin: WorldPoint,
  stepSize: number,
  maxRadius: number,
  baseDirections = 8,
): RingStep<WorldPoint>[] {
  const steps: RingStep<WorldPoint>[] = [{ points: [origin] }]
  let radius = stepSize
  let ring = 1
  while (radius <= maxRadius) {
    const directions = baseDirections * ring
    const points: WorldPoint[] = []
    for (let i = 0; i < directions; i++) {
      const angle = (i / directions) * Math.PI * 2
      points.push({ x: origin.x + Math.cos(angle) * radius, z: origin.z + Math.sin(angle) * radius })
    }
    steps.push({ points })
    radius += stepSize
    ring++
  }
  return steps
}

/**
 * Grid-cell expanding Chebyshev rings around `origin`, generic over any cell
 * shape via `offset` (e.g. `SettlementCell {gx,gz}` for village queries,
 * `RiverTileCoord {tx,tz}` for river queries) — ring 0 is `origin` itself;
 * ring N (N>=1) is exactly the N-th Chebyshev shell (the border of a
 * (2N+1)x(2N+1) box), in fixed row-major (dz outer, dx inner) order — the
 * same order `settlementGenerator.ts`'s `cellsWithinRadius` walks a full disc
 * in, just emitted ring-by-ring so a nearer ring is always exhausted before a
 * farther one.
 */
export function cellRingSteps<C>(
  origin: C,
  maxCellRadius: number,
  offset: (origin: C, dx: number, dz: number) => C,
): RingStep<C>[] {
  const steps: RingStep<C>[] = [{ points: [origin] }]
  for (let r = 1; r <= maxCellRadius; r++) {
    const points: C[] = []
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        points.push(offset(origin, dx, dz))
      }
    }
    steps.push({ points })
  }
  return steps
}
