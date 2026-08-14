import type { WorldConfig } from '../config/worldConfig'
import type { QuestState } from '../quests/quests'
import type { PlacedFireKind } from '../settlement/PlacedFires'
import { isToolKind } from '../items/HeldTool'
import { type ItemKind } from '../items/items'

/** Same shape as `StoredConfig` in `config/persistConfig.ts` — kept independent
 *  here so this module doesn't reach into config internals. */
export type SaveConfig = {
  seed: number
  terrain: WorldConfig['terrain']
  sky: WorldConfig['sky']
  player: WorldConfig['player']
  /** Optional — older saves predate issue 020; missing → defaults on load. */
  settlements?: WorldConfig['settlements']
}

export type SavePlayer = { x: number, z: number, yaw: number, pitch: number }

export type QuestProgressEntry = { id: string, state: QuestState, stageIndex: number }

export type SaveQuests = {
  progress: QuestProgressEntry[]
  exp: number
  relations: Record<string, number>
}

export type SaveDroppedItem = { id: string, kind: ItemKind, x: number, z: number }

/** `kind` added in v6 (`docs/plans/archive/2026-08-09--050`) — `'pit'` (stone-ring,
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

export type SaveDataV6 = {
  version: 6
  config: SaveConfig
  player: SavePlayer
  savedAt: number
  quests: SaveQuests
  inventory: Partial<Record<ItemKind, number>>
  collectedItemIds: string[]
  droppedItems: SaveDroppedItem[]
  placedFires: SavePlacedFire[]
  timeOfDay: number
}

/** Canonical save shape — always v9. `loadSaveData` migrates older saves up. */
export type SaveDataV7 = {
  version: 7
  config: SaveConfig
  player: SavePlayer
  savedAt: number
  quests: SaveQuests
  inventory: Partial<Record<ItemKind, number>>
  collectedItemIds: string[]
  droppedItems: SaveDroppedItem[]
  placedFires: SavePlacedFire[]
  timeOfDay: number
  heldTool: ItemKind | null
}

export type SaveTreeOverride = {
  stage: 'sapling' | 'young' | 'mature' | 'old' | 'limbed' | 'felled' | 'harvested'
  stageStartedAt: number
}

/** Portable hand light mid-burn (`player/PlayerTorch.ts`) — plan 085. */
export type SavePlayerTorch = {
  source: 'branch' | 'wooden_torch'
  /** Seconds of fuel left (clamped on restore). */
  fuelRemaining: number
}

export type SaveDataV8 = {
  version: 8
  config: SaveConfig
  player: SavePlayer
  savedAt: number
  quests: SaveQuests
  inventory: Partial<Record<ItemKind, number>>
  collectedItemIds: string[]
  droppedItems: SaveDroppedItem[]
  placedFires: SavePlacedFire[]
  timeOfDay: number
  elapsedDays: number
  heldTool: ItemKind | null
  treeOverrides: Record<string, SaveTreeOverride>
}

export type SaveDataV9 = {
  version: 9
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
  /** Absolute game-days for lazy systems (tree lifecycle, plan 058). */
  elapsedDays: number
  /** Single held-tool slot (`items/HeldTool.ts`). Null when nothing is in hand. */
  heldTool: ItemKind | null
  /** Sparse tree lifecycle overrides (`world/treeLifecycle.ts`) — only trees
   *  whose state diverges from procedural default + world-time growth. */
  treeOverrides: Record<string, SaveTreeOverride>
  /** Lit hand torch/branch + remaining fuel. Null when unlit. */
  playerTorch: SavePlayerTorch | null
}

export type SavePlacedTent = { id: string, x: number, z: number, yaw: number }

export type SaveWorldFlags = {
  /** Strażnik already gifted a long_sword (quest or dialogue, plan 090). */
  guardSwordGifted?: boolean
}

export type SaveMap = { discoveredCells: string[] }

