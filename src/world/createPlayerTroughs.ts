import type { AnimalWaterSourceProvider } from '../fauna/animalForaging'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import { createTroughVisual, type TroughVisual } from '../settlement/settlementStructures'
import {
  clampPlayerTroughWaterLitres,
  isPlayerTroughConstructionComplete,
  PLAYER_TROUGH_REQUIRED_WORK,
  playerTroughFreeCapacity,
  type PlayerTroughRecord,
  playerTroughRemainingWork,
} from './playerTrough'
import type { Scene } from 'three'

export type PlayerTroughEntry = PlayerTroughRecord & { visual: TroughVisual }

const PLAYER_TROUGH_UNFINISHED_SCALE_MIN = 0.5

function playerTroughVisualScaleY(record: Pick<PlayerTroughRecord, 'completedWork'>): number {
  if (isPlayerTroughConstructionComplete(record)) return 1
  const fraction = Math.max(0, Math.min(1, record.completedWork / PLAYER_TROUGH_REQUIRED_WORK))
  return PLAYER_TROUGH_UNFINISHED_SCALE_MIN + (1 - PLAYER_TROUGH_UNFINISHED_SCALE_MIN) * fraction
}

function syncPlayerTroughWaterVisual(entry: PlayerTroughEntry): void {
  entry.visual.setHasWater(
    isPlayerTroughConstructionComplete(entry) && entry.waterLitres > 0,
  )
}

export type PlayerTroughs = AnimalWaterSourceProvider & {
  list: () => readonly PlayerTroughEntry[]
  nodes: () => readonly PlayerTroughRecord[]
  place: (x: number, z: number, yaw: number) => PlayerTroughRecord
  contributeWork: (id: string, workAmount: number) => { acceptedWork: number, completed: boolean } | null
  addWater: (id: string, litres: number) => number
  consumeWater: (id: string, litres: number) => boolean
  dispose: () => void
}

let nextPlayerTroughId = 0

/**
 * Player-built animal troughs (plan items-player-020) — same "player chose the
 * spot, whole record round-trips through the save" shape as
 * `StandingTorches`/`Palisades`.
 *
 * @domain items-player
 */
export function createPlayerTroughs(
  scene: Scene,
  sampleHeight: HeightSampler,
  initial: readonly PlayerTroughRecord[] = [],
): PlayerTroughs {
  const entries: PlayerTroughEntry[] = []

  const find = (id: string): PlayerTroughEntry | undefined => entries.find((entry) => entry.id === id)

  const toRecord = (entry: PlayerTroughEntry): PlayerTroughRecord => ({
    id: entry.id,
    x: entry.x,
    z: entry.z,
    yaw: entry.yaw,
    completedWork: entry.completedWork,
    waterLitres: entry.waterLitres,
  })

  const spawn = (record: PlayerTroughRecord): PlayerTroughEntry => {
    const visual = createTroughVisual()
    visual.object.rotation.y = record.yaw
    placeOnGround(visual.object, record.x, record.z, sampleHeight)
    visual.object.scale.y = playerTroughVisualScaleY(record)
    scene.add(visual.object)
    const entry: PlayerTroughEntry = { ...record, visual }
    syncPlayerTroughWaterVisual(entry)
    entries.push(entry)
    return entry
  }

  for (const record of initial) spawn(record)

  const queryAvailableNear = (x: number, z: number, radius: number) => {
    const out: { id: string, x: number, z: number }[] = []
    for (const entry of entries) {
      if (!isPlayerTroughConstructionComplete(entry) || entry.waterLitres <= 0) continue
      const d = Math.hypot(entry.x - x, entry.z - z)
      if (d <= radius) out.push({ id: entry.id, x: entry.x, z: entry.z })
    }
    return out
  }

  const isAvailable = (id: string, litres: number): boolean => {
    const entry = find(id)
    if (!entry || !isPlayerTroughConstructionComplete(entry)) return false
    return entry.waterLitres >= litres
  }

  const consumeWater = (id: string, litres: number): boolean => {
    const entry = find(id)
    if (!entry || !isPlayerTroughConstructionComplete(entry) || entry.waterLitres < litres) return false
    entry.waterLitres -= litres
    syncPlayerTroughWaterVisual(entry)
    return true
  }

  return {
    list: () => entries,
    nodes: () => entries.map(toRecord),
    place(x, z, yaw) {
      const record: PlayerTroughRecord = {
        id: `playerTrough:${Date.now()}:${nextPlayerTroughId++}`,
        x,
        z,
        yaw,
        completedWork: 0,
        waterLitres: 0,
      }
      spawn(record)
      return record
    },
    contributeWork(id, workAmount) {
      const entry = find(id)
      if (!entry) return null
      const acceptedWork = Math.max(0, Math.min(workAmount, playerTroughRemainingWork(entry)))
      if (acceptedWork > 0) {
        entry.completedWork += acceptedWork
        entry.visual.object.scale.y = playerTroughVisualScaleY(entry)
        syncPlayerTroughWaterVisual(entry)
      }
      return { acceptedWork, completed: isPlayerTroughConstructionComplete(entry) }
    },
    addWater(id, litres) {
      const entry = find(id)
      if (!entry || !isPlayerTroughConstructionComplete(entry) || litres <= 0) return 0
      const free = playerTroughFreeCapacity(entry)
      const poured = Math.min(litres, free)
      if (poured <= 0) return 0
      entry.waterLitres = clampPlayerTroughWaterLitres(entry.waterLitres + poured)
      syncPlayerTroughWaterVisual(entry)
      return poured
    },
    consumeWater,
    queryAvailableNear,
    isAvailable,
    consume: consumeWater,
    dispose() {
      for (const entry of entries) {
        entry.visual.object.removeFromParent()
        disposeObject3D(entry.visual.object)
      }
      entries.length = 0
    },
  }
}
