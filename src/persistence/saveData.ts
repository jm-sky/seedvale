import type { BadgeId } from '../badges/badges'
import type { WorldConfig } from '../config/worldConfig'
import type { SettlementEconomySnapshot } from '../economy/settlementEconomy'
import type { AnimalKind } from '../fauna/AnimalAgent'
import type { SpawnPointState } from '../fauna/AnimalSpawner'
import type { ContainerKind } from '../items/container'
import type { SaveItemInstance } from '../items/Inventory'
import type { SkillId } from '../player/PlayerSkills'
import type { QuestState } from '../quests/quests'
import type { HouseholdId, HouseholdSnapshot } from '../settlement/household'
import type { LivestockSaveRecord } from '../settlement/livestock'
import type { NpcRelationshipEntry } from '../settlement/npcRelationships'
import type { NpcId, NpcStateSnapshot } from '../settlement/npcState'
import type { PlacedFireKind } from '../settlement/PlacedFires'
import type { PreparationSize } from '../terrain/terrainPreparation'
import type { TrapKind, TrapState } from '../world/animalTraps'
import type { CropId } from '../world/cropLifecycle'
import type { MapConfidence, MapSource } from '../world/map/mapTypes'
import type { WellStage } from '../world/playerWell'
import type { SleepingUtilityVariant } from '../world/sleepingUtilities'
import type { TreeSizeClass } from '../world/treeLifecycle'
import { isToolKind } from '../items/HeldTool'
import { isTrapKind } from '../items/itemInstances'
import { type ItemKind } from '../items/items'

/** Same shape as `StoredConfig` in `config/persistConfig.ts` — kept independent
 *  here so this module doesn't reach into config internals. */
export type SaveConfig = {
  seed: number
  terrain: WorldConfig['terrain']
  sky: WorldConfig['sky']
  player: WorldConfig['player']
  settlements: WorldConfig['settlements']
}

export type SavePlayer = {
  x: number
  z: number
  yaw: number
  pitch: number
  /** Livestock `animalId` currently ridden (plan fauna-003) — `undefined`
   *  when not mounted. Only livestock kinds have a deterministic id, so this
   *  is safe to round-trip; a missing/invalid id on load just fails to
   *  reattach (see `createApp.ts`'s `resolveMountAnimal`). */
  mountedAnimalId?: string
}

export type QuestProgressEntry = { id: string, state: QuestState, stageIndex: number }

export type SaveQuests = {
  progress: QuestProgressEntry[]
  exp: number
  relations: Record<string, number>
}

/** `instance` (plan 199) — set only when this drop came from an
 *  `ItemInstance` (traps, weapon-maintenance kinds). */
export type SaveDroppedItem = { id: string, kind: ItemKind, x: number, z: number, instance?: SaveItemInstance }

/** `kind` — `'pit'` (stone-ring, longer burn) vs `'simple'` (branches only,
 *  shorter burn). `grate` is optional; a missing value restores as `false`. */
export type SavePlacedFire = { id: string, x: number, z: number, kind: PlacedFireKind, grate?: boolean }

export type SaveTreeOverride = {
  stage: 'sapling' | 'young' | 'mature' | 'old' | 'limbed' | 'felled' | 'harvested'
  stageStartedAt: number
  /** Plan items-player-012 — game-day a branch harvest becomes available
   *  again; absent means available now. */
  branchRegeneratesAt?: number
}

/** Portable hand light mid-burn (`player/PlayerTorch.ts`). */
export type SavePlayerTorch = {
  source: 'branch' | 'wooden_torch'
  /** Seconds of fuel left (clamped on restore). */
  fuelRemaining: number
}

export type SavePlacedTent = { id: string, x: number, z: number, yaw: number }

export type SaveWorldFlags = {
  /** Strażnik already gifted a long_sword (quest or dialogue, plan 090). */
  guardSwordGifted?: boolean
  /** Hidden-treasure easter egg (quick task) already revealed — blocks a
   *  second reward chest from spawning after all 3 flower markers are dug
   *  again post-reload. */
  hiddenTreasureFound?: boolean
}

/** Player knowledge of a concrete `WorldLocation` (plan world-012 §3/§20) —
 *  sparse, keyed by the location's own stable id. Only `state`/`source` are
 *  persisted; position/name/weight are re-derived from `(world seed,
 *  location id)` by `world/locations/worldLocationCatalog.ts`, never stored. */
export type SaveLocationKnowledge = { id: string, state: MapConfidence, source: MapSource }

export type SaveMap = {
  discoveredCells: string[]
  /** Location-knowledge layer (plan world-012) — independent of
   *  `discoveredCells`'s terrain Fog of War (persistence-003 v1→v2). */
  discoveredLocations: SaveLocationKnowledge[]
  /** Active navigation target `WorldLocation` ids (plan world-012 §13),
   *  max 3 — re-validated against current knowledge on load, never trusted
   *  blindly (see `world/locations/navigationTargets.ts`'s `restore`). */
  targets: string[]
}

/** Reputation Badges / Achievements (plan world-007 §10) — `gravesDisturbed`/
 *  `hiddenFindsFound` are the counters `badges/badges.ts`'s `BadgeManager`
 *  derives progress and the UI-facing standing penalty from; not themselves
 *  re-derivable from `resolvedHiddenFindSpotIds` alone (a resolved spot id
 *  doesn't say whether it was a grave or which count it bumped). */
export type SaveBadges = {
  earned: readonly BadgeId[]
  gravesDisturbed: number
  hiddenFindsFound: number
}

/** Hunger/thirst/vigor pools (`player/PlayerNeeds.ts`) plus the simulation-time
 *  crisis counters that gate real HP loss in `playerDamage.ts` (plan 165).
 *  Stamina stays transient (short-term, not worth persisting). */
export type SavePlayerNeeds = {
  hunger: number
  thirst: number
  vigor: number
  starvationDuration: number
  dehydrationDuration: number
}

/** Only `xp` is stored: `value` is always derived from it
 *  (`player/PlayerSkills.ts`'s `xpToSkillValue`), and `active` is runtime
 *  state that must never come back from a save. */
export type SaveSkill = { xp: number }
export type SaveSkills = Record<SkillId, SaveSkill>

