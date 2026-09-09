import * as THREE from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import {
  acceptWorkContract,
  beginContractTravel,
  beginContractWork,
  cancelWorkContract,
  completeContractWork,
  contractHasActiveTarget,
  type ContractTarget,
  createWorkContractRecord,
  expireWorkAssignmentPayment,
  findAssignment,
  invalidateWorkContract,
  isAssignmentPayable,
  isAssignmentWorkActive,
  isContractDiscoverable,
  isContractTerminal,
  markWorkAssignmentPaid,
  markWorkAssignmentUncollectable,
  normalizeRequestedWorkerCount,
  postWorkContract,
  recordNpcWorkContribution,
  recordWorkAssignmentPaymentRequest,
  releaseWorkContract,
  sameContractTarget,
  type WorkContractAssignment,
  type WorkContractClaimTiming,
  type WorkContractRecord,
  type WorkContractReleaseReason,
} from './workContract'

export type CreateWorkContractParams = {
  employer: string
  target: ContractTarget
  x: number
  z: number
  rewardCoins: number
  /** See `createWorkContractRecord` — a `WORK_SHARE_PRESETS` fraction. */
  requestedWorkShare: number
  /** The target's remaining useful work at this exact moment (plan §5) —
   *  the caller resolves this via the target's own remaining-work rule
   *  (`wellRemainingWork`/`terrainPreparationRemainingWork`) before calling. */
  remainingWorkAtCreation: number
  /** Integer `>= 1` (plan npc-028 §4). Frozen after creation. */
  requestedWorkerCount?: number
  now: number
}

/** Authoritative lookup of one NPC's assignment on a live contract. */
export type WorkContractAssignmentLookup = {
  contract: WorkContractRecord
  assignment: WorkContractAssignment
}

export type WorkContracts = {
  list: () => readonly WorkContractRecord[]
  nodes: () => readonly WorkContractRecord[]
  find: (id: string) => WorkContractRecord | undefined
  /** True if `target` already has a non-terminal contract (plan §9) — at
   *  most one active contract per target; callers use this to gate contract
   *  creation before ever calling `create`. */
  hasActiveContract: (target: ContractTarget) => boolean
  /** Creates a new `available`/`not_posted` contract referencing `params.target`
   *  and spawns its target flag (plan npc-014 §4/§5, extended by npc-018 §2/§4
   *  and items-player-017 §16) — never advertises it, never assigns anyone.
   *  `params.target` must already be a real, independently-existing world
   *  object (a `PlayerWellRecord`, `TerrainPreparationRecord`,
   *  `PalisadeSegmentRecord` or `StandingTorchRecord`) placed by the caller,
   *  never a placeholder.
   *  Returns `null` if `target` already has a non-terminal contract
   *  (plan §9's one-active-contract-per-target invariant). */
  create: (params: CreateWorkContractParams) => WorkContractRecord | null
  /** Posts `id` at `boardId` — returns the updated record, or `null` if
   *  `id` is unknown or `canPostContract` rejects it (plan §8/§9). */
  post: (id: string, boardId: string, now: number) => WorkContractRecord | null
  /** Cancels `id` and removes its flag — returns `false` (no-op) if `id` is
   *  unknown or already terminal (plan §10). */
  cancel: (id: string, timing?: WorkContractClaimTiming) => boolean
  /** Marks `id`'s target invalid and removes its flag — same no-op contract
   *  as `cancel` (plan §10). */
  invalidateTarget: (id: string, timing?: WorkContractClaimTiming) => boolean
  /** Contracts currently posted at `boardId` (plan §9) — the board's own
   *  "what's here" view, resolved by querying contracts rather than a
   *  duplicated list kept on the board. */
  postedAt: (boardId: string) => readonly WorkContractRecord[]
  /** Still-open contracts posted at `boardId` (plan npc-028 §4/§10) —
   *  posted, non-terminal, useful group work remaining, and a free work
   *  slot. An already-assigned contract stays posted and remains offered
   *  until its slots fill or work ends. */
  discoverableAt: (boardId: string) => readonly WorkContractRecord[]
  /**
   * This NPC's current work-active assignment (`accepted`/`travelling`/
   * `working`) and its owning contract, or `undefined` (plan npc-028 §21).
   * Payment-due/released history is not returned here — use
   * `findPayableByNpc`. Linear scan; never persisted.
   */
  findActiveWorkByNpc: (npcId: string) => WorkContractAssignmentLookup | undefined
  /** This NPC's outstanding payable assignment (`payment_due` with a
   *  positive frozen claim), or `undefined` (plan npc-016). Expires an
   *  overdue claim first so callers never see a stale `payment_due`. */
  findPayableByNpc: (npcId: string, now: number) => WorkContractAssignmentLookup | undefined
  /** The one active (non-terminal) contract referencing `target`, or
   *  `undefined` (plan items-player-017 §17) — used to invalidate a
   *  buildable's own contract when the player removes it, since
   *  `invalidateTarget` itself takes a contract id, not a world-target id. */
  findByTarget: (target: ContractTarget) => WorkContractRecord | undefined
  /** Adds `npcId` as an assignment on `id` (plan npc-028 §10). `null` if
   *  `id` is unknown, `canAcceptContract` rejects it, or `npcId` already has
   *  a work-active assignment on any contract. */
  accept: (id: string, npcId: string, now: number) => WorkContractRecord | null
  /** Assignment `accepted` → `travelling` (plan npc-015 §6). `null` if
   *  `id` is unknown or `npcId` has no `accepted` assignment on it. */
  beginTravel: (id: string, npcId: string) => WorkContractRecord | null
  /** Assignment `travelling` → `working` (plan npc-015 §7), once this
   *  worker has reached the target. Same guards as `beginTravel`. */
  beginWork: (id: string, npcId: string, now: number) => WorkContractRecord | null
  /** Ends the work phase for every still-work-active assignment (plan
   *  npc-028 §15/§16, npc-016 §6). `null` if `id` is unknown or `npcId` is
   *  not currently work-active on it. */
  completeWork: (id: string, npcId: string, timing?: WorkContractClaimTiming) => WorkContractRecord | null
  /** Credits `workAmount` of useful work `npcId` actually got accepted by the
   *  target (plan npc-028 §8) — updates assignment `workCompleted` and
   *  aggregate `npcWorkCompleted` together. `null` if `id` is unknown or
   *  `npcId` is not currently `working`; a non-positive `workAmount` is a
   *  no-op that still returns the current record. */
  creditNpcWork: (id: string, npcId: string, workAmount: number) => WorkContractRecord | null
  /** Releases `npcId`'s work participation without touching the posting
   *  (plan npc-028 §13, npc-016 §6/§8) — genuine abandonment or death, never
   *  a temporary interruption. `false` if `id` is unknown or `npcId` is not
   *  currently work-active on it. */
  release: (id: string, npcId: string, reason?: WorkContractReleaseReason, timing?: WorkContractClaimTiming) => boolean
  /** Marks a payable assignment `paid` after a successful coin transfer
   *  (plan npc-016). `null` if the claim is no longer payable. */
  markPaid: (id: string, npcId: string) => WorkContractRecord | null
  /** Dead worker whose payable claim can no longer be collected. */
  markUncollectable: (id: string, npcId: string) => WorkContractRecord | null
  /** Stamps this assignment's payment-request throttle (plan npc-016 §17). */
  recordPaymentRequest: (id: string, npcId: string, now: number) => WorkContractRecord | null
  /** Lazy patience expiry for one NPC's payable assignment. */
  expirePayment: (id: string, npcId: string, now: number) => WorkContractRecord | null
  dispose: () => void
}

