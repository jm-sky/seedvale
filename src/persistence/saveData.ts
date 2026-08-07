import type { WorldConfig } from '../config/worldConfig'
import type { ItemKind } from '../items/items'
import type { QuestState } from '../quests/quests'

/** Same shape as `StoredConfig` in `config/persistConfig.ts` — kept independent
 *  here so this module doesn't reach into config internals. */
export type SaveConfig = {
  seed: number
  terrain: WorldConfig['terrain']
  sky: WorldConfig['sky']
  player: WorldConfig['player']
}

export type SavePlayer = { x: number, z: number, yaw: number, pitch: number }

export type QuestProgressEntry = { id: string, state: QuestState, stageIndex: number }

export type SaveQuests = {
  progress: QuestProgressEntry[]
  exp: number
  relations: Record<string, number>
}

export type SaveDroppedItem = { id: string, kind: ItemKind, x: number, z: number }

export type SaveDataV1 = {
  version: 1
  config: SaveConfig
  player: SavePlayer
  savedAt: number
}

export type SaveDataV2 = {
  version: 2
  config: SaveConfig
  player: SavePlayer
  savedAt: number
  quests: SaveQuests
  inventory: Partial<Record<ItemKind, number>>
  /** Ids of world-generated items (`terrain/chunkItems.ts`) already picked up —
   *  see `ChunkManagerConfig.collectedItemIds`. */
  collectedItemIds: string[]
}

/** Canonical save shape used everywhere outside this module and `saveDb.ts` —
 *  always v3. `loadSaveData` migrates a stored v1/v2 save up to this on read. */
export type SaveData = {
  version: 3
  config: SaveConfig
  player: SavePlayer
  savedAt: number
  quests: SaveQuests
  inventory: Partial<Record<ItemKind, number>>
  collectedItemIds: string[]
  /** Player-dropped item instances — unlike `collectedItemIds`, these aren't
   *  derivable from the seed, so the full position+kind record round-trips. */
  droppedItems: SaveDroppedItem[]
}

function isSaveConfig(value: unknown): value is SaveConfig {
  if (!value || typeof value !== 'object') return false
  const config = value as Record<string, unknown>
  if (typeof config.seed !== 'number') return false
  if (!config.terrain || typeof config.terrain !== 'object') return false
  if (!config.sky || typeof config.sky !== 'object') return false
  if (!config.player || typeof config.player !== 'object') return false
  return true
}

function isSavePlayer(value: unknown): value is SavePlayer {
  if (!value || typeof value !== 'object') return false
  const player = value as Record<string, unknown>
  return (
    typeof player.x === 'number' &&
    typeof player.z === 'number' &&
    typeof player.yaw === 'number' &&
    typeof player.pitch === 'number'
  )
}

export function isSaveDataV1(value: unknown): value is SaveDataV1 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 1) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  return typeof v.savedAt === 'number'
}

export function isSaveDataV2(value: unknown): value is SaveDataV2 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 2) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  if (typeof v.savedAt !== 'number') return false
  if (!v.quests || typeof v.quests !== 'object') return false
  if (!v.inventory || typeof v.inventory !== 'object') return false
  if (!Array.isArray(v.collectedItemIds)) return false
  return true
}

export function isSaveDataV3(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 3) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  if (typeof v.savedAt !== 'number') return false
  if (!v.quests || typeof v.quests !== 'object') return false
  if (!v.inventory || typeof v.inventory !== 'object') return false
  if (!Array.isArray(v.collectedItemIds)) return false
  if (!Array.isArray(v.droppedItems)) return false
  return true
}

/** Accepts a stored v1/v2/v3 save and always returns the canonical v3 shape,
 *  migrating older versions with empty state for whatever fields didn't exist
 *  yet. Null if `value` matches none of them (missing/corrupted save). */
export function loadSaveData(value: unknown): SaveData | null {
  if (isSaveDataV3(value)) return value
  if (isSaveDataV2(value)) {
    return {
      version: 3,
      config: value.config,
      player: value.player,
      savedAt: value.savedAt,
      quests: value.quests,
      inventory: value.inventory,
      collectedItemIds: value.collectedItemIds,
      droppedItems: [],
    }
  }
  if (isSaveDataV1(value)) {
    return {
      version: 3,
      config: value.config,
      player: value.player,
      savedAt: value.savedAt,
      quests: { progress: [], exp: 0, relations: {} },
      inventory: {},
      collectedItemIds: [],
      droppedItems: [],
    }
  }
  return null
}