/** Mirrors `world/animalTraps.ts`'s `PlacedTrapRecord`: only what cannot be
 *  re-derived from `TRAP_DEFS`. The per-animal detection cooldown is
 *  deliberately absent (wild fauna isn't persisted either, so its `animalId`s
 *  don't survive a reload). `baitKind` is optional; absent/undefined restores
 *  as no bait. */
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
  baitKind?: ItemKind | null
}

/** Minimal fauna spawn-point lifecycle, keyed by the stable
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

/** Stack-level freshness batches for the player's perishable food
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

/** Persistent player-placed storage container — mirrors
 *  `world/createPlacedContainers.ts`'s `PlacedContainerRecord`: only what
 *  can't be re-derived from `CONTAINER_DEFS` (capacity/base weight stay in
 *  the def, never duplicated here). */
export type SavePlacedContainer = {
  id: string
  kind: ContainerKind
  x: number
  z: number
  yaw: number
  counts: Partial<Record<ItemKind, number>>
  instances: SaveItemInstance[]
}

/** The container currently in the player's hands — same contents shape, no
 *  position/yaw since it has none while carried. */
export type SaveCarriedContainer = {
  id: string
  kind: ContainerKind
  counts: Partial<Record<ItemKind, number>>
  instances: SaveItemInstance[]
}

/** Persistent player-built well — mirrors `world/playerWell.ts`'s
 *  `PlayerWellRecord`; the completed `WaterSource` itself is never saved,
 *  only re-derived once `stage === 'roof'` and its work requirement is met.
 *  `workProgress` is hours of *active* player work toward the current stage —
 *  a stage cannot finish just because time passed. */
export type SavePlayerWell = {
  id: string
  x: number
  z: number
  yaw: number
  stage: WellStage
  workProgress: number
}

/** Persistent runtime terrain deformation (plan `world-terrain-save`) —
 *  mirrors `terrain/chunkManager.ts`'s `TerrainModification`, minus `source`:
 *  only `'player'`-caused entries are ever serialized (`saveState.ts`'s
 *  `buildSaveData()` filters them out) — deterministic `'system'` effects
 *  (cave carving, fauna spawn-point burn replay) are reproduced from scratch
 *  on every world build and must never also be replayed from a save, or
 *  their cumulative depth would double up. `'dig'`/`'scorch'` carry the
 *  radial-falloff fields; `'prepare'` (`Wyrównaj`/land-preparation) carries
 *  exact grid-sample heights instead. */
export type SaveTerrainModification =
  | { mode: 'dig' | 'scorch', x: number, z: number, radius: number, depth: number }
  | { mode: 'prepare', id: string, samples: { x: number, z: number, height: number }[] }

/** Active `Przygotuj teren` work (plan `world-terrain-002` §9) — mirrors
 *  `terrain/terrainPreparation.ts`'s `TerrainPreparationRecord` minus the
 *  runtime-only `status` (always `'active'` whenever a record is persisted —
 *  completion deletes it outright, same convention as `active` on
 *  `SaveSkill`). `originalHeights` is the immutable baseline every
 *  progressive height is re-derived from; it must round-trip exactly for
 *  save/load to reproduce the same terrain deterministically. */
export type SaveTerrainPreparation = {
  id: string
  x: number
  z: number
  size: PreparationSize
  targetHeight: number
  originalHeights: { x: number, z: number, height: number }[]
  requiredWork: number
  completedWork: number
}

/** Persistent planted-tree record — mirrors `world/plantedTrees.ts`'s
 *  `PlantedTreeRecord`. Identity/placement only; current growth stage lives in
 *  `treeOverrides`. */
export type SavePlantedTree = {
  id: string
  x: number
  z: number
  speciesIndex: number
  sizeClass: TreeSizeClass
  sizeJitter: number
  rotationY: number
}

/** Persistent planted-crop record — mirrors `world/cropLifecycle.ts`'s
 *  `CropPlacement`, reused directly for a planted crop's own presence (a
 *  harvested planted crop is removed from this array outright, unlike a wild
 *  crop's sparse `harvestedCropIds`). */
export type SavePlantedCrop = {
  id: string
  x: number
  z: number
  cropId: CropId
  stageStartedAt: number
}

/** Persistent player-built standing torch — mirrors `world/standingTorch.ts`'s
 *  `StandingTorchRecord`. `lit` is the only authoritative ignition state; the
 *  runtime flame/light is always re-derived from it on load, never saved
 *  directly (plan items-player-009). */
export type SaveStandingTorch = { id: string, x: number, z: number, yaw: number, lit: boolean }

/** Persistent player-built palisade segment — mirrors `world/palisade.ts`'s
 *  `PalisadeSegmentRecord`. Each segment round-trips independently; no
 *  neighbour/connection data is persisted — connection is always re-derived
 *  from each segment's own transform on load (plan items-player-010 §9). */
export type SavePalisadeSegment = { id: string, x: number, z: number, yaw: number }

/** Persistent player-built bedroll — mirrors `world/sleepingUtilities.ts`'s
 *  `BedrollRecord`. `condition`/`lastConditionUpdateAtDays` round-trip the
 *  lazy weather-degradation anchor (plan items-player-013) — same "resolve
 *  on demand from a persisted anchor" shape as `SavePlayerGarden.care`. */
export type SaveBedroll = {
  id: string
  x: number
  z: number
  yaw: number
  variant: SleepingUtilityVariant
  condition: number
  lastConditionUpdateAtDays: number
}

/** Persistent player-built raised sleeping platform — mirrors
 *  `world/sleepingUtilities.ts`'s `PlatformRecord`. No `bedroll` reference is
 *  persisted — which bedroll (if any) is "on" a platform is always resolved
 *  spatially on demand (plan items-player-013 §"Relacja bedroll ↔ platform"). */
export type SavePlatform = { id: string, x: number, z: number, yaw: number, condition: number, lastConditionUpdateAtDays: number }

/** Persistent player-built garden plot — mirrors `world/playerGarden.ts`'s
 *  `PlayerGardenRecord`. A plot has no construction stages of its own (crops
 *  planted on it are separate `SavePlantedCrop` records), but does carry
 *  maintenance state (plan 176): `care`/`lastMaintainedAtDays` together
 *  round-trip the lazy degradation anchor — see `resolveCultivationCare`.
 *  `hydration`/`lastHydrationUpdateAtDays`/`droughtStressDays` (plan
 *  settlements-npcs-001) round-trip the independent watering anchor — see
 *  `resolveGardenHydration`. */
