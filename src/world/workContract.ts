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
  return { ...record, state: 'cancelled', advertisement: 'not_posted', postedBoardId: null }
}

/** Invalidates `record`'s target — same atomic publication cleanup as
 *  `cancelWorkContract`, distinct terminal state (plan §10). Returns `null`
 *  (no-op) if already terminal. */
export function invalidateWorkContract(record: WorkContractRecord): WorkContractRecord | null {
  if (isContractTerminal(record.state)) return null
  return { ...record, state: 'invalidated', advertisement: 'not_posted', postedBoardId: null }
}
