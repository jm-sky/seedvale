/**
 * Work Contract domain — pure lifecycle/state for player-issued work
 * contracts (plan npc-014, "Workforce for Hire" foundation). Deliberately
 * free of `THREE`/DOM, same split as `world/standingTorch.ts` vs
 * `world/createStandingTorches.ts`.
 *
 * Since plan npc-028 a contract is a job, not a single worker's FSM.
 * `WorkContractRecord` owns the posting, group commitment and reward
 * ceiling; each hired NPC is a `WorkContractAssignment` with its own
 * execution lifecycle and attributable claim. The target itself
 * (`PlayerWellRecord`/`TerrainPreparationRecord`/…) remains the sole owner
 * of actual progress; player and NPCs contribute to the same target through
 * the actor-neutral seam.
 *
 * Since plan npc-030 a contract's `scope` is a discriminated union: measurable
 * construction-like work (a real world target with `contributeWork()`
 * progress) versus a bounded expedition-escort service (no numeric work
 * target — fulfilment is duration/destination-based, plan npc-030 §1/§11).
 * Every field that only makes sense for measurable progress
 * (`workType`/`target`/`x`/`z`/`requestedWorkShare`/`remainingWorkAtCreation`/
 * `committedWork`/`npcWorkCompleted`) lives on `MeasurableWorkContractScope`,
 * never as a nullable field on every contract. `WorkContractAssignment`
 * remains the single shared "one NPC's participation/payment" shape for both
 * scopes.
 *
 * A posted board never duplicates reward/target/state (plan npc-014 §8/§12)
 * — it only keeps `postedBoardId` on the contract, and a board's "what's
 * posted here" view is a query over contracts by that field.
 *
 * @domain npc
 */
export type WorkContractState =
  | 'available'
  | 'advertised'
  | 'active'
  | 'settling'
  | 'completed'
  | 'cancelled'
  | 'invalidated'

/** One NPC's execution against a Work Contract (plan npc-028 §1, extended
 *  by npc-016, npc-030). `payment_due` is a payable claim; `paid` / `unpaid` /
 *  `uncollectable` are terminal claim outcomes. `released` is genuine
 *  abandonment/death with no positive wage. Temporary interruptions never
 *  use these states. `serving` is the expedition-escort counterpart of
 *  `travelling`/`working` — an accepted escort skips the measurable-work
 *  travel/work split entirely (plan npc-030 §5). */
export type WorkContractAssignmentState =
  | 'accepted'
  | 'travelling'
  | 'working'
  | 'serving'
  | 'payment_due'
  | 'paid'
  | 'unpaid'
  | 'uncollectable'
  | 'released'

/** Genuine stop of contractual work (plan npc-016 §6/§8/§13) — never a
 *  temporary hunger/sleep/combat interruption. Death preserves an earned
 *  claim as `uncollectable` instead of creating a payable one. */
export type WorkContractReleaseReason = 'abandoned' | 'death'

/** World-time inputs used when an assignment's wage claim is frozen
 *  (plan npc-016 §4/§18). `patienceDaysFor` may consult relation once at
 *  freeze time; the resulting deadline is then immutable. */
export type WorkContractClaimTiming = {
  now: number
  patienceDaysFor?: (npcId: string) => number
}

/** One world hour in `elapsedDays` units (plan npc-016 §17). */
export const PAYMENT_REQUEST_INTERVAL_DAYS = 1 / 24

/** Default payment patience when no relation lookup is available. */
export const DEFAULT_PAYMENT_PATIENCE_DAYS = 1

/** Relation snapshot used only at claim freeze (plan npc-016 §18). */
export type WorkContractRelationLevel = 'stranger' | 'acquainted' | 'friendly' | 'trusted'

/** Frozen patience in elapsed days — better personal relation waits longer. */
export function workContractPaymentPatienceDays(
  level: WorkContractRelationLevel = 'stranger',
): number {
  switch (level) {
    case 'acquainted': return 1.5
    case 'friendly': return 2
    case 'trusted': return 3
    default: return DEFAULT_PAYMENT_PATIENCE_DAYS
  }
}

export type WorkContractAdvertisement = 'not_posted' | 'posted'

/** One entry per measurable `ContractTarget` variant (plan npc-018 §10,
 *  extended by plan items-player-017 §2/§16 with the two simple buildable
 *  targets). Expedition escort is deliberately not a `WorkType`/
 *  `ContractTarget` variant (plan npc-030 §"Work Contract core") — it has no
 *  actor-neutral `contributeWork()` target. */
export type WorkType = 'construction' | 'terrain_preparation' | 'palisade' | 'standing_torch' | 'residential_building'

/** A concrete, recoverable world target a contract describes work at — never
 *  a display string like "build a well" (plan §3). `targetId` is the stable
 *  identity later NPC construction execution (Plan 2) resolves against; the
 *  placement coordinate itself lives on the measurable scope's `x`/`z`, not
 *  here, mirroring the plan's own "target reference" + "target location"
 *  split (plan §2/§11). */
export type ConstructionContractTarget = {
  kind: 'construction'
  targetId: string
}

/** References an active `TerrainPreparationRecord` (plan npc-018 §14) — same
 *  "stable id, no display string" shape as `ConstructionContractTarget`.
 *  `targetId` is the preparation's own `id`; `TerrainPreparationRecord`
 *  remains the sole owner of its progress/terrain state. */
export type TerrainPreparationContractTarget = {
  kind: 'terrain_preparation'
  targetId: string
}

/** References an unfinished `PalisadeSegmentRecord` (plan items-player-017
 *  §2/§10/§16) — same "stable id, no display string" shape as the other
 *  variants. `targetId` is the segment's own `id`; `Palisades` remains the
 *  sole owner of its construction progress. */