export type SavePlayerGarden = {
  id: string
  x: number
  z: number
  yaw: number
  care: number
  lastMaintainedAtDays: number
  hydration: number
  lastHydrationUpdateAtDays: number
  droughtStressDays: number
}

/** Persistent player-issued work contract — mirrors `world/workContract.ts`'s
 *  `WorkContractRecord` (plan npc-014). `target`/`x`/`z` round-trip the
 *  contract's concrete world target; `postedBoardId` is the only publication
 *  state kept here — a board never gets its own duplicated posting list, it
 *  is always resolved by querying contracts (see `createWorkContracts.ts`'s
 *  `postedAt`). */
export type SaveWorkContractState =
  | 'available'
  | 'advertised'
  | 'accepted'
  | 'travelling'
  | 'working'
  | 'payment_due'
  | 'completed'
  | 'cancelled'
  | 'invalidated'
export type SaveWorkContractAdvertisement = 'not_posted' | 'posted'
export type SaveConstructionContractTarget = { kind: 'construction', targetId: string }
export type SaveWorkContract = {
  id: string
  employer: string
  workType: 'construction'
  target: SaveConstructionContractTarget
  x: number
  z: number
  rewardCoins: number
  state: SaveWorkContractState
  advertisement: SaveWorkContractAdvertisement
  postedBoardId: string | null
  createdAt: number
  postedAt: number | null
}

/** Single source of truth for the current persisted schema version
 *  (persistence-003). Bump this and add a `CURRENT_SAVE_VERSION - 1 →
 *  CURRENT_SAVE_VERSION` entry to `SAVE_MIGRATIONS` whenever the persisted
 *  representation or semantics of `SaveData` change — see the plan's
 *  "Future schema-change workflow". Never duplicate this number elsewhere;
 *  `saveState.ts` imports it instead of declaring its own constant. */
export const CURRENT_SAVE_VERSION = 2

/** Canonical save contract for the current schema version. This module
 *  intentionally carries no history of schemas from before the v1 hard cut
 *  (plan 201) — the migration pipeline below only ever walks forward from
 *  v1.
 *
 * @domain persistence
 * @system save-schema
 * @role Owns the SaveData shape and its validation/defaulting.
 * @owns SaveData
 */
export type SaveData = {
  version: typeof CURRENT_SAVE_VERSION
  config: SaveConfig
  player: SavePlayer
  savedAt: number
  quests: SaveQuests
  inventory: Partial<Record<ItemKind, number>>
  /** Per-instance item state — durability/sharpness for weapons/traps, held
   *  liquid (`liquid`/`amountLitres`, plan items-player-001) for waterskins/
   *  buckets — for every instance-backed kind (`items/Inventory.ts`'s
   *  `SaveItemInstance`). */
  inventoryInstances: SaveItemInstance[]
  /** Ids of world-generated items (`terrain/chunkItems.ts`) already picked up —
   *  see `ChunkManagerConfig.collectedItemIds`. */
  collectedItemIds: string[]
  /** Player-dropped item instances — unlike `collectedItemIds`, these aren't
   *  derivable from the seed, so the full position+kind record round-trips. */
  droppedItems: SaveDroppedItem[]
  /** Player-built campfires (`settlement/PlacedFires.ts`) — positions aren't
   *  derivable from the seed either, same reasoning as `droppedItems`. Lit/fuel
   *  state is intentionally not persisted (see `PlacedFires.ts`). */
  placedFires: SavePlacedFire[]
  /** `world/dayNight.ts`'s `DayNightState.timeOfDay` — otherwise the clock
   *  resets to the default dawn-ish start on every Continue. */
  timeOfDay: number
  /** Absolute game-days for lazy systems (tree lifecycle). */
  elapsedDays: number
  /** Single held-tool slot (`items/HeldTool.ts`). Null when nothing is in hand. */
  heldTool: ItemKind | null
  /** Sparse tree lifecycle overrides (`world/treeLifecycle.ts`) — only trees
   *  whose state diverges from procedural default + world-time growth. */
  treeOverrides: Record<string, SaveTreeOverride>
  /** Lit hand torch/branch + remaining fuel. Null when unlit. */
  playerTorch: SavePlayerTorch | null
  placedTents: SavePlacedTent[]
  placedTraps: SavePlacedTrap[]
  worldFlags: SaveWorldFlags
  /** Resolved Hidden Find spot ids (plan world-007 §10) — sparse, same
   *  "already-collected id" contract as `collectedItemIds`/`harvestedCropIds`.
   *  Positions/outcomes themselves are never persisted — they re-derive
   *  deterministically from `(landmark id, spot index)`; only "already
   *  resolved" needs to round-trip. */
  resolvedHiddenFindSpotIds: string[]
  badges: SaveBadges
  map: SaveMap
  settlementEconomies: Record<string, SettlementEconomySnapshot>
  playerNeeds: SavePlayerNeeds
  /** Sparse `settlementId:plotId` composite-key list
   *  (`settlement/landOwnership.ts`); an empty list means no purchased plots. */
  ownedLandPlots: string[]
  skills: SaveSkills
  spawnPoints: SaveSpawnPoint[]
  foodBatches: Partial<Record<ItemKind, SaveFoodBatch[]>>
  dryingRacks: SaveDryingRack[]
  hives: SaveHive[]
  fishingBait: Record<string, SaveFishingBait>
  /** Naturally-generated wild crops already harvested/removed
   *  (`terrain/chunkCrops.ts`'s deterministic placements), same sparse
   *  "id already collected" contract as `collectedItemIds`. A harvested
   *  crop is a removal, not a collected pickup, so the two id namespaces
   *  are intentionally distinct. */
  harvestedCropIds: string[]
  placedContainers: SavePlacedContainer[]
  carriedContainer: SaveCarriedContainer | null
  playerWells: SavePlayerWell[]
  terrainPreparations: SaveTerrainPreparation[]
  terrainModifications: SaveTerrainModification[]
  plantedTrees: SavePlantedTree[]
  plantedCrops: SavePlantedCrop[]
  playerGardens: SavePlayerGarden[]
  standingTorches: SaveStandingTorch[]
  palisades: SavePalisadeSegment[]
  bedrolls: SaveBedroll[]
  platforms: SavePlatform[]
  /** Authoritative mining-hits-remaining override for ore deposits
   *  (`terrain/depositMining.ts`'s `ResourceDepletionState`), keyed by
   *  `NaturalResource.id`. Sparse — an absent id restores as untouched
   *  (deterministic initial from richness); `0` means depleted. */
  resourceDeposits: Record<string, number>
  workContracts: SaveWorkContract[]
  /** NPC authoritative state (health/needs/stamina/vigor/helper assignment/
   *  active plan), keyed by stable npc id (plan persistence-001) — see
   *  `settlement/npcState.ts`'s `NpcStateSnapshot`. Sparse: an id absent here
   *  falls back to normal deterministic NPC creation (older v1 saves, or an
   *  NPC never yet constructed this session). Optional — same "existing v1
   *  slots predate this collection, missing means empty" contract as every
   *  field below (plan persistence-001 §15: no version bump/migration
   *  framework for this; every new save always writes it). */
  npcStates?: Record<NpcId, NpcStateSnapshot>
  /** Household authoritative state (stock/water/items), keyed by stable
   *  household id (plan persistence-001) — see `settlement/household.ts`'s
   *  `HouseholdSnapshot`. Same sparse/fallback/optional contract as `npcStates`. */
  households?: Record<HouseholdId, HouseholdSnapshot>
  /** Non-zero NPC↔NPC relationship pairs (plan persistence-001) — see
   *  `settlement/npcRelationships.ts`'s `NpcRelationshipEntry`. Optional, same
   *  contract as `npcStates`. */
  npcRelationships?: NpcRelationshipEntry[]
  /** House-owned livestock + merchant-horse authoritative state (plan
   *  persistence-001) — see `settlement/livestock.ts`'s `LivestockSaveRecord`.
   *  Individual wild fauna is intentionally not part of this (see
   *  `spawnPoints` above for what wild fauna does persist). Optional, same
   *  contract as `npcStates`. */
  livestock?: LivestockSaveRecord[]
  /** `${settlementId}:${animalId}` tombstones (plan persistence-001) — a
   *  livestock individual whose corpse/removal lifecycle completed before
   *  save must not be recreated by deterministic spawning on load. Optional,
   *  same contract as `npcStates`. */
  removedLivestockIds?: string[]
}

