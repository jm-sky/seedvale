import type { WorldConfig } from '../config/worldConfig'
import type { ItemKind } from '../items/items'
import type { QuestState } from '../quests/quests'
import type { PlacedFireKind } from '../settlement/PlacedFires'

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

/** `kind` added in v6 (`docs/plans/2026-08-09--050`) — `'pit'` (stone-ring,
 *  longer burn) vs `'simple'` (branches only, shorter burn). Older saves
 *  (v5 and below) predate the distinction; migrated as `'pit'`, matching what
 *  the single old "Zbuduj ognisko" (2x branch + 2x stone) action always
 *  built. */
export type SavePlacedFire = { id: string, x: number, z: number, kind: PlacedFireKind }

/** Shape stored by v4/v5 saves, before `kind` existed. */
export type LegacySavePlacedFire = { id: string, x: number, z: number }

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

export type SaveDataV3 = {
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

export type SaveDataV4 = {
  version: 4
  config: SaveConfig
  player: SavePlayer
  savedAt: number
  quests: SaveQuests
  inventory: Partial<Record<ItemKind, number>>
  collectedItemIds: string[]
  droppedItems: SaveDroppedItem[]
  placedFires: LegacySavePlacedFire[]
}

export type SaveDataV5 = {
  version: 5
  config: SaveConfig
  player: SavePlayer
  savedAt: number
  quests: SaveQuests
  inventory: Partial<Record<ItemKind, number>>
  collectedItemIds: string[]
  droppedItems: SaveDroppedItem[]
  placedFires: LegacySavePlacedFire[]
  timeOfDay: number
}

/** Canonical save shape used everywhere outside this module and `saveDb.ts` —
 *  always v6. `loadSaveData` migrates a stored v1/v2/v3/v4/v5 save up to this
 *  on read. */
export type SaveData = {
  version: 6
  config: SaveConfig
  player: SavePlayer
  savedAt: number
  quests: SaveQuests
  inventory: Partial<Record<ItemKind, number>>
  collectedItemIds: string[]
  droppedItems: SaveDroppedItem[]
  /** Player-built campfires (`settlement/PlacedFires.ts`) — positions aren't
   *  derivable from the seed either, same reasoning as `droppedItems`. Lit/fuel
   *  state is intentionally not persisted (see `PlacedFires.ts`). */
  placedFires: SavePlacedFire[]
  /** `world/dayNight.ts`'s `DayNightState.timeOfDay` — otherwise the clock
   *  resets to the default dawn-ish start on every Continue. */
  timeOfDay: number
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

export function isSaveDataV3(value: unknown): value is SaveDataV3 {
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

export function isSaveDataV4(value: unknown): value is SaveDataV4 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 4) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  if (typeof v.savedAt !== 'number') return false
  if (!v.quests || typeof v.quests !== 'object') return false
  if (!v.inventory || typeof v.inventory !== 'object') return false
  if (!Array.isArray(v.collectedItemIds)) return false
  if (!Array.isArray(v.droppedItems)) return false
  if (!Array.isArray(v.placedFires)) return false
  return true
}

export function isSaveDataV5(value: unknown): value is SaveDataV5 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 5) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  if (typeof v.savedAt !== 'number') return false
  if (!v.quests || typeof v.quests !== 'object') return false
  if (!v.inventory || typeof v.inventory !== 'object') return false
  if (!Array.isArray(v.collectedItemIds)) return false
  if (!Array.isArray(v.droppedItems)) return false
  if (!Array.isArray(v.placedFires)) return false
  if (typeof v.timeOfDay !== 'number') return false
  return true
}

export function isSaveDataV6(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 6) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  if (typeof v.savedAt !== 'number') return false
  if (!v.quests || typeof v.quests !== 'object') return false
  if (!v.inventory || typeof v.inventory !== 'object') return false
  if (!Array.isArray(v.collectedItemIds)) return false
  if (!Array.isArray(v.droppedItems)) return false
  if (!Array.isArray(v.placedFires)) return false
  if (typeof v.timeOfDay !== 'number') return false
  return true
}

/** Default `timeOfDay` for saves that predate persisting the clock (v1-v4) —
 *  mirrors `dayNight.ts::createDayNightState`'s own default. */
const DEFAULT_TIME_OF_DAY = 0.32

/** `kind` didn't exist before v6 (`docs/plans/2026-08-09--050`) — every
 *  pre-v6 placed fire was built by the single old "Zbuduj ognisko" action
 *  (2x branch + 2x stone), which matches today's `'pit'` variant. */
function migratePlacedFires(placedFires: readonly LegacySavePlacedFire[]): SavePlacedFire[] {
  return placedFires.map((pf) => ({ ...pf, kind: 'pit' as const }))
}

/** Accepts a stored v1/v2/v3/v4/v5/v6 save and always returns the canonical
 *  v6 shape, migrating older versions with empty state for whatever fields
 *  didn't exist yet. Null if `value` matches none of them (missing/corrupted
 *  save). */
export function loadSaveData(value: unknown): SaveData | null {
  if (isSaveDataV6(value)) return value
  if (isSaveDataV5(value)) {
    return {
      version: 6,
      config: value.config,
      player: value.player,
      savedAt: value.savedAt,
      quests: value.quests,
      inventory: value.inventory,
      collectedItemIds: value.collectedItemIds,
      droppedItems: value.droppedItems,
      placedFires: migratePlacedFires(value.placedFires),
      timeOfDay: value.timeOfDay,
    }
  }
  if (isSaveDataV4(value)) {
    return {
      version: 6,
      config: value.config,
      player: value.player,
      savedAt: value.savedAt,
      quests: value.quests,
      inventory: value.inventory,
      collectedItemIds: value.collectedItemIds,
      droppedItems: value.droppedItems,
      placedFires: migratePlacedFires(value.placedFires),
      timeOfDay: DEFAULT_TIME_OF_DAY,
    }
  }
  if (isSaveDataV3(value)) {
    return {
      version: 6,
      config: value.config,
      player: value.player,
      savedAt: value.savedAt,
      quests: value.quests,
      inventory: value.inventory,
      collectedItemIds: value.collectedItemIds,
      droppedItems: value.droppedItems,
      placedFires: [],
      timeOfDay: DEFAULT_TIME_OF_DAY,
    }
  }
  if (isSaveDataV2(value)) {
    return {
      version: 6,
      config: value.config,
      player: value.player,
      savedAt: value.savedAt,
      quests: value.quests,
      inventory: value.inventory,
      collectedItemIds: value.collectedItemIds,
      droppedItems: [],
      placedFires: [],
      timeOfDay: DEFAULT_TIME_OF_DAY,
    }
  }
  if (isSaveDataV1(value)) {
    return {
      version: 6,
      config: value.config,
      player: value.player,
      savedAt: value.savedAt,
      quests: { progress: [], exp: 0, relations: {} },
      inventory: {},
      collectedItemIds: [],
      droppedItems: [],
      placedFires: [],
      timeOfDay: DEFAULT_TIME_OF_DAY,
    }
  }
  return null
}
