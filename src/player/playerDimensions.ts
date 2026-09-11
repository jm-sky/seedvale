/** Player body dimensions — the one neutral owner shared by
 *  `PlayerController` (movement / capsule fallback), cave containment
 *  (`Caves.resolveHorizontal`) and the `?caveHeightfieldTest` harness, which
 *  must not pull the whole gameplay module graph in just for two numbers.
 *
 * @domain items-player
 */

/** Matches the capsule fallback's `CapsuleGeometry` radius (plan 097 §2.2) —
 *  the GLB model has no measured collision shape, so this stands in for both. */
export const PLAYER_COLLISION_RADIUS = 0.35
export const PLAYER_HEIGHT = 1.8

/** A reported cave ceiling is rock overburden, not the open sky above a
 *  mouth/approach pit. If clamping to `ceiling - PLAYER_HEIGHT` would put
 *  the player *below* the walkable floor, ignore it. */
export function rockCeilingMaxY(ceilingY: number | null | undefined, floorY: number): number | undefined {
  if (ceilingY == null) return undefined
  const maxY = ceilingY - PLAYER_HEIGHT
  if (maxY < floorY - 1e-6) return undefined
  return maxY
}
