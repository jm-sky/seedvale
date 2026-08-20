import type { WorldConfig } from '../config/worldConfig'
import type { EconomicKind } from '../economy/kinds'
import type { SpawnPointState } from '../fauna/AnimalSpawner'
import type { SaveItemInstance } from '../items/Inventory'
import type { SkillId } from '../player/PlayerSkills'
import type { QuestState } from '../quests/quests'
import type { PlacedFireKind } from '../settlement/PlacedFires'
import type { TrapKind, TrapState } from '../world/animalTraps'
import { isToolKind } from '../items/HeldTool'
import { type ItemKind } from '../items/items'
import { SNEAK_LEGACY_XP } from '../player/PlayerSkills'

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

export type SaveDataV11 = Omit<SaveDataV10, 'version'> & {
  version: 11
  map: SaveMap
}

export type SaveDataV12 = Omit<SaveDataV11, 'version'> & {
  version: 12
  settlementEconomies: Record<string, Partial<Record<EconomicKind, number>>>
}

/** Plan 106 — hunger/thirst/vigor pools (`player/PlayerNeeds.ts`). Stamina
 *  stays transient per the plan §8 (short-term, not worth persisting). */
export type SavePlayerNeeds = { hunger: number, thirst: number, vigor: number }

export type SaveDataV13 = Omit<SaveDataV12, 'version'> & {
  version: 13
  playerNeeds: SavePlayerNeeds
}

/** Plan 129 — persistent player-owned settlement sale plots. Sparse
 *  `settlementId:plotId` composite-key list (`settlement/landOwnership.ts`);
 *  absence on an older save means no purchased plots, not an error. */
export type SaveDataV14 = Omit<SaveDataV13, 'version'> & {
  version: 14
  ownedLandPlots: string[]
}

/** Plan 128 — skill progression. Only `xp` is stored: `value` is always
 *  derived from it (`player/PlayerSkills.ts`'s `xpToSkillValue`), and `active`
 *  is runtime state that must never come back from a save. */
export type SaveSkill = { xp: number }
export type SaveSkills = Record<SkillId, SaveSkill>

export type SaveDataV15 = Omit<SaveDataV14, 'version'> & {
  version: 15
  skills: SaveSkills
}

/** Plan 141 — placed animal traps. Mirrors `world/animalTraps.ts`'s
 *  `PlacedTrapRecord`: only what cannot be re-derived from `TRAP_DEFS`. The
 *  per-animal detection cooldown is deliberately absent (wild fauna isn't
 *  persisted either, so its `animalId`s don't survive a reload). */
export type SavePlacedTrap = {
  id: string
  kind: TrapKind
  x: number
  z: number
  yaw: number
  state: TrapState
  durability: number
  skillAtActivation: number
  weatherCheckedAtDay: number
  /** Plan 159 §12 — optional so v16-19 saves (predating trap bait) parse
   *  unchanged; absent/undefined restores as no bait. */
  baitKind?: ItemKind | null
}

export type SaveDataV16 = Omit<SaveDataV15, 'version'> & {
  version: 16
  placedTraps: SavePlacedTrap[]
}

/** Plan 125 persistence follow-up (`docs/plans/LOOSE-ENDS.md` 2026-08-16) —
 *  minimal fauna spawn-point lifecycle, keyed by the stable
 *  `PreySpawner.id` (`fauna/AnimalSpawner.ts`). Deliberately excludes
 *  position/type/kind (deterministic from seed/settlement) and any actual
 *  animal/runtime state — only what's needed to keep `active`/`depleted`/
 *  `disabled`/`recovering` (and its recovery clock) across a reload. */
export type SaveSpawnPoint = {
  id: string
  state: SpawnPointState
  deathsThisCycle: number
  disabledAtDay: number | null
}

export type SaveDataV17 = Omit<SaveDataV16, 'version'> & {
  version: 17
  spawnPoints: SaveSpawnPoint[]
}

export type SaveDataV18 = Omit<SaveDataV17, 'version'> & {
  version: 18
}

export type SaveDataV19 = Omit<SaveDataV18, 'version'> & {
  version: 19
  inventoryInstances: SaveItemInstance[]
}

