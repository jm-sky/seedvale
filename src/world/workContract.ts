/**
 * Work Contract domain — pure lifecycle/state for player-issued work
 * contracts (plan npc-014, "Workforce for Hire" foundation). Deliberately
 * free of `THREE`/DOM, same split as `world/standingTorch.ts` vs
 * `world/createStandingTorches.ts`.
 *
 * Since plan npc-028 a contract is a job, not a single worker's FSM.
 * `WorkContractRecord` owns the posting, target, group commitment and
 * reward ceiling; each hired NPC is a `WorkContractAssignment` with its
 * own execution lifecycle and attributable `workCompleted`. The target
 * itself (`PlayerWellRecord`/`TerrainPreparationRecord`/…) remains the
 * sole owner of actual progress; player and NPCs contribute to the same
 * target through the actor-neutral seam.
 *
 * A posted board never duplicates reward/target/state (plan npc-014
 * §8/§12) — it only keeps `postedBoardId` on the contract, and a board's
 * "what's posted here" view is a query over contracts by that field.
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

/** One NPC's execution against a Work Contract (plan npc-028 §1).
 *  `payment_due` is the work-phase handoff to npc-016; `released` is
 *  genuine abandonment/death, not a temporary interruption. */
export type WorkContractAssignmentState =
  | 'accepted'
  | 'travelling'
  | 'working'
  | 'payment_due'
  | 'released'

export type WorkContractAdvertisement = 'not_posted' | 'posted'

/** One entry per `ContractTarget` variant (plan npc-018 §10, extended by
 *  plan items-player-017 §2/§16 with the two simple buildable targets). */
export type WorkType = 'construction' | 'terrain_preparation' | 'palisade' | 'standing_torch'

/** A concrete, recoverable world target a contract describes work at — never
 *  a display string like "build a well" (plan §3). `targetId` is the stable
 *  identity later NPC construction execution (Plan 2) resolves against; the
 *  placement coordinate itself lives on `WorkContractRecord.x`/`z`, not here,
 *  mirroring the plan's own "target reference" + "target location" split
 *  (plan §2/§11). */
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

/** Union of every contract-target shape — one variant per `WorkType` (plan
 *  npc-018 §10, extended by plan items-player-017). */
export type ContractTarget =
  | ConstructionContractTarget
  | TerrainPreparationContractTarget
  | PalisadeContractTarget
  | StandingTorchContractTarget

/** One NPC's participation in a Work Contract (plan npc-028 §1). Owned by
 *  the contract, never copied onto `NpcAgent`. Historical assignments are
 *  kept after release/settlement so npc-016 can freeze per-assignment
 *  payment claims. */
export type WorkContractAssignment = {
  npcId: string
  state: WorkContractAssignmentState
  acceptedAt: number
  workStartedAt: number | null
  /** Useful work this NPC actually got accepted by the target — not a
   *  personal quota. Payment (npc-016) will derive a claim from this. */
  workCompleted: number
}