export type SaveDataV10 = {
  version: 10
  config: SaveConfig
  player: SavePlayer
  savedAt: number
  quests: SaveQuests
  inventory: Partial<Record<ItemKind, number>>
  collectedItemIds: string[]
  droppedItems: SaveDroppedItem[]
  placedFires: SavePlacedFire[]
  timeOfDay: number
  elapsedDays: number
  heldTool: ItemKind | null
  treeOverrides: Record<string, SaveTreeOverride>
  playerTorch: SavePlayerTorch | null
  placedTents: SavePlacedTent[]
  worldFlags: SaveWorldFlags
}

/** Canonical save shape — always v11. `loadSaveData` migrates older saves up. */
export type SaveData = Omit<SaveDataV10, 'version'> & {
  version: 11
  map: SaveMap
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

function isHeldToolField(value: unknown): value is ItemKind | null {
  if (value === null) return true
  if (typeof value !== 'string') return false
  return isToolKind(value as ItemKind)
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

export function isSaveDataV6(value: unknown): value is SaveDataV6 {
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

export function isSaveDataV7(value: unknown): value is SaveDataV7 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 7) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  if (typeof v.savedAt !== 'number') return false
  if (!v.quests || typeof v.quests !== 'object') return false
  if (!v.inventory || typeof v.inventory !== 'object') return false
  if (!Array.isArray(v.collectedItemIds)) return false
  if (!Array.isArray(v.droppedItems)) return false
  if (!Array.isArray(v.placedFires)) return false
  if (typeof v.timeOfDay !== 'number') return false
  if (!isHeldToolField(v.heldTool)) return false
  return true
}

function isTreeOverridesField(value: unknown): value is Record<string, SaveTreeOverride> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  for (const raw of Object.values(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') return false
    const rec = raw as Record<string, unknown>
    if (
      rec.stage !== 'sapling' &&
      rec.stage !== 'young' &&
      rec.stage !== 'mature' &&
      rec.stage !== 'old' &&
      rec.stage !== 'limbed' &&
      rec.stage !== 'felled' &&
      rec.stage !== 'harvested'
    ) {
      return false
    }
    if (typeof rec.stageStartedAt !== 'number') return false
  }
  return true
}

function isPlayerTorchField(value: unknown): value is SavePlayerTorch | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const t = value as Record<string, unknown>
  if (t.source !== 'branch' && t.source !== 'wooden_torch') return false
  return typeof t.fuelRemaining === 'number' && Number.isFinite(t.fuelRemaining)
}

export function isSaveDataV8(value: unknown): value is SaveDataV8 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 8) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  if (typeof v.savedAt !== 'number') return false
  if (!v.quests || typeof v.quests !== 'object') return false
  if (!v.inventory || typeof v.inventory !== 'object') return false
  if (!Array.isArray(v.collectedItemIds)) return false
  if (!Array.isArray(v.droppedItems)) return false
  if (!Array.isArray(v.placedFires)) return false
  if (typeof v.timeOfDay !== 'number') return false
  if (typeof v.elapsedDays !== 'number') return false
  if (!isHeldToolField(v.heldTool)) return false
  if (!isTreeOverridesField(v.treeOverrides)) return false
  return true
}

function isPlacedTentsField(value: unknown): value is SavePlacedTent[] {
  if (!Array.isArray(value)) return false
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return false
    const t = raw as Record<string, unknown>
    if (typeof t.id !== 'string') return false
    if (typeof t.x !== 'number' || typeof t.z !== 'number' || typeof t.yaw !== 'number') return false
  }
  return true
}

function isWorldFlagsField(value: unknown): value is SaveWorldFlags {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const flags = value as Record<string, unknown>
  if (flags.guardSwordGifted !== undefined && typeof flags.guardSwordGifted !== 'boolean') return false
  return true
}

function isSaveMap(value: unknown): value is SaveMap {
  if (!value || typeof value !== 'object') return false
  const map = value as Record<string, unknown>
  if (!Array.isArray(map.discoveredCells)) return false
  return map.discoveredCells.every((cell) => typeof cell === 'string')
}

