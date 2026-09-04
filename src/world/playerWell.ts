import type { MaterialRequirement } from '../items/constructionMaterials'
import type { ItemCapability } from '../items/itemCatalog'
import type { GroundPlacementReason } from '../items/tentPlacement'
import { createWaterSource, UNCOVERED_WELL_CONSUMPTION_RISK, type WaterSource } from './WaterSource'
import { isDeepWellDepth, WELL_WATER_DEPTH_MAX, WELL_WATER_DEPTH_MIN, type WellWaterKind } from './wellGroundwater'

/**
 * Player-built well — pure domain logic (plan 127, revised for active-work
 * construction). Deliberately free of `THREE`/DOM: same split as
 * `world/animalTraps.ts` vs `world/createPlacedTraps.ts`/`world/trapProp.ts`.
 * A well is a plain, persistent world object — no reference to
 * `PlayerController`, no manager.
 *
 * Three visible construction stages (`pit → well → roof`). Each stage
 * requires `wellStageWorkHours(stage, waterDepth)` of *active* player work —
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
  /** Hours of *active* work completed toward the current stage's
   *  requirement (`wellStageWorkHours`). Reset to 0 whenever `stage`
   *  advances. Only ever increases while a well-work busy-channel bout for
   *  this well is running. */
  workProgress: number
  /** Resolved exactly once, at placement (plan world-004 §1/§9/§11) — a
   *  deterministic function of world seed + position + local terrain
   *  (`world/wellGroundwater.ts`'s `resolveWellWater`), never re-rolled on
   *  chunk unload/reload. Drives the `pit` stage's work requirement
   *  (`getWellPitWorkHours`), the deep-well `rock_mining`/`rope`
   *  requirements (`isDeepWellDepth`), and the drawn water's `WaterSource`
   *  (`wellWaterSource`). */
  waterDepth: number
  waterKind: WellWaterKind
}

/** Active-work hours required to finish `well`/`roof`, unaffected by depth
 *  (plan world-004 §2 keeps these fixed — "Pozostałe etapy (well, roof) nie
 *  muszą być zależne od głębokości"). `pit`'s entry here is only the
 *  pre-placement *reference* value `ai/npcWorkContract.ts`'s cost estimate
 *  reads before any concrete site/depth is chosen; a real, placed well's own
 *  `pit` requirement is `getWellPitWorkHours(record.waterDepth)` instead
 *  (`wellStageWorkHours`) — chosen values, not derived from other existing
 *  gameplay. */
export const WELL_STAGE_WORK_HOURS: Record<WellStage, number> = {
  pit: 2,
  well: 1,
  roof: 1,
}

/** `pit`'s active-work requirement scales with the well's resolved water
 *  depth (plan world-004 §2) — shallow groundwater digs faster than a deep
 *  site that also demands `rock_mining`. Bounds are chosen so the shallowest
 *  possible well is faster than the old fixed 2h and the deepest is
 *  noticeably slower, not to reproduce any specific prior value. */
const PIT_WORK_HOURS_AT_MIN_DEPTH = 1
const PIT_WORK_HOURS_AT_MAX_DEPTH = 5

export function getWellPitWorkHours(waterDepth: number): number {
  const span = WELL_WATER_DEPTH_MAX - WELL_WATER_DEPTH_MIN
  const fraction = Math.max(0, Math.min(1, (waterDepth - WELL_WATER_DEPTH_MIN) / span))
  return PIT_WORK_HOURS_AT_MIN_DEPTH + fraction * (PIT_WORK_HOURS_AT_MAX_DEPTH - PIT_WORK_HOURS_AT_MIN_DEPTH)
}

/** The single source of truth for a stage's active-work requirement on an
 *  actually-placed well (plan world-004 §2) — `pit` reads
 *  `getWellPitWorkHours(waterDepth)`, `well`/`roof` stay the fixed
 *  `WELL_STAGE_WORK_HOURS` values. Every gameplay call site (`isWellStageWorkComplete`,
 *  `wellPromptLabel`, `app/actions/placementActions.ts`'s `workOnWell`/
 *  `describeWellWork`) reads this instead of indexing `WELL_STAGE_WORK_HOURS`
 *  directly, so `pit` can never drift out of sync between them. */
