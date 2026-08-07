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

export type SaveDataV1 = {
  version: 1
  config: SaveConfig
  player: SavePlayer
  savedAt: number
}

export type QuestProgressEntry = { id: string, state: QuestState, stageIndex: number }

/** Canonical save shape used everywhere outside this module and `saveDb.ts` —
 *  always v2. `loadSaveData` migrates a stored v1 save up to this on read. */
export type SaveData = {
  version: 2
  config: SaveConfig
  player: SavePlayer
  savedAt: number
  quests: {
    progress: QuestProgressEntry[]
    exp: number
    relations: Record<string, number>
  }
  inventory: Partial<Record<ItemKind, number>>
  /** Ids of world-generated items (`terrain/chunkItems.ts`) already picked up —
   *  see `ChunkManagerConfig.collectedItemIds`. */
  collectedItemIds: string[]
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

export function isSaveDataV2(value: unknown): value is SaveData {
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

/** Accepts a stored v1 or v2 save and always returns the canonical v2 shape,
 *  migrating v1 with empty quest/inventory/collected-item state. Null if
 *  `value` matches neither (missing/corrupted save). */
export function loadSaveData(value: unknown): SaveData | null {
  if (isSaveDataV2(value)) return value
  if (isSaveDataV1(value)) {
    return {
      version: 2,
      config: value.config,
      player: value.player,
      savedAt: value.savedAt,
      quests: { progress: [], exp: 0, relations: {} },
      inventory: {},
      collectedItemIds: [],
    }
  }
  return null
}
