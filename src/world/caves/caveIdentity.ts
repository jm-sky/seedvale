/** Plan world-terrain-008 B1 — stable cave identity, shared by V1's siting
 *  (`caveGenerator.ts`) and Cave V2's production topology
 *  (`productionTopology.ts`). Deterministic from the seed plus the site's own
 *  (already-deterministic) placement; independent of generation/build order.
 *  Extracted out of `caveGenerator.ts` so Cave V2 can compute the exact same
 *  id without going through V1's tunnel/chamber layout or acceptance.
 *
 * @domain world-terrain
 */

export type CaveIdentitySite = { x: number, z: number }

/** Same bit-mixing V1 always used — moved, not changed, so discovered-location
 *  ids never drift for an existing save/seed. */
export function makeCaveId(seed: number, site: CaveIdentitySite): string {
  const fixedX = Math.round(site.x * 100)
  const fixedZ = Math.round(site.z * 100)
  let h = (seed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ fixedX, 0x85ebca6b) >>> 0
  h = Math.imul(h ^ fixedZ, 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return `cave:${h.toString(16).padStart(8, '0')}`
}