let nextWorkContractId = 0

/** A simple pole + flag marker — no dedicated notice/quest-marker asset
 *  exists yet (`docs/assets/MODELS.md` convention: procedural until one is
 *  authored). Inlined here rather than split into its own prop module like
 *  `palisadeProp.ts`/`standingTorchProp.ts`: those cache/clone loaded GLB
 *  templates, this is a handful of static primitives with nothing to share. */
function createContractFlagVisual(): THREE.Group {
  const group = new THREE.Group()
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6e4e32, flatShading: true })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 6), poleMat)
  pole.position.y = 0.8
  pole.castShadow = true
  group.add(pole)
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, flatShading: true, side: THREE.DoubleSide })
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), flagMat)
  flag.position.set(0.27, 1.35, 0)
  flag.castShadow = true
  group.add(flag)
  return group
}

/**
 * World-owned runtime system for player-issued work contracts (plan npc-014)
 * — same "player chose the spot, whole record round-trips through the save"
 * shape as `PlayerWells`/`StandingTorches`, carried through
 * `createWorldBundle()`/`rebuildWorldBundle()` like every other player-created
 * record. The flag is a pure render/world representation of `list()`'s
 * authoritative records — it is never a second source of truth and is always
 * rebuildable from `initial` on load (plan §12's ownership split).
 *
 * @domain npc
 */
