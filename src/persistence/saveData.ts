import type { WorldConfig } from '../config/worldConfig'
import type { SettlementEconomySnapshot } from '../economy/settlementEconomy'
import type { SpawnPointState } from '../fauna/AnimalSpawner'
import type { ContainerKind } from '../items/container'
import type { SaveItemInstance } from '../items/Inventory'
import type { SkillId } from '../player/PlayerSkills'
import type { QuestState } from '../quests/quests'
import type { PlacedFireKind } from '../settlement/PlacedFires'
import type { PreparationSize } from '../terrain/terrainPreparation'
import type { TrapKind, TrapState } from '../world/animalTraps'
import type { CropId } from '../world/cropLifecycle'
import type { WellStage } from '../world/playerWell'
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

export type SaveMap = { discoveredCells: string[] }

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

/** Canonical (and, for now, only) save contract. Versioning/migration can be
 *  reintroduced later if the format changes again — this module intentionally
 *  carries no history of prior schemas.
 *
 * @domain persistence
 * @system save-schema
 * @role Owns the SaveData shape and its validation/defaulting.
 * @owns SaveData
 */
export type SaveData = {
  version: 1
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
  /** Authoritative mining-hits-remaining override for ore deposits
   *  (`terrain/depositMining.ts`'s `ResourceDepletionState`), keyed by
   *  `NaturalResource.id`. Sparse — an absent id restores as untouched
   *  (deterministic initial from richness); `0` means depleted. */
  resourceDeposits: Record<string, number>
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

function isSaveMap(value: unknown): value is SaveMap {
  if (!value || typeof value !== 'object') return false
  const map = value as Record<string, unknown>
  if (!Array.isArray(map.discoveredCells)) return false
  return map.discoveredCells.every((cell) => typeof cell === 'string')
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

export function isSaveData(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 1) return false
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
  if (!isResourceDepositsField(v.resourceDeposits)) return false
  return true
}

/** Accepts a stored save and returns it in the canonical v1 shape, or `null`
 *  if it doesn't match. No migration: a save from a prior schema (this
 *  module's history before the v1 hard cut) simply fails to load. */
export function loadSaveData(value: unknown): SaveData | null {
  try {
    return isSaveData(value) ? value : null
  } catch {
    return null
  }
}
