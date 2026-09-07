/**
 * @domain settlements-npcs
 *
 * Blacksmith household-yard workplace geometry (plan
 * settlements-npcs-024 Stage 1) — pure geometry only, no Three.js or
 * runtime state. Computes the compact anvil + grind-workbench + NPC
 * access-anchor arrangement for one household's blacksmith workplace,
 * anchored to that household's own house.
 *
 * The workplace sits in a lateral sector offset from the house's existing
 * outward yard axis (`props.ts`'s `houseYardPlacements()`, also core →
 * house) so it never overlaps the common household barrel/trough/storage
 * slots (`householdYard.ts`) or the house entrance, which faces inward
 * toward the settlement core (`props.ts` sets house yaw to `outward + PI`).
 */

/** Distance from the house footprint edge to the workplace's own local
 *  origin (the anvil). Small relative to `HOUSEHOLD_YARD_PROP_OFFSETS`
 *  because the compact anvil/workbench/anchor arrangement below extends
 *  further out on its own — every local offset only ever adds a
 *  non-negative outward or purely-tangential component, so every point in
 *  the arrangement stays at least this far outside the house footprint. */
export const BLACKSMITH_YARD_BASE_OFFSET = 1.0

/** Angular offset (radians) of the workplace's local outward axis from the
 *  house's own outward axis (settlement core → house) — keeps the
 *  workplace in a distinct lateral sector, clear of the common yard props'
 *  outward ± jitter sector (`props.ts`'s `houseYardPlacements`, ~±0.45 rad)
 *  and of the house entrance (which faces the opposite/inward direction,
 *  `outwardAngle + PI`). 100° sits well inside the outward hemisphere while
 *  staying far from both. */
export const BLACKSMITH_YARD_SECTOR_OFFSET = (100 * Math.PI) / 180

/** Local anvil → grind-workbench offset, along the workplace's own
 *  outward/tangent axes — the original settlement-center materializer's
 *  relative arrangement (plan settlements-npcs-002: center-to-center
 *  distance ≈1.08 m), preserved as the starting geometry per plan
 *  settlements-npcs-024. */
const WORKBENCH_LOCAL_OFFSET = { outward: 1.0, tangent: 0.4 }

/** Local anvil → NPC-access-anchor offset — purely tangential, on the
 *  opposite side from the workbench so the approach path never crosses
 *  either prop and never targets a mesh center. */
const ANCHOR_LOCAL_OFFSET = { outward: 0, tangent: -1.1 }

export type BlacksmithYardGeometry = {
  anvil: { x: number, z: number }
  workbench: { x: number, z: number }
  /** NPC work/access point — reachable free space beside the equipment. */
  anchor: { x: number, z: number }
}

/**
 * One household's blacksmith workplace geometry, derived from its actual
 * house center + footprint radius (`houseBuilder.ts`'s
 * `houseFootprintRadius()`, not the legacy catalog max) and the
 * settlement-core-relative outward angle already used for that house's
 * common yard props. Deterministic — same inputs always produce the same
 * output, no internal randomness.
 */
export function blacksmithYardGeometry(
  houseCenter: { x: number, z: number },
  houseFootprintRadius: number,
  outwardAngle: number,
): BlacksmithYardGeometry {
  const basisAngle = outwardAngle + BLACKSMITH_YARD_SECTOR_OFFSET
  const ux = Math.cos(basisAngle)
  const uz = Math.sin(basisAngle)
  const tx = -uz
  const tz = ux
  const r = houseFootprintRadius + BLACKSMITH_YARD_BASE_OFFSET

  const anvil = { x: houseCenter.x + ux * r, z: houseCenter.z + uz * r }
  const workbench = {
    x: anvil.x + ux * WORKBENCH_LOCAL_OFFSET.outward + tx * WORKBENCH_LOCAL_OFFSET.tangent,
    z: anvil.z + uz * WORKBENCH_LOCAL_OFFSET.outward + tz * WORKBENCH_LOCAL_OFFSET.tangent,
  }
  const anchor = {
    x: anvil.x + ux * ANCHOR_LOCAL_OFFSET.outward + tx * ANCHOR_LOCAL_OFFSET.tangent,
    z: anvil.z + uz * ANCHOR_LOCAL_OFFSET.outward + tz * ANCHOR_LOCAL_OFFSET.tangent,
  }
  return { anvil, workbench, anchor }
}
