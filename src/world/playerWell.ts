import type { ItemCapability } from '../items/itemCatalog'
import type { GroundPlacementReason } from '../items/tentPlacement'

/**
 * Player-built well — pure domain logic (plan 127, revised for active-work
 * construction). Deliberately free of `THREE`/DOM: same split as
 * `world/animalTraps.ts` vs `world/createPlacedTraps.ts`/`world/trapProp.ts`.
 * A well is a plain, persistent world object — no reference to
 * `PlayerController`, no manager.
 *
 * Three visible construction stages (`pit → well → roof`). Each stage
 * requires `WELL_STAGE_WORK_HOURS[stage]` of *active* player work —
 * `PlayerWellRecord.workProgress` only increases while a well-work busy
 * channel bout is actually running (`app/actions/placementActions.ts`'s
 * `workOnWell`), never from elapsed world time alone. There is no
 * `stageStartedAt`/timer — a stage cannot finish just because time passed.
 */
export type WellStage = 'pit' | 'well' | 'roof'

/** Persisted state of one player-built well. Intentionally excludes a
 *  `WaterSource`/quantity/`Object3D` reference — those are always derived
 *  from `stage`/`workProgress`. */
export type PlayerWellRecord = {
  id: string
  x: number
  z: number
  yaw: number
  stage: WellStage
  /** Hours of *active* work completed toward `WELL_STAGE_WORK_HOURS[stage]`.
   *  Reset to 0 whenever `stage` advances. Only ever increases while a
   *  well-work busy-channel bout for this well is running. */
  workProgress: number
}

/** Active-work hours required to finish each stage. `pit` is the value
 *  given directly by the design ("~2h aktywnej pracy"); `well`/`roof` keep
 *  the original plan's 1 : 1 : 0.5 proportions (pit : well : roof) scaled
 *  onto active-work hours instead of elapsed-world-time days — chosen
 *  values, not derived from other existing gameplay. */
export const WELL_STAGE_WORK_HOURS: Record<WellStage, number> = {
  pit: 2,
  well: 1,
  roof: 1,
}

export type WellMaterialCost = { stone: number, branch: number }

/** Cost to *start* each stage — charged once, atomically, the moment that
 *  stage's first work session begins. `pit` costs nothing beyond the
 *  shovel used to dig it; `well` is the stone/wood body, `roof` is the
 *  wood daszek. */
export const WELL_STAGE_COST: Record<WellStage, WellMaterialCost> = {
  pit: { stone: 0, branch: 0 },
  well: { stone: 6, branch: 3 },
  roof: { stone: 0, branch: 4 },
}

/** Capability required to work each stage (plan 184 §15) — checked (never
 *  consumed) before every work session, including resumes. Digging the pit is
 *  a capability requirement, not a `shovel`-identity one: anything that can
 *  move earth qualifies. `null` means no tool is required: no existing item
 *  fits "assemble stone/wood into a well body or roof," and inventing one
 *  would be an artificial requirement the design explicitly avoids. */
export const WELL_STAGE_CAPABILITY: Record<WellStage, ItemCapability | null> = {
  pit: 'soil_digging',
  well: null,
  roof: null,
}

const WELL_NEXT_STAGE: Record<WellStage, WellStage | null> = {
  pit: 'well',
  well: 'roof',
  roof: null,
}

export function nextWellStage(record: PlayerWellRecord): WellStage | null {
  return WELL_NEXT_STAGE[record.stage]
}

/** True once `record`'s current stage has accumulated enough active work. */
export function isWellStageWorkComplete(record: PlayerWellRecord): boolean {
  return record.workProgress >= WELL_STAGE_WORK_HOURS[record.stage]
}

/** Only `roof` reaching its own work requirement counts as a finished well —
 *  the single place that decides whether a completed `WaterSource` exists. */
export function isWellCompleted(record: PlayerWellRecord): boolean {
  return record.stage === 'roof' && isWellStageWorkComplete(record)
}

/** The stage a `[E]` press right now would work on: `record.stage` itself if
 *  its work isn't finished yet, otherwise the next stage (about to be
 *  started/transitioned into in the same press). `null` once the well is
 *  fully completed — `app/interactables.ts` stops emitting a `playerWell`
 *  candidate at that point, so callers shouldn't normally see `null`. */
export function activeWellStage(record: PlayerWellRecord): WellStage | null {
  if (!isWellStageWorkComplete(record)) return record.stage
  return nextWellStage(record)
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
/** Busy-channel length for the placement action itself (creating the
 *  record) — unrelated to the active-work hours a stage still needs. */
export const WELL_PLACE_DURATION_SEC = 3

/** Length of one active-work "bout" (a single `[E]` press's busy channel),
 *  capped like every other timed player action (`busyChannelDurations.test.ts`
 *  enforces `≤ 8s` across the board — a stage's full work requirement is
 *  reached over several repeated bouts, never one long frozen channel). */
export const WELL_WORK_SESSION_SEC = 8

/** `[E]` prompt to start (fresh) or resume/transition into a stage's work. */
export const WELL_STAGE_START_PROMPT: Record<WellStage, string> = {
  pit: '[E] Wykop dół',
  well: '[E] Buduj studnię',
  roof: '[E] Zbuduj daszek',
}

/** Busy-overlay label shown while a work-session bout is actively running. */
export const WELL_WORK_LABEL: Record<WellStage, string> = {
  pit: 'Kopanie dołu w toku…',
  well: 'Budowa studni w toku…',
  roof: 'Budowa daszku w toku…',
}

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

/** Prompt for an unfinished (not yet `roof`-complete) well — a completed well
 *  instead becomes a plain `well` `Interactable` (see `app/interactables.ts`).
 *  Appends the current progress fraction only while genuinely resuming an
 *  already-started stage (not when the press would start a new one). */
export function wellPromptLabel(record: PlayerWellRecord): string {
  const stage = activeWellStage(record)
  if (!stage) return WELL_STAGE_START_PROMPT.roof
  const base = WELL_STAGE_START_PROMPT[stage]
  if (stage === record.stage && record.workProgress > 0) {
    return `${base} (${formatHours(record.workProgress)}/${formatHours(WELL_STAGE_WORK_HOURS[stage])} h)`
  }
  return base
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