function isSaveConfig(value: unknown): value is SaveConfig {
  if (!value || typeof value !== 'object') return false
  const config = value as Record<string, unknown>
  if (typeof config.seed !== 'number') return false
  if (!config.terrain || typeof config.terrain !== 'object') return false
  if (!config.sky || typeof config.sky !== 'object') return false
  if (!config.player || typeof config.player !== 'object') return false
  if (!config.settlements || typeof config.settlements !== 'object') return false
  return true
}

function isSavePlayer(value: unknown): value is SavePlayer {
  if (!value || typeof value !== 'object') return false
  const player = value as Record<string, unknown>
  return (
    typeof player.x === 'number' &&
    typeof player.z === 'number' &&
    typeof player.yaw === 'number' &&
    typeof player.pitch === 'number' &&
    (player.mountedAnimalId === undefined || typeof player.mountedAnimalId === 'string')
  )
}

function isHeldToolField(value: unknown): value is ItemKind | null {
  if (value === null) return true
  if (typeof value !== 'string') return false
  return isToolKind(value as ItemKind)
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
    if (rec.branchRegeneratesAt !== undefined && typeof rec.branchRegeneratesAt !== 'number') return false
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
  if (flags.hiddenTreasureFound !== undefined && typeof flags.hiddenTreasureFound !== 'boolean') return false
  return true
}

const MAP_CONFIDENCE_VALUES: ReadonlySet<string> = new Set<MapConfidence>(['confirmed', 'discovered', 'estimated'])
const MAP_SOURCE_VALUES: ReadonlySet<string> = new Set<MapSource>(['book', 'exploration', 'map', 'npc'])

function isSaveLocationKnowledgeField(value: unknown): value is SaveLocationKnowledge[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const e = entry as Record<string, unknown>
    return typeof e.id === 'string' && MAP_CONFIDENCE_VALUES.has(e.state as string) && MAP_SOURCE_VALUES.has(e.source as string)
  })
}

function isSaveMap(value: unknown): value is SaveMap {
  if (!value || typeof value !== 'object') return false
  const map = value as Record<string, unknown>
  if (!Array.isArray(map.discoveredCells)) return false
  if (!map.discoveredCells.every((cell) => typeof cell === 'string')) return false
  if (!isSaveLocationKnowledgeField(map.discoveredLocations)) return false
  if (!Array.isArray(map.targets) || !map.targets.every((id) => typeof id === 'string')) return false
  return true
}

function isResolvedHiddenFindSpotIdsField(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string')
}

const BADGE_IDS: ReadonlySet<string> = new Set<BadgeId>(['desecrator', 'grave_robber', 'relic_seeker', 'treasure_hunter'])

function isSaveBadges(value: unknown): value is SaveBadges {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const b = value as Record<string, unknown>
  return (
    Array.isArray(b.earned) && b.earned.every((id) => typeof id === 'string' && BADGE_IDS.has(id)) &&
    typeof b.gravesDisturbed === 'number' &&
    typeof b.hiddenFindsFound === 'number'
  )
}

/** Validates one settlement's `{ stock, food }` snapshot (plan
 *  settlements-npcs-008) — `food.counts` is validated with the same loose
 *  "object of numbers" check `stock` always used; `food.instances` reuses
 *  `isSaveItemInstancesField` (food items are plain counts today, but the
 *  shape is the same `SaveItemInstance[]` every other `Inventory` uses). */
function isSettlementEconomySnapshot(value: unknown): value is SettlementEconomySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (!v.stock || typeof v.stock !== 'object' || Array.isArray(v.stock)) return false
  for (const amount of Object.values(v.stock as Record<string, unknown>)) {
    if (typeof amount !== 'number') return false
  }
  if (!v.food || typeof v.food !== 'object' || Array.isArray(v.food)) return false
  const food = v.food as Record<string, unknown>
  if (!food.counts || typeof food.counts !== 'object' || Array.isArray(food.counts)) return false
  for (const amount of Object.values(food.counts as Record<string, unknown>)) {
    if (typeof amount !== 'number') return false
  }
  return isSaveItemInstancesField(food.instances)
}

