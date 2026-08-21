import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { Collider } from './collision'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import {
  isWellCompleted,
  type NearbyPlayerWellLookup,
  nextWellStage,
  type PlayerWellRecord,
  WELL_FOOTPRINT_RADIUS,
} from './playerWell'
import { createPlayerWellStageProp } from './playerWellProp'

export type PlayerWellEntry = PlayerWellRecord & { mesh: Object3D }

export type PlayerWells = {
  list: () => readonly PlayerWellEntry[]
  nodes: () => readonly PlayerWellRecord[]
  /** Places a new well at `(x, z)`, starting the `pit` stage's world-time
   *  clock right away — the plan's "[E] Wykop dół" is this placement action
   *  (implementation notes §11: same ownership pattern as `PlacedTents`). */
  place: (x: number, z: number, yaw: number, nowDays: number) => PlayerWellRecord
  /** Advances `id` into its next stage, restarting the stage clock. False if
   *  the well is unknown or already fully built (`roof`, nothing further). */
  advanceStage: (id: string, nowDays: number) => boolean
  /** Nearest *completed* well to `(x, z)` within `maxDistance`, or null — the
   *  `NearbyPlayerWellLookup` `NpcAgent` uses for water-fetch destination
   *  resolution (plan 127 §10). */
  nearestCompleted: NearbyPlayerWellLookup
  dispose: () => void
}

const colliderKey = (id: string): string => `playerWell:${id}`

let nextWellId = 0

/**
 * Player-built wells (plan 127) — same "player chose the spot, whole record
 * round-trips through the save" shape as `PlacedTents`/`PlacedTraps`. A well
 * is a plain world object: no reference to `PlayerController`, no manager.
 * Registers a collider through the shared `ColliderRegistry` (same mechanism
 * settlement wells/houses use) so NPC pathing routes around it without any
 * well-specific avoidance logic.
 */
export function createPlayerWells(
  scene: Scene,
  sampleHeight: HeightSampler,
  getWorldDays: () => number,
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void,
  clearColliders: (ownerKey: string) => void,
  initial: readonly PlayerWellRecord[] = [],
): PlayerWells {
  const wells: PlayerWellEntry[] = []

  const registerCollider = (record: PlayerWellRecord): void => {
    registerColliders(colliderKey(record.id), [{ x: record.x, z: record.z, radius: WELL_FOOTPRINT_RADIUS }])
  }

  const spawn = (record: PlayerWellRecord): PlayerWellEntry => {
    const mesh = createPlayerWellStageProp(record.stage)
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    scene.add(mesh)
    registerCollider(record)
    const entry: PlayerWellEntry = { ...record, mesh }
    wells.push(entry)
    return entry
  }

  for (const record of initial) spawn(record)

  const find = (id: string): PlayerWellEntry | undefined => wells.find((entry) => entry.id === id)

  const toRecord = (entry: PlayerWellEntry): PlayerWellRecord => ({
    id: entry.id,
    x: entry.x,
    z: entry.z,
    yaw: entry.yaw,
    stage: entry.stage,
    stageStartedAt: entry.stageStartedAt,
  })

  return {
    list: () => wells,
    nodes: () => wells.map(toRecord),
    place(x, z, yaw, nowDays) {
      const record: PlayerWellRecord = {
        id: `well:${Date.now()}:${nextWellId++}`,
        x,
        z,
        yaw,
        stage: 'pit',
        stageStartedAt: nowDays,
      }
      spawn(record)
      return record
    },
    advanceStage(id, nowDays) {
      const entry = find(id)
      if (!entry) return false
      const next = nextWellStage(entry)
      if (!next) return false
      disposeObject3D(entry.mesh)
      entry.mesh.removeFromParent()
      const newMesh = createPlayerWellStageProp(next)
      newMesh.rotation.y = entry.yaw
      placeOnGround(newMesh, entry.x, entry.z, sampleHeight)
      scene.add(newMesh)
      entry.mesh = newMesh
      entry.stage = next
      entry.stageStartedAt = nowDays
      // Idempotent by id — replaces, never appends (implementation notes §16).
      registerCollider(entry)
      return true
    },
    nearestCompleted(x, z, maxDistance) {
      const nowDays = getWorldDays()
      let best: PlayerWellEntry | null = null
      let bestDistSq = maxDistance * maxDistance
      for (const entry of wells) {
        if (!isWellCompleted(entry, nowDays)) continue
        const dx = entry.x - x
        const dz = entry.z - z
        const distSq = dx * dx + dz * dz
        if (distSq > bestDistSq) continue
        best = entry
        bestDistSq = distSq
      }
      if (!best) return null
      return { x: best.x, y: sampleHeight(best.x, best.z), z: best.z }
    },
    dispose() {
      for (const entry of wells) {
        disposeObject3D(entry.mesh)
        entry.mesh.removeFromParent()
        clearColliders(colliderKey(entry.id))
      }
      wells.length = 0
    },
  }
}
