import { type Object3D, type Scene } from 'three'
import type { MaterialRequirement } from '../items/constructionMaterials'
import type { ItemCapability } from '../items/itemCatalog'
import type { HeightSampler } from '../player/PlayerController'
import {
  applyCampRepairWork,
  beginCampRepair,
  type CampRepairStartOutcome,
  hasActiveCampRepair,
} from '../items/campRepair'
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

type RepairOwnerApi<T> = {
  get: (id: string) => T | null
  startRepair: (
    id: string,
    nowDays: number,
    shelterFactor: number,
    hasCapability: (capability: ItemCapability) => boolean,
    hasMaterial: (requirement: MaterialRequirement) => boolean,
    consumeMaterial: (requirement: MaterialRequirement) => void,
  ) => CampRepairStartOutcome
  contributeRepairWork: (id: string, workAmount: number, nowDays: number) => number
}

export type SleepingUtilities = {
  bedrolls: {
    list: () => readonly BedrollEntry[]
    nodes: () => readonly BedrollRecord[]
    place: (x: number, z: number, yaw: number, worldDays: number, variant: SleepingUtilityVariant) => BedrollRecord
    /** Resolved current condition (plan §"Condition resolution"), or `null`
     *  if `id` no longer exists — same pure-read contract as
     *  `PlayerGardens.hydrationOf`. `shelterFactor` is `0..1` tent shelter
     *  (plan items-player-018) against this record's position. Active repair
     *  freezes degradation at the checkpointed condition. */
    conditionOf: (id: string, worldDays: number, shelterFactor: number) => number | null
  } & RepairOwnerApi<BedrollRecord>
  platforms: {
    list: () => readonly PlatformEntry[]
    nodes: () => readonly PlatformRecord[]
    place: (x: number, z: number, yaw: number, worldDays: number) => PlatformRecord
    conditionOf: (id: string, worldDays: number, shelterFactor: number) => number | null
  } & RepairOwnerApi<PlatformRecord>
  dispose: () => void
}

let nextBedrollId = 0
let nextPlatformId = 0

function copyRepair<T extends { repair?: BedrollRecord['repair'] }>(record: T): T {
  if (!record.repair) return record
  return {
    ...record,
    repair: {
      startedCondition: record.repair.startedCondition,
      targetCondition: record.repair.targetCondition,
      requiredWork: record.repair.requiredWork,
      completedWork: record.repair.completedWork,
    },
  }
}

/**
 * Player-built sleeping utilities (plan items-player-013) — same "player
 * chose the spot, whole record round-trips through the save" shape as
 * `PlacedTents`/`StandingTorches`. Bedroll and platform stay two independent
 * runtime collections (packing a tent must never touch either) even though
 * both live on this one `WorldBundle` field (implementation notes §2).
 *
 * Condition is lazy-resolved; repair episodes live on the world record
 * (plan items-player-019).
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

  const bedrollRecord = (entry: BedrollEntry): BedrollRecord => copyRepair({
    id: entry.id,
    x: entry.x,
    z: entry.z,
    yaw: entry.yaw,
    variant: entry.variant,
    condition: entry.condition,
    lastConditionUpdateAtDays: entry.lastConditionUpdateAtDays,
    ...(entry.repair ? { repair: entry.repair } : {}),
  })

  const platformRecord = (entry: PlatformEntry): PlatformRecord => copyRepair({
    id: entry.id,
    x: entry.x,
    z: entry.z,
    yaw: entry.yaw,
    condition: entry.condition,
    lastConditionUpdateAtDays: entry.lastConditionUpdateAtDays,
    ...(entry.repair ? { repair: entry.repair } : {}),
  })

  const resolveBedroll = (entry: BedrollEntry, worldDays: number, shelterFactor: number): number => {
    if (hasActiveCampRepair(entry)) return entry.condition
    return resolveSleepingUtilityCondition(entry, seed, worldDays, shelterFactor)
  }

  const resolvePlatform = (entry: PlatformEntry, worldDays: number, shelterFactor: number): number => {
    if (hasActiveCampRepair(entry)) return entry.condition
    return resolveSleepingUtilityCondition(entry, seed, worldDays, shelterFactor)
  }

  return {
    bedrolls: {
      list: () => bedrolls,
      nodes: () => bedrolls.map(bedrollRecord),
      get(id) {
        const entry = bedrolls.find((b) => b.id === id)
        return entry ? bedrollRecord(entry) : null
      },
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
      conditionOf(id, worldDays, shelterFactor) {
        const entry = bedrolls.find((b) => b.id === id)
        return entry ? resolveBedroll(entry, worldDays, shelterFactor) : null
      },
      startRepair(id, nowDays, shelterFactor, hasCapability, hasMaterial, consumeMaterial) {
        const entry = bedrolls.find((b) => b.id === id)
        if (!entry) return { status: 'unavailable' }
        const outcome = beginCampRepair({
          kind: 'bedroll',
          currentCondition: resolveBedroll(entry, nowDays, shelterFactor),
          nowDays,
          hasActiveRepair: hasActiveCampRepair(entry),
          hasCapability,
          hasMaterial,
          consumeMaterial,
        })
        if (outcome.status !== 'started') return outcome
        entry.condition = outcome.condition
        entry.lastConditionUpdateAtDays = outcome.lastConditionUpdateAtDays
        entry.repair = outcome.progress
        return outcome
      },
      contributeRepairWork(id, workAmount, nowDays) {
        const entry = bedrolls.find((b) => b.id === id)
        if (!entry) return 0
        const { record, acceptedWork } = applyCampRepairWork(bedrollRecord(entry), workAmount, nowDays)
        entry.condition = record.condition
        entry.lastConditionUpdateAtDays = record.lastConditionUpdateAtDays
        if (record.repair) entry.repair = record.repair
        else delete entry.repair
        return acceptedWork
      },
    },
    platforms: {
      list: () => platforms,
      nodes: () => platforms.map(platformRecord),
      get(id) {
        const entry = platforms.find((p) => p.id === id)
        return entry ? platformRecord(entry) : null
      },
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
      conditionOf(id, worldDays, shelterFactor) {
        const entry = platforms.find((p) => p.id === id)
        return entry ? resolvePlatform(entry, worldDays, shelterFactor) : null
      },
      startRepair(id, nowDays, shelterFactor, hasCapability, hasMaterial, consumeMaterial) {
        const entry = platforms.find((p) => p.id === id)
        if (!entry) return { status: 'unavailable' }
        const outcome = beginCampRepair({
          kind: 'platform',
          currentCondition: resolvePlatform(entry, nowDays, shelterFactor),
          nowDays,
          hasActiveRepair: hasActiveCampRepair(entry),
          hasCapability,
          hasMaterial,
          consumeMaterial,
        })
        if (outcome.status !== 'started') return outcome
        entry.condition = outcome.condition
        entry.lastConditionUpdateAtDays = outcome.lastConditionUpdateAtDays
        entry.repair = outcome.progress
        return outcome
      },
      contributeRepairWork(id, workAmount, nowDays) {
        const entry = platforms.find((p) => p.id === id)
        if (!entry) return 0
        const { record, acceptedWork } = applyCampRepairWork(platformRecord(entry), workAmount, nowDays)
        entry.condition = record.condition
        entry.lastConditionUpdateAtDays = record.lastConditionUpdateAtDays
        if (record.repair) entry.repair = record.repair
        else delete entry.repair
        return acceptedWork
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