export type PalisadeContractTarget = {
  kind: 'palisade'
  targetId: string
}

/** References an unfinished `StandingTorchRecord` (plan items-player-017
 *  §2/§11/§16) — same shape as `PalisadeContractTarget`. */
export type StandingTorchContractTarget = {
  kind: 'standing_torch'
  targetId: string
}

/** References an unfinished `ResidentialBuildingRecord` (plan settlements-005). */
export type ResidentialBuildingContractTarget = {
  kind: 'residential_building'
  targetId: string
}

/** Union of every measurable-work contract-target shape — one variant per
 *  `WorkType` (plan npc-018 §10, extended by plan items-player-017 /
 *  settlements-005). */
export type ContractTarget =
  | ConstructionContractTarget
  | TerrainPreparationContractTarget
  | PalisadeContractTarget
  | StandingTorchContractTarget
  | ResidentialBuildingContractTarget

/** One NPC's participation in a Work Contract (plan npc-028 §1). Owned by
 *  the contract, never copied onto `NpcAgent`. Historical assignments are
 *  kept after release/settlement so npc-016 can freeze per-assignment
 *  payment claims. `serviceStartedAt`/`serviceEndsAt` are the expedition-
 *  escort service timing (plan npc-030 §6) — absolute `elapsedDays`
 *  anchors frozen once service starts, `null` for measurable-work
 *  assignments and for an escort assignment that has not yet started
 *  serving or has no duration boundary. */
export type WorkContractAssignment = {
  npcId: string
  state: WorkContractAssignmentState
  acceptedAt: number
  workStartedAt: number | null
  /** Useful measurable-work work this NPC actually got accepted by the
   *  target — not a personal quota, and not used for escort at all (plan
   *  npc-030 §11: escort fulfilment is never emulated with fake work
   *  units). Payment (npc-016) derives a measurable-work claim from this. */
  workCompleted: number
  /** Frozen integer wage for this assignment (plan npc-016 §4). `0` until
   *  participation permanently ends. Immutable once frozen. */
  rewardCoinsDue: number
  /** Absolute `elapsedDays` of the last payment request, or `null` if none
   *  has been made yet (plan npc-016 §17). */
  lastPaymentRequestAt: number | null
  /** Absolute `elapsedDays` after which a still-due claim becomes `unpaid`
   *  (plan npc-016 §18). `null` when no positive claim exists. */
  paymentDeadline: number | null
  /** Absolute `elapsedDays` this escort assignment began serving (plan
   *  npc-030 §6). `null` for measurable work and before service starts. */
  serviceStartedAt: number | null
  /** Absolute `elapsedDays` this escort assignment's duration boundary
   *  resolves (plan npc-030 §6) — `serviceStartedAt + terms.durationDays`,
   *  frozen once at service start. `null` for measurable work and for a
   *  pure `destination` policy with no duration anchor. */
  serviceEndsAt: number | null
}

/** Fields meaningful only for a real, measurable-progress world target (plan
 *  npc-030 §1) — grouped together rather than becoming nullable fields on
 *  every contract. */
export type MeasurableWorkContractScope = {
  kind: 'measurable_work'
  workType: WorkType
  target: ContractTarget
  x: number
  z: number
  /** Fraction (0–1] of the target's remaining useful work the NPC group was
   *  asked to perform, chosen at contract creation (plan npc-018 §4/§5).
   *  Presets are 25/50/75/100% — never renegotiated afterward, and never
   *  multiplied by worker count (plan npc-028 §6). */
  requestedWorkShare: number
  /** Snapshot of the target's remaining useful work at the moment this
   *  contract was created (plan §5) — resolved by the target-specific
   *  remaining-work rule (`wellRemainingWork`/`terrainPreparationRemainingWork`).
   *  Immutable for the contract's lifetime: never recalculated as the player
   *  or NPC contribute more work, the target changes stage, or the contract
   *  is saved/loaded. */
  remainingWorkAtCreation: number
  /** `remainingWorkAtCreation * requestedWorkShare` (plan npc-018 §5) —
   *  the **total** work promised by the NPC group, computed exactly once at
   *  creation. Not a per-worker quota. The work phase ends once
   *  `npcWorkCompleted >= committedWork` (plan npc-028 §15). */
  committedWork: number
  /** Useful work actually accepted by the target from this contract's NPCs
   *  in aggregate (plan npc-018 §6, npc-028 §8) — never inferred from a
   *  delta in the target's own total progress (the player may also be
   *  contributing between NPC bouts). The sum of assignment
   *  `workCompleted` values. */
  npcWorkCompleted: number
}

/** Stable world reference for an escort destination (plan npc-030 §7) —
 *  never mesh/Object3D identity, never a bare `(x, z)` as the primary
 *  identity. */
export type ExpeditionDestinationRef =
  | { kind: 'settlement', settlementId: string }
  | { kind: 'location', locationId: string }

/** A destination resolved once, at contract-creation time, by the
 *  composition/UI layer that actually owns the settlement/location registry
 *  (plan npc-030 §10 implementation notes — "resolver in app/world
 *  integration seam, not pure `workContract.ts`"). `x`/`z` are a bounded
 *  snapshot, never re-resolved live during scoring/fulfilment. */
export type ExpeditionEscortDestination = {
  ref: ExpeditionDestinationRef
  x: number
  z: number
}

/** Explicit, persisted completion rule (plan npc-030 §5) — never inferred
 *  from whichever optional term fields happen to be present. */
export type ExpeditionEscortCompletionPolicy = 'duration' | 'destination' | 'destination_or_timeout'

