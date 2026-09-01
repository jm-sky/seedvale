import type { MaterialRequirement } from '../items/constructionMaterials'
import type { GroundPlacementReason } from '../items/tentPlacement'

/**
 * Player-built standing torch — pure domain logic (plan items-player-009).
 * Deliberately free of `THREE`/DOM, same split as `world/playerWell.ts` vs
 * `world/createPlayerWells.ts`/`world/playerWellProp.ts`. A separate world
 * object from the portable `wooden_torch` item (`items/items.ts`) — building
 * one consumes a `wooden_torch` as a component, but the standing torch itself
 * is its own persistent world object with its own identity/lit state.
 *
 * `lit` is the only authoritative ignition state; the runtime flame/light
 * (`world/createStandingTorches.ts`) is always derived from it, never a
 * second source of truth.
 *
 * @domain items-player
 */
export type StandingTorchRecord = { id: string, x: number, z: number, yaw: number, lit: boolean }

/** Clearance/spacing (plan §1) — smaller than a tent/well/garden: a torch is
 *  a single post, not a footprint the player stands inside. */
export const STANDING_TORCH_FOOTPRINT_RADIUS = 0.3
export const STANDING_TORCH_SEPARATION = 1.5
/** How far ahead of the player a standing torch is placed — mirrors
 *  `GARDEN_PLACE_REACH`/`TRAP_PLACE_REACH`. */
export const STANDING_TORCH_PLACE_REACH = 1.6
/** Busy-channel duration for the placement action itself — same order of
 *  magnitude as a trap/garden placement. */
export const STANDING_TORCH_PLACE_DURATION_SEC = 3

export type StandingTorchPlacementReason = GroundPlacementReason | 'torch'

export const STANDING_TORCH_PLACEMENT_MESSAGE: Record<Exclude<StandingTorchPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na pochodnię.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już coś stoi.',
  torch: 'Tu już stoi pochodnia.',
}

/**
 * Materials consumed atomically on a successful placement (plan §2). The
 * plan names `wooden pole × 1` — no such item exists in `items/items.ts`,
 * and the plan's own completion criteria forbid adding a new material solely
 * for this recipe. `beam` ("belka" — a felled-tree structural timber,
 * `items/items.ts`) is the closest existing match and stands in for it.
 * `wooden_torch` is the existing portable item; using it here consumes it —
 * it does not become the standing torch's own record.
 */
export const STANDING_TORCH_MATERIAL_REQUIREMENTS: readonly MaterialRequirement[] = [
  { kind: 'beam', count: 1 },
  { kind: 'wooden_torch', count: 1 },
]
