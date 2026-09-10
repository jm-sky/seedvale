/** Mouth/opening yaw helpers shared by siting and mouth-plane queries.
 *  Kept free of terrain/fauna imports so cave SDF extraction can run in a
 *  worker without pulling `largeCaves.ts` → `createFauna`.
 *
 * @domain world-terrain
 */

export function tunnelDirection(yaw: number): { dx: number, dz: number } {
  return { dx: -Math.sin(yaw), dz: -Math.cos(yaw) }
}

export function openingDirection(yaw: number): { dx: number, dz: number } {
  return { dx: Math.sin(yaw), dz: Math.cos(yaw) }
}