export type ExpeditionEscortTerms = {
  completionPolicy: ExpeditionEscortCompletionPolicy
  /** Required for `duration` and `destination_or_timeout`. */
  durationDays?: number
  /** Required for `destination` and `destination_or_timeout`. */
  destination?: ExpeditionEscortDestination
}

/** At least one finite boundary is required (plan npc-030 §5) — a policy
 *  without the term(s) it needs is invalid and must be rejected at creation,
 *  never silently defaulted. */
export function isValidExpeditionEscortTerms(terms: ExpeditionEscortTerms): boolean {
  if (terms.completionPolicy === 'duration') {
    return typeof terms.durationDays === 'number' && terms.durationDays > 0
  }
  if (terms.completionPolicy === 'destination') {
    return terms.destination != null
  }
  return typeof terms.durationDays === 'number' && terms.durationDays > 0 && terms.destination != null
}

export type ExpeditionEscortContractScope = {
  kind: 'expedition_escort'
  terms: ExpeditionEscortTerms
}

/**
 * Discriminated Work Contract scope (plan npc-030 §1) — separates what a
 * contract *is* (a real, measurable-progress target vs a bounded escort
 * service) from `WorkContractAssignment`, which continues to describe one
 * NPC's participation/payment regardless of scope. Not a generic
 * `ContractObjective<T>` framework for hypothetical future jobs.
 */
export type WorkContractScope = MeasurableWorkContractScope | ExpeditionEscortContractScope

type BaseWorkContractRecord = {
  id: string
  /** Who issued the contract — always `'player'` today; a `string` (not a
   *  literal) so a later NPC-employer phase doesn't need a schema change. */
  employer: string
  /** Maximum total price for the agreed scope (plan npc-028 §12) — never a
   *  per-worker reward and never multiplied by `requestedWorkerCount`. For
   *  expedition escort this is the single worker's full agreed wage (plan
   *  npc-030 §2: V1 escort is always exactly one worker). */
  rewardCoins: number
  state: WorkContractState
  advertisement: WorkContractAdvertisement
  /** The notice board this contract is currently posted at, or `null` when
   *  `advertisement === 'not_posted'` (including after cancellation/
   *  invalidation clears a prior posting). */
  postedBoardId: string | null
  createdAt: number
  postedAt: number | null
  /** How many NPCs may participate in contractual work at once (plan
   *  npc-028 §4). Frozen after creation; integer `>= 1`. An assignment
   *  waiting for payment does not occupy a work slot. Expedition escort
   *  forces exactly `1` (plan npc-030 §2/§27). */
  requestedWorkerCount: number
  /** Every NPC that has accepted this contract, including released and
   *  payment-due history. An NPC may not accept the same contract twice. */
  assignments: WorkContractAssignment[]
}

export type MeasurableWorkContractRecord = BaseWorkContractRecord & { scope: MeasurableWorkContractScope }
export type EscortWorkContractRecord = BaseWorkContractRecord & { scope: ExpeditionEscortContractScope }

export type WorkContractRecord = MeasurableWorkContractRecord | EscortWorkContractRecord

export function isMeasurableWorkContract(record: WorkContractRecord): record is MeasurableWorkContractRecord {
  return record.scope.kind === 'measurable_work'
}

export function isExpeditionEscortContract(record: WorkContractRecord): record is EscortWorkContractRecord {
  return record.scope.kind === 'expedition_escort'
}

const TERMINAL_STATES: ReadonlySet<WorkContractState> = new Set(['cancelled', 'completed', 'invalidated'])

const WORK_ACTIVE_ASSIGNMENT_STATES: ReadonlySet<WorkContractAssignmentState> = new Set([
  'accepted',
  'serving',
  'travelling',
  'working',
])

export function isContractTerminal(state: WorkContractState): boolean {
  return TERMINAL_STATES.has(state)
}

/** True while this assignment still occupies a work slot (plan npc-028
 *  §4). Payment-due, terminal claim, and released assignments do not. */
export function isAssignmentWorkActive(assignment: WorkContractAssignment): boolean {
  return WORK_ACTIVE_ASSIGNMENT_STATES.has(assignment.state)
}

const TERMINAL_CLAIM_STATES: ReadonlySet<WorkContractAssignmentState> = new Set([
  'paid',
  'uncollectable',
  'unpaid',
])

/** Positive earned claims that still need employer resolution. */
export function isAssignmentPayable(assignment: WorkContractAssignment): boolean {
  return assignment.state === 'payment_due' && assignment.rewardCoinsDue > 0
}

export function isAssignmentClaimTerminal(state: WorkContractAssignmentState): boolean {
  return TERMINAL_CLAIM_STATES.has(state)
}

/** Sum of already-frozen integer claims — never used as a second ledger,
 *  only to clamp a newly frozen claim so the group stays `<= rewardCoins`. */
export function frozenAssignmentClaimSum(record: WorkContractRecord): number {
  let sum = 0
  for (const assignment of record.assignments) {
    if (assignment.rewardCoinsDue > 0) sum += assignment.rewardCoinsDue
  }
  return sum
}

/**
 * Deterministic integer wage from one measurable-work assignment's final
 * `workCompleted` and the frozen group rate (plan npc-016 §4). Floor
 * discards fractional remainder coins rather than introducing a second
 * currency ledger. `alreadyFrozen` clamps the result so the group never
 * exceeds `rewardCoins`. Never used for expedition escort (plan npc-030
 * §11) — see `endEscortService`/`freezeAssignmentClaimAgainst`.
 */
