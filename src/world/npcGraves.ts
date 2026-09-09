import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import { createGraveStone, placeOnGround } from '../settlement/props'

/**
 * NPC burial graves (plan npc-011) — persistent world objects for completed
 * burials, same "plain record + runtime collection + SaveData field" shape as
 * `createPlacedTraps` / `PlacedFires`.
 *
 * @domain npc
 * @role Persistent completed burial world result.
 * @owns NpcGraveRecord
 */

export type NpcGraveRecord = {
  id: string
  x: number
  z: number
  yaw: number
  deceasedNpcId: string
  buriedAtDays: number
}

export type SaveGrave = NpcGraveRecord

export function graveIdForDeceased(deceasedNpcId: string): string {
  return `grave:${deceasedNpcId}`
}

export type NpcGraves = {
  nodes: () => readonly NpcGraveRecord[]
  get: (id: string) => NpcGraveRecord | null
  hasForDeceased: (deceasedNpcId: string) => boolean
  /** Idempotent add — returns false when the grave already exists. */
  ensure: (record: NpcGraveRecord) => boolean
  dispose: () => void
}

type GraveEntry = NpcGraveRecord & { mesh: Object3D }

export function createNpcGraves(
  scene: Scene,
  sampleHeight: HeightSampler,
  initial: readonly NpcGraveRecord[] = [],
): NpcGraves {
  const graves: GraveEntry[] = []
  const byId = new Map<string, GraveEntry>()
  const byDeceased = new Map<string, GraveEntry>()

  const spawn = (record: NpcGraveRecord): GraveEntry => {
    const mesh = createGraveStone(1)
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    scene.add(mesh)
    const entry: GraveEntry = { ...record, mesh }
    graves.push(entry)
    byId.set(record.id, entry)
    byDeceased.set(record.deceasedNpcId, entry)
    return entry
  }

  for (const record of initial) spawn(record)

  return {
    nodes: () => graves.map(({ id, x, z, yaw, deceasedNpcId, buriedAtDays }) => ({
      id, x, z, yaw, deceasedNpcId, buriedAtDays,
    })),
    get: (id) => {
      const entry = byId.get(id)
      return entry ? { id: entry.id, x: entry.x, z: entry.z, yaw: entry.yaw, deceasedNpcId: entry.deceasedNpcId, buriedAtDays: entry.buriedAtDays } : null
    },
    hasForDeceased: (deceasedNpcId) => byDeceased.has(deceasedNpcId),
    ensure(record) {
      if (byId.has(record.id) || byDeceased.has(record.deceasedNpcId)) return false
      spawn(record)
      return true
    },
    dispose() {
      for (const entry of graves) {
        entry.mesh.removeFromParent()
        disposeObject3D(entry.mesh)
      }
      graves.length = 0
      byId.clear()
      byDeceased.clear()
    },
  }
}

/** Atomic corpse terminal transition + grave ensure (plan npc-011). */
export function ensureNpcBurialGrave(opts: {
  graves: NpcGraves
  deceasedNpcId: string
  x: number
  z: number
  yaw: number
  buriedAtDays: number
}): boolean {
  return opts.graves.ensure({
    id: graveIdForDeceased(opts.deceasedNpcId),
    x: opts.x,
    z: opts.z,
    yaw: opts.yaw,
    deceasedNpcId: opts.deceasedNpcId,
    buriedAtDays: opts.buriedAtDays,
  })
}