export function wellStageWorkHours(stage: WellStage, waterDepth: number): number {
  return stage === 'pit' ? getWellPitWorkHours(waterDepth) : WELL_STAGE_WORK_HOURS[stage]
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

/** Every capability required to work `stage` on a well resolved to
 *  `waterDepth` (plan world-004 §3) — `well`/`roof` are unaffected by depth;
 *  a deep `pit` additionally requires `rock_mining` on top of the baseline
 *  `soil_digging` (implementation notes §8: extend, don't replace, the
 *  existing single-capability gate). The single source every call site
 *  (`app/actions/placementActions.ts`'s `workOnWell`/`describeWellWork`)
 *  reads instead of indexing `WELL_STAGE_CAPABILITY` directly. */
export function wellStageCapabilities(stage: WellStage, waterDepth: number): readonly ItemCapability[] {
  const base = WELL_STAGE_CAPABILITY[stage]
  const required = base ? [base] : []
  if (stage === 'pit' && isDeepWellDepth(waterDepth)) return [...required, 'rock_mining']
  return required
}

/** `WELL_STAGE_COST[stage] → MaterialRequirement[]` (review 2026-09-03 §5
 *  E9 / §8 step 9) — the single owner of this build, previously re-derived
 *  in three places (`workOnWell`'s cost build, `describeWellWork`'s
 *  read-only preflight, `NpcAgent.runContractWorkBout`). Omits a kind whose
 *  cost is 0, same as every existing call site already did by hand. */
export function wellStageRequirements(stage: WellStage): readonly MaterialRequirement[] {
  const cost = WELL_STAGE_COST[stage]
  const requirements: MaterialRequirement[] = []
  if (cost.stone > 0) requirements.push({ kind: 'stone', count: cost.stone })
  if (cost.branch > 0) requirements.push({ kind: 'branch', count: cost.branch })
  return requirements
}

/** Outcome of one `advanceWellConstruction` call. `'completed'` — no active
 *  stage left (`activeWellStage` returned `null`); the caller decides what
 *  that means for it (a no-op for the player, `completeWork` for an NPC's
 *  work contract). `'blocked'` — a capability or material requirement isn't
 *  met yet; nothing was consumed or transitioned. `'advanced'` — the gate
 *  passed; `enteredNewStage` is `true` only when this call is what
 *  transitioned `record` into `stage` (materials were just consumed),
 *  `false` when `stage` was already `record.stage` (a resume). Crediting
 *  actual work hours (`PlayerWells.addWork`) is deliberately **not** part
 *  of this seam — the player's timed busy-channel partial-credit-on-cancel
 *  policy and the NPC's flat per-bout credit are real policy differences,
 *  not duplicated logic; each caller still calls `addWork` itself with its
 *  own amount, same as before this refactor. */
export type WellWorkOutcome =
  | { status: 'advanced', stage: WellStage, enteredNewStage: boolean }
  | { status: 'blocked', missingCapability: ItemCapability | null, missing: readonly MaterialRequirement[] }
  | { status: 'completed' }

/**
 * The stage/material/transition rule all three current copies (`workOnWell`,
 * `describeWellWork`'s preflight, `NpcAgent.runContractWorkBout`) re-derive
 * by hand (review §3 P6 / §5 E9) — actor-neutral: `capabilities: null` is
 * the documented npc-015 simplification ("no tool/capability check for NPC
 * work") now stated explicitly at the seam instead of by omission, rather
 * than a change to who gets gated.
 */
export function advanceWellConstruction(params: {
  record: PlayerWellRecord
  wells: { transitionTo: (id: string, nextStage: WellStage) => boolean }
  hasMaterial: (requirement: MaterialRequirement) => boolean
  consumeMaterial: (requirement: MaterialRequirement) => void
  capabilities: { has: (capability: ItemCapability) => boolean } | null
}): WellWorkOutcome {
  const { capabilities, consumeMaterial, hasMaterial, record, wells } = params
  const stage = activeWellStage(record)
  if (!stage) return { status: 'completed' }

  if (capabilities) {
    const missingCapability = wellStageCapabilities(stage, record.waterDepth).find((c) => !capabilities.has(c))
    if (missingCapability) return { status: 'blocked', missingCapability, missing: [] }
  }

  const enteredNewStage = stage !== record.stage
  if (enteredNewStage) {
    const requirements = wellStageRequirements(stage)
    const missing = requirements.filter((r) => !hasMaterial(r))
    if (missing.length > 0) return { status: 'blocked', missingCapability: null, missing }
    for (const requirement of requirements) consumeMaterial(requirement)
    wells.transitionTo(record.id, stage)
  }
  return { status: 'advanced', stage, enteredNewStage }
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
  return record.workProgress >= wellStageWorkHours(record.stage, record.waterDepth)
}

/** Only `roof` reaching its own work requirement counts as a finished well —
 *  the single place that decides whether a well counts as fully protected
 *  (no `wellWaterSource` consumption risk). See `isWellWaterAvailable` for
 *  "usable as a `WaterSource` at all", which doesn't require the roof. */
export function isWellCompleted(record: PlayerWellRecord): boolean {
  return record.stage === 'roof' && isWellStageWorkComplete(record)
}

/** A well is a usable `WaterSource` once its `well`-stage body is finished —
 *  the roof is protection/upgrade, not activation (plan world-004 §5).
 *  `stage === 'roof'` always implies the body finished (that's the only way
 *  to reach it), so it's water-available regardless of the roof's own
 *  progress. */
export function isWellWaterAvailable(record: PlayerWellRecord): boolean {
  return record.stage === 'roof' || (record.stage === 'well' && isWellStageWorkComplete(record))
}

/** The `WaterSource` a completed-body well currently draws (plan world-004
 *  §6/§10) — `requiresRope` is purely a function of depth (a roofed deep
 *  well still needs a rope); `consumptionRisk` disappears only once the roof
 *  itself is finished (`isWellCompleted`), not merely once water is
 *  available. Callers must first check `isWellWaterAvailable`. */
export function wellWaterSource(record: PlayerWellRecord): WaterSource {
  const source = createWaterSource('well')
  return {
    ...source,
    requiresRope: isDeepWellDepth(record.waterDepth) ? true : undefined,
    consumptionRisk: isWellCompleted(record) ? undefined : UNCOVERED_WELL_CONSUMPTION_RISK,
  }
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

/** Active-work hours credited by one *full-length* `WELL_WORK_SESSION_SEC`
 *  bout (plan `ui-input-004` §1) — deliberately decoupled from the ambient
 *  day/night clock's own real-time/game-time ratio (`world/timeConversion.ts`),
 *  which would otherwise only credit ~0.4h per 8s bout. Sized so a shallow
 *  `pit` (`getWellPitWorkHours` near `WELL_WATER_DEPTH_MIN`) completes in a
 *  single bout, while `roof` and a deep `pit` keep needing their own
 *  additional bout(s), never shortened by this constant alone. */
export const WELL_WORK_SESSION_HOURS = 2

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
 *  already-started stage (not when the press would start a new one), and a
 *  short hint once the well's body is already usable as a `WaterSource`
 *  (plan world-004 §5) even though construction (the roof) isn't finished —
 *  reachable through `[R]`'s requirements panel (`app/gameLoop.ts`'s
 *  `playerWell` handling), not a dedicated keybinding. */
export function wellPromptLabel(record: PlayerWellRecord): string {
  const stage = activeWellStage(record)
  const waterHint = isWellWaterAvailable(record) ? ' · woda dostępna w [R]' : ''
  if (!stage) return `${WELL_STAGE_START_PROMPT.roof}${waterHint} · [R] wymagania`
  const base = WELL_STAGE_START_PROMPT[stage]
  if (stage === record.stage && record.workProgress > 0) {
    return `${base} (${formatHours(record.workProgress)}/${formatHours(wellStageWorkHours(stage, record.waterDepth))} h)${waterHint} · [R] wymagania`
  }
  return `${base}${waterHint} · [R] wymagania`
}

/** Bounded lookup for a nearby player-built well that's already usable as a
 *  `WaterSource` (`isWellWaterAvailable` — the roof need not be finished,
 *  plan world-004 §5/§10), used by `NpcAgent`'s water-fetch destination
 *  resolution (plan 127 §10) so a household can prefer a nearby player well
 *  over its settlement's own — through the same `kind: 'drink'`/
 *  `kind: 'deposit'` action chain, no well-specific NPC behaviour.
 *  Implemented by `world/createPlayerWells.ts`. */
export type NearbyPlayerWellLookup = (
  x: number,
  z: number,
  maxDistance: number,
) => { x: number, y: number, z: number } | null
