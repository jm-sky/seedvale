export const TORCH_LIGHT_BRANCH = { color: 0xff8a3c, intensity: 2.35, distance: 8 }
export const TORCH_LIGHT_WOODEN = { color: 0xff9a4a, intensity: 2.8, distance: 11 }
export const TORCH_LIGHT_DECAY = 2

/** Cave lighting multiplier (world-terrain-008 Milestone A test-environment
 *  patch) — applied only to the player's own torch `PointLight` while inside
 *  a cave. Surface presets above are never changed; distance matters more
 *  than intensity for reading cave walls, hence the larger multiplier. */
export const TORCH_CAVE_INTENSITY_MULTIPLIER = 1.6
export const TORCH_CAVE_DISTANCE_MULTIPLIER = 2.2

/** Resolves the live intensity/distance for the player's torch `PointLight`
 *  from its base preset, current fuel ratio and whether the player is
 *  currently inside a cave. Pure so it can be unit-tested without a
 *  `PointLight`/scene; both `PlayerTorch.light()` and `.update()` must call
 *  this so the cave multiplier isn't overwritten a frame after ignite. */
export function resolveTorchLight(
  preset: { intensity: number, distance: number },
  fuelRatio: number,
  inCave: boolean,
): { intensity: number, distance: number } {
  const intensityMultiplier = inCave ? TORCH_CAVE_INTENSITY_MULTIPLIER : 1
  const distanceMultiplier = inCave ? TORCH_CAVE_DISTANCE_MULTIPLIER : 1
  return {
    intensity: preset.intensity * fuelRatio * intensityMultiplier,
    distance: preset.distance * distanceMultiplier,
  }
}
/** Local +Z from the held wrap toward the flame tip (after grip offset). */
export const TORCH_TIP_OFFSET_BRANCH = [-0.05, 0.05, -0.35] as const
export const TORCH_TIP_OFFSET_WOODEN = [0, 0, 0.42] as const
/** Flame sits behind the light offset — the light marks the torch head, the
 *  flame anchor sits closer to the grip so the (larger, drifting) particle
 *  flame doesn't read as floating past the actual torch head. */
export const TORCH_FLAME_OFFSET_WOODEN = [0, 0, 0.25] as const

export const BRANCH_URL = '/models/items/branch.glb'
export const BRANCH_HELD_MAX = 0.55
