/** Representation-neutral scalar helpers shared by cave spatial
 *  representations (SDF and heightfield) during the world-terrain-019
 *  migration. Not an SDF primitive and not a heightfield primitive.
 *
 * @domain world-terrain
 */

/**
 * Polynomial smooth minimum. For `k > 0`, `smin(a, a, k) = a - k/4`, so a
 * running fold over overlapping operands silently shrinks the result.
 *
 * @domain world-terrain
 */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

/** Smooth maximum built from `smin`, so unions never crease. */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k)
}
