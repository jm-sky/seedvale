import type { GroundPlacementReason } from '../items/tentPlacement'

/**
 * Player-built well — pure domain logic (plan 127). Deliberately free of
 * `THREE`/DOM: same split as `world/animalTraps.ts` vs
 * `world/createPlacedTraps.ts`/`world/trapProp.ts`. A well is a plain,
 * persistent world object — no reference to `PlayerController`, no manager.
 *
 * Three visible construction stages (`pit → well → roof`), each gated by
 * elapsed *world* time (`WELL_STAGE_DURATION_DAYS`), not a real-time timer.
 * Only `roof` reached its own duration exposes a completed `WaterSource` —
 * see `world/createPlayerWells.ts` and `app/interactables.ts`.
 */
export type WellStage = 'pit' | 'well' | 'roof'

/** Persisted state of one player-built well. Intentionally excludes a
 *  `WaterSource`/quantity/`Object3D` reference — those are always derived
 *  from `stage`/`stageStartedAt` (implementation notes §3). */
export type PlayerWellRecord = {
  id: string
  x: number
  z: number
  yaw: number
  stage: WellStage
  /** World-day (`dayNight.elapsedDays`) the *current* stage's work began. */
  stageStartedAt: number
}

/** Initial values from the plan (§4): pit ~1 day, well ~1 day, roof ~0.5 day. */
export const WELL_STAGE_DURATION_DAYS: Record<WellStage, number> = {
  pit: 1,
  well: 1,
  roof: 0.5,
}

export type WellMaterialCost = { stone: number, branch: number }

/** Cost to *advance into* each stage — charged once, when that stage starts
 *  (implementation notes §9). `pit` costs nothing beyond the shovel used to
 *  dig it; `well` is the stone/wood body, `roof` is the wood daszek. */
export const WELL_STAGE_COST: Record<WellStage, WellMaterialCost> = {
  pit: { stone: 0, branch: 0 },
  well: { stone: 6, branch: 3 },
  roof: { stone: 0, branch: 4 },
}

const WELL_NEXT_STAGE: Record<WellStage, WellStage | null> = {
  pit: 'well',
  well: 'roof',
  roof: null,
}

export function nextWellStage(record: PlayerWellRecord): WellStage | null {
  return WELL_NEXT_STAGE[record.stage]
}

/** Materials required to advance out of `record`'s current stage — `null`
 *  once the well is already complete (nothing further to build). */
export function wellAdvanceCost(record: PlayerWellRecord): WellMaterialCost | null {
  const next = nextWellStage(record)
  return next ? WELL_STAGE_COST[next] : null
}

export function wellStageElapsedDays(record: PlayerWellRecord, nowDays: number): number {
  return Math.max(0, nowDays - record.stageStartedAt)
}

/** True once the current stage's world-time duration has elapsed — evaluated
 *  lazily whenever the well is looked at (implementation notes §7), never a
 *  per-frame timer. */
export function isWellStageComplete(record: PlayerWellRecord, nowDays: number): boolean {
  return wellStageElapsedDays(record, nowDays) >= WELL_STAGE_DURATION_DAYS[record.stage]
}

/** Only `roof` reaching its own duration counts as a finished well — the
 *  single place that decides whether a completed `WaterSource` exists. */
export function isWellCompleted(record: PlayerWellRecord, nowDays: number): boolean {
  return record.stage === 'roof' && isWellStageComplete(record, nowDays)
}

export type WellPlacementReason = GroundPlacementReason | 'well'

export const WELL_PLACEMENT_MESSAGE: Record<Exclude<WellPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na studnię.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już coś stoi.',
  well: 'Tu już stoi studnia.',
}

/** Footprint/clearance + minimum spacing (plan §5) — a well is bigger and
 *  needs more clearance than a tent/trap/container. */
export const WELL_FOOTPRINT_RADIUS = 0.9
export const WELL_SEPARATION = 4
/** How far ahead of the player a well is placed — mirrors `TRAP_PLACE_REACH`. */
export const WELL_PLACE_REACH = 1.8
/** Busy-channel length for the placement action, which also starts the
 *  `pit` stage's world-time clock (§7's "[E] Wykop dół" happens here). */
export const WELL_PLACE_DURATION_SEC = 3

/** `[E]` prompt once a stage's work is done and the next stage can start. */
export const WELL_ADVANCE_PROMPT: Record<Exclude<WellStage, 'roof'>, string> = {
  pit: '[E] Buduj studnię',
  well: '[E] Zbuduj daszek',
}

/** Prompt while a stage's world-time clock hasn't elapsed yet. */
export const WELL_PROGRESS_PROMPT: Record<WellStage, string> = {
  pit: 'Kopanie dołu w toku…',
  well: 'Budowa studni w toku…',
  roof: 'Budowa daszku w toku…',
}

/** Prompt for an unfinished (not yet `roof`-complete) well — a completed well
 *  instead becomes a plain `well` `Interactable` (see `app/interactables.ts`). */
export function wellPromptLabel(record: PlayerWellRecord, nowDays: number): string {
  if (!isWellStageComplete(record, nowDays)) return WELL_PROGRESS_PROMPT[record.stage]
  if (record.stage === 'roof') return WELL_PROGRESS_PROMPT.roof
  return WELL_ADVANCE_PROMPT[record.stage]
}

/** Bounded lookup for a completed player-built well near `(x, z)`, used by
 *  `NpcAgent`'s water-fetch destination resolution (plan 127 §10) so a
 *  household can prefer a nearby player well over its settlement's own —
 *  through the same `kind: 'drink'`/`kind: 'deposit'` action chain, no
 *  well-specific NPC behaviour. Implemented by `world/createPlayerWells.ts`. */
export type NearbyPlayerWellLookup = (
  x: number,
  z: number,
  maxDistance: number,
) => { x: number, y: number, z: number } | null