export function assignmentRewardCoinsDue(
  record: MeasurableWorkContractRecord,
  workCompleted: number,
  alreadyFrozen = 0,
): number {
  if (workCompleted <= 0) return 0
  if (!(record.scope.committedWork > 0) || !(record.rewardCoins > 0)) return 0
  const proportional = Math.floor(workCompleted * record.rewardCoins / record.scope.committedWork)
  const remaining = Math.max(0, record.rewardCoins - alreadyFrozen)
  return Math.min(proportional, remaining)
}

export function hasUnresolvedPaymentClaims(record: WorkContractRecord): boolean {
  return record.assignments.some(isAssignmentPayable)
}

/** `settling` → `completed` once every positive claim is terminal
 *  (plan npc-016 §9). Other contract states are left unchanged. */
export function refreshContractSettlement<T extends WorkContractRecord>(record: T): T {
  if (record.state !== 'settling') return record
  if (hasUnresolvedPaymentClaims(record)) return record
  return { ...record, state: 'completed' }
}

export function isPaymentRequestEligible(assignment: WorkContractAssignment, now: number): boolean {
  if (!isAssignmentPayable(assignment)) return false
  if (assignment.lastPaymentRequestAt == null) return true
  return now >= assignment.lastPaymentRequestAt + PAYMENT_REQUEST_INTERVAL_DAYS
}

function emptyPaymentFields(): Pick<WorkContractAssignment, 'rewardCoinsDue' | 'lastPaymentRequestAt' | 'paymentDeadline'> {
  return { rewardCoinsDue: 0, lastPaymentRequestAt: null, paymentDeadline: null }
}

const DEFAULT_CLAIM_TIMING: WorkContractClaimTiming = { now: 0 }

/** Count of assignments still participating in contractual work. */
export function activeWorkAssignmentCount(record: WorkContractRecord): number {
  let count = 0
  for (const assignment of record.assignments) {
    if (isAssignmentWorkActive(assignment)) count += 1
  }
  return count
}

/** Remaining group commitment, never negative (plan npc-028 §7). Measurable
 *  work only — expedition escort has no numeric work target. */
export function groupRemainingWork(record: MeasurableWorkContractRecord): number {
  return Math.max(0, record.scope.committedWork - record.scope.npcWorkCompleted)
}

export function findAssignment(record: WorkContractRecord, npcId: string): WorkContractAssignment | undefined {
  return record.assignments.find((assignment) => assignment.npcId === npcId)
}

/** Whether `record` should still show a physical target flag in the world
 *  (plan §5/§10) — true for every non-terminal measurable-work contract.
 *  Expedition escort never spawns a world flag (plan npc-030 §3 runtime
 *  notes — it has no placed target). */
export function contractHasActiveTarget(record: WorkContractRecord): boolean {
  return record.scope.kind === 'measurable_work' && !isContractTerminal(record.state)
}

/** Only an `available`, not-yet-posted contract can be posted (plan §8/§9) —
 *  posting a cancelled/invalidated/already-advertised contract is rejected
 *  rather than silently no-op-ing, so board posting can never duplicate a
 *  publication or resurrect a dead contract. Scope-neutral. */
export function canPostContract(record: WorkContractRecord): boolean {
  return record.state === 'available' && record.advertisement === 'not_posted'
}

/**
 * Posted contracts stay discoverable while a work slot remains and, for
 * measurable work, useful group work remains (plan npc-028 §4/§10, extended
 * by npc-030 §4) — not only while `state === 'advertised'`. Expedition
 * escort has no target-usefulness gate: an open slot on a posted, non-
 * terminal contract with valid terms is always discoverable. Target
 * usefulness for measurable work is the caller's job (the domain does not
 * know the live target).
 */
export function isContractDiscoverable(record: WorkContractRecord): boolean {
  if (isContractTerminal(record.state)) return false
  if (record.advertisement !== 'posted' || record.postedBoardId == null) return false
  if (record.state !== 'advertised' && record.state !== 'active') return false
  if (activeWorkAssignmentCount(record) >= record.requestedWorkerCount) return false
  if (record.scope.kind === 'measurable_work') return groupRemainingWork(record as MeasurableWorkContractRecord) > 0
  return true
}

/** Deterministic id for the one notice board a settlement owns — derived
 *  from the settlement's own stable `Settlement.id`, never an array index or
 *  Object3D identity (plan §6/§9's "board lookup must use stable board/
 *  settlement identity"). */
export function noticeBoardId(settlementId: string): string {
  return `noticeBoard:${settlementId}`
}

/** Work-share presets offered at contract creation (plan §4/§20) — of the
 *  target's remaining useful work at that moment, never of its total work. */
export const WORK_SHARE_PRESETS: readonly number[] = [0.25, 0.5, 0.75, 1]

/** Initial UI worker-count presets (plan npc-028 §4). Runtime accepts any
 *  integer `>= 1`; this is not a domain maximum. */
export const WORKER_COUNT_PRESETS: readonly number[] = [1, 2, 3]

export function normalizeRequestedWorkerCount(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.floor(value))
}

export function createWorkContractRecord(params: {
  id: string
  employer: string
  target: ContractTarget
  x: number
  z: number
  rewardCoins: number
  /** Fraction (0–1] of `remainingWorkAtCreation` the NPC group commits to —
   *  see `WORK_SHARE_PRESETS`. */
  requestedWorkShare: number
  /** The target's remaining useful work *right now*, resolved by the
   *  caller's target-specific rule (plan §5) — never recomputed here later. */
  remainingWorkAtCreation: number
  requestedWorkerCount?: number
  now: number
}): MeasurableWorkContractRecord {
  const requestedWorkShare = Math.max(0, Math.min(1, params.requestedWorkShare))
  const remainingWorkAtCreation = Math.max(0, params.remainingWorkAtCreation)
  return {
    id: params.id,
    employer: params.employer,
    rewardCoins: params.rewardCoins,
    state: 'available',
    advertisement: 'not_posted',
    postedBoardId: null,
    createdAt: params.now,
    postedAt: null,
    requestedWorkerCount: normalizeRequestedWorkerCount(params.requestedWorkerCount ?? 1),
    assignments: [],
    scope: {
      kind: 'measurable_work',
      workType: params.target.kind,
      target: params.target,
      x: params.x,
      z: params.z,
      requestedWorkShare,
      remainingWorkAtCreation,
      committedWork: remainingWorkAtCreation * requestedWorkShare,
      npcWorkCompleted: 0,
    },
  }
}