export function isSaveDataV10(value: unknown): value is SaveDataV10 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 10) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  if (typeof v.savedAt !== 'number') return false
  if (!v.quests || typeof v.quests !== 'object') return false
  if (!v.inventory || typeof v.inventory !== 'object') return false
  if (!Array.isArray(v.collectedItemIds)) return false
  if (!Array.isArray(v.droppedItems)) return false
  if (!Array.isArray(v.placedFires)) return false
  if (typeof v.timeOfDay !== 'number') return false
  if (typeof v.elapsedDays !== 'number') return false
  if (!isHeldToolField(v.heldTool)) return false
  if (!isTreeOverridesField(v.treeOverrides)) return false
  if (!isPlayerTorchField(v.playerTorch)) return false
  if (!isPlacedTentsField(v.placedTents)) return false
  if (!isWorldFlagsField(v.worldFlags)) return false
  return true
}

export function isSaveDataV11(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 11) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  if (typeof v.savedAt !== 'number') return false
  if (!v.quests || typeof v.quests !== 'object') return false
  if (!v.inventory || typeof v.inventory !== 'object') return false
  if (!Array.isArray(v.collectedItemIds)) return false
  if (!Array.isArray(v.droppedItems)) return false
  if (!Array.isArray(v.placedFires)) return false
  if (typeof v.timeOfDay !== 'number') return false
  if (typeof v.elapsedDays !== 'number') return false
  if (!isHeldToolField(v.heldTool)) return false
  if (!isTreeOverridesField(v.treeOverrides)) return false
  if (!isPlayerTorchField(v.playerTorch)) return false
  if (!isPlacedTentsField(v.placedTents)) return false
  if (!isWorldFlagsField(v.worldFlags)) return false
  if (!isSaveMap(v.map)) return false
  return true
}

export function isSaveDataV9(value: unknown): value is SaveDataV9 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 9) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  if (typeof v.savedAt !== 'number') return false
  if (!v.quests || typeof v.quests !== 'object') return false
  if (!v.inventory || typeof v.inventory !== 'object') return false
  if (!Array.isArray(v.collectedItemIds)) return false
  if (!Array.isArray(v.droppedItems)) return false
  if (!Array.isArray(v.placedFires)) return false
  if (typeof v.timeOfDay !== 'number') return false
  if (typeof v.elapsedDays !== 'number') return false
  if (!isHeldToolField(v.heldTool)) return false
  if (!isTreeOverridesField(v.treeOverrides)) return false
  if (!isPlayerTorchField(v.playerTorch)) return false
  return true
}

/** Default `timeOfDay` for saves that predate persisting the clock (v1-v4) —
 *  mirrors `dayNight.ts::createDayNightState`'s own default. */
const DEFAULT_TIME_OF_DAY = 0.32

/** `kind` didn't exist before v6 (`docs/plans/archive/2026-08-09--050`) — every
 *  pre-v6 placed fire was built by the single old "Zbuduj ognisko" action
 *  (2x branch + 2x stone), which matches today's `'pit'` variant. */
function migratePlacedFires(placedFires: readonly LegacySavePlacedFire[]): SavePlacedFire[] {
  return placedFires.map((pf) => ({ ...pf, kind: 'pit' as const }))
}

function toV10(fields: Omit<SaveDataV10, 'version' | 'heldTool' | 'elapsedDays' | 'treeOverrides' | 'playerTorch' | 'placedTents' | 'worldFlags'> & {
  heldTool?: ItemKind | null
  elapsedDays?: number
  treeOverrides?: Record<string, SaveTreeOverride>
  playerTorch?: SavePlayerTorch | null
  placedTents?: SavePlacedTent[]
  worldFlags?: SaveWorldFlags
}): SaveDataV10 {
  return {
    version: 10,
    ...fields,
    heldTool: fields.heldTool ?? null,
    elapsedDays: fields.elapsedDays ?? 0,
    treeOverrides: fields.treeOverrides ?? {},
    playerTorch: fields.playerTorch ?? null,
    placedTents: fields.placedTents ?? [],
    worldFlags: fields.worldFlags ?? {},
  }
}

function toV11(v10: SaveDataV10): SaveData {
  const { version: _version, ...rest } = v10
  return {
    ...rest,
    version: 11,
    map: { discoveredCells: [] },
  }
}

