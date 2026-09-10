/**
 * Surface-world water vs the space the player currently occupies.
 *
 * `ChunkManager.waterLevel` is a single ocean/river plane. A cave chamber
 * below that plane is not flooded: rock separates the void from the sea.
 * Closed cave occupancy therefore must not hand vertical ownership to the
 * swim path (which snaps feet to `waterLevel` / outdoor `sampleFloor`).
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

/**
 * Whether the global water plane may own vertical motion at this sample.
 * `null` occupancy is outdoor / non-cave space — existing wading/swim rules.
 */
export function worldWaterAppliesInCurrentSpace(occupancy: WorldWaterOccupancy): boolean {
  if (!occupancy) return true
  return occupancy.openSky === true
}

/** Feet Y while the swim path owns vertical motion (deep water caps at `MAX_SWIM_DEPTH`). */
export function swimFeetY(waterLevel: number, terrainFloorY: number): number {
  const depth = Math.min(waterLevel - terrainFloorY, MAX_SWIM_DEPTH)
  return waterLevel - depth
}
