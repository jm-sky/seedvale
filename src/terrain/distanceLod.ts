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

/** Short cheap filler blades — distance LOD for the ground-cover bucket that
 *  densifies grass coverage without paying detailed-species fill-rate (plan
 *  world-terrain-005). Linear falloff to 0 at `radius`, so `radius = 1`
 *  reproduces the original near-only behaviour (issue 023) while a larger
 *  `radius` (`ChunkManager`'s `grassFillerCoverage` quality knob, scaled into
 *  `effectiveGrassRadius`) lets cheap filler extend across the whole grass
 *  ring instead of detailed species density, matching the plan's "far → very
 *  cheap filler" model. */
export function grassFillerLodFraction(dist: number, radius: number, lodScale: number): number {
  if (radius <= 0) return 0
  return Math.max(0, (1 - dist / radius) * lodScale)
}

/** Grass blade-cluster geometry LOD (plan 148 S) — how many fins/segments a
 *  species' InstancedMesh uses, on top of (not instead of) `densityLodFraction`'s
 *  instance-count reduction. Reuses `densityLodFraction`'s own near-field
 *  breakpoint (`t <= 0.35`) as the near/mid line so geometry LOD doesn't
 *  fight density LOD with a second, uncoordinated threshold. */
export type GrassGeometryLodTier = 'near' | 'mid' | 'far'

export function grassGeometryLodTier(dist: number, radius: number): GrassGeometryLodTier {
  const t = dist / Math.max(1, radius)
  if (t <= 0.35) return 'near'
  if (t <= 0.7) return 'mid'
  return 'far'
}
