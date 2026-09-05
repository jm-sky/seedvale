import type { MaterialRequirement } from '../items/constructionMaterials'
import type { GroundPlacementReason } from '../items/tentPlacement'
import { formatHours } from './playerWell'

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
 * Since plan items-player-017, placement creates a real but unfinished torch
 * (`completedWork` starts at 0, `lit` stays `false`) — construction progress
 * is deliberately kept independent from `lit`: an unfinished torch cannot be
 * lit, but a *completed*, unlit torch behaves exactly as before this plan
 * (existing ignition interaction). A pre-plan save has no `completedWork`
 * field at all — the migration in `persistence/saveData.ts` defaults that to
 * `STANDING_TORCH_REQUIRED_WORK` (already complete), never to 0.
 *
 * @domain items-player
 */
export type StandingTorchRecord = {
  id: string
  x: number
  z: number
  yaw: number
  lit: boolean
  /** Hours of active work applied so far (plan items-player-017 §3/§11) —
   *  `STANDING_TORCH_REQUIRED_WORK` (a fixed constant) is the single
   *  requirement authority every reader reads instead of a per-record field. */
  completedWork: number
}

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

/** `slope`'s message points at the existing terrain-preparation tool rather
 *  than silently flattening anything here (plan items-player-017 §5) — same
 *  reasoning as `world/palisade.ts`'s `PALISADE_PLACEMENT_MESSAGE`. */
export const STANDING_TORCH_PLACEMENT_MESSAGE: Record<Exclude<StandingTorchPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na pochodnię.',
  slope: 'Teren jest zbyt stromy. Najpierw przygotuj teren (Szybkie akcje → Przygotuj teren).',
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

/** Active-work hours required to finish a torch (plan items-player-017 §3/
 *  §11) — the smallest buildable this plan covers, so one full-length bout
 *  completes it (plan §4's "keep small objects practical to construct
 *  manually"). */
export const STANDING_TORCH_REQUIRED_WORK = 1
/** Real-seconds length of one active-work bout — same reasoning as
 *  `world/palisade.ts`'s `PALISADE_WORK_SESSION_SEC`. */
export const STANDING_TORCH_WORK_SESSION_SEC = 4
/** Active-work hours credited by one full-length bout — shared by the
 *  player's own work action and NPC contract execution. */
export const STANDING_TORCH_WORK_SESSION_HOURS = 1

/** All useful work still required to finish `record` (plan items-player-017
 *  §16) — mirrors `world/palisade.ts`'s `palisadeRemainingWork`. */
export function standingTorchRemainingWork(record: Pick<StandingTorchRecord, 'completedWork'>): number {
  return Math.max(0, STANDING_TORCH_REQUIRED_WORK - record.completedWork)
}

/** True once `record` has accumulated `STANDING_TORCH_REQUIRED_WORK` of
 *  active work (plan §12) — gates ignition/functional light; mirrors
 *  `world/palisade.ts`'s `isPalisadeConstructionComplete`. */
export function isStandingTorchConstructionComplete(record: Pick<StandingTorchRecord, 'completedWork'>): boolean {
  return record.completedWork >= STANDING_TORCH_REQUIRED_WORK
}

/** Gaze prompt for a torch (plan items-player-017 §15) — an unfinished torch
 *  offers `[E]` construction work instead of `Ignite`; a completed torch
 *  keeps exactly its pre-plan lit/unlit prompt (plan §12's interaction
 *  precedence). */
export function standingTorchPromptLabel(record: Pick<StandingTorchRecord, 'lit' | 'completedWork'>): string {
  if (!isStandingTorchConstructionComplete(record)) {
    return `[E] Buduj pochodnię (${formatHours(record.completedWork)}/${formatHours(STANDING_TORCH_REQUIRED_WORK)} h)`
  }
  return record.lit ? 'Zapalona pochodnia' : '[E] Zapal pochodnię'
}