/** Plan 159 — stack-level freshness batches for the player's perishable food
 *  (`items/Inventory.ts`'s `FoodBatch`). Only perishable kinds ever appear
 *  here; storage/derived freshness stages are never persisted. */
export type SaveFoodBatch = { count: number, acquiredAtDays: number }

/** Persistent drying rack (`world/dryingRacks.ts`'s `DryingRackRecord`) —
 *  same "player chose the spot" shape as `SavePlacedTent`/`SavePlacedTrap`,
 *  plus at most one in-flight `TimedProcess`. */
export type SaveTimedProcess = {
  id: string
  kind: 'drying'
  startedAtDays: number
  durationDays: number
  input: { kind: ItemKind, count: number }[]
  output: { kind: ItemKind, count: number }[]
}

export type SaveDryingRack = {
  id: string
  x: number
  z: number
  yaw: number
  process: SaveTimedProcess | null
}

/** Persistent wild hive (`world/beehives.ts`'s `BeehiveRecord`). */
export type SaveHive = {
  id: string
  x: number
  z: number
  yaw: number
  lastCollectedAtDay: number
  burned: boolean
  burnRewardCollected: boolean
}

/** Persistent per-fishing-spot bait state (`world/fishing.ts`'s
 *  `FishingBaitState`), keyed by the deterministic `fishingSpotId()`. Not a
 *  per-chunk/streamed structure — a flat map survives stream-out/in for
 *  free. */
export type SaveFishingBait = { kind: ItemKind, appliedAtDays: number, expiresAtDays: number, strength: number }

export type SaveDataV20 = Omit<SaveDataV19, 'version'> & {
  version: 20
  foodBatches: Partial<Record<ItemKind, SaveFoodBatch[]>>
  dryingRacks: SaveDryingRack[]
  hives: SaveHive[]
  fishingBait: Record<string, SaveFishingBait>
}

/** Canonical save shape — always v20. `loadSaveData` migrates older saves up. */
export type SaveData = SaveDataV20

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

export function isSaveDataV11(value: unknown): value is SaveDataV11 {
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

function isSettlementEconomiesField(value: unknown): value is Record<string, Partial<Record<EconomicKind, number>>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  for (const stock of Object.values(value as Record<string, unknown>)) {
    if (!stock || typeof stock !== 'object' || Array.isArray(stock)) return false
    for (const amount of Object.values(stock as Record<string, unknown>)) {
      if (typeof amount !== 'number') return false
    }
  }
  return true
}

export function isSaveDataV12(value: unknown): value is SaveDataV12 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 12) return false
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
  if (!isSettlementEconomiesField(v.settlementEconomies)) return false
  return true
}

function isPlayerNeedsField(value: unknown): value is SavePlayerNeeds {
  if (!value || typeof value !== 'object') return false
  const n = value as Record<string, unknown>
  return typeof n.hunger === 'number' && typeof n.thirst === 'number' && typeof n.vigor === 'number'
}

export function isSaveDataV13(value: unknown): value is SaveDataV13 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 13) return false
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
  if (!isSettlementEconomiesField(v.settlementEconomies)) return false
  if (!isPlayerNeedsField(v.playerNeeds)) return false
  return true
}

function isOwnedLandPlotsField(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

export function isSaveDataV14(value: unknown): value is SaveDataV14 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 14) return false
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
  if (!isSettlementEconomiesField(v.settlementEconomies)) return false
  if (!isPlayerNeedsField(v.playerNeeds)) return false
  if (!isOwnedLandPlotsField(v.ownedLandPlots)) return false
  return true
}

function isSaveSkill(value: unknown): value is SaveSkill {
  if (!value || typeof value !== 'object') return false
  return typeof (value as Record<string, unknown>).xp === 'number'
}

function isSkillsField(value: unknown): value is SaveSkills {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  return isSaveSkill(s.sneak) && isSaveSkill(s.survival)
}

export function isSaveDataV15(value: unknown): value is SaveDataV15 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 15) return false
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
  if (!isSettlementEconomiesField(v.settlementEconomies)) return false
  if (!isPlayerNeedsField(v.playerNeeds)) return false
  if (!isOwnedLandPlotsField(v.ownedLandPlots)) return false
  if (!isSkillsField(v.skills)) return false
  return true
}