export type WorkContractRecord = {
  id: string
  /** Who issued the contract — always `'player'` today; a `string` (not a
   *  literal) so a later NPC-employer phase doesn't need a schema change. */
  employer: string
  workType: WorkType
  target: ContractTarget
  x: number
  z: number
  /** Maximum total price for the original group `committedWork` (plan
   *  npc-028 §12) — never a per-worker reward and never multiplied by
   *  `requestedWorkerCount`. */
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
   *  waiting for payment does not occupy a work slot. */
  requestedWorkerCount: number
  /** Every NPC that has accepted this contract, including released and
   *  payment-due history. An NPC may not accept the same contract twice. */
  assignments: WorkContractAssignment[]
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

const TERMINAL_STATES: ReadonlySet<WorkContractState> = new Set(['cancelled', 'completed', 'invalidated'])

const WORK_ACTIVE_ASSIGNMENT_STATES: ReadonlySet<WorkContractAssignmentState> = new Set([
  'accepted',
  'travelling',
  'working',
])

export function isContractTerminal(state: WorkContractState): boolean {
  return TERMINAL_STATES.has(state)
}

/** True while this assignment still occupies a work slot (plan npc-028
 *  §4). `payment_due` / `released` do not. */
export function isAssignmentWorkActive(assignment: WorkContractAssignment): boolean {
  return WORK_ACTIVE_ASSIGNMENT_STATES.has(assignment.state)
}

/** Count of assignments still participating in contractual work. */
export function activeWorkAssignmentCount(record: WorkContractRecord): number {
  let count = 0
  for (const assignment of record.assignments) {
    if (isAssignmentWorkActive(assignment)) count += 1
  }
  return count
}

/** Remaining group commitment, never negative (plan npc-028 §7). */
export function groupRemainingWork(record: WorkContractRecord): number {
  return Math.max(0, record.committedWork - record.npcWorkCompleted)
}

export function findAssignment(record: WorkContractRecord, npcId: string): WorkContractAssignment | undefined {
  return record.assignments.find((assignment) => assignment.npcId === npcId)
}

/** Whether `record` should still show a physical target flag in the world
 *  (plan §5/§10) — true for every non-terminal state. */
export function contractHasActiveTarget(record: WorkContractRecord): boolean {
  return !isContractTerminal(record.state)
}

/** Only an `available`, not-yet-posted contract can be posted (plan §8/§9) —
 *  posting a cancelled/invalidated/already-advertised contract is rejected
 *  rather than silently no-op-ing, so board posting can never duplicate a
 *  publication or resurrect a dead contract. */
export function canPostContract(record: WorkContractRecord): boolean {
  return record.state === 'available' && record.advertisement === 'not_posted'
}

/**
 * Posted contracts stay discoverable while a work slot and useful group
 * work remain (plan npc-028 §4/§10) — not only while `state ===
 * 'advertised'`. Target usefulness is the caller's job (the domain does
 * not know the live target).
 */
export function isContractDiscoverable(record: WorkContractRecord): boolean {
  if (isContractTerminal(record.state)) return false
  if (record.advertisement !== 'posted' || record.postedBoardId == null) return false
  if (record.state !== 'advertised' && record.state !== 'active') return false
  if (groupRemainingWork(record) <= 0) return false
  return activeWorkAssignmentCount(record) < record.requestedWorkerCount
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
}): WorkContractRecord {
  const requestedWorkShare = Math.max(0, Math.min(1, params.requestedWorkShare))
  const remainingWorkAtCreation = Math.max(0, params.remainingWorkAtCreation)
  return {
    id: params.id,
    employer: params.employer,
    workType: params.target.kind,
    target: params.target,
    x: params.x,
    z: params.z,
    rewardCoins: params.rewardCoins,
    state: 'available',
    advertisement: 'not_posted',
    postedBoardId: null,
    createdAt: params.now,
    postedAt: null,
    requestedWorkerCount: normalizeRequestedWorkerCount(params.requestedWorkerCount ?? 1),
    assignments: [],
    requestedWorkShare,
    remainingWorkAtCreation,
    committedWork: remainingWorkAtCreation * requestedWorkShare,
    npcWorkCompleted: 0,
  }
}

/** Posts `record` at `boardId` — returns the updated record, or `null` if
 *  `canPostContract` rejects it (see that function for the exact gate). */
export function postWorkContract(
  record: WorkContractRecord,
  boardId: string,
  now: number,
): WorkContractRecord | null {
  if (!canPostContract(record)) return null
  return { ...record, state: 'advertised', advertisement: 'posted', postedBoardId: boardId, postedAt: now }
}

function releaseWorkActiveAssignments(record: WorkContractRecord): WorkContractAssignment[] {
  return record.assignments.map((assignment) => (
    isAssignmentWorkActive(assignment) ? { ...assignment, state: 'released' } : assignment
  ))
}

/** Cancels `record` — clears any publication atomically with the state
 *  change (plan §10). Work-active assignments are released; historical
 *  contribution is preserved for npc-016. Returns `null` (no-op) if
 *  already terminal. */
export function cancelWorkContract(record: WorkContractRecord): WorkContractRecord | null {
  if (isContractTerminal(record.state)) return null
  return {
    ...record,
    state: 'cancelled',
    advertisement: 'not_posted',
    postedBoardId: null,
    assignments: releaseWorkActiveAssignments(record),
  }
}

/** Invalidates `record`'s target — same atomic publication cleanup as
 *  `cancelWorkContract`, distinct terminal state (plan §10). Returns `null`
 *  (no-op) if already terminal. */
export function invalidateWorkContract(record: WorkContractRecord): WorkContractRecord | null {
  if (isContractTerminal(record.state)) return null
  return {
    ...record,
    state: 'invalidated',
    advertisement: 'not_posted',
    postedBoardId: null,
    assignments: releaseWorkActiveAssignments(record),
  }
}

/** Whether `npcId` may accept `record` right now (plan npc-028 §4/§10) —
 *  discoverable, a free work slot, useful group work remaining, and this NPC
 *  has never had an assignment on this contract. Callers must still
 *  re-check the live record and the one-active-work-commitment-per-NPC
 *  rule; this predicate is the contract-local half. */
export function canAcceptContract(record: WorkContractRecord, npcId: string): boolean {
  return isContractDiscoverable(record) && findAssignment(record, npcId) == null
}

/** NPC accepts a discovered, still-open contract (plan npc-028 §10) —
 *  adds an assignment without replacing any other worker. `null` if
 *  `canAcceptContract` rejects it. */
export function acceptWorkContract(record: WorkContractRecord, npcId: string, now: number): WorkContractRecord | null {
  if (!canAcceptContract(record, npcId)) return null
  const assignment: WorkContractAssignment = {
    npcId,
    state: 'accepted',
    acceptedAt: now,
    workStartedAt: null,
    workCompleted: 0,
  }
  return {
    ...record,
    state: 'active',
    assignments: [...record.assignments, assignment],
  }
}