function isSettlementEconomiesField(value: unknown): value is Record<string, SettlementEconomySnapshot> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  for (const snapshot of Object.values(value as Record<string, unknown>)) {
    if (!isSettlementEconomySnapshot(snapshot)) return false
  }
  return true
}

function isPlayerNeedsField(value: unknown): value is SavePlayerNeeds {
  if (!value || typeof value !== 'object') return false
  const n = value as Record<string, unknown>
  return (
    typeof n.hunger === 'number' &&
    typeof n.thirst === 'number' &&
    typeof n.vigor === 'number' &&
    typeof n.starvationDuration === 'number' &&
    typeof n.dehydrationDuration === 'number'
  )
}

function isOwnedLandPlotsField(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isSaveSkill(value: unknown): value is SaveSkill {
  if (!value || typeof value !== 'object') return false
  return typeof (value as Record<string, unknown>).xp === 'number'
}

function isSkillsField(value: unknown): value is SaveSkills {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  return (
    isSaveSkill(s.sneak) &&
    isSaveSkill(s.survival) &&
    isSaveSkill(s.traps) &&
    isSaveSkill(s.defense) &&
    isSaveSkill(s.archery) &&
    // `riding` is optional here only (plan fauna-003) — a save written
    // before this skill existed has no such field at all; `restorePersistedSkills`
    // already defaults a missing key's xp to 0, so this keeps old v1 saves
    // loadable without a version bump.
    (s.riding === undefined || isSaveSkill(s.riding))
  )
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

function isSaveItemInstancesField(value: unknown): value is SaveItemInstance[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const row = entry as Record<string, unknown>
    if (typeof row.id !== 'string' || typeof row.kind !== 'string') return false
    if (isTrapKind(row.kind as ItemKind)) {
      return typeof row.durability === 'number' && Number.isFinite(row.durability)
    }
    if (row.durability !== undefined && typeof row.durability !== 'number') return false
    if (row.sharpness !== undefined && typeof row.sharpness !== 'number') return false
    // Plan items-player-001 — liquid-container rows (`liquid`/`amountLitres`),
    // both optional (an empty container omits them); when present, `liquid`
    // must be a real content and `amountLitres` a finite non-negative number.
    // Capacity clamping against the kind's actual `container.capacityLiters`
    // happens in `Inventory.instancesFromJSON`, not here.
    if (row.liquid !== undefined && row.liquid !== 'water' && row.liquid !== 'milk') return false
    if (row.amountLitres !== undefined && (typeof row.amountLitres !== 'number' || !Number.isFinite(row.amountLitres) || row.amountLitres < 0)) return false
    return true
  })
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

function isHarvestedCropIdsField(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string')
}

const CONTAINER_KINDS: ReadonlySet<string> = new Set<ContainerKind>(['chest'])

function isPlacedContainersField(value: unknown): value is SavePlacedContainer[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const c = entry as Record<string, unknown>
    return (
      typeof c.id === 'string' &&
      typeof c.kind === 'string' && CONTAINER_KINDS.has(c.kind) &&
      typeof c.x === 'number' &&
      typeof c.z === 'number' &&
      typeof c.yaw === 'number' &&
      !!c.counts && typeof c.counts === 'object' &&
      isSaveItemInstancesField(c.instances)
    )
  })
}

function isCarriedContainerField(value: unknown): value is SaveCarriedContainer | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return (
    typeof c.id === 'string' &&
    typeof c.kind === 'string' && CONTAINER_KINDS.has(c.kind) &&
    !!c.counts && typeof c.counts === 'object' &&
    isSaveItemInstancesField(c.instances)
  )
}

const WELL_STAGES: ReadonlySet<string> = new Set<WellStage>(['pit', 'roof', 'well'])

function isPlayerWellsField(value: unknown): value is SavePlayerWell[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const w = entry as Record<string, unknown>
    return (
      typeof w.id === 'string' &&
      typeof w.x === 'number' &&
      typeof w.z === 'number' &&
      typeof w.yaw === 'number' &&
      typeof w.stage === 'string' && WELL_STAGES.has(w.stage) &&
      typeof w.workProgress === 'number'
    )
  })
}

const PREPARATION_SIZES: ReadonlySet<number> = new Set<PreparationSize>([2, 3, 4])

function isHeightSamplesField(value: unknown): value is { x: number, z: number, height: number }[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const s = entry as Record<string, unknown>
    return typeof s.x === 'number' && typeof s.z === 'number' && typeof s.height === 'number'
  })
}

function isTerrainPreparationsField(value: unknown): value is SaveTerrainPreparation[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const p = entry as Record<string, unknown>
    return (
      typeof p.id === 'string' &&
      typeof p.x === 'number' &&
      typeof p.z === 'number' &&
      typeof p.size === 'number' && PREPARATION_SIZES.has(p.size) &&
      typeof p.targetHeight === 'number' &&
      isHeightSamplesField(p.originalHeights) &&
      typeof p.requiredWork === 'number' &&
      typeof p.completedWork === 'number'
    )
  })
}

const TERRAIN_MODIFICATION_RADIAL_MODES: ReadonlySet<string> = new Set(['dig', 'scorch'])

/** First true per-branch discriminated-union validator in this file — every
 *  other array field here has one shape per entry. `'dig'`/`'scorch'` need
 *  the radial fields; `'prepare'` needs `id`/`samples` instead (reusing
 *  `isHeightSamplesField`). */
function isTerrainModificationsField(value: unknown): value is SaveTerrainModification[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const m = entry as Record<string, unknown>
    if (typeof m.mode !== 'string') return false
    if (TERRAIN_MODIFICATION_RADIAL_MODES.has(m.mode)) {
      return (
        typeof m.x === 'number' &&
        typeof m.z === 'number' &&
        typeof m.radius === 'number' &&
        typeof m.depth === 'number'
      )
    }
    if (m.mode === 'prepare') {
      return typeof m.id === 'string' && isHeightSamplesField(m.samples)
    }
    return false
  })
}

const TREE_SIZE_CLASSES: ReadonlySet<string> = new Set<TreeSizeClass>(['large', 'medium', 'small'])
const CROP_IDS_SET: ReadonlySet<string> = new Set<CropId>(['cabbage', 'carrot', 'potato'])