const TRAP_KINDS: ReadonlySet<string> = new Set<TrapKind>(['good', 'simple'])
const TRAP_STATES: ReadonlySet<string> = new Set<TrapState>(['active', 'broken', 'placed'])

function isPlacedTrapsField(value: unknown): value is SavePlacedTrap[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const t = entry as Record<string, unknown>
    return (
      typeof t.id === 'string' &&
      typeof t.kind === 'string' && TRAP_KINDS.has(t.kind) &&
      typeof t.x === 'number' &&
      typeof t.z === 'number' &&
      typeof t.yaw === 'number' &&
      typeof t.state === 'string' && TRAP_STATES.has(t.state) &&
      typeof t.durability === 'number' &&
      typeof t.skillAtActivation === 'number' &&
      typeof t.weatherCheckedAtDay === 'number' &&
      (t.baitKind === undefined || t.baitKind === null || typeof t.baitKind === 'string')
    )
  })
}

export function isSaveDataV16(value: unknown): value is SaveDataV16 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 16) return false
  if (!isSaveDataV15({ ...v, version: 15 })) return false
  if (!isPlacedTrapsField(v.placedTraps)) return false
  return true
}

const SPAWN_POINT_STATES: ReadonlySet<string> = new Set<SpawnPointState>(['active', 'depleted', 'disabled', 'recovering'])

function isSpawnPointsField(value: unknown): value is SaveSpawnPoint[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const s = entry as Record<string, unknown>
    return (
      typeof s.id === 'string' &&
      typeof s.state === 'string' && SPAWN_POINT_STATES.has(s.state) &&
      typeof s.deathsThisCycle === 'number' &&
      (s.disabledAtDay === null || typeof s.disabledAtDay === 'number')
    )
  })
}

export function isSaveDataV17(value: unknown): value is SaveDataV17 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 17) return false
  if (!isSaveDataV16({ ...v, version: 16 })) return false
  if (!isSpawnPointsField(v.spawnPoints)) return false
  return true
}

export function isSaveDataV18(value: unknown): value is SaveDataV18 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 18) return false
  if (!isSaveDataV17({ ...v, version: 17 })) return false
  return true
}

function isInventoryInstancesField(value: unknown): value is SaveItemInstance[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const row = entry as Record<string, unknown>
    if (typeof row.id !== 'string' || typeof row.kind !== 'string') return false
    if (row.kind === 'trap_simple' || row.kind === 'trap_good') {
      return typeof row.durability === 'number' && Number.isFinite(row.durability)
    }
    if (row.durability !== undefined && typeof row.durability !== 'number') return false
    return true
  })
}

export function isSaveDataV19(value: unknown): value is SaveDataV19 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 19) return false
  if (!isSaveDataV18({ ...v, version: 18 })) return false
  if (!isInventoryInstancesField(v.inventoryInstances)) return false
  return true
}

function isSaveFoodBatchArray(value: unknown): value is SaveFoodBatch[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const b = entry as Record<string, unknown>
    return typeof b.count === 'number' && typeof b.acquiredAtDays === 'number'
  })
}

function isFoodBatchesField(value: unknown): value is Partial<Record<ItemKind, SaveFoodBatch[]>> {
  if (!value || typeof value !== 'object') return false
  return Object.values(value as Record<string, unknown>).every(isSaveFoodBatchArray)
}

function isTimedProcessField(value: unknown): value is SaveTimedProcess | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    p.kind === 'drying' &&
    typeof p.startedAtDays === 'number' &&
    typeof p.durationDays === 'number' &&
    Array.isArray(p.input) &&
    Array.isArray(p.output)
  )
}

function isDryingRacksField(value: unknown): value is SaveDryingRack[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const r = entry as Record<string, unknown>
    return (
      typeof r.id === 'string' &&
      typeof r.x === 'number' &&
      typeof r.z === 'number' &&
      typeof r.yaw === 'number' &&
      isTimedProcessField(r.process)
    )
  })
}

function isHivesField(value: unknown): value is SaveHive[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const h = entry as Record<string, unknown>
    return (
      typeof h.id === 'string' &&
      typeof h.x === 'number' &&
      typeof h.z === 'number' &&
      typeof h.yaw === 'number' &&
      typeof h.lastCollectedAtDay === 'number' &&
      typeof h.burned === 'boolean' &&
      typeof h.burnRewardCollected === 'boolean'
    )
  })
}

