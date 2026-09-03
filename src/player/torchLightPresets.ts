export const TORCH_LIGHT_BRANCH = { color: 0xff8a3c, intensity: 2.35, distance: 8 }
export const TORCH_LIGHT_WOODEN = { color: 0xff9a4a, intensity: 2.8, distance: 11 }
export const TORCH_LIGHT_DECAY = 2
/** Local +Z from the held wrap toward the flame tip (after grip offset). */
export const TORCH_TIP_OFFSET_BRANCH = [-0.05, 0.05, -0.35] as const
export const TORCH_TIP_OFFSET_WOODEN = [0, 0, 0.42] as const
/** Flame sits behind the light offset — the light marks the torch head, the
 *  flame anchor sits closer to the grip so the (larger, drifting) particle
 *  flame doesn't read as floating past the actual torch head. */
export const TORCH_FLAME_OFFSET_WOODEN = [0, 0, 0.25] as const

export const BRANCH_URL = '/models/items/branch.glb'
export const BRANCH_HELD_MAX = 0.55
