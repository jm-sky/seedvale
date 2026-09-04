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

/** First (and for now only) work type — see plan §2. */
export type WorkType = 'construction'

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

/** Union of every contract-target shape — one variant per `WorkType`. Only
 *  `ConstructionContractTarget` exists today. */
export type ContractTarget = ConstructionContractTarget

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

export function createWorkContractRecord(params: {
  id: string
  employer: string
  targetId: string
  x: number
  z: number
  rewardCoins: number
  now: number
}): WorkContractRecord {
  return {
    id: params.id,
    employer: params.employer,
    workType: 'construction',
    target: { kind: 'construction', targetId: params.targetId },
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