function isFishingBaitField(value: unknown): value is Record<string, SaveFishingBait> {
  if (!value || typeof value !== 'object') return false
  return Object.values(value as Record<string, unknown>).every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const b = entry as Record<string, unknown>
    return (
      typeof b.kind === 'string' &&
      typeof b.appliedAtDays === 'number' &&
      typeof b.expiresAtDays === 'number' &&
      typeof b.strength === 'number'
    )
  })
}

export function isSaveDataV20(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 20) return false
  if (!isSaveDataV19({ ...v, version: 19 })) return false
  if (!isFoodBatchesField(v.foodBatches)) return false
  if (!isDryingRacksField(v.dryingRacks)) return false
  if (!isHivesField(v.hives)) return false
  if (!isFishingBaitField(v.fishingBait)) return false
  return true
}

/** @deprecated Prefer `isSaveDataV19` — kept for migration tests. */
export function isSaveDataV18Canonical(value: unknown): value is SaveDataV18 {
  return isSaveDataV18(value)
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

function toV11(v10: SaveDataV10): SaveDataV11 {
  const { version: _version, ...rest } = v10
  return {
    ...rest,
    version: 11,
    map: { discoveredCells: [] },
  }
}

function toV12(v11: SaveDataV11): SaveDataV12 {
  const { version: _version, ...rest } = v11
  return {
    ...rest,
    version: 12,
    settlementEconomies: {},
  }
}

/** Full pools — matches `player/PlayerNeeds.ts`'s `createPlayerNeeds()` default,
 *  for saves that predate plan 106. */
const DEFAULT_PLAYER_NEEDS: SavePlayerNeeds = { hunger: 100, thirst: 100, vigor: 100 }

function toV13(v12: SaveDataV12): SaveDataV13 {
  const { version: _version, ...rest } = v12
  return {
    ...rest,
    version: 13,
    playerNeeds: DEFAULT_PLAYER_NEEDS,
  }
}

function toV14(v13: SaveDataV13): SaveDataV14 {
  const { version: _version, ...rest } = v13
  return {
    ...rest,
    version: 14,
    ownedLandPlots: [],
  }
}

/** Pre-plan-128 saves had no progression: Sneak was a flat 0.5 and Survival
 *  didn't exist. Restore exactly that (plan 128 §2). */
const DEFAULT_SAVE_SKILLS: SaveSkills = {
  sneak: { xp: SNEAK_LEGACY_XP },
  survival: { xp: 0 },
  traps: { xp: 0 },
  defense: { xp: 0 },
}

function toV15(v14: SaveDataV14): SaveDataV15 {
  const { version: _version, ...rest } = v14
  return {
    ...rest,
    version: 15,
    skills: {
      sneak: { ...DEFAULT_SAVE_SKILLS.sneak },
      survival: { ...DEFAULT_SAVE_SKILLS.survival },
      traps: { ...DEFAULT_SAVE_SKILLS.traps },
      defense: { ...DEFAULT_SAVE_SKILLS.defense },
    },
  }
}

/** Plan 141 — adds placed traps and the `traps` skill. A v15 save has no
 *  `traps` entry (the skill didn't exist), which restores as a fresh skill;
 *  everything else carries over untouched. */
function toV16(v15: SaveDataV15): SaveDataV16 {
  const { version: _version, skills, ...rest } = v15
  return {
    ...rest,
    version: 16,
    skills: {
      sneak: { xp: skills.sneak?.xp ?? 0 },
      survival: { xp: skills.survival?.xp ?? 0 },
      traps: { xp: skills.traps?.xp ?? 0 },
      defense: { xp: 0 },
    },
    placedTraps: [],
  }
}

/** Plan 125 persistence follow-up — pre-v17 saves predate spawn-point
 *  lifecycle entirely, so they restore with no entries (every spawn point
 *  behaves as a fresh `active` one, same as before this save field existed). */
function toV17(v16: SaveDataV16): SaveDataV17 {
  const { version: _version, ...rest } = v16
  return {
    ...rest,
    version: 17,
    spawnPoints: [],
  }
}

function toV18(v17: SaveDataV17): SaveDataV18 {
  const { version: _version, skills, ...rest } = v17
  return {
    ...rest,
    version: 18,
    skills: {
      sneak: { xp: skills.sneak?.xp ?? 0 },
      survival: { xp: skills.survival?.xp ?? 0 },
      traps: { xp: skills.traps?.xp ?? 0 },
      defense: { xp: skills.defense?.xp ?? 0 },
    },
  }
}

function toV19(v18: SaveDataV18): SaveDataV19 {
  const { version: _version, ...rest } = v18
  return {
    ...rest,
    version: 19,
    inventoryInstances: [],
  }
}

/** Plan 159 — pre-v20 saves predate the whole natural-food/fishing/
 *  preservation/bait feature set, so every new field restores empty (no
 *  perishable batches, no drying racks, no hives, no fishing bait). Existing
 *  `placedTraps` entries simply lack `baitKind`, already optional on the
 *  shared `SavePlacedTrap` type — nothing to migrate there. */
function toV20(v19: SaveDataV19): SaveData {
  const { version: _version, ...rest } = v19
  return {
    ...rest,
    version: 20,
    foodBatches: {},
    dryingRacks: [],
    hives: [],
    fishingBait: {},
  }
}

/** Migrates any post-v16 save payload to the canonical v20 shape. */
function upToCurrent(v16: SaveDataV16): SaveData {
  return toV20(toV19(toV18(toV17(v16))))
}

/** Accepts a stored v1–v20 save and always returns the canonical v20 shape. */
export function loadSaveData(value: unknown): SaveData | null {
  try {
    if (isSaveDataV20(value)) return value
    if (isSaveDataV19(value)) return toV20(value)
    if (isSaveDataV18(value)) return toV20(toV19(value))
    if (isSaveDataV17(value)) return toV20(toV19(toV18(value)))
    if (isSaveDataV16(value)) return upToCurrent(value)
    if (isSaveDataV15(value)) return upToCurrent(toV16(value))
    if (isSaveDataV14(value)) return upToCurrent(toV16(toV15(value)))
    if (isSaveDataV13(value)) return upToCurrent(toV16(toV15(toV14(value))))
    if (isSaveDataV12(value)) return upToCurrent(toV16(toV15(toV14(toV13(value)))))
    if (isSaveDataV11(value)) return upToCurrent(toV16(toV15(toV14(toV13(toV12(value))))))
    if (isSaveDataV10(value)) return upToCurrent(toV16(toV15(toV14(toV13(toV12(toV11(value)))))))
    if (isSaveDataV9(value)) {
      return upToCurrent(toV16(toV15(toV14(toV13(toV12(toV11(toV10({
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
      }))))))))
    }
    if (isSaveDataV8(value)) {
      return upToCurrent(toV16(toV15(toV14(toV13(toV12(toV11(toV10({
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
      }))))))))
    }
    if (isSaveDataV7(value)) {
      return upToCurrent(toV16(toV15(toV14(toV13(toV12(toV11(toV10({
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
      }))))))))
    }
    if (isSaveDataV6(value)) {
      return upToCurrent(toV16(toV15(toV14(toV13(toV12(toV11(toV10({
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
      }))))))))
    }
    if (isSaveDataV5(value)) {
      return upToCurrent(toV16(toV15(toV14(toV13(toV12(toV11(toV10({
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
      }))))))))
    }
    if (isSaveDataV4(value)) {
      return upToCurrent(toV16(toV15(toV14(toV13(toV12(toV11(toV10({
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
      }))))))))
    }
    if (isSaveDataV3(value)) {
      return upToCurrent(toV16(toV15(toV14(toV13(toV12(toV11(toV10({
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
      }))))))))
    }
    if (isSaveDataV2(value)) {
      return upToCurrent(toV16(toV15(toV14(toV13(toV12(toV11(toV10({
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
      }))))))))
    }
    if (isSaveDataV1(value)) {
      return upToCurrent(toV16(toV15(toV14(toV13(toV12(toV11(toV10({
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
      }))))))))
    }
    return null
  } catch {
    return null
  }
}