/** Accepts a stored v1–v11 save and always returns the canonical v11 shape. */
export function loadSaveData(value: unknown): SaveData | null {
  try {
    if (isSaveDataV11(value)) return value
    if (isSaveDataV10(value)) return toV11(value)
    if (isSaveDataV9(value)) {
      return toV11(toV10({
        config: value.config,
        player: value.player,
        savedAt: value.savedAt,
        quests: value.quests,
        inventory: value.inventory,
        collectedItemIds: value.collectedItemIds,
        droppedItems: value.droppedItems,
        placedFires: value.placedFires,
        timeOfDay: value.timeOfDay,
        elapsedDays: value.elapsedDays,
        heldTool: value.heldTool,
        treeOverrides: value.treeOverrides,
        playerTorch: value.playerTorch,
      }))
    }
    if (isSaveDataV8(value)) {
      return toV11(toV10({
        config: value.config,
        player: value.player,
        savedAt: value.savedAt,
        quests: value.quests,
        inventory: value.inventory,
        collectedItemIds: value.collectedItemIds,
        droppedItems: value.droppedItems,
        placedFires: value.placedFires,
        timeOfDay: value.timeOfDay,
        elapsedDays: value.elapsedDays,
        heldTool: value.heldTool,
        treeOverrides: value.treeOverrides,
        playerTorch: null,
      }))
    }
    if (isSaveDataV7(value)) {
      return toV11(toV10({
        config: value.config,
        player: value.player,
        savedAt: value.savedAt,
        quests: value.quests,
        inventory: value.inventory,
        collectedItemIds: value.collectedItemIds,
        droppedItems: value.droppedItems,
        placedFires: value.placedFires,
        timeOfDay: value.timeOfDay,
        heldTool: value.heldTool,
      }))
    }
    if (isSaveDataV6(value)) {
      return toV11(toV10({
        config: value.config,
        player: value.player,
        savedAt: value.savedAt,
        quests: value.quests,
        inventory: value.inventory,
        collectedItemIds: value.collectedItemIds,
        droppedItems: value.droppedItems,
        placedFires: value.placedFires,
        timeOfDay: value.timeOfDay,
        heldTool: null,
      }))
    }
    if (isSaveDataV5(value)) {
      return toV11(toV10({
        config: value.config,
        player: value.player,
        savedAt: value.savedAt,
        quests: value.quests,
        inventory: value.inventory,
        collectedItemIds: value.collectedItemIds,
        droppedItems: value.droppedItems,
        placedFires: migratePlacedFires(value.placedFires),
        timeOfDay: value.timeOfDay,
        heldTool: null,
      }))
    }
    if (isSaveDataV4(value)) {
      return toV11(toV10({
        config: value.config,
        player: value.player,
        savedAt: value.savedAt,
        quests: value.quests,
        inventory: value.inventory,
        collectedItemIds: value.collectedItemIds,
        droppedItems: value.droppedItems,
        placedFires: migratePlacedFires(value.placedFires),
        timeOfDay: DEFAULT_TIME_OF_DAY,
        heldTool: null,
      }))
    }
    if (isSaveDataV3(value)) {
      return toV11(toV10({
        config: value.config,
        player: value.player,
        savedAt: value.savedAt,
        quests: value.quests,
        inventory: value.inventory,
        collectedItemIds: value.collectedItemIds,
        droppedItems: value.droppedItems,
        placedFires: [],
        timeOfDay: DEFAULT_TIME_OF_DAY,
        heldTool: null,
      }))
    }
    if (isSaveDataV2(value)) {
      return toV11(toV10({
        config: value.config,
        player: value.player,
        savedAt: value.savedAt,
        quests: value.quests,
        inventory: value.inventory,
        collectedItemIds: value.collectedItemIds,
        droppedItems: [],
        placedFires: [],
        timeOfDay: DEFAULT_TIME_OF_DAY,
        heldTool: null,
      }))
    }
    if (isSaveDataV1(value)) {
      return toV11(toV10({
        config: value.config,
        player: value.player,
        savedAt: value.savedAt,
        quests: { progress: [], exp: 0, relations: {} },
        inventory: {},
        collectedItemIds: [],
        droppedItems: [],
        placedFires: [],
        timeOfDay: DEFAULT_TIME_OF_DAY,
        heldTool: null,
      }))
    }
    return null
  } catch {
    return null
  }
}
