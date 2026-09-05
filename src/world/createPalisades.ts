import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { Collider } from './collision'
import { placeOnGround } from '../settlement/props'
import {
  isPalisadeConstructionComplete,
  PALISADE_FOOTPRINT_RADIUS,
  PALISADE_HALF_LENGTH,
  PALISADE_REQUIRED_WORK,
  palisadeRemainingWork,
  type PalisadeSegmentRecord,
} from './palisade'
import { createPalisadeSegmentProp, disposePalisadeSegmentProp } from './palisadeProp'

/** Cheap discrete unfinished-height fraction derived from progress (plan
 *  items-player-017 §14) — a growing fence panel, one `Object3D.scale.y` set
 *  only when work is applied or completion changes, never per frame. Starts
 *  visibly shorter than complete so an unfinished segment reads as "in
 *  progress" even at 0 work. */
const PALISADE_UNFINISHED_SCALE_MIN = 0.35

function palisadeVisualScaleY(record: Pick<PalisadeSegmentRecord, 'completedWork'>): number {
  if (isPalisadeConstructionComplete(record)) return 1
  const fraction = Math.max(0, Math.min(1, record.completedWork / PALISADE_REQUIRED_WORK))
  return PALISADE_UNFINISHED_SCALE_MIN + (1 - PALISADE_UNFINISHED_SCALE_MIN) * fraction
}

export type PalisadeSegmentEntry = PalisadeSegmentRecord & { mesh: Object3D }

export type Palisades = {
  list: () => readonly PalisadeSegmentEntry[]
  nodes: () => readonly PalisadeSegmentRecord[]
  /** Places a new, unfinished segment at `(x, z, yaw)` (plan items-player-017
   *  §6) — the caller (`app/actions/placementActions.ts`'s
   *  `placePalisadeAtAim`) owns validation/snapping/material consumption;
   *  this only creates the record + runtime representation. `completedWork`
   *  starts at 0; the segment's own footprint/snapping still reserve its
   *  position (plan §10) but its collider is not registered until
   *  construction completes (see `contributeWork`). */
  place: (x: number, z: number, yaw: number) => PalisadeSegmentRecord
  /** Actor-neutral construction work contribution (plan items-player-017
   *  §16) — same shape as `TerrainPreparations.contributeWork`: clamps
   *  `workAmount` to the segment's actual remaining work, applies it, and
   *  reports what was actually accepted plus whether this call completed it.
   *  `null` if `id` is unknown. Registers the segment's collider and snaps
   *  its visual to full height exactly once, the instant this call finishes
   *  construction. */
  contributeWork: (id: string, workAmount: number) => { acceptedWork: number, completed: boolean } | null
  /** Removes `id`'s authoritative record, runtime mesh and collider —
   *  returns the removed record, or `null` if `id` is unknown. Removing one
   *  segment never touches any other (plan §8/§21: no rebuild of the
   *  remaining chain). */
  remove: (id: string) => PalisadeSegmentRecord | null
  dispose: () => void
}

const colliderKey = (id: string): string => `palisade:${id}`

let nextPalisadeId = 0

/**
 * Player-built palisade segments (plan items-player-010) — same "player
 * chose the spot, whole record round-trips through the save" shape as
 * `PlacedTents`/`PlayerWells`. Each segment is its own independent runtime
 * entry: there is no `PalisadeManager` and no per-frame update over the
 * list (placed segments are static once built — see the plan's Performance
 * section). Registers an oriented-box collider per segment through the
 * shared `ColliderRegistry` (same mechanism player wells/gardens use) so NPC
 * pathing routes around a fence line without palisade-specific avoidance
 * logic.
 *
 * @domain items-player
 */
export function createPalisades(
  scene: Scene,
  sampleHeight: HeightSampler,
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void,
  clearColliders: (ownerKey: string) => void,
  initial: readonly PalisadeSegmentRecord[] = [],
): Palisades {
  const segments: PalisadeSegmentEntry[] = []

  const registerCollider = (record: PalisadeSegmentRecord): void => {
    registerColliders(colliderKey(record.id), [{
      type: 'obb',
      x: record.x,
      z: record.z,
      halfWidth: PALISADE_FOOTPRINT_RADIUS,
      halfDepth: PALISADE_HALF_LENGTH,
      rotationY: record.yaw,
    }])
  }

  const spawn = (record: PalisadeSegmentRecord): PalisadeSegmentEntry => {
    const mesh = createPalisadeSegmentProp()
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    mesh.scale.y = palisadeVisualScaleY(record)
    scene.add(mesh)
    // Functional-state gate (plan items-player-017 §12/§13): an unfinished
    // segment reserves its footprint for placement/snapping (`nodes()` below
    // still lists it) but must not act as a completed barrier for NPC
    // pathing/collision until construction finishes.
    if (isPalisadeConstructionComplete(record)) registerCollider(record)
    const entry: PalisadeSegmentEntry = { ...record, mesh }
    segments.push(entry)
    return entry
  }

  for (const record of initial) spawn(record)

  const toRecord = (entry: PalisadeSegmentEntry): PalisadeSegmentRecord => ({
    id: entry.id,
    x: entry.x,
    z: entry.z,
    yaw: entry.yaw,
    completedWork: entry.completedWork,
  })

  return {
    list: () => segments,
    nodes: () => segments.map(toRecord),
    place(x, z, yaw) {
      const record: PalisadeSegmentRecord = { id: `palisade:${Date.now()}:${nextPalisadeId++}`, x, z, yaw, completedWork: 0 }
      spawn(record)
      return record
    },
    contributeWork(id, workAmount) {
      const entry = segments.find((e) => e.id === id)
      if (!entry) return null
      const wasComplete = isPalisadeConstructionComplete(entry)
      const remaining = palisadeRemainingWork(entry)
      const acceptedWork = Math.max(0, Math.min(workAmount, remaining))
      if (acceptedWork > 0) {
        entry.completedWork += acceptedWork
        entry.mesh.scale.y = palisadeVisualScaleY(entry)
        if (!wasComplete && isPalisadeConstructionComplete(entry)) registerCollider(entry)
      }
      return { acceptedWork, completed: isPalisadeConstructionComplete(entry) }
    },
    remove(id) {
      const index = segments.findIndex((entry) => entry.id === id)
      if (index === -1) return null
      const [entry] = segments.splice(index, 1)
      if (!entry) return null
      disposePalisadeSegmentProp(entry.mesh)
      clearColliders(colliderKey(entry.id))
      return toRecord(entry)
    },
    dispose() {
      for (const entry of segments) {
        disposePalisadeSegmentProp(entry.mesh)
        clearColliders(colliderKey(entry.id))
      }
      segments.length = 0
    },
  }
}
