/** Representation-neutral cave/walk-surface seam contracts.
 *
 *  Shared by SDF queries and the heightfield representation so neither
 *  spatial implementation owns the surface-clip epsilon. Presentation
 *  triangle clipping (`clipBelowSurface.ts`) and mouth-carve geometry
 *  (`mouthCarve.ts`) stay in their own modules.
 *
 * @domain world-terrain
 */

/** Clip cave ceilings this far below the walk surface so a surface entity
 *  at `y ≈ sampleBaseHeight` is not contained in cave void. Open-sky /
 *  mouth-opening tests use the same slack so gameplay and presentation
 *  agree on the contour. */
export const SURFACE_CLIP_EPS = 0.05
