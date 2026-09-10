/**
 * Surface-world water vs the space the player currently occupies.
 *
 * `ChunkManager.waterLevel` is a single ocean/river plane. A cave chamber
 * below that plane is not flooded: rock separates the void from the sea.
 * The swim path snaps feet to `waterLevel` / outdoor `sampleFloor`, so it
 * must not own vertical motion while cave ground still resolves a closed
 * interval — even if strict occupancy is briefly false (floor grace /
 * quantization / a centimetre below the floor).
 *
 * Open-sky mouth/approach pits still see world water (a flooded entrance).
 * True underground water needs its own occupancy later — this helper is the
 * seam, not a permanent "no swimming in caves" ban.
 *
 * @domain items-player
 */

export const MAX_SWIM_DEPTH = 1.2

export type WorldWaterOccupancy = {
  openSky?: boolean
} | null

export type WorldWaterEligibilityInput = {
  /** Strict cave occupancy at the player's Y. May be `null` on a floor boundary. */
  occupancy: WorldWaterOccupancy
  /**
   * Rock ceiling from the resolved cave ground query (`source` cave/hysteresis).
   * `null` means outdoor or an open-sky pit (the gameplay adapter strips
   * openSky ceilings). A real number means overburden between the player
   * and the outdoor surface.
   */
  caveCeiling: number | null
}

/**
 * Whether the global water plane may own vertical motion at this sample.
 *
 * Closed cave *ground* wins over occupancy: if queryGround still owns the
 * column with a rock ceiling, outdoor water is on the other side of that
 * roof. Occupancy-only false must not reopen surface swim.
 */
export function worldWaterAppliesInCurrentSpace(input: WorldWaterEligibilityInput): boolean {
  if (input.caveCeiling != null) return false
  if (input.occupancy && input.occupancy.openSky !== true) return false
  return true
}

/** Feet Y while the swim path owns vertical motion (deep water caps at `MAX_SWIM_DEPTH`). */
export function swimFeetY(waterLevel: number, terrainFloorY: number): number {
  const depth = Math.min(waterLevel - terrainFloorY, MAX_SWIM_DEPTH)
  return waterLevel - depth
}
