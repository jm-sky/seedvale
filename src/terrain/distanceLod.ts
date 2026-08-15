/** Distance LOD for instanced density (grass / vegetation / rocks).
 *  `dist` is Chebyshev chunk distance; `radius` is the visible ring
 *  (`grass.radius` or `loadRadius`). Near stays full; far drops aggressively
 *  instead of the old ~25% floor (plan 113 P2). `lodScale` (quality preset)
 *  multiplies the curve without changing generation density. */
export function densityLodFraction(dist: number, radius: number, lodScale: number): number {
  const t = dist / Math.max(1, radius)
  const unscaled = t <= 0.35 ? 1 : 1 - (t - 0.35) * 1.6
  return Math.max(0.08, Math.min(1, unscaled * lodScale))
}

/** Short near-field filler blades — only the player's chunk + immediate ring. */
export function grassFillerLodFraction(dist: number, lodScale: number): number {
  return dist <= 1 ? Math.max(0, (1 - dist * 0.55) * lodScale) : 0
}