function isPlantedTreesField(value: unknown): value is SavePlantedTree[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const t = entry as Record<string, unknown>
    return (
      typeof t.id === 'string' &&
      typeof t.x === 'number' &&
      typeof t.z === 'number' &&
      typeof t.speciesIndex === 'number' &&
      typeof t.sizeClass === 'string' && TREE_SIZE_CLASSES.has(t.sizeClass) &&
      typeof t.sizeJitter === 'number' &&
      typeof t.rotationY === 'number'
    )
  })
}

function isPlantedCropsField(value: unknown): value is SavePlantedCrop[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const c = entry as Record<string, unknown>
    return (
      typeof c.id === 'string' &&
      typeof c.x === 'number' &&
      typeof c.z === 'number' &&
      typeof c.cropId === 'string' && CROP_IDS_SET.has(c.cropId) &&
      typeof c.stageStartedAt === 'number'
    )
  })
}

function isResourceDepositsField(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every((remaining) => typeof remaining === 'number')
}

function isPlayerGardensField(value: unknown): value is SavePlayerGarden[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const g = entry as Record<string, unknown>
    return (
      typeof g.id === 'string' &&
      typeof g.x === 'number' &&
      typeof g.z === 'number' &&
      typeof g.yaw === 'number' &&
      typeof g.care === 'number' &&
      typeof g.lastMaintainedAtDays === 'number' &&
      typeof g.hydration === 'number' &&
      typeof g.lastHydrationUpdateAtDays === 'number' &&
      typeof g.droughtStressDays === 'number'
    )
  })
}

function isStandingTorchesField(value: unknown): value is SaveStandingTorch[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const t = entry as Record<string, unknown>
    return (
      typeof t.id === 'string' &&
      typeof t.x === 'number' &&
      typeof t.z === 'number' &&
      typeof t.yaw === 'number' &&
      typeof t.lit === 'boolean'
    )
  })
}

function isPalisadesField(value: unknown): value is SavePalisadeSegment[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const p = entry as Record<string, unknown>
    return (
      typeof p.id === 'string' &&
      typeof p.x === 'number' &&
      typeof p.z === 'number' &&
      typeof p.yaw === 'number'
    )
  })
}

function isBedrollsField(value: unknown): value is SaveBedroll[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const b = entry as Record<string, unknown>
    return (
      typeof b.id === 'string' &&
      typeof b.x === 'number' &&
      typeof b.z === 'number' &&
      typeof b.yaw === 'number' &&
      b.variant === 'leather' &&
      typeof b.condition === 'number' &&
      typeof b.lastConditionUpdateAtDays === 'number'
    )
  })
}

function isPlatformsField(value: unknown): value is SavePlatform[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const p = entry as Record<string, unknown>
    return (
      typeof p.id === 'string' &&
      typeof p.x === 'number' &&
      typeof p.z === 'number' &&
      typeof p.yaw === 'number' &&
      typeof p.condition === 'number' &&
      typeof p.lastConditionUpdateAtDays === 'number'
    )
  })
}

const WORK_CONTRACT_STATES: ReadonlySet<string> = new Set([
  'accepted', 'advertised', 'available', 'cancelled', 'completed', 'invalidated', 'payment_due', 'travelling', 'working',
])

function isWorkContractsField(value: unknown): value is SaveWorkContract[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const c = entry as Record<string, unknown>
    const target = c.target as Record<string, unknown> | undefined
    return (
      typeof c.id === 'string' &&
      typeof c.employer === 'string' &&
      c.workType === 'construction' &&
      !!target && typeof target === 'object' &&
      target.kind === 'construction' &&
      typeof target.targetId === 'string' &&
      typeof c.x === 'number' &&
      typeof c.z === 'number' &&
      typeof c.rewardCoins === 'number' &&
      typeof c.state === 'string' && WORK_CONTRACT_STATES.has(c.state) &&
      (c.advertisement === 'not_posted' || c.advertisement === 'posted') &&
      (c.postedBoardId === null || typeof c.postedBoardId === 'string') &&
      typeof c.createdAt === 'number' &&
      (c.postedAt === null || typeof c.postedAt === 'number')
    )
  })
}

function isCurrentMaxNumbers(value: unknown): value is { current: number, max: number } {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.current === 'number' && typeof v.max === 'number'
}

function isNpcHealth(value: unknown): value is { current: number, max: number, dead: boolean } {
  return isCurrentMaxNumbers(value) && typeof (value as Record<string, unknown>).dead === 'boolean'
}

function isNpcNeeds(value: unknown): value is { thirst: number, woodDuty: number, waterDuty: number, hunger: number } {
  if (!value || typeof value !== 'object') return false
  const n = value as Record<string, unknown>
  return (
    typeof n.thirst === 'number' &&
    typeof n.woodDuty === 'number' &&
    typeof n.waterDuty === 'number' &&
    typeof n.hunger === 'number'
  )
}

const HELPER_RESOURCE_KINDS: ReadonlySet<string> = new Set(['food'])

function isHelperAssignment(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const h = value as Record<string, unknown>
  return (
    typeof h.targetContainerId === 'string' &&
    typeof h.resourceKind === 'string' && HELPER_RESOURCE_KINDS.has(h.resourceKind) &&
    typeof h.enabled === 'boolean'
  )
}

const NPC_GOAL_IDS: ReadonlySet<string> = new Set(['fulfilWorkDuty', 'obtainWood', 'secureFood', 'secureWater'])
const NPC_PLAN_STATES: ReadonlySet<string> = new Set([
  'active', 'blocked', 'completed', 'interrupted', 'obsolete', 'partially_completed',
])
const NPC_STRATEGY_IDS: ReadonlySet<string> = new Set([
  'chopDeposit', 'economyWithdraw', 'fetchDeposit', 'gardenGather', 'householdExchange',
  'householdFood', 'householdWater', 'hunt', 'nearbyFoodSource', 'playerStorageDelivery', 'well',
])

function isNpcPlan(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  const progress = p.progress as Record<string, unknown> | undefined
  return (
    typeof p.goal === 'string' && NPC_GOAL_IDS.has(p.goal) &&
    (p.strategy === null || (typeof p.strategy === 'string' && NPC_STRATEGY_IDS.has(p.strategy))) &&
    typeof p.state === 'string' && NPC_PLAN_STATES.has(p.state) &&
    !!progress && typeof progress.amount === 'number' &&
    typeof p.currentStep === 'string'
  )
}

