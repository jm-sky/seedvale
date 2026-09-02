import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { placeOnGround } from '../settlement/props'
import {
  type BedrollRecord,
  type PlatformRecord,
  resolveSleepingUtilityCondition,
  type SleepingUtilityVariant,
} from './sleepingUtilities'
import { createBedrollProp, createPlatformProp, disposeSleepingUtilityProp } from './sleepingUtilityProp'

export type BedrollEntry = BedrollRecord & { mesh: Object3D }
export type PlatformEntry = PlatformRecord & { mesh: Object3D }

export type SleepingUtilities = {
  bedrolls: {
    list: () => readonly BedrollEntry[]
    nodes: () => readonly BedrollRecord[]
    place: (x: number, z: number, yaw: number, worldDays: number, variant: SleepingUtilityVariant) => BedrollRecord
    /** Resolved current condition (plan §"Condition resolution"), or `null`
     *  if `id` no longer exists — same pure-read contract as
     *  `PlayerGardens.hydrationOf`. `sheltered` is the caller's own
     *  `hasTentNear` read against this record's position. */
    conditionOf: (id: string, worldDays: number, sheltered: boolean) => number | null
  }
  platforms: {
    list: () => readonly PlatformEntry[]
    nodes: () => readonly PlatformRecord[]
    place: (x: number, z: number, yaw: number, worldDays: number) => PlatformRecord
    conditionOf: (id: string, worldDays: number, sheltered: boolean) => number | null
  }
  dispose: () => void
}

let nextBedrollId = 0
let nextPlatformId = 0

/**
 * Player-built sleeping utilities (plan items-player-013) — same "player
 * chose the spot, whole record round-trips through the save" shape as
 * `PlacedTents`/`StandingTorches`. Bedroll and platform stay two independent
 * runtime collections (packing a tent must never touch either) even though
 * both live on this one `WorldBundle` field (implementation notes §2).
 *
 * Condition is never resolved or mutated here — this is pure spawn/place/
 * dispose plumbing; `world/sleepingUtilities.ts`'s `resolveSleepingUtilityCondition`
 * is called directly by whichever reader needs current condition (camp rest,
 * a future interaction), passing the record from `list()`/`nodes()`.
 *
 * @domain items-player
 */
export function createSleepingUtilities(
  scene: Scene,
  sampleHeight: HeightSampler,
  initialBedrolls: readonly BedrollRecord[] = [],
  initialPlatforms: readonly PlatformRecord[] = [],
  seed = 0,
): SleepingUtilities {
  const bedrolls: BedrollEntry[] = []
  const platforms: PlatformEntry[] = []

  const spawnBedroll = (record: BedrollRecord): BedrollEntry => {
    const mesh = createBedrollProp()
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    scene.add(mesh)
    const entry: BedrollEntry = { ...record, mesh }
    bedrolls.push(entry)
    return entry
  }

  const spawnPlatform = (record: PlatformRecord): PlatformEntry => {
    const mesh = createPlatformProp()
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    scene.add(mesh)
    const entry: PlatformEntry = { ...record, mesh }
    platforms.push(entry)
    return entry
  }

  for (const record of initialBedrolls) spawnBedroll(record)
  for (const record of initialPlatforms) spawnPlatform(record)

  return {
    bedrolls: {
      list: () => bedrolls,
      nodes: () => bedrolls.map(({ id, x, z, yaw, variant, condition, lastConditionUpdateAtDays }) => (
        { id, x, z, yaw, variant, condition, lastConditionUpdateAtDays }
      )),
      place(x, z, yaw, placedAtDays, variant) {
        const record: BedrollRecord = {
          id: `bedroll:${Date.now()}:${nextBedrollId++}`,
          x,
          z,
          yaw,
          variant,
          condition: 100,
          lastConditionUpdateAtDays: placedAtDays,
        }
        spawnBedroll(record)
        return record
      },
      conditionOf(id, worldDays, sheltered) {
        const entry = bedrolls.find((b) => b.id === id)
        return entry ? resolveSleepingUtilityCondition(entry, seed, worldDays, sheltered) : null
      },
    },
    platforms: {
      list: () => platforms,
      nodes: () => platforms.map(({ id, x, z, yaw, condition, lastConditionUpdateAtDays }) => (
        { id, x, z, yaw, condition, lastConditionUpdateAtDays }
      )),
      place(x, z, yaw, placedAtDays) {
        const record: PlatformRecord = {
          id: `platform:${Date.now()}:${nextPlatformId++}`,
          x,
          z,
          yaw,
          condition: 100,
          lastConditionUpdateAtDays: placedAtDays,
        }
        spawnPlatform(record)
        return record
      },
      conditionOf(id, worldDays, sheltered) {
        const entry = platforms.find((p) => p.id === id)
        return entry ? resolveSleepingUtilityCondition(entry, seed, worldDays, sheltered) : null
      },
    },
    dispose() {
      for (const entry of bedrolls) disposeSleepingUtilityProp(entry.mesh)
      for (const entry of platforms) disposeSleepingUtilityProp(entry.mesh)
      bedrolls.length = 0
      platforms.length = 0
    },
  }
}
