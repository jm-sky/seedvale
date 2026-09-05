/**
 * Work Contract domain — pure lifecycle/state for player-issued work
 * contracts (plan npc-014, "Workforce for Hire" foundation). Deliberately
 * free of `THREE`/DOM, same split as `world/standingTorch.ts` vs
 * `world/createStandingTorches.ts`.
 *
 * This phase only ever produces/transitions `available`/`advertised` plus the
 * two terminal states `cancelled`/`invalidated` — the remaining states exist
 * so later phases (NPC discovery/acceptance/travel/construction/payment) can
 * extend the same record without a schema change (plan §2's lifecycle
 * diagram). `WorkContractRecord` is the sole authoritative source; a posted
 * board never duplicates its reward/target/state (plan §8/§12) — it only
 * keeps `postedBoardId` on the contract itself, and a board's "what's posted
 * here" view is a query over contracts by that field.
 *
 * Since plan npc-018, a contract owns only the NPC's work *commitment*
 * (`requestedWorkShare`/`remainingWorkAtCreation`/`committedWork`/
 * `npcWorkCompleted`) against an existing `ContractTarget` — the target
 * itself (`PlayerWellRecord`/`TerrainPreparationRecord`) remains the sole
 * owner of actual progress; player and NPC contribute to the same target.
 *
 * @domain npc
 */
export type WorkContractState =
  | 'available'
  | 'advertised'
  | 'accepted'
  | 'travelling'
  | 'working'
  | 'payment_due'
  | 'completed'
  | 'cancelled'
  | 'invalidated'

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

export type WorkContractRecord = {
  id: string
  /** Who issued the contract — always `'player'` today; a `string` (not a
   *  literal) so a later NPC-employer phase doesn't need a schema change. */
  employer: string
  workType: WorkType
  target: ContractTarget
  x: number
  z: number
  rewardCoins: number
  state: WorkContractState
  advertisement: WorkContractAdvertisement
  /** The notice board this contract is currently posted at, or `null` when
   *  `advertisement === 'not_posted'` (including after cancellation/
   *  invalidation clears a prior posting). */
  postedBoardId: string | null
  createdAt: number
  postedAt: number | null
  /** The NPC currently committed to this contract (plan npc-015 §5), or
   *  `null` when unassigned. This is the *sole* authority for the
   *  assignment — an `NpcAgent` never keeps a second copy of its own
   *  commitment, it resolves it by querying contracts for
   *  `workerNpcId === this.id` (implementation notes "Recommended contract
   *  ownership"). Only ever set by `acceptWorkContract`, cleared by
   *  `releaseWorkContract`/`cancelWorkContract`/`invalidateWorkContract`. */
  workerNpcId: string | null
  acceptedAt: number | null
  workStartedAt: number | null
  /** Fraction (0–1] of the target's remaining useful work the NPC was asked
   *  to perform, chosen at contract creation (plan npc-018 §4/§5). Presets
   *  are 25/50/75/100% — never renegotiated afterward (plan §5's explicit
   *  non-goal). */
  requestedWorkShare: number
  /** Snapshot of the target's remaining useful work at the moment this
   *  contract was created (plan §5) — resolved by the target-specific
   *  remaining-work rule (`wellRemainingWork`/`terrainPreparationRemainingWork`).
   *  Immutable for the contract's lifetime: never recalculated as the player
   *  or NPC contribute more work, the target changes stage, or the contract
   *  is saved/loaded. */
  remainingWorkAtCreation: number
  /** `remainingWorkAtCreation * requestedWorkShare` (plan §5) — computed
   *  exactly once at creation, then frozen for the same reason as
   *  `remainingWorkAtCreation`. The NPC's work agreement is fulfilled once
   *  `npcWorkCompleted >= committedWork` (plan §7), independent of whether
   *  the underlying target itself is finished. */
  committedWork: number
  /** Useful work actually accepted by the target from this contract's NPC
   *  (plan §6) — never inferred from a delta in the target's own total
   *  progress (the player may also be contributing between NPC bouts).
   *  Distinct from `remainingWorkAtCreation`/`committedWork`: this is the
   *  only field that changes after creation. */
  npcWorkCompleted: number
}

const TERMINAL_STATES: ReadonlySet<WorkContractState> = new Set(['cancelled', 'completed', 'invalidated'])