/**
 * Creates a bounded expedition-escort contract (plan npc-030 §26) — no
 * placed target, no target flag, always exactly one requested worker (plan
 * §2/§27). `null` if `terms` is not a valid, finite, persisted policy (plan
 * §5) — never silently defaulted.
 */
export function createExpeditionEscortContractRecord(params: {
  id: string
  employer: string
  terms: ExpeditionEscortTerms
  rewardCoins: number
  now: number
}): EscortWorkContractRecord | null {
  if (!isValidExpeditionEscortTerms(params.terms)) return null
  return {
    id: params.id,
    employer: params.employer,
    rewardCoins: params.rewardCoins,
    state: 'available',
    advertisement: 'not_posted',
    postedBoardId: null,
    createdAt: params.now,
    postedAt: null,
    requestedWorkerCount: 1,
    assignments: [],
    scope: { kind: 'expedition_escort', terms: params.terms },
  }
}

/** Posts `record` at `boardId` — returns the updated record, or `null` if
 *  `canPostContract` rejects it (see that function for the exact gate). */
export function postWorkContract<T extends WorkContractRecord>(
  record: T,
  boardId: string,
  now: number,
): T | null {
  if (!canPostContract(record)) return null
  return { ...record, state: 'advertised', advertisement: 'posted', postedBoardId: boardId, postedAt: now }
}

/**
 * Escort-scope claim for a genuine early-termination boundary (plan npc-030
 * §14). `allowProportional` distinguishes an employer-initiated stop
 * (`cancelWorkContract`/`invalidateWorkContract` — proportional-to-elapsed-
 * duration once serving) from a single-NPC genuine abandonment/death
 * (`releaseWorkContract` — always `0` unless a claim was already frozen by
 * an earlier transition, plan §14's death rule). A destination-only policy
 * has no duration anchor (`serviceEndsAt == null`) and always yields `0`
 * before arrival, matching plan §14's "destination-only contract cancelled
 * before destination → 0".
 */
function escortCancellationDue(
  record: EscortWorkContractRecord,
  assignment: WorkContractAssignment,
  now: number,
  alreadyFrozen: number,
  allowProportional: boolean,
): number {
  if (!allowProportional) return 0
  if (assignment.state !== 'serving') return 0
  if (assignment.serviceStartedAt == null || assignment.serviceEndsAt == null) return 0
  const span = assignment.serviceEndsAt - assignment.serviceStartedAt
  const elapsedFraction = span > 0 ? Math.max(0, Math.min(1, (now - assignment.serviceStartedAt) / span)) : 0
  const raw = Math.floor(record.rewardCoins * elapsedFraction)
  return Math.max(0, Math.min(raw, record.rewardCoins - alreadyFrozen))
}

function freezeAssignmentClaimAgainst(
  record: WorkContractRecord,
  assignment: WorkContractAssignment,
  outcome: 'payment_due' | 'uncollectable',
  timing: WorkContractClaimTiming,
  alreadyFrozen: number,
  allowEscortProportional: boolean,
): WorkContractAssignment {
  if (assignment.rewardCoinsDue > 0) return { ...assignment, state: outcome }
  const due = record.scope.kind === 'expedition_escort'
    ? escortCancellationDue(record as EscortWorkContractRecord, assignment, timing.now, alreadyFrozen, allowEscortProportional)
    : assignmentRewardCoinsDue(record as MeasurableWorkContractRecord, assignment.workCompleted, alreadyFrozen)
  if (due <= 0) return { ...assignment, state: 'released', ...emptyPaymentFields() }
  const patience = timing.patienceDaysFor?.(assignment.npcId) ?? DEFAULT_PAYMENT_PATIENCE_DAYS
  return {
    ...assignment,
    state: outcome,
    rewardCoinsDue: due,
    lastPaymentRequestAt: null,
    paymentDeadline: timing.now + patience,
  }
}

/** Employer-initiated stop of every still-work-active assignment (plan
 *  §10) — escort assignments credit proportional-to-elapsed-duration
 *  (`allowEscortProportional: true`), matching the plan's explicit early-
 *  termination rules for a player cancellation. */
function freezeWorkActiveAssignments(
  record: WorkContractRecord,
  outcome: 'payment_due' | 'uncollectable',
  timing: WorkContractClaimTiming,
): WorkContractAssignment[] {
  let frozen = frozenAssignmentClaimSum(record)
  return record.assignments.map((assignment) => {
    if (!isAssignmentWorkActive(assignment)) return assignment
    const next = freezeAssignmentClaimAgainst(record, assignment, outcome, timing, frozen, true)
    frozen += Math.max(0, next.rewardCoinsDue - assignment.rewardCoinsDue)
    return next
  })
}

/** Single-NPC genuine abandonment/death (plan §12/§14) — escort never
 *  credits proportional service here (`allowEscortProportional: false`):
 *  only a claim already frozen by an earlier transition survives. */
