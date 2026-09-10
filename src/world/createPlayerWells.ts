import { type Object3D, type Scene } from 'three'
import type { MaterialRequirement } from '../items/constructionMaterials'
import type { HeightSampler } from '../player/PlayerController'
import type { Collider } from './collision'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import {
  applyWellRoofConditionDelta,
  applyWellRoofRepairWork,
  beginWellRoofRepair,
  initializeWellRoofCondition,
  isWellWaterAvailable,
  type NearbyPlayerWellLookup,
  type PlayerWellRecord,
  WELL_FOOTPRINT_RADIUS,
  type WellRoofRepairStartOutcome,
  type WellStage,
} from './playerWell'
import { createPlayerWellStageProp } from './playerWellProp'
import { resolveWellWater } from './wellGroundwater'

export type PlayerWellEntry = PlayerWellRecord & { mesh: Object3D }

export type PlayerWells = {
  list: () => readonly PlayerWellEntry[]
  nodes: () => readonly PlayerWellRecord[]
  /** Places a new well at `(x, z)` in the `pit` stage with no work done yet —
   *  the plan's "[E] Wykop dół" starts as soon as the player works it
   *  (implementation notes §11: same ownership pattern as `PlacedTents`).
   *  Resolves and persists this well's `waterDepth`/`waterKind` right here,
   *  exactly once (plan world-004 §1/§11/§12) via `resolveWellWater`. */
  place: (x: number, z: number, yaw: number) => PlayerWellRecord
  /** Adds `hoursDelta` (clamped ≥ 0) of active-work progress to `id`'s
   *  current stage. Pure bookkeeping only — never changes `stage`, the mesh
   *  or the collider. When this credit first completes the roof, initializes
   *  roof condition at 100 with `nowDays` as the weather/time anchor (plan
   *  world-020). False if the well is unknown. */
  addWork: (id: string, hoursDelta: number, nowDays: number) => boolean
  /** Transitions `id` into `nextStage`: resets `workProgress` to 0, swaps the
   *  stage-visual mesh and re-registers the collider (idempotent by id — the
   *  caller must already have validated/consumed `nextStage`'s tool/material
   *  cost). False if the well is unknown. */
  transitionTo: (id: string, nextStage: WellStage) => boolean
  /**
   * Checkpoint-then-mutate roof condition at `nowDays` (plan world-020 /
   * world-021). Resolves lazy wear first so elapsed weather is neither lost
   * nor double-counted. False if the well is unknown or has no roof yet.
   */
  applyRoofConditionDelta: (id: string, seed: number, nowDays: number, delta: number) => boolean
  /**
   * Start a roof-repair episode on the live well (plan world-021). Relookups
   * by id, derives a fresh quote, consumes materials only after every
   * requirement is available, then checkpoints condition and stores
   * `RepairProgress`. Does not checkpoint on a failed material preflight.
   */
  startRoofRepair: (
    id: string,
    nowDays: number,
    hasMaterial: (requirement: MaterialRequirement) => boolean,
    consumeMaterial: (requirement: MaterialRequirement) => void,
    targetCondition?: number,
  ) => WellRoofRepairStartOutcome
  /**
   * Actor-neutral roof-repair contribution (plan world-021). Returns the
   * exact `acceptedWork`. Completion restores target condition, clears the
   * episode, and resets the condition anchor.
   */
  contributeRoofRepairWork: (id: string, workAmount: number, nowDays: number) => number
  /** Nearest well within `maxDistance` that's already usable as a
   *  `WaterSource` (`isWellWaterAvailable` — plan world-004 §5/§10, the roof
   *  need not be finished), or null — the `NearbyPlayerWellLookup`
   *  `NpcAgent` uses for water-fetch destination resolution (plan 127 §10). */
  nearestCompleted: NearbyPlayerWellLookup
  remove: (id: string) => PlayerWellRecord | null
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
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void,
  clearColliders: (ownerKey: string) => void,
  initial: readonly PlayerWellRecord[] = [],
  /** World seed + local sea level (plan world-004 §1) — fed into
   *  `resolveWellWater` only by `place()`, exactly once per new well; a
   *  restored `initial` record's `waterDepth`/`waterKind` are never
   *  recomputed (plan §11/§12). */
  seed = 0,
  waterLevel = 0,
): PlayerWells {
  const wells: PlayerWellEntry[] = []

  const registerCollider = (record: PlayerWellRecord): void => {
    registerColliders(colliderKey(record.id), [{ type: 'circle', x: record.x, z: record.z, radius: WELL_FOOTPRINT_RADIUS }])
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
    workProgress: entry.workProgress,
    waterDepth: entry.waterDepth,
    waterKind: entry.waterKind,
    ...(entry.roofCondition !== undefined && entry.lastRoofConditionUpdateAtDays !== undefined
      ? {
          roofCondition: entry.roofCondition,
          lastRoofConditionUpdateAtDays: entry.lastRoofConditionUpdateAtDays,
        }
      : {}),
    ...(entry.roofRepair
      ? {
          roofRepair: {
            startedCondition: entry.roofRepair.startedCondition,
            targetCondition: entry.roofRepair.targetCondition,
            requiredWork: entry.roofRepair.requiredWork,
            completedWork: entry.roofRepair.completedWork,
          },
        }
      : {}),
  })

  return {
    list: () => wells,
    nodes: () => wells.map(toRecord),
    place(x, z, yaw) {
      const water = resolveWellWater(seed, x, z, sampleHeight(x, z), waterLevel)
      const record: PlayerWellRecord = {
        id: `well:${Date.now()}:${nextWellId++}`,
        x,
        z,
        yaw,
        stage: 'pit',
        workProgress: 0,
        waterDepth: water.depth,
        waterKind: water.kind,
      }
      spawn(record)
      return record
    },
    addWork(id, hoursDelta, nowDays) {
      const entry = find(id)
      if (!entry) return false
      entry.workProgress = Math.max(0, entry.workProgress + hoursDelta)
      initializeWellRoofCondition(entry, nowDays)
      return true
    },
    transitionTo(id, nextStage) {
      const entry = find(id)
      if (!entry) return false
      disposeObject3D(entry.mesh)
      entry.mesh.removeFromParent()
      const newMesh = createPlayerWellStageProp(nextStage)
      newMesh.rotation.y = entry.yaw
      placeOnGround(newMesh, entry.x, entry.z, sampleHeight)
      scene.add(newMesh)
      entry.mesh = newMesh
      entry.stage = nextStage
      entry.workProgress = 0
      // Idempotent by id — replaces, never appends (implementation notes §16).
      registerCollider(entry)
      return true
    },
    applyRoofConditionDelta(id, seed, nowDays, delta) {
      const entry = find(id)
      if (!entry) return false
      const next = applyWellRoofConditionDelta(entry, seed, nowDays, delta)
      if (next === entry) return false
      entry.roofCondition = next.roofCondition
      entry.lastRoofConditionUpdateAtDays = next.lastRoofConditionUpdateAtDays
      return true
    },
    startRoofRepair(id, nowDays, hasMaterial, consumeMaterial, targetCondition) {
      const entry = find(id)
      if (!entry) return { status: 'unavailable' }
      const outcome = beginWellRoofRepair({
        record: entry,
        seed,
        nowDays,
        targetCondition,
        hasMaterial,
        consumeMaterial,
      })
      if (outcome.status !== 'started') return outcome
      entry.roofCondition = outcome.roofCondition
      entry.lastRoofConditionUpdateAtDays = outcome.lastRoofConditionUpdateAtDays
      entry.roofRepair = outcome.progress
      return outcome
    },
    contributeRoofRepairWork(id, workAmount, nowDays) {
      const entry = find(id)
      if (!entry) return 0
      const { record, acceptedWork } = applyWellRoofRepairWork(entry, workAmount, nowDays)
      entry.roofCondition = record.roofCondition
      entry.lastRoofConditionUpdateAtDays = record.lastRoofConditionUpdateAtDays
      if (record.roofRepair) entry.roofRepair = record.roofRepair
      else delete entry.roofRepair
      return acceptedWork
    },
    nearestCompleted(x, z, maxDistance) {
      let best: PlayerWellEntry | null = null
      let bestDistSq = maxDistance * maxDistance
      for (const entry of wells) {
        if (!isWellWaterAvailable(entry)) continue
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
    remove(id) {
      const index = wells.findIndex((entry) => entry.id === id)
      if (index === -1) return null
      const [entry] = wells.splice(index, 1)
      if (!entry) return null
      disposeObject3D(entry.mesh)
      entry.mesh.removeFromParent()
      clearColliders(colliderKey(entry.id))
      return toRecord(entry)
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
