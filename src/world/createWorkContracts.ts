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
  invalidateWorkContract,
  isContractTerminal,
  postWorkContract,
  recordNpcWorkContribution,
  releaseWorkContract,
  sameContractTarget,
  type WorkContractRecord,
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
  now: number
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
  cancel: (id: string) => boolean
  /** Marks `id`'s target invalid and removes its flag — same no-op contract
   *  as `cancel` (plan §10). */
  invalidateTarget: (id: string) => boolean
  /** Contracts currently posted at `boardId` (plan §9) — the board's own
   *  "what's here" view, resolved by querying contracts rather than a
   *  duplicated list kept on the board. */
  postedAt: (boardId: string) => readonly WorkContractRecord[]
  /** Still-open contracts posted at `boardId` — `postedAt` narrowed to
   *  `advertised` (plan npc-015 §2: "not posted → not discoverable, posted →
   *  potentially discoverable"). This is what an NPC's decision code queries
   *  for new candidates; an already-`accepted`/`travelling`/`working`
   *  contract stays posted but is no longer offered to anyone else. */
  discoverableAt: (boardId: string) => readonly WorkContractRecord[]
  /** The one active (non-terminal) contract `npcId` is currently committed
   *  to, or `undefined` — the hot `npcId → contract` lookup implementation
   *  notes call for ("Recommended contract ownership"). Rebuilt from
   *  `records` on every call; never persisted itself. */
  findByWorker: (npcId: string) => WorkContractRecord | undefined
  /** The one active (non-terminal) contract referencing `target`, or
   *  `undefined` (plan items-player-017 §17) — used to invalidate a
   *  buildable's own contract when the player removes it, since
   *  `invalidateTarget` itself takes a contract id, not a world-target id. */
  findByTarget: (target: ContractTarget) => WorkContractRecord | undefined
  /** Assigns `npcId` to `id` (plan §5) — `advertised` → `accepted`. `null`
   *  if `id` is unknown or `canAcceptContract` rejects it (already taken,
   *  not currently offered, ...). */
  accept: (id: string, npcId: string, now: number) => WorkContractRecord | null
  /** `accepted` → `travelling` (plan §6). `null` if `id` is unknown, not
   *  `accepted`, or `npcId` isn't its assigned worker. */
  beginTravel: (id: string, npcId: string) => WorkContractRecord | null
  /** `travelling` → `working` (plan §7), once the worker has reached the
   *  target. Same guards as `beginTravel`. */
  beginWork: (id: string, npcId: string, now: number) => WorkContractRecord | null
  /** `working` → `payment_due` (plan §7/§11). Same guards as `beginTravel`. */
  completeWork: (id: string, npcId: string) => WorkContractRecord | null
  /** Credits `workAmount` of useful work `npcId` actually got accepted by the
   *  target (plan §6/§17) — the only mutation of `npcWorkCompleted`. `null`
   *  if `id` is unknown, not currently `working`, or `npcId` isn't its
   *  assigned worker; a non-positive `workAmount` is a no-op that still
   *  returns the current record. */
  creditNpcWork: (id: string, npcId: string, workAmount: number) => WorkContractRecord | null
  /** Releases `npcId`'s commitment back to `advertised` without touching the
   *  posting (plan §10/§12) — genuine abandonment (the worker died, or can
   *  no longer fulfil it), never a temporary interruption. `false` if `id`
   *  is unknown, not currently assigned to `npcId`, or already terminal. */
  release: (id: string, npcId: string) => boolean
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
        now: params.now,
      })
      records.push(record)
      spawnFlag(record)
      return record
    },
    post(id, boardId, now) {
      const index = indexOf(id)
      if (index === -1) return null
      const updated = postWorkContract(records[index]!, boardId, now)
      if (!updated) return null
      records[index] = updated
      return updated
    },
    cancel(id) {
      const index = indexOf(id)
      if (index === -1) return false
      const updated = cancelWorkContract(records[index]!)
      if (!updated) return false
      records[index] = updated
      removeFlag(id)
      return true
    },
    invalidateTarget(id) {
      const index = indexOf(id)
      if (index === -1) return false
      const updated = invalidateWorkContract(records[index]!)
      if (!updated) return false
      records[index] = updated
      removeFlag(id)
      return true
    },
    postedAt: (boardId) => records.filter(
      (r) => r.postedBoardId === boardId && r.advertisement === 'posted' && !isContractTerminal(r.state),
    ),
    discoverableAt: (boardId) => records.filter((r) => r.postedBoardId === boardId && r.state === 'advertised'),
    findByWorker: (npcId) => records.find((r) => r.workerNpcId === npcId && !isContractTerminal(r.state)),
    findByTarget: (target) => records.find((r) => !isContractTerminal(r.state) && sameContractTarget(r.target, target)),
    accept(id, npcId, now) {
      const index = indexOf(id)
      if (index === -1) return null
      const updated = acceptWorkContract(records[index]!, npcId, now)
      if (!updated) return null
      records[index] = updated
      return updated
    },
    beginTravel(id, npcId) {
      const index = indexOf(id)
      if (index === -1) return null
      const updated = beginContractTravel(records[index]!, npcId)
      if (!updated) return null
      records[index] = updated
      return updated
    },
    beginWork(id, npcId, now) {
      const index = indexOf(id)
      if (index === -1) return null
      const updated = beginContractWork(records[index]!, npcId, now)
      if (!updated) return null
      records[index] = updated
      return updated
    },
    completeWork(id, npcId) {
      const index = indexOf(id)
      if (index === -1) return null
      const updated = completeContractWork(records[index]!, npcId)
      if (!updated) return null
      records[index] = updated
      return updated
    },
    release(id, npcId) {
      const index = indexOf(id)
      if (index === -1) return false
      const updated = releaseWorkContract(records[index]!, npcId)
      if (!updated) return false
      records[index] = updated
      return true
    },
    creditNpcWork(id, npcId, workAmount) {
      const index = indexOf(id)
      if (index === -1) return null
      const record = records[index]!
      if (record.state !== 'working' || record.workerNpcId !== npcId) return null
      const updated = recordNpcWorkContribution(record, workAmount)
      records[index] = updated
      return updated
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