/** Validates one `NpcStateSnapshot` (plan persistence-001) — mirrors
 *  `settlement/npcState.ts`'s own shape; `helperAssignment`/`activePlan` are
 *  optional (absent means `null`, same as a fresh in-session snapshot). */
function isNpcStateSnapshot(value: unknown): value is NpcStateSnapshot {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  if (!isNpcHealth(s.health)) return false
  if (!isCurrentMaxNumbers(s.stamina)) return false
  if (!isCurrentMaxNumbers(s.vigor)) return false
  if (!isNpcNeeds(s.needs)) return false
  if (s.helperAssignment !== undefined && s.helperAssignment !== null && !isHelperAssignment(s.helperAssignment)) return false
  if (s.activePlan !== undefined && s.activePlan !== null && !isNpcPlan(s.activePlan)) return false
  return true
}

function isNpcStatesField(value: unknown): value is Record<NpcId, NpcStateSnapshot> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every(isNpcStateSnapshot)
}

/** Validates one `HouseholdSnapshot` (plan persistence-001) — `stock`/`items
 *  .counts` reuse the same loose "object of numbers" check `stock` already
 *  uses elsewhere in this file (`isSettlementEconomySnapshot`); `items` is
 *  optional (absent restores as an empty `Inventory`). */
function isHouseholdSnapshot(value: unknown): value is HouseholdSnapshot {
  if (!value || typeof value !== 'object') return false
  const h = value as Record<string, unknown>
  if (!h.stock || typeof h.stock !== 'object' || Array.isArray(h.stock)) return false
  for (const amount of Object.values(h.stock as Record<string, unknown>)) {
    if (typeof amount !== 'number') return false
  }
  if (typeof h.water !== 'number') return false
  if (h.items !== undefined) {
    if (!h.items || typeof h.items !== 'object') return false
    const items = h.items as Record<string, unknown>
    if (!items.counts || typeof items.counts !== 'object' || Array.isArray(items.counts)) return false
    for (const amount of Object.values(items.counts as Record<string, unknown>)) {
      if (typeof amount !== 'number') return false
    }
    if (!isSaveItemInstancesField(items.instances)) return false
  }
  return true
}

function isHouseholdsField(value: unknown): value is Record<HouseholdId, HouseholdSnapshot> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every(isHouseholdSnapshot)
}

function isNpcRelationshipsField(value: unknown): value is NpcRelationshipEntry[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const e = entry as Record<string, unknown>
    return typeof e.a === 'string' && typeof e.b === 'string' && typeof e.value === 'number'
  })
}

const ANIMAL_KINDS: ReadonlySet<string> = new Set<AnimalKind>([
  'bear', 'boar', 'chicken', 'cow', 'deer', 'donkey', 'duck', 'fox', 'horse', 'rabbit',
  'rooster', 'sheep', 'stag', 'wolf',
])

function isLivestockLife(value: unknown): value is { hunger: number, thirst: number, stamina: number } {
  if (!value || typeof value !== 'object') return false
  const l = value as Record<string, unknown>
  return typeof l.hunger === 'number' && typeof l.thirst === 'number' && typeof l.stamina === 'number'
}

function isLivestockCorpse(value: unknown): value is { timeSinceDeath: number, meatHarvested: boolean } | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return typeof c.timeSinceDeath === 'number' && typeof c.meatHarvested === 'boolean'
}

/** Validates one `LivestockSaveRecord` (plan persistence-001) — `kind` is
 *  validated against the full `AnimalKind` set (not just `LIVESTOCK_KINDS`)
 *  since a merchant horse is a plain `'horse'` too; `livestock.ts`'s own
 *  kind/owner cross-check at hydration time is what actually gates which
 *  saved records get applied to which deterministic individual. */
function isLivestockSaveRecord(value: unknown): value is LivestockSaveRecord {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    typeof r.settlementId === 'string' &&
    typeof r.animalId === 'string' &&
    typeof r.kind === 'string' && ANIMAL_KINDS.has(r.kind) &&
    (r.ownerHouseId === undefined || typeof r.ownerHouseId === 'string') &&
    typeof r.x === 'number' &&
    typeof r.z === 'number' &&
    typeof r.yaw === 'number' &&
    isNpcHealth(r.health) &&
    isLivestockLife(r.life) &&
    (r.productionReadyAtDays === null || typeof r.productionReadyAtDays === 'number') &&
    typeof r.eggPending === 'boolean' &&
    isLivestockCorpse(r.corpse)
  )
}

function isLivestockField(value: unknown): value is LivestockSaveRecord[] {
  return Array.isArray(value) && value.every(isLivestockSaveRecord)
}

function isRemovedLivestockIdsField(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string')
}