function freezeAssignmentClaim(
  record: WorkContractRecord,
  assignment: WorkContractAssignment,
  outcome: 'payment_due' | 'uncollectable',
  timing: WorkContractClaimTiming,
): WorkContractAssignment {
  return freezeAssignmentClaimAgainst(
    record,
    assignment,
    outcome,
    timing,
    frozenAssignmentClaimSum(record) - Math.max(0, assignment.rewardCoinsDue),
    false,
  )
}

/** Cancels `record` — clears any publication atomically with the state
 *  change (plan §10). Work-active assignments freeze earned claims as
 *  living `payment_due` (plan npc-016, generalized by npc-030 §14); zero-
 *  claim assignments are `released`. Returns `null` (no-op) if already
 *  terminal. */
export function cancelWorkContract<T extends WorkContractRecord>(
  record: T,
  timing: WorkContractClaimTiming = DEFAULT_CLAIM_TIMING,
): T | null {
  if (isContractTerminal(record.state)) return null
  return {
    ...record,
    state: 'cancelled',
    advertisement: 'not_posted',
    postedBoardId: null,
    assignments: freezeWorkActiveAssignments(record, 'payment_due', timing),
  }
}

/** Invalidates `record`'s target — same atomic publication cleanup as
 *  `cancelWorkContract`, distinct terminal state (plan §10). Returns `null`
 *  (no-op) if already terminal. */
export function invalidateWorkContract<T extends WorkContractRecord>(
  record: T,
  timing: WorkContractClaimTiming = DEFAULT_CLAIM_TIMING,
): T | null {
  if (isContractTerminal(record.state)) return null
  return {
    ...record,
    state: 'invalidated',
    advertisement: 'not_posted',
    postedBoardId: null,
    assignments: freezeWorkActiveAssignments(record, 'payment_due', timing),
  }
}

/** Whether `npcId` may accept `record` right now (plan npc-028 §4/§10) —
 *  discoverable, a free work slot, useful group work remaining (measurable
 *  work only), and this NPC has never had an assignment on this contract.
 *  Callers must still re-check the live record and the one-active-work-
 *  commitment-per-NPC rule; this predicate is the contract-local half. */
export function canAcceptContract(record: WorkContractRecord, npcId: string): boolean {
  return isContractDiscoverable(record) && findAssignment(record, npcId) == null
}

/** NPC accepts a discovered, still-open contract (plan npc-028 §10) —
 *  adds an assignment without replacing any other worker. `null` if
 *  `canAcceptContract` rejects it. Scope-neutral: the resulting assignment
 *  starts `accepted` regardless of scope; escort service timing is stamped
 *  separately by `beginEscortService`. */
export function acceptWorkContract<T extends WorkContractRecord>(record: T, npcId: string, now: number): T | null {
  if (!canAcceptContract(record, npcId)) return null
  const assignment: WorkContractAssignment = {
    npcId,
    state: 'accepted',
    acceptedAt: now,
    workStartedAt: null,
    workCompleted: 0,
    serviceStartedAt: null,
    serviceEndsAt: null,
    ...emptyPaymentFields(),
  }
  return {
    ...record,
    state: 'active',
    assignments: [...record.assignments, assignment],
  }
}

function withAssignment<T extends WorkContractRecord>(
  record: T,
  npcId: string,
  update: (assignment: WorkContractAssignment) => WorkContractAssignment | null,
): T | null {
  const index = record.assignments.findIndex((assignment) => assignment.npcId === npcId)
  if (index === -1) return null
  const current = record.assignments[index]!
  const updated = update(current)
  if (!updated) return null
  const assignments = record.assignments.slice()
  assignments[index] = updated
  return { ...record, assignments }
}

/** `accepted` → `travelling` (plan npc-015 §6) — measurable work only; only
 *  that NPC's assignment moves, other workers are untouched. */
export function beginContractTravel(record: MeasurableWorkContractRecord, npcId: string): MeasurableWorkContractRecord | null {
  return withAssignment(record, npcId, (assignment) => (
    assignment.state === 'accepted' ? { ...assignment, state: 'travelling' } : null
  ))
}

/** `travelling` → `working` (plan npc-015 §7), once this worker has reached
 *  the target. Measurable work only. */
export function beginContractWork(record: MeasurableWorkContractRecord, npcId: string, now: number): MeasurableWorkContractRecord | null {
  return withAssignment(record, npcId, (assignment) => (
    assignment.state === 'travelling' ? { ...assignment, state: 'working', workStartedAt: now } : null
  ))
}

/**
 * `accepted` → `serving` for an expedition escort (plan npc-030 §5/§6) —
 * skips the measurable-work travel/work split entirely (no fictional
 * `travelling` to a static target). Stamps absolute service timing:
 * `serviceEndsAt` derives once from `terms.durationDays` when present,
 * `null` for a pure `destination` policy. `null` if `npcId` has no
 * `accepted` assignment on this contract.
 */
export function beginEscortService(
  record: EscortWorkContractRecord,
  npcId: string,
  now: number,
): EscortWorkContractRecord | null {
  const durationDays = record.scope.terms.durationDays
  const serviceEndsAt = typeof durationDays === 'number' ? now + durationDays : null
  return withAssignment(record, npcId, (assignment) => (
    assignment.state === 'accepted'
      ? { ...assignment, state: 'serving', serviceStartedAt: now, serviceEndsAt }
      : null
  ))
}

function settleWorkPhase<T extends WorkContractRecord>(
  record: T,
  timing: WorkContractClaimTiming = DEFAULT_CLAIM_TIMING,
): T {
  const next: T = {
    ...record,
    state: 'settling',
    assignments: freezeWorkActiveAssignments(record, 'payment_due', timing),
  }
  return refreshContractSettlement(next)
}