export function isContractTerminal(state: WorkContractState): boolean {
  return TERMINAL_STATES.has(state)
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

export function createWorkContractRecord(params: {
  id: string
  employer: string
  target: ContractTarget
  x: number
  z: number
  rewardCoins: number
  /** Fraction (0–1] of `remainingWorkAtCreation` the NPC commits to — see
   *  `WORK_SHARE_PRESETS`. */
  requestedWorkShare: number
  /** The target's remaining useful work *right now*, resolved by the
   *  caller's target-specific rule (plan §5) — never recomputed here later. */
  remainingWorkAtCreation: number
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
    workerNpcId: null,
    acceptedAt: null,
    workStartedAt: null,
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

/** Cancels `record` — clears any publication atomically with the state
 *  change (plan §10). Returns `null` (no-op) if already terminal. */
export function cancelWorkContract(record: WorkContractRecord): WorkContractRecord | null {
  if (isContractTerminal(record.state)) return null
  return { ...record, state: 'cancelled', advertisement: 'not_posted', postedBoardId: null, workerNpcId: null }
}

/** Invalidates `record`'s target — same atomic publication cleanup as
 *  `cancelWorkContract`, distinct terminal state (plan §10). Returns `null`
 *  (no-op) if already terminal. */
export function invalidateWorkContract(record: WorkContractRecord): WorkContractRecord | null {
  if (isContractTerminal(record.state)) return null
  return { ...record, state: 'invalidated', advertisement: 'not_posted', postedBoardId: null, workerNpcId: null }
}

/** Only an `advertised`, unassigned contract can be accepted (plan npc-015
 *  §5) — mirrors `canPostContract`'s "reject rather than silently no-op"
 *  shape so `WorkContracts.accept` can distinguish "unknown id" from
 *  "already taken". */
export function canAcceptContract(record: WorkContractRecord): boolean {
  return record.state === 'advertised' && record.workerNpcId === null
}

/** NPC accepts a discovered, still-open contract (plan §5) — assigns the
 *  worker and starts its commitment. `null` if `canAcceptContract` rejects
 *  it (already taken, cancelled, not yet posted, ...). */
export function acceptWorkContract(record: WorkContractRecord, npcId: string, now: number): WorkContractRecord | null {
  if (!canAcceptContract(record)) return null
  return { ...record, state: 'accepted', workerNpcId: npcId, acceptedAt: now }
}

/** `accepted` → `travelling` (plan §6) — only the assigned worker can drive
 *  its own contract's lifecycle. */
export function beginContractTravel(record: WorkContractRecord, npcId: string): WorkContractRecord | null {
  if (record.state !== 'accepted' || record.workerNpcId !== npcId) return null
  return { ...record, state: 'travelling' }
}

/** `travelling` → `working` (plan §7), once the worker has reached the
 *  target. */
export function beginContractWork(record: WorkContractRecord, npcId: string, now: number): WorkContractRecord | null {
  if (record.state !== 'travelling' || record.workerNpcId !== npcId) return null
  return { ...record, state: 'working', workStartedAt: now }
}

/** `working` → `payment_due` (plan §7/§11) once the existing construction
 *  pipeline confirms the target is finished. Never pays — that is
 *  `npc-016`'s job (plan §11's explicit non-goal). */
export function completeContractWork(record: WorkContractRecord, npcId: string): WorkContractRecord | null {
  if (record.state !== 'working' || record.workerNpcId !== npcId) return null
  return { ...record, state: 'payment_due' }
}

/** Releases `npcId`'s commitment back to `advertised` (plan §10/§12) —
 *  temporary interruption is never abandonment (handled entirely by
 *  `NpcAgent` simply resuming the same non-terminal contract on its next
 *  decision), so this is only ever called for a *genuine* abandonment: the
 *  worker died or otherwise can no longer fulfil the commitment while the
 *  target itself is still valid. Keeps the existing posting (`postedAt`/
 *  `postedBoardId` untouched) so the contract re-enters the same board's
 *  candidate pool for another NPC (or the same one, later) instead of
 *  requiring the player to re-post it. Use `invalidateWorkContract` instead
 *  when the target itself is the problem. */
export function releaseWorkContract(record: WorkContractRecord, npcId: string): WorkContractRecord | null {
  if (record.state !== 'accepted' && record.state !== 'travelling' && record.state !== 'working') return null
  if (record.workerNpcId !== npcId) return null
  return { ...record, state: 'advertised', workerNpcId: null, acceptedAt: null, workStartedAt: null }
}

/** True once `record`'s assigned NPC has performed its full agreed share
 *  (plan §7) — independent of whether the underlying target itself is
 *  finished. The caller (`NpcAgent`) still separately checks target
 *  completion (plan §8); either condition ends the contractual work phase. */
export function isNpcCommitmentFulfilled(record: WorkContractRecord): boolean {
  return record.npcWorkCompleted >= record.committedWork
}

/** Credits `workAmount` of useful work actually accepted by the target from
 *  `record`'s NPC (plan §6/§17) — the only mutation of `npcWorkCompleted`.
 *  A non-positive amount is a no-op (nothing was actually accepted this
 *  bout, e.g. the target was already complete). */
export function recordNpcWorkContribution(record: WorkContractRecord, workAmount: number): WorkContractRecord {
  if (workAmount <= 0) return record
  return { ...record, npcWorkCompleted: record.npcWorkCompleted + workAmount }
}

/** Whether `a`/`b` name the same concrete world target — the one-active-
 *  contract-per-target check (plan §9) compares against this rather than
 *  reference equality. */
export function sameContractTarget(a: ContractTarget, b: ContractTarget): boolean {
  return a.kind === b.kind && a.targetId === b.targetId
}