export function isSaveData(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== CURRENT_SAVE_VERSION) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  if (typeof v.savedAt !== 'number') return false
  if (!v.quests || typeof v.quests !== 'object') return false
  if (!v.inventory || typeof v.inventory !== 'object') return false
  if (!isSaveItemInstancesField(v.inventoryInstances)) return false
  if (!Array.isArray(v.collectedItemIds)) return false
  if (!Array.isArray(v.droppedItems)) return false
  if (!Array.isArray(v.placedFires)) return false
  if (typeof v.timeOfDay !== 'number') return false
  if (typeof v.elapsedDays !== 'number') return false
  if (!isHeldToolField(v.heldTool)) return false
  if (!isTreeOverridesField(v.treeOverrides)) return false
  if (!isPlayerTorchField(v.playerTorch)) return false
  if (!isPlacedTentsField(v.placedTents)) return false
  if (!isPlacedTrapsField(v.placedTraps)) return false
  if (!isWorldFlagsField(v.worldFlags)) return false
  if (!isResolvedHiddenFindSpotIdsField(v.resolvedHiddenFindSpotIds)) return false
  if (!isSaveBadges(v.badges)) return false
  if (!isSaveMap(v.map)) return false
  if (!isSettlementEconomiesField(v.settlementEconomies)) return false
  if (!isPlayerNeedsField(v.playerNeeds)) return false
  if (!isOwnedLandPlotsField(v.ownedLandPlots)) return false
  if (!isSkillsField(v.skills)) return false
  if (!isSpawnPointsField(v.spawnPoints)) return false
  if (!isFoodBatchesField(v.foodBatches)) return false
  if (!isDryingRacksField(v.dryingRacks)) return false
  if (!isHivesField(v.hives)) return false
  if (!isFishingBaitField(v.fishingBait)) return false
  if (!isHarvestedCropIdsField(v.harvestedCropIds)) return false
  if (!isPlacedContainersField(v.placedContainers)) return false
  if (!isCarriedContainerField(v.carriedContainer)) return false
  if (!isPlayerWellsField(v.playerWells)) return false
  if (!isTerrainPreparationsField(v.terrainPreparations)) return false
  if (!isTerrainModificationsField(v.terrainModifications)) return false
  if (!isPlantedTreesField(v.plantedTrees)) return false
  if (!isPlantedCropsField(v.plantedCrops)) return false
  if (!isPlayerGardensField(v.playerGardens)) return false
  if (!isStandingTorchesField(v.standingTorches)) return false
  if (!isPalisadesField(v.palisades)) return false
  if (!isBedrollsField(v.bedrolls)) return false
  if (!isPlatformsField(v.platforms)) return false
  if (!isResourceDepositsField(v.resourceDeposits)) return false
  if (!isWorkContractsField(v.workContracts)) return false
  if (v.npcStates !== undefined && !isNpcStatesField(v.npcStates)) return false
  if (v.households !== undefined && !isHouseholdsField(v.households)) return false
  if (v.npcRelationships !== undefined && !isNpcRelationshipsField(v.npcRelationships)) return false
  if (v.livestock !== undefined && !isLivestockField(v.livestock)) return false
  if (v.removedLivestockIds !== undefined && !isRemovedLivestockIdsField(v.removedLivestockIds)) return false
  return true
}

/** Accepts a stored save and returns it only if it already matches the
 *  current schema exactly, or `null` otherwise. Performs no migration and no
 *  version inspection — use `loadStoredSave()` at the persistence boundary
 *  (raw IndexedDB value → runtime), which distinguishes malformed data from
 *  an older version with a migration path from a newer, unsupported one. */
export function loadSaveData(value: unknown): SaveData | null {
  try {
    return isSaveData(value) ? value : null
  } catch {
    return null
  }
}

/** A single schema-migration step (persistence-003 §4): accepts exactly the
 *  previous persisted contract and returns exactly the next one. Must be
 *  deterministic, side-effect free, and must not mutate its input — the
 *  pipeline below always calls it with a fresh `structuredClone`. Domain
 *  hydration/defaulting is not a migration's job; a migration only
 *  translates persisted representation. */
export type SaveMigration = (data: unknown) => unknown

/** v1 → v2 (plan world-012): adds the location-knowledge/navigation-targets
 *  layer to `SaveData.map`. Every other field is untouched — `settleTarget`/
 *  navigation state simply starts empty, same "new save-shaped field always
 *  writes, older data defaults to empty" contract other sparse fields use. */
function migrateSaveV1ToV2(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const map = (v.map ?? {}) as Record<string, unknown>
  return {
    ...v,
    version: 2,
    map: {
      discoveredCells: Array.isArray(map.discoveredCells) ? map.discoveredCells : [],
      discoveredLocations: [],
      targets: [],
    },
  }
}

/** Registry of migrations, keyed by the version each one accepts as input.
 *  One entry per exact source version, chained by `migrateStoredSave()` —
 *  avoid a single monolithic function covering every historical step. */
const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  1: migrateSaveV1ToV2,
}

function detectStoredVersion(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const version = (value as Record<string, unknown>).version
  return typeof version === 'number' ? version : null
}

/** Walks `migrations` from `fromVersion` up to `toVersion`, one exact step
 *  at a time. Pure and side-effect free: never mutates `value` (each step
 *  runs against a fresh `structuredClone`), and fails closed — a missing
 *  step or a step that throws stops the chain rather than skipping ahead.
 *  Exported so the chain-walking mechanism itself (determinism, input
 *  immutability, exact source/target versions, rejection of a missing step)
 *  can be tested independently of the real `SAVE_MIGRATIONS` registry. */
export function migrateStoredSave(
  value: unknown,
  fromVersion: number,
  toVersion: number,
  migrations: Readonly<Record<number, SaveMigration>>,
): { ok: true, data: unknown } | { ok: false } {
  let migrated = value
  for (let from = fromVersion; from < toVersion; from++) {
    const migrate = migrations[from]
    if (!migrate) return { ok: false }
    try {
      migrated = migrate(structuredClone(migrated))
    } catch {
      return { ok: false }
    }
  }
  return { ok: true, data: migrated }
}

/** Result of loading a raw stored value through the full migration pipeline
 *  (persistence-003 §3/§9). `'invalid'` covers structurally malformed data,
 *  including a current-version record that fails schema validation.
 *  `'migration-failed'` covers an older, known version whose migration chain
 *  is missing a step, throws, or produces something that still fails
 *  current-schema validation. `'unsupported-version'` covers a version newer
 *  than this build knows about. Only `'ok'` may ever reach runtime. */
export type StoredSaveResult =
  | { status: 'ok', data: SaveData }
  | { status: 'invalid' }
  | { status: 'migration-failed', version: number }
  | { status: 'unsupported-version', version: number }

/** Central migration pipeline entry point (persistence-003 §3). Detects the
 *  persisted version, migrates in memory up to `CURRENT_SAVE_VERSION`, then
 *  validates against the current schema — never touches storage itself, and
 *  never persists the migrated representation (persistence-003 §7: that only
 *  happens through an ordinary later save). */
export function loadStoredSave(value: unknown): StoredSaveResult {
  try {
    const version = detectStoredVersion(value)
    if (version === null) return { status: 'invalid' }
    if (version > CURRENT_SAVE_VERSION) return { status: 'unsupported-version', version }

    const migration = migrateStoredSave(value, version, CURRENT_SAVE_VERSION, SAVE_MIGRATIONS)
    if (!migration.ok) return { status: 'migration-failed', version }

    if (isSaveData(migration.data)) return { status: 'ok', data: migration.data }
    return version === CURRENT_SAVE_VERSION ? { status: 'invalid' } : { status: 'migration-failed', version }
  } catch {
    return { status: 'invalid' }
  }
}