export function createWorkContracts(
  scene: THREE.Scene,
  sampleHeight: HeightSampler,
  initial: readonly WorkContractRecord[] = [],
): WorkContracts {
  const records: WorkContractRecord[] = []
  const flags = new Map<string, THREE.Group>()

  const spawnFlag = (record: WorkContractRecord): void => {
    const flag = createContractFlagVisual()
    placeOnGround(flag, record.x, record.z, sampleHeight)
    scene.add(flag)
    flags.set(record.id, flag)
  }

  const removeFlag = (id: string): void => {
    const flag = flags.get(id)
    if (!flag) return
    flag.removeFromParent()
    disposeObject3D(flag)
    flags.delete(id)
  }

  for (const record of initial) {
    records.push(record)
    if (contractHasActiveTarget(record)) spawnFlag(record)
  }

  const indexOf = (id: string): number => records.findIndex((r) => r.id === id)

  const findActiveWorkByNpc = (npcId: string): WorkContractAssignmentLookup | undefined => {
    for (const contract of records) {
      if (isContractTerminal(contract.state)) continue
      const assignment = findAssignment(contract, npcId)
      if (assignment && isAssignmentWorkActive(assignment)) return { contract, assignment }
    }
    return undefined
  }

  const findPayableByNpc = (npcId: string, now: number): WorkContractAssignmentLookup | undefined => {
    for (let i = 0; i < records.length; i++) {
      const contract = records[i]!
      const assignment = findAssignment(contract, npcId)
      if (!assignment) continue
      const expired = expireWorkAssignmentPayment(contract, npcId, now)
      if (expired && expired !== contract) records[i] = expired
      const fresh = records[i]!
      const current = findAssignment(fresh, npcId)
      if (current && isAssignmentPayable(current)) return { contract: fresh, assignment: current }
    }
    return undefined
  }

  const replace = (id: string, updated: WorkContractRecord | null): WorkContractRecord | null => {
    if (!updated) return null
    const index = indexOf(id)
    if (index === -1) return null
    records[index] = updated
    return updated
  }

  return {
    list: () => records,
    nodes: () => records,
    find: (id) => records.find((r) => r.id === id),
    hasActiveContract: (target) =>
      records.some((r) => !isContractTerminal(r.state) && sameContractTarget(r.target, target)),
    create(params) {
      const alreadyActive = records.some(
        (r) => !isContractTerminal(r.state) && sameContractTarget(r.target, params.target),
      )
      if (alreadyActive) return null
      const record = createWorkContractRecord({
        id: `workContract:${Date.now()}:${nextWorkContractId++}`,
        employer: params.employer,
        target: params.target,
        x: params.x,
        z: params.z,
        rewardCoins: params.rewardCoins,
        requestedWorkShare: params.requestedWorkShare,
        remainingWorkAtCreation: params.remainingWorkAtCreation,
        requestedWorkerCount: normalizeRequestedWorkerCount(params.requestedWorkerCount ?? 1),
        now: params.now,
      })
      records.push(record)
      spawnFlag(record)
      return record
    },
    post(id, boardId, now) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, postWorkContract(records[index]!, boardId, now))
    },
    cancel(id, timing) {
      const index = indexOf(id)
      if (index === -1) return false
      const updated = cancelWorkContract(records[index]!, timing)
      if (!updated) return false
      records[index] = updated
      removeFlag(id)
      return true
    },
    invalidateTarget(id, timing) {
      const index = indexOf(id)
      if (index === -1) return false
      const updated = invalidateWorkContract(records[index]!, timing)
      if (!updated) return false
      records[index] = updated
      removeFlag(id)
      return true
    },
    postedAt: (boardId) => records.filter(
      (r) => r.postedBoardId === boardId && r.advertisement === 'posted' && !isContractTerminal(r.state),
    ),
    discoverableAt: (boardId) => records.filter((r) => r.postedBoardId === boardId && isContractDiscoverable(r)),
    findActiveWorkByNpc,
    findPayableByNpc,
    findByTarget: (target) => records.find((r) => !isContractTerminal(r.state) && sameContractTarget(r.target, target)),
    accept(id, npcId, now) {
      if (findActiveWorkByNpc(npcId)) return null
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, acceptWorkContract(records[index]!, npcId, now))
    },
    beginTravel(id, npcId) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, beginContractTravel(records[index]!, npcId))
    },
    beginWork(id, npcId, now) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, beginContractWork(records[index]!, npcId, now))
    },
    completeWork(id, npcId, timing) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, completeContractWork(records[index]!, npcId, timing))
    },
    release(id, npcId, reason = 'abandoned', timing) {
      const index = indexOf(id)
      if (index === -1) return false
      const updated = releaseWorkContract(records[index]!, npcId, reason, timing)
      if (!updated) return false
      records[index] = updated
      return true
    },
    creditNpcWork(id, npcId, workAmount) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, recordNpcWorkContribution(records[index]!, npcId, workAmount))
    },
    markPaid(id, npcId) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, markWorkAssignmentPaid(records[index]!, npcId))
    },
    markUncollectable(id, npcId) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, markWorkAssignmentUncollectable(records[index]!, npcId))
    },
    recordPaymentRequest(id, npcId, now) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, recordWorkAssignmentPaymentRequest(records[index]!, npcId, now))
    },
    expirePayment(id, npcId, now) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, expireWorkAssignmentPayment(records[index]!, npcId, now))
    },
    dispose() {
      for (const flag of flags.values()) {
        flag.removeFromParent()
        disposeObject3D(flag)
      }
      flags.clear()
      records.length = 0
    },
  }
}