function withAssignment(
  record: WorkContractRecord,
  npcId: string,
  update: (assignment: WorkContractAssignment) => WorkContractAssignment | null,
): WorkContractRecord | null {
  const index = record.assignments.findIndex((assignment) => assignment.npcId === npcId)
  if (index === -1) return null
  const current = record.assignments[index]!
  const updated = update(current)
  if (!updated) return null
  const assignments = record.assignments.slice()
  assignments[index] = updated
  return { ...record, assignments }
}

/** `accepted` → `travelling` (plan npc-015 §6) — only that NPC's
 *  assignment moves; other workers are untouched. */
export function beginContractTravel(record: WorkContractRecord, npcId: string): WorkContractRecord | null {
  return withAssignment(record, npcId, (assignment) => (
    assignment.state === 'accepted' ? { ...assignment, state: 'travelling' } : null
  ))
}

/** `travelling` → `working` (plan npc-015 §7), once this worker has reached
 *  the target. */
export function beginContractWork(record: WorkContractRecord, npcId: string, now: number): WorkContractRecord | null {
  return withAssignment(record, npcId, (assignment) => (
    assignment.state === 'travelling' ? { ...assignment, state: 'working', workStartedAt: now } : null
  ))
}

function settleWorkPhase(record: WorkContractRecord): WorkContractRecord {
  return {
    ...record,
    state: 'settling',
    assignments: record.assignments.map((assignment) => (
      isAssignmentWorkActive(assignment) ? { ...assignment, state: 'payment_due' } : assignment
    )),
  }
}

/** Ends the contractual work phase for every still-work-active assignment
 *  (plan npc-028 §15/§16) — group commitment fulfilled, or the real target
 *  no longer accepts useful work. `npcId` must currently have a
 *  work-active assignment (authorization); other workers stop regardless of
 *  their individual progress. Never synthesizes contribution. `null` if
 *  `npcId` is not currently work-active on this contract. */
export function completeContractWork(record: WorkContractRecord, npcId: string): WorkContractRecord | null {
  const assignment = findAssignment(record, npcId)
  if (!assignment || !isAssignmentWorkActive(assignment)) return null
  return settleWorkPhase(record)
}

/** Releases `npcId`'s work participation (plan npc-028 §13) — genuine
 *  abandonment/death, never a temporary interruption. Preserves that
 *  assignment's `workCompleted` and the aggregate `npcWorkCompleted`. Other
 *  assignments are untouched. Reopens one work slot when useful group work
 *  remains (`advertised` if nobody is left working; `active` otherwise).
 *  Use `invalidateWorkContract` when the target itself is the problem. */
export function releaseWorkContract(record: WorkContractRecord, npcId: string): WorkContractRecord | null {
  const current = findAssignment(record, npcId)
  if (!current || !isAssignmentWorkActive(current)) return null
  const assignments = record.assignments.map((assignment) => (
    assignment.npcId === npcId ? { ...assignment, state: 'released' as const } : assignment
  ))
  const next: WorkContractRecord = { ...record, assignments }
  if (activeWorkAssignmentCount(next) > 0) return { ...next, state: 'active' }
  if (groupRemainingWork(next) <= 0) return settleWorkPhase(next)
  if (next.advertisement === 'posted') return { ...next, state: 'advertised' }
  return next
}

/** True once the NPC *group* has performed its full agreed share (plan
 *  npc-028 §15) — independent of contribution distribution and of whether
 *  the underlying target itself is finished. The caller (`NpcAgent`)
 *  still separately checks target completion (plan §16); either condition
 *  ends the contractual work phase. */
export function isNpcCommitmentFulfilled(record: WorkContractRecord): boolean {
  return record.npcWorkCompleted >= record.committedWork
}

/** Frozen reward rate for attributable work (plan npc-028 §12). `0` when
 *  `committedWork` is 0 so callers never divide by zero. */
export function contractRewardRate(record: WorkContractRecord): number {
  return record.committedWork > 0 ? record.rewardCoins / record.committedWork : 0
}

/**
 * Deterministic estimate of how much remaining group work the next
 * accepting candidate would take on (plan npc-028 §11). Not a personal
 * quota — `active + remaining slots`, bounded to at least 1.
 */
export function expectedCandidateWork(record: WorkContractRecord): number {
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
 *  that still returns the current record. */
export function recordNpcWorkContribution(
  record: WorkContractRecord,
  npcId: string,
  workAmount: number,
): WorkContractRecord | null {
  const assignment = findAssignment(record, npcId)
  if (!assignment || assignment.state !== 'working') return null
  if (workAmount <= 0) return record
  return {
    ...record,
    npcWorkCompleted: record.npcWorkCompleted + workAmount,
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