/** Genuine service boundary reached for one escort assignment (plan npc-030
 *  §11/§13) — pure fulfilment, never emulated with fake work units.
 *  `outcome.kind === 'fulfilled'` (duration elapsed, shared destination
 *  arrival, or a `destination_or_timeout` boundary reached either way)
 *  freezes the full agreed reward. `null` if `npcId` is not currently
 *  `serving` (including an already-terminal assignment — idempotent). */
export function endEscortService(
  record: EscortWorkContractRecord,
  npcId: string,
  outcome: { kind: 'fulfilled' },
  timing: WorkContractClaimTiming = DEFAULT_CLAIM_TIMING,
): EscortWorkContractRecord | null {
  const assignment = findAssignment(record, npcId)
  if (!assignment || assignment.state !== 'serving') return null
  const alreadyFrozen = frozenAssignmentClaimSum(record)
  const due = Math.max(0, Math.min(record.rewardCoins, record.rewardCoins - alreadyFrozen))
  void outcome
  const patience = timing.patienceDaysFor?.(npcId) ?? DEFAULT_PAYMENT_PATIENCE_DAYS
  const updated: WorkContractAssignment = due > 0
    ? { ...assignment, state: 'payment_due', rewardCoinsDue: due, lastPaymentRequestAt: null, paymentDeadline: timing.now + patience }
    : { ...assignment, state: 'released', ...emptyPaymentFields() }
  const next = withAssignment(record, npcId, () => updated)
  if (!next) return null
  return settleWorkPhase(next, timing)
}

/** Ends the contractual work phase for every still-work-active assignment
 *  (plan npc-028 §15/§16, npc-016 §6, generalized by npc-030 §11) — group
 *  measurable commitment fulfilled (or the real target no longer accepts
 *  useful work), or an escort's service boundary was reached. Measurable
 *  work freezes a proportional-to-`workCompleted` claim; escort freezes the
 *  full agreed reward via `endEscortService`. `null` if `npcId` is not
 *  currently work-active on this contract. */
export function completeContractWork<T extends WorkContractRecord>(
  record: T,
  npcId: string,
  timing: WorkContractClaimTiming = DEFAULT_CLAIM_TIMING,
): T | null {
  const assignment = findAssignment(record, npcId)
  if (!assignment || !isAssignmentWorkActive(assignment)) return null
  if (record.scope.kind === 'expedition_escort') {
    return endEscortService(record as EscortWorkContractRecord, npcId, { kind: 'fulfilled' }, timing) as T | null
  }
  return settleWorkPhase(record, timing)
}

/** Releases `npcId`'s work participation (plan npc-028 §13, npc-016 §6/§8,
 *  generalized by npc-030 §12/§14) — genuine abandonment/death, never a
 *  temporary interruption. A living measurable-work worker with useful work
 *  keeps a `payment_due` claim; an escort abandonment/death never
 *  synthesizes a new wage (only a claim already frozen by an earlier
 *  transition survives). Reopens a work slot when useful group work
 *  remains. Use `invalidateWorkContract` when the target itself is the
 *  problem. */
export function releaseWorkContract<T extends WorkContractRecord>(
  record: T,
  npcId: string,
  reason: WorkContractReleaseReason = 'abandoned',
  timing: WorkContractClaimTiming = DEFAULT_CLAIM_TIMING,
): T | null {
  const current = findAssignment(record, npcId)
  if (!current || !isAssignmentWorkActive(current)) return null
  const outcome = reason === 'death' ? 'uncollectable' as const : 'payment_due' as const
  const assignments = record.assignments.map((assignment) => (
    assignment.npcId === npcId ? freezeAssignmentClaim(record, assignment, outcome, timing) : assignment
  ))
  const next: T = { ...record, assignments }
  if (activeWorkAssignmentCount(next) > 0) return { ...next, state: 'active' }
  if (record.scope.kind === 'measurable_work' && groupRemainingWork(next as MeasurableWorkContractRecord) <= 0) {
    return settleWorkPhase(next, timing)
  }
  if (record.scope.kind === 'expedition_escort') return settleWorkPhase(next, timing)
  if (next.advertisement === 'posted') return { ...next, state: 'advertised' }
  return next
}

/** Marks a still-payable assignment `paid` (plan npc-016 §15) — inventory
 *  transfer must already have succeeded. Refreshes aggregate settlement. */
export function markWorkAssignmentPaid<T extends WorkContractRecord>(record: T, npcId: string): T | null {
  const current = findAssignment(record, npcId)
  if (!current || !isAssignmentPayable(current)) return null
  const updated = withAssignment(record, npcId, (assignment) => ({ ...assignment, state: 'paid' as const }))
  return updated ? refreshContractSettlement(updated) : null
}

/** Patience expiry: `payment_due` → `unpaid` when `now >= paymentDeadline`
 *  (plan npc-016 §18). Unchanged record if the deadline has not passed. */
export function expireWorkAssignmentPayment<T extends WorkContractRecord>(
  record: T,
  npcId: string,
  now: number,
): T | null {
  const current = findAssignment(record, npcId)
  if (!current || current.state !== 'payment_due') return null
  if (current.paymentDeadline == null || now < current.paymentDeadline) return record
  const updated = withAssignment(record, npcId, (assignment) => ({ ...assignment, state: 'unpaid' as const }))
  return updated ? refreshContractSettlement(updated) : null
}

/** Dead worker with a still-payable claim (plan npc-016 §8) — preserves the
 *  frozen amount and stops payment requests. */
export function markWorkAssignmentUncollectable<T extends WorkContractRecord>(record: T, npcId: string): T | null {
  const current = findAssignment(record, npcId)
  if (!current || !isAssignmentPayable(current)) return null
  const updated = withAssignment(record, npcId, (assignment) => ({ ...assignment, state: 'uncollectable' as const }))
  return updated ? refreshContractSettlement(updated) : null
}

