import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { Collider } from './collision'
import { placeOnGround } from '../settlement/props'
import { PALISADE_FOOTPRINT_RADIUS, PALISADE_HALF_LENGTH, type PalisadeSegmentRecord } from './palisade'
import { createPalisadeSegmentProp, disposePalisadeSegmentProp } from './palisadeProp'

export type PalisadeSegmentEntry = PalisadeSegmentRecord & { mesh: Object3D }

export type Palisades = {
  list: () => readonly PalisadeSegmentEntry[]
  nodes: () => readonly PalisadeSegmentRecord[]
  /** Places a new segment at `(x, z, yaw)` — the caller
   *  (`app/actions/placementActions.ts`'s `placePalisadeAtAim`) owns
   *  validation/snapping/material consumption; this only creates the record +
   *  runtime representation. */
  place: (x: number, z: number, yaw: number) => PalisadeSegmentRecord
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
    scene.add(mesh)
    registerCollider(record)
    const entry: PalisadeSegmentEntry = { ...record, mesh }
    segments.push(entry)
    return entry
  }

  for (const record of initial) spawn(record)

  return {
    list: () => segments,
    nodes: () => segments.map(({ id, x, z, yaw }) => ({ id, x, z, yaw })),
    place(x, z, yaw) {
      const record: PalisadeSegmentRecord = { id: `palisade:${Date.now()}:${nextPalisadeId++}`, x, z, yaw }
      spawn(record)
      return record
    },
    remove(id) {
      const index = segments.findIndex((entry) => entry.id === id)
      if (index === -1) return null
      const [entry] = segments.splice(index, 1)
      if (!entry) return null
      disposePalisadeSegmentProp(entry.mesh)
      clearColliders(colliderKey(entry.id))
      return { id: entry.id, x: entry.x, z: entry.z, yaw: entry.yaw }
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
