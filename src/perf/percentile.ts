/** Percentile of the first `count` values in `sorted` (ascending).
 *  `p` is 0–100. Empty input → 0. */
export function percentile(sorted: ArrayLike<number>, count: number, p: number): number {
  if (count <= 0) return 0
  const clamped = Math.min(100, Math.max(0, p))
  if (count === 1) return sorted[0] ?? 0
  const rank = (clamped / 100) * (count - 1)
  const lo = Math.floor(rank)
  const hi = Math.min(count - 1, lo + 1)
  const a = sorted[lo] ?? 0
  const b = sorted[hi] ?? a
  return a + (b - a) * (rank - lo)
}

/** Copies `source[0..count)` into `scratch`, sorts scratch in place, returns it. */
export function copyAndSort(
  source: Float64Array,
  count: number,
  scratch: Float64Array,
): Float64Array {
  const n = Math.min(count, source.length, scratch.length)
  for (let i = 0; i < n; i++) scratch[i] = source[i]!
  scratch.subarray(0, n).sort()
  return scratch
}