/** Stamps `lastPaymentRequestAt` on a payable assignment (plan npc-016 §17). */
export function recordWorkAssignmentPaymentRequest<T extends WorkContractRecord>(
  record: T,
  npcId: string,
  now: number,
): T | null {
  const current = findAssignment(record, npcId)
  if (!current || !isAssignmentPayable(current)) return null
  return withAssignment(record, npcId, (assignment) => ({ ...assignment, lastPaymentRequestAt: now }))
}

/** True once the NPC *group* has performed its full agreed share (plan
 *  npc-028 §15) — independent of contribution distribution and of whether
 *  the underlying target itself is finished. Measurable work only. The
 *  caller (`NpcAgent`) still separately checks target completion (plan
 *  §16); either condition ends the contractual work phase. */
export function isNpcCommitmentFulfilled(record: MeasurableWorkContractRecord): boolean {
  return record.scope.npcWorkCompleted >= record.scope.committedWork
}

/** Frozen reward rate for attributable measurable work (plan npc-028 §12).
 *  `0` when `committedWork` is 0 so callers never divide by zero. */
export function contractRewardRate(record: MeasurableWorkContractRecord): number {
  return record.scope.committedWork > 0 ? record.rewardCoins / record.scope.committedWork : 0
}

/**
 * Deterministic estimate of how much remaining group work the next
 * accepting candidate would take on (plan npc-028 §11). Not a personal
 * quota — `active + remaining slots`, bounded to at least 1. Measurable
 * work only.
 */
export function expectedCandidateWork(record: MeasurableWorkContractRecord): number {
  const remaining = groupRemainingWork(record)
  const active = activeWorkAssignmentCount(record)
  const remainingSlots = Math.max(0, record.requestedWorkerCount - active)
  const expectedWorkers = Math.max(1, active + remainingSlots)
  return remaining / expectedWorkers
}

/** Credits `workAmount` of useful work actually accepted by the target from
 *  `npcId` (plan npc-028 §8) — the only mutation of both
 *  `assignment.workCompleted` and aggregate `npcWorkCompleted`. `null` if
 *  that NPC is not currently `working`. A non-positive amount is a no-op
 *  that still returns the current record. Measurable work only. */
export function recordNpcWorkContribution(
  record: MeasurableWorkContractRecord,
  npcId: string,
  workAmount: number,
): MeasurableWorkContractRecord | null {
  const assignment = findAssignment(record, npcId)
  if (!assignment || assignment.state !== 'working') return null
  if (workAmount <= 0) return record
  return {
    ...record,
    scope: { ...record.scope, npcWorkCompleted: record.scope.npcWorkCompleted + workAmount },
    assignments: record.assignments.map((entry) => (
      entry.npcId === npcId
        ? { ...entry, workCompleted: entry.workCompleted + workAmount }
        : entry
    )),
  }
}

/** Whether `a`/`b` name the same concrete world target — the one-active-
 *  contract-per-target check (plan §9) compares against this rather than
 *  reference equality. */
export function sameContractTarget(a: ContractTarget, b: ContractTarget): boolean {
  return a.kind === b.kind && a.targetId === b.targetId
}

/** `now >= serviceEndsAt`, the escort duration boundary (plan npc-030 §11).
 *  `false` when this assignment has no duration anchor at all (a pure
 *  `destination` policy, or not yet serving). */
export function isEscortServiceDurationDue(assignment: WorkContractAssignment, nowDays: number): boolean {
  return assignment.serviceEndsAt != null && nowDays >= assignment.serviceEndsAt
}

/** Meaningful shared arrival radius (plan npc-030 §11) — both the player
 *  and the escort NPC must be within this bound, never only the player. */
export const ESCORT_DESTINATION_ARRIVAL_RADIUS = 20

/** Shared-arrival predicate (plan npc-030 §11/§10) — the caller supplies
 *  the resolved destination snapshot plus current player/NPC positions;
 *  this stays pure and free of any live world-location/settlement lookup. */
export function isEscortDestinationArrived(
  destination: { x: number, z: number },
  playerPos: { x: number, z: number },
  npcPos: { x: number, z: number },
  radius: number = ESCORT_DESTINATION_ARRIVAL_RADIUS,
): boolean {
  return (
    Math.hypot(playerPos.x - destination.x, playerPos.z - destination.z) <= radius
    && Math.hypot(npcPos.x - destination.x, npcPos.z - destination.z) <= radius
  )
}

/**
 * Pure escort fulfilment check (plan npc-030 §11) — never completes a
 * `destination` policy merely because the player crossed the destination
 * while the NPC remains materially separated (a missing `npcPos`, e.g. an
 * off-screen/separated NPC, never counts as arrived). `destination_or_timeout`
 * completes on whichever boundary is reached first; both are a successful
 * "contract boundary reached" (plan npc-030 §13's fulfilment payment rule),
 * never early termination.
 */
export function isEscortServiceFulfilled(input: {
  terms: ExpeditionEscortTerms
  assignment: WorkContractAssignment
  nowDays: number
  playerPos?: { x: number, z: number } | null
  npcPos?: { x: number, z: number } | null
}): boolean {
  const { terms, assignment } = input
  const durationDue = isEscortServiceDurationDue(assignment, input.nowDays)
  if (terms.completionPolicy === 'duration') return durationDue
  const destination = terms.destination
  const arrived = destination != null && input.playerPos != null && input.npcPos != null
    && isEscortDestinationArrived(destination, input.playerPos, input.npcPos)
  if (terms.completionPolicy === 'destination') return arrived
  return arrived || durationDue
}
