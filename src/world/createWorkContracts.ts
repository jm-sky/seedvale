import * as THREE from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import {
  cancelWorkContract,
  contractHasActiveTarget,
  createWorkContractRecord,
  invalidateWorkContract,
  isContractTerminal,
  postWorkContract,
  type WorkContractRecord,
} from './workContract'

export type WorkContracts = {
  list: () => readonly WorkContractRecord[]
  nodes: () => readonly WorkContractRecord[]
  find: (id: string) => WorkContractRecord | undefined
  /** Creates a new `available`/`not_posted` construction contract at (x, z)
   *  and spawns its target flag (plan npc-014 §4/§5) — never advertises it,
   *  never assigns anyone. */
  create: (employer: string, x: number, z: number, rewardCoins: number, now: number) => WorkContractRecord
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
  dispose: () => void
}

let nextWorkContractId = 0
let nextConstructionTargetId = 0

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
    create(employer, x, z, rewardCoins, now) {
      const record = createWorkContractRecord({
        id: `workContract:${Date.now()}:${nextWorkContractId++}`,
        employer,
        targetId: `contractTarget:${Date.now()}:${nextConstructionTargetId++}`,
        x,
        z,
        rewardCoins,
        now,
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
