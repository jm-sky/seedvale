import type { BadgeId } from '../badges/badges'
import type { WorldConfig } from '../config/worldConfig'
import type { SettlementEconomySnapshot } from '../economy/settlementEconomy'
import type { AnimalKind } from '../fauna/AnimalAgent'
import type { SpawnPointState } from '../fauna/AnimalSpawner'
import type { PersistentOccupantSaveRecord } from '../fauna/persistentOccupants'
import type { ContainerKind } from '../items/container'
import type { InventoryContentsSnapshot, SaveItemInstance } from '../items/Inventory'
import type { SkillId } from '../player/PlayerSkills'
import type { Reputation, ReputationDimension } from '../reputation/ReputationManager'
import type { HouseholdId, HouseholdSnapshot } from '../settlement/household'
import type { LivestockSaveRecord } from '../settlement/livestock'
import type { NpcRelationshipEntry } from '../settlement/npcRelationships'
import type { NpcId, NpcStateSnapshot } from '../settlement/npcState'
import type { PlacedFireKind } from '../settlement/PlacedFires'
import type { RatInfestationState } from '../settlement/ratInfestation'
import type { RatSaveRecord } from '../settlement/ratPersistence'
import type { SettlementStructureState } from '../settlement/structureCondition'
import type { SaveTemporaryConditionsSnapshot } from '../shared/temporaryConditions'
import type { TrapKind, TrapState } from '../world/animalTraps'
import type { CropId } from '../world/cropLifecycle'
import type { MapConfidence, MapSource } from '../world/map/mapTypes'
import type { SaveGrave } from '../world/npcGraves'
import type { WellStage } from '../world/playerWell'
import type { RepairProgress } from '../world/repair'
import type { SleepingUtilityVariant } from '../world/sleepingUtilities'
import type { TransportEndpointRef, TransportExecution, TransportOrder, TransportOrderState } from '../world/transportOrder'
import type { TreeSizeClass } from '../world/treeLifecycle'
import type { WellWaterKind } from '../world/wellGroundwater'
import type { SaveWorldGeneratedContainer } from '../world/worldGeneratedContainers'
import { isAnimalStraySave } from '../fauna/animalStray'
import { EQUIPMENT_SLOTS, isEquipmentSlot, type SavePlayerEquipment } from '../items/equipment'
import { type FoodSourceSpecies, isFoodSourceSpecies } from '../items/foodFreshness'
import { isToolKind } from '../items/HeldTool'
import { isMeleeToolKind, isRangedTool } from '../items/itemCatalog'
import { ARMOR_KIND_LIST, isArmorKind, isTrapKind } from '../items/itemInstances'
import { type ItemKind } from '../items/items'
import { type SavePrimaryWeaponChoice } from '../items/primaryWeapons'
import { QUEST_STATES, type QuestProgressEntry } from '../quests/quests'
import { isPreparationSize, type PreparationSize } from '../terrain/terrainPreparation'
import { CONDITION_MAX } from '../world/condition'
import { PALISADE_REQUIRED_WORK } from '../world/palisade'
import { PLAYER_TROUGH_CAPACITY_LITRES, PLAYER_TROUGH_REQUIRED_WORK } from '../world/playerTrough'
import { WELL_STAGE_WORK_HOURS } from '../world/playerWell'
import { STANDING_TORCH_REQUIRED_WORK } from '../world/standingTorch'

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

export type { QuestProgressEntry }

export type SaveQuests = {
  progress: QuestProgressEntry[]
  relations: Record<string, number>
}

/** Stack-level freshness batches for perishable food (`items/foodFreshness.ts`). */
export type SaveFoodBatch = {
  count: number
  acquiredAtDays: number
  sourceSpecies?: FoodSourceSpecies
  accumulatedEffectiveAge: number
  lastCheckpointDays: number
  decayModifier: number
}

/** `instance` (plan 199) — set only when this drop came from an
 *  `ItemInstance` (traps, weapon-maintenance kinds). `foodBatch` preserves
 *  perishable provenance for a dropped unit (plan items-player-002). */
export type SaveDroppedItem = { id: string, kind: ItemKind, x: number, z: number, instance?: SaveItemInstance, foodBatch?: SaveFoodBatch }

/** `kind` — `'pit'` (stone-ring, longer burn) vs `'simple'` (branches only,
 *  shorter burn). `grate` is optional; a missing value restores as `false`. */
export type SavePlacedFire = { id: string, x: number, z: number, kind: PlacedFireKind, grate?: boolean }

export type SaveTreeOverride = {
  stage: 'sapling' | 'young' | 'mature' | 'old' | 'limbed' | 'felled' | 'harvested'
  stageStartedAt: number
  /** Plan items-player-012 — game-day a branch harvest becomes available
   *  again; absent means available now. */
  branchRegeneratesAt?: number
  /** Plan items-player-012 — branches left in the current regeneration
   *  cycle's rolled pool once partially collected; absent means not yet
   *  rolled this cycle. */
  branchPoolRemaining?: number
}

/** Portable hand light mid-burn (`player/PlayerTorch.ts`). */
export type SavePlayerTorch = {
  source: 'branch' | 'wooden_torch'
  /** Seconds of fuel left (clamped on restore). */
  fuelRemaining: number
}

export type SavePlacedTent = {
  id: string
  x: number
  z: number
  yaw: number
  /** 0..100 lazy weather-driven condition (plan items-player-018). */
  condition: number
  lastConditionUpdateAtDays: number
  /** Active repair episode (plan items-player-019). */
  repair?: RepairProgress
}

/** Movable fauna-007 cart — identity + world transform only. Hitch is runtime. */
export type SaveCart = {
  id: string
  x: number
  z: number
  yaw: number
}

export type SaveGuardClaimState = {
  torchGiftClaimed?: boolean
  swordRewardConsumed?: boolean
  renownRouteClaimed?: boolean
  alphaRouteClaimed?: boolean
}

export type SaveWorldFlags = {
  /** Strażnik already gifted a long_sword (quest or dialogue, plan 090). */
  guardSwordGifted?: boolean
  /** Player-caused alpha wolf kill deed (plan quests-progression-021). */
  alphaWolfDeedEarned?: boolean
  /** Per stable guard NPC reward claims (plan quests-progression-021). */
  guardClaims?: Record<NpcId, SaveGuardClaimState>
  /** Hidden-treasure easter egg (quick task) already revealed — blocks a
   *  second reward chest from spawning after all 3 flower markers are dug
   *  again post-reload. */
  hiddenTreasureFound?: boolean
  /** Plan quests-progression-009 — treasure map was read at least once. */
  treasureMapDarkForestRead?: boolean
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

/** Reputation Badges / Achievements (plan world-007 §10) — `hiddenFindsFound`
 *  is the counter `badges/badges.ts`'s `BadgeManager` derives Hidden Find
 *  progress from; not itself re-derivable from `resolvedHiddenFindSpotIds`
 *  alone (a resolved spot id doesn't say whether it yielded loot). Grave
 *  disturbance is not a badge. */
export type SaveBadges = {
  earned: readonly BadgeId[]
  hiddenFindsFound: number
}

/** Local settlement reputation & renown (plan quests-progression-001) — see
 *  `reputation/ReputationManager.ts`. Optional/sparse, same "absent means
 *  never yet populated" contract as `npcStates`/`households` below: an older
 *  save without this field restores as every settlement neutral, not a
 *  version bump/migration (nothing existing changes meaning). */
export type SaveReputation = {
  settlements: Record<string, { reputation: Reputation, renown: number }>
}

/** One pending/resolved-so-far social-news event (plan quests-progression-022
 *  §13), see `reputation/SocialNewsLedger.ts`'s `SocialNewsEventSnapshot` —
 *  independently declared here, structurally compatible, same
 *  `ReputationManager`/`SaveReputation` convention. */
export type SaveSocialNewsEvent = {
  id: string
  kind: 'dangerous_animal_deed'
  occurredAtDays: number
  expiresAtDays: number
  originX: number
  originZ: number
  reputation: Partial<Record<ReputationDimension, number>>
  renown: number
  carriers: { settlementId: string, x: number, z: number, renownSignal: number }[]
  processedSettlementIds: string[]
}

/** Pending social-news queue (plan quests-progression-022) — optional/sparse,
 *  same "absent means never yet populated" contract as `SaveReputation`
 *  above: an older save without this field restores an empty ledger, not a
 *  version bump/migration by itself (see `migrateSaveV39ToV40`). */
export type SaveSocialNews = {
  nextEventId: number
  events: SaveSocialNewsEvent[]
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
  pressure?: number
  humanTaste?: boolean
  canRecover?: boolean
  lastSettlementTripOpportunityDay?: number | null
}

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
  inputBatches?: SaveFoodBatch[]
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
  foodBatches?: Partial<Record<ItemKind, SaveFoodBatch[]>>
}

/** Plan items-player-026 — sparse forced-entry/trap mutations for a systemic
 *  treasure chest. Reconstructable trap/loot definitions are not stored. */
export type SaveTreasureChestMutation = {
  containerId: string
  attemptIndex: number
  trapTriggered?: boolean
  damaged?: boolean
  destroyed?: boolean
}

/** The container currently in the player's hands — same contents shape, no
 *  position/yaw since it has none while carried. */
export type SaveCarriedContainer = {
  id: string
  kind: ContainerKind
  counts: Partial<Record<ItemKind, number>>
  instances: SaveItemInstance[]
  foodBatches?: Partial<Record<ItemKind, SaveFoodBatch[]>>
}

/** Persistent player-built well — mirrors `world/playerWell.ts`'s
 *  `PlayerWellRecord`; the drawn `WaterSource` itself is never saved, only
 *  re-derived from `stage`/`workProgress`/`waterDepth`/`waterKind` plus the
 *  resolved roof-condition factor. `workProgress` is hours of *active*
 *  player work toward the current stage — a stage cannot finish just because
 *  time passed. `waterDepth`/`waterKind` are the groundwater result resolved
 *  once at placement (plan world-004 §1/§9/§11). Optional `roofCondition` /
 *  `lastRoofConditionUpdateAtDays` exist only after the roof is completed
 *  (plan world-020) — they are independent of `workProgress`. Optional
 *  `roofRepair` is an active repair episode (plan world-021), never a quote
 *  or remaining-work cache. */
export type SavePlayerWell = {
  id: string
  x: number
  z: number
  yaw: number
  stage: WellStage
  workProgress: number
  waterDepth: number
  waterKind: WellWaterKind
  roofCondition?: number
  lastRoofConditionUpdateAtDays?: number
  roofRepair?: RepairProgress
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

/** Compact completed `Przygotuj teren` footprint (plan world-019) — identity,
 *  centre and metre size only. Final terrain heights remain in
 *  `terrainModifications`; this collection must never duplicate them. */
export type SaveCompletedTerrainPreparation = {
  id: string
  x: number
  z: number
  size: PreparationSize
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
 *  `StandingTorchRecord`. `lit` plus `burnUntilDays` are the authoritative
 *  ignition state (plan items-player-022); the runtime flame/light is always
 *  re-derived from them on load, never saved directly. `completedWork` is the
 *  construction-progress field added by plan items-player-017 — a pre-plan
 *  save has no such field at all, so the v5→v6 migration defaults it to
 *  `STANDING_TORCH_REQUIRED_WORK` (already complete), never to 0. Legacy lit
 *  torches without a deadline become unlit in v27→v28. */
export type SaveStandingTorch = {
  id: string
  x: number
  z: number
  yaw: number
  lit: boolean
  /** World-day burn deadline while lit; `null` when unlit (plan items-player-022). */
  burnUntilDays: number | null
  completedWork: number
}

/** Persistent player-built palisade segment — mirrors `world/palisade.ts`'s
 *  `PalisadeSegmentRecord`. Each segment round-trips independently; no
 *  neighbour/connection data is persisted — connection is always re-derived
 *  from each segment's own transform on load (plan items-player-010 §9).
 *  `completedWork` is the construction-progress field added by plan
 *  items-player-017 — same "missing means already complete" migration
 *  contract as `SaveStandingTorch.completedWork`. */
export type SavePalisadeSegment = { id: string, x: number, z: number, yaw: number, completedWork: number }

/** Persistent player-built animal trough — mirrors `world/playerTrough.ts`'s
 *  `PlayerTroughRecord` (plan items-player-020). */
export type SavePlayerTrough = {
  id: string
  x: number
  z: number
  yaw: number
  completedWork: number
  waterLitres: number
}

export type SaveResidentialOwner =
  | { kind: 'player' }
  | { kind: 'household', householdId: string }
  | { kind: 'settlement', settlementId: string }
  | { kind: 'unowned' }

/** Persistent player-built residential house (plan settlements-005). Lodging
 *  is derived on restore, never stored. */
export type SaveResidentialBuilding = {
  id: string
  kind: 'small_house' | 'medium_house'
  x: number
  z: number
  yaw: number
  stage: 'foundation' | 'structure' | 'roof' | 'completed'
  stageWorkProgress: number
  materialsSupplied: boolean
  owner: SaveResidentialOwner
  settlementId: string | null
  homePlaceId: string | null
}

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
  /** Active repair episode (plan items-player-019). */
  repair?: RepairProgress
}

/** Persistent player-built raised sleeping platform — mirrors
 *  `world/sleepingUtilities.ts`'s `PlatformRecord`. No `bedroll` reference is
 *  persisted — which bedroll (if any) is "on" a platform is always resolved
 *  spatially on demand (plan items-player-013 §"Relacja bedroll ↔ platform"). */
export type SavePlatform = {
  id: string
  x: number
  z: number
  yaw: number
  condition: number
  lastConditionUpdateAtDays: number
  /** Active repair episode (plan items-player-019). */
  repair?: RepairProgress
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

/** Persistent player-issued work contract — mirrors `world/workContract.ts`'s
 *  `WorkContractRecord` (plan npc-014, discriminated `scope` since plan
 *  npc-030). `postedBoardId` is the only publication state kept here — a
 *  board never gets its own duplicated posting list, it is always resolved
 *  by querying contracts (see `createWorkContracts.ts`'s `postedAt`). */
export type SaveWorkContractState =
  | 'available'
  | 'advertised'
  | 'active'
  | 'settling'
  | 'completed'
  | 'cancelled'
  | 'invalidated'
export type SaveWorkContractAssignmentState =
  | 'accepted'
  | 'travelling'
  | 'working'
  | 'serving'
  | 'payment_due'
  | 'paid'
  | 'unpaid'
  | 'uncollectable'
  | 'released'
export type SaveWorkContractAdvertisement = 'not_posted' | 'posted'
export type SaveWorkContractAssignment = {
  npcId: string
  state: SaveWorkContractAssignmentState
  acceptedAt: number
  workStartedAt: number | null
  workCompleted: number
  rewardCoinsDue: number
  lastPaymentRequestAt: number | null
  paymentDeadline: number | null
  /** Expedition-escort service timing (plan npc-030 §6) — `null` for
   *  measurable work and before/without a duration boundary. */
  serviceStartedAt: number | null
  serviceEndsAt: number | null
}
export type SaveConstructionContractTarget = { kind: 'construction', targetId: string }
/** Mirrors `world/workContract.ts`'s `TerrainPreparationContractTarget`
 *  (plan npc-018 §14). */
export type SaveTerrainPreparationContractTarget = { kind: 'terrain_preparation', targetId: string }
/** Mirrors `world/workContract.ts`'s `PalisadeContractTarget`/
 *  `StandingTorchContractTarget` (plan items-player-017 §16). */
export type SavePalisadeContractTarget = { kind: 'palisade', targetId: string }
export type SaveStandingTorchContractTarget = { kind: 'standing_torch', targetId: string }
export type SaveResidentialBuildingContractTarget = { kind: 'residential_building', targetId: string }
export type SaveContractTarget =
  | SaveConstructionContractTarget
  | SaveTerrainPreparationContractTarget
  | SavePalisadeContractTarget
  | SaveStandingTorchContractTarget
  | SaveResidentialBuildingContractTarget

/** Mirrors `world/workContract.ts`'s `MeasurableWorkContractScope` (plan
 *  npc-030 §1). */
export type SaveMeasurableWorkContractScope = {
  kind: 'measurable_work'
  workType: 'construction' | 'terrain_preparation' | 'palisade' | 'standing_torch' | 'residential_building'
  target: SaveContractTarget
  x: number
  z: number
  requestedWorkShare: number
  remainingWorkAtCreation: number
  committedWork: number
  npcWorkCompleted: number
}

/** Mirrors `world/workContract.ts`'s `ExpeditionDestinationRef`/
 *  `ExpeditionEscortDestination`/`ExpeditionEscortTerms` (plan npc-030
 *  §7/§10). */
export type SaveExpeditionDestinationRef =
  | { kind: 'settlement', settlementId: string }
  | { kind: 'location', locationId: string }
export type SaveExpeditionEscortDestination = {
  ref: SaveExpeditionDestinationRef
  x: number
  z: number
}
export type SaveExpeditionEscortTerms = {
  completionPolicy: 'duration' | 'destination' | 'destination_or_timeout'
  durationDays?: number
  destination?: SaveExpeditionEscortDestination
}

/** Mirrors `world/workContract.ts`'s `ExpeditionEscortContractScope` (plan
 *  npc-030 §1). */
export type SaveExpeditionEscortContractScope = {
  kind: 'expedition_escort'
  terms: SaveExpeditionEscortTerms
}

export type SaveWorkContractScope = SaveMeasurableWorkContractScope | SaveExpeditionEscortContractScope

type BaseSaveWorkContract = {
  id: string
  employer: string
  rewardCoins: number
  state: SaveWorkContractState
  advertisement: SaveWorkContractAdvertisement
  postedBoardId: string | null
  createdAt: number
  postedAt: number | null
  /** Integer `>= 1` — frozen after creation (plan npc-028 §4/§20); always
   *  `1` for expedition escort (plan npc-030 §2/§27). */
  requestedWorkerCount: number
  /** Every NPC that has accepted this contract, including released and
   *  payment-due history. Not duplicated onto NPC-side save state. */
  assignments: SaveWorkContractAssignment[]
}

/** Mirrors `world/workContract.ts`'s `WorkContractRecord` union shape
 *  exactly (a proper discriminated union, not one object type whose `scope`
 *  happens to be a union) — required for structural assignability against
 *  the runtime type at load (plan npc-030). */
export type SaveWorkContract =
  | (BaseSaveWorkContract & { scope: SaveMeasurableWorkContractScope })
  | (BaseSaveWorkContract & { scope: SaveExpeditionEscortContractScope })

/** Single source of truth for the current persisted schema version
 *  (persistence-003). Bump this and add a `CURRENT_SAVE_VERSION - 1 →
 *  CURRENT_SAVE_VERSION` entry to `SAVE_MIGRATIONS` whenever the persisted
 *  representation or semantics of `SaveData` change — see the plan's
 *  "Future schema-change workflow". Never duplicate this number elsewhere;
 *  `saveState.ts` imports it instead of declaring its own constant. */
export const CURRENT_SAVE_VERSION = 40

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
   *  buckets, tent `condition` `0..100` (plan items-player-019) — for every
   *  instance-backed kind (`items/Inventory.ts`'s `SaveItemInstance`). */
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
  /** Wearable-equipment selection (`items/equipment.ts`, plan items-player-030)
   *  — per-slot instance IDs only, never a copy of item data `Inventory` already owns.
   *  Absent/empty on older saves; an invalid/no-longer-owned id restores
   *  empty rather than recreating the item. */
  playerEquipment?: SavePlayerEquipment
  /** Explicit primary weapon slots (plan ui-input-010) — player configuration,
   *  not the currently held tool. */
  primaryMeleeWeapon: SavePrimaryWeaponChoice | null
  primaryRangedWeapon: SavePrimaryWeaponChoice | null
  /** Sparse tree lifecycle overrides (`world/treeLifecycle.ts`) — only trees
   *  whose state diverges from procedural default + world-time growth. */
  treeOverrides: Record<string, SaveTreeOverride>
  /** Lit hand torch/branch + remaining fuel. Null when unlit. */
  playerTorch: SavePlayerTorch | null
  placedTents: SavePlacedTent[]
  placedTraps: SavePlacedTrap[]
  /** Movable draft carts (plan fauna-007) — world identity/transform. */
  carts: SaveCart[]
  /** NPC burial graves (plan npc-011) — positions aren't derivable from the
   *  seed; completed burials round-trip like `placedTraps`. */
  graves: SaveGrave[]
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
  /** Player temporary physical conditions (plan npc-024) — optional/sparse. */
  playerConditions?: SaveTemporaryConditionsSnapshot
  /** Monotonic direct-drink counter for deterministic unsafe-water rolls. */
  waterDrinkEventCount?: number
  /** Monotonic raw-meat-risk counter for deterministic unsafe-food rolls
   *  (plan items-player-023). */
  unsafeFoodEventCount?: number
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
  /** Plan quests-progression-009 — world-authored chests (not player-placed). */
  worldGeneratedContainers?: SaveWorldGeneratedContainer[]
  /** Plan world-024 — sparse unlocked systemic treasure chests, keyed by
   *  stable container id. Missing means none unlocked. */
  unlockedTreasureContainerIds?: string[]
  /** Plan items-player-026 — sparse forced-entry/trap mutation state keyed by
   *  stable container id. Missing means unattempted. */
  treasureChestMutations?: SaveTreasureChestMutation[]
  carriedContainer: SaveCarriedContainer | null
  playerWells: SavePlayerWell[]
  terrainPreparations: SaveTerrainPreparation[]
  /** Compact completed prepared-area facts (plan world-019). Empty on older
   *  saves after migration — never reconstructed from terrain geometry. */
  completedTerrainPreparations: SaveCompletedTerrainPreparation[]
  terrainModifications: SaveTerrainModification[]
  plantedTrees: SavePlantedTree[]
  plantedCrops: SavePlantedCrop[]
  playerGardens: SavePlayerGarden[]
  standingTorches: SaveStandingTorch[]
  playerTroughs: SavePlayerTrough[]
  palisades: SavePalisadeSegment[]
  residentialBuildings: SaveResidentialBuilding[]
  bedrolls: SaveBedroll[]
  platforms: SavePlatform[]
  /** Authoritative mining-hits-remaining override for ore deposits
   *  (`terrain/depositMining.ts`'s `ResourceDepletionState`), keyed by
   *  `NaturalResource.id`. Sparse — an absent id restores as untouched
   *  (deterministic initial from richness); `0` means depleted. */
  resourceDeposits: Record<string, number>
  workContracts: SaveWorkContract[]
  /** NPC authoritative state (health/needs/stamina/vigor/helper assignment/
   *  active plan/post-death/personal inventory), keyed by stable npc id
   *  (plan persistence-001 / npc-010 / settlements-npcs-026) — see
   *  `settlement/npcState.ts`'s `NpcStateSnapshot`. Sparse: an id absent here
   *  falls back to normal deterministic NPC creation. Optional at the
   *  collection level (missing means empty); each snapshot itself is
   *  validated against the current contract, including `postDeath` and
   *  `personalInventory`. */
  npcStates?: Record<NpcId, NpcStateSnapshot>
  /** Active/non-terminal `TransportOrder` commitments (plan
   *  settlements-npcs-019) — see `world/transportOrder.ts`'s `TransportOrder`.
   *  Reused directly: the type is already plain data with no runtime object
   *  refs. Sparse/optional, same fallback contract as `npcStates`; carrier
   *  cargo itself lives on the carrier's `npcStates[id].transportCargo`, not
   *  here. Terminal orders (`completed`/`failed`/`cancelled`) are never
   *  written — they carry no continuity requirement. */
  transportOrders?: TransportOrder[]
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
  /** Wild settlement rat individuals (plan quests-progression-006). */
  rats?: RatSaveRecord[]
  /** `${settlementId}:${animalId}` tombstones for settlement rats. */
  removedRatIds?: string[]
  /** Sparse persistent habitat occupants (plan fauna-018) — fauna-owned,
   *  not settlement-owned. Ordinary wild fauna is still not persisted. */
  persistentHabitatOccupants?: PersistentOccupantSaveRecord[]
  /** `habitatId:occupantKey` tombstones for persistent habitat occupants. */
  removedPersistentOccupantSlots?: string[]
  /** Settlement rat infestation state per settlement id (plan
   *  quests-progression-006 / quests-progression-013) — independent
   *  storage-damage and nest-destroyed facts. */
  storageInfestation?: Record<string, RatInfestationState>
  /** Sparse settlement-structure condition/repair state (plan
   *  settlements-007) — `SettlementStructureStateRegistry`'s own composite
   *  `settlementId:structure:structureId` key, same sparse/fallback contract
   *  as `grassForagePatches`/`households` above: an absent entry (including
   *  the whole field, for an older save) restores that structure as pristine
   *  (`condition: 100`, no active repair). */
  structureStates?: Record<string, SettlementStructureState>
  /** Sparse grass forage patch depletion overrides (plan fauna-010 §3/§4) —
   *  `patchId -> availableAtDays`, see `world/grassForage.ts`'s
   *  `GrassForageOverrides`. Patch *placement* is deterministic and never
   *  persisted, only which ids are currently depleted. Optional, same
   *  sparse/fallback contract as `npcStates`/`households` above — an absent
   *  save restores every patch as available. */
  grassForagePatches?: Record<string, number>
  /** Local settlement reputation & renown (plan quests-progression-001), see
   *  `SaveReputation`. Optional, same sparse/fallback contract as
   *  `npcStates`/`households` above — an absent save restores every
   *  settlement as neutral. */
  reputation?: SaveReputation
  /** Pending lazy social-news queue (plan quests-progression-022), see
   *  `SaveSocialNews`. Optional, same sparse/fallback contract as
   *  `reputation` above — an absent save restores an empty ledger. */
  socialNews?: SaveSocialNews
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

function isDroppedItemsField(value: unknown): value is SaveDroppedItem[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const d = entry as Record<string, unknown>
    if (typeof d.id !== 'string' || typeof d.kind !== 'string' || typeof d.x !== 'number' || typeof d.z !== 'number') return false
    return d.foodBatch === undefined || isSaveFoodBatch(d.foodBatch)
  })
}

function isHeldToolField(value: unknown): value is ItemKind | null {
  if (value === null) return true
  if (typeof value !== 'string') return false
  return isToolKind(value as ItemKind)
}

/** Structural shape only — each occupied slot, if present, must be a non-empty
 *  instance-id string. Ownership/slot compatibility is `createEquipmentState`'s job. */
function isPlayerEquipmentField(value: unknown): value is SavePlayerEquipment | undefined {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  for (const key of Object.keys(v)) {
    if (!isEquipmentSlot(key)) return false
    const id = v[key]
    if (id === undefined) continue
    if (typeof id !== 'string' || id.length === 0) return false
  }
  return true
}

function normalizeSavePrimaryWeaponChoice(
  value: unknown,
  slot: 'melee' | 'ranged',
): SavePrimaryWeaponChoice | null {
  if (value == null) return null
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.kind !== 'string') return null
  const kind = v.kind as ItemKind
  if (slot === 'melee' ? !isMeleeToolKind(kind) : !isRangedTool(kind)) return null
  if (v.instanceId !== undefined && v.instanceId !== null && typeof v.instanceId !== 'string') return null
  return { kind, instanceId: typeof v.instanceId === 'string' ? v.instanceId : null }
}

function isPrimaryWeaponChoiceField(value: unknown, slot: 'melee' | 'ranged'): value is SavePrimaryWeaponChoice | null {
  if (value === null) return true
  return normalizeSavePrimaryWeaponChoice(value, slot) !== null
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
    if (rec.branchPoolRemaining !== undefined && typeof rec.branchPoolRemaining !== 'number') return false
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
    if (typeof t.condition !== 'number' || typeof t.lastConditionUpdateAtDays !== 'number') return false
    if (t.repair !== undefined && !isRepairProgressField(t.repair)) return false
  }
  return true
}

function isCartsField(value: unknown): value is SaveCart[] {
  if (!Array.isArray(value)) return false
  return value.every((raw) => {
    if (!raw || typeof raw !== 'object') return false
    const c = raw as Record<string, unknown>
    return typeof c.id === 'string' && typeof c.x === 'number' && typeof c.z === 'number' && typeof c.yaw === 'number'
  })
}

function isWorldFlagsField(value: unknown): value is SaveWorldFlags {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const flags = value as Record<string, unknown>
  if (flags.guardSwordGifted !== undefined && typeof flags.guardSwordGifted !== 'boolean') return false
  if (flags.alphaWolfDeedEarned !== undefined && typeof flags.alphaWolfDeedEarned !== 'boolean') return false
  if (flags.hiddenTreasureFound !== undefined && typeof flags.hiddenTreasureFound !== 'boolean') return false
  if (flags.treasureMapDarkForestRead !== undefined && typeof flags.treasureMapDarkForestRead !== 'boolean') return false
  if (flags.guardClaims !== undefined) {
    if (!flags.guardClaims || typeof flags.guardClaims !== 'object' || Array.isArray(flags.guardClaims)) return false
    for (const [npcId, raw] of Object.entries(flags.guardClaims as Record<string, unknown>)) {
      if (typeof npcId !== 'string' || !raw || typeof raw !== 'object' || Array.isArray(raw)) return false
      const claim = raw as Record<string, unknown>
      for (const key of ['torchGiftClaimed', 'swordRewardConsumed', 'renownRouteClaimed', 'alphaRouteClaimed'] as const) {
        if (claim[key] !== undefined && typeof claim[key] !== 'boolean') return false
      }
    }
  }
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

function isTreasureChestMutationEntry(value: unknown): value is SaveTreasureChestMutation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  if (typeof row.containerId !== 'string') return false
  if (typeof row.attemptIndex !== 'number' || !Number.isInteger(row.attemptIndex) || row.attemptIndex < 0) return false
  if (row.trapTriggered !== undefined && typeof row.trapTriggered !== 'boolean') return false
  if (row.damaged !== undefined && typeof row.damaged !== 'boolean') return false
  if (row.destroyed !== undefined && typeof row.destroyed !== 'boolean') return false
  return true
}

function isTreasureChestMutationsField(value: unknown): value is SaveTreasureChestMutation[] {
  return Array.isArray(value) && value.every(isTreasureChestMutationEntry)
}

const BADGE_IDS: ReadonlySet<string> = new Set<BadgeId>(['relic_seeker', 'treasure_hunter'])

const REPUTATION_DIMENSIONS = ['trust', 'competence', 'benevolence', 'courage', 'integrity'] as const

function isReputationField(value: unknown): value is Reputation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const r = value as Record<string, unknown>
  return REPUTATION_DIMENSIONS.every((dimension) => typeof r[dimension] === 'number')
}

function isSaveReputation(value: unknown): value is SaveReputation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const settlements = (value as Record<string, unknown>).settlements
  if (!settlements || typeof settlements !== 'object' || Array.isArray(settlements)) return false
  return Object.values(settlements as Record<string, unknown>).every((standing) => {
    if (!standing || typeof standing !== 'object' || Array.isArray(standing)) return false
    const s = standing as Record<string, unknown>
    return isReputationField(s.reputation) && typeof s.renown === 'number'
  })
}

/** Sparse reputation deltas (an event's base signal, or a `SocialConsequence`)
 *  — unlike `isReputationField` (a full `Reputation` snapshot), every key is
 *  optional; only present keys are validated. */
function isPartialReputationField(value: unknown): value is Partial<Record<ReputationDimension, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const r = value as Record<string, unknown>
  return Object.keys(r).every((key) => (REPUTATION_DIMENSIONS as readonly string[]).includes(key) && typeof r[key] === 'number')
}

function isSocialNewsCarriersField(value: unknown): value is SaveSocialNewsEvent['carriers'] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const c = entry as Record<string, unknown>
    return (
      typeof c.settlementId === 'string' &&
      typeof c.x === 'number' && Number.isFinite(c.x) &&
      typeof c.z === 'number' && Number.isFinite(c.z) &&
      typeof c.renownSignal === 'number' && Number.isFinite(c.renownSignal)
    )
  })
}

function isSaveSocialNewsEvent(value: unknown): value is SaveSocialNewsEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const e = value as Record<string, unknown>
  if (typeof e.id !== 'string' || e.kind !== 'dangerous_animal_deed') return false
  if (typeof e.occurredAtDays !== 'number' || !Number.isFinite(e.occurredAtDays)) return false
  if (typeof e.expiresAtDays !== 'number' || !Number.isFinite(e.expiresAtDays)) return false
  if (typeof e.originX !== 'number' || !Number.isFinite(e.originX)) return false
  if (typeof e.originZ !== 'number' || !Number.isFinite(e.originZ)) return false
  if (!isPartialReputationField(e.reputation)) return false
  if (typeof e.renown !== 'number' || !Number.isFinite(e.renown)) return false
  if (!isSocialNewsCarriersField(e.carriers)) return false
  if (!Array.isArray(e.processedSettlementIds) || !e.processedSettlementIds.every((id) => typeof id === 'string')) return false
  return true
}

function isSaveSocialNews(value: unknown): value is SaveSocialNews {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (typeof v.nextEventId !== 'number' || !Number.isFinite(v.nextEventId)) return false
  return Array.isArray(v.events) && v.events.every(isSaveSocialNewsEvent)
}

function isSaveBadges(value: unknown): value is SaveBadges {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const b = value as Record<string, unknown>
  return (
    Array.isArray(b.earned) && b.earned.every((id) => typeof id === 'string' && BADGE_IDS.has(id)) &&
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
  return isSaveItemInstancesField(food.instances) && isOptionalFoodBatchesField(food.foodBatches)
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
    // `riding`/`medicine`/`repair` are optional here — saves written before
    // those skills existed have no such fields; `restorePersistedSkills`
    // already defaults a missing key's xp to 0, so this keeps old saves
    // loadable without a version bump.
    (s.riding === undefined || isSaveSkill(s.riding)) &&
    (s.medicine === undefined || isSaveSkill(s.medicine)) &&
    (s.repair === undefined || isSaveSkill(s.repair))
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

function isGravesField(value: unknown): value is SaveGrave[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const g = entry as Record<string, unknown>
    return (
      typeof g.id === 'string' &&
      typeof g.x === 'number' &&
      typeof g.z === 'number' &&
      typeof g.yaw === 'number' &&
      typeof g.deceasedNpcId === 'string' &&
      typeof g.buriedAtDays === 'number'
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
    if (row.condition !== undefined && (typeof row.condition !== 'number' || !Number.isFinite(row.condition))) return false
    if (row.quality !== undefined && row.quality !== 'common' && row.quality !== 'good' && row.quality !== 'masterwork') return false
    return true
  })
}

function isSaveFoodBatch(value: unknown): value is SaveFoodBatch {
  if (!value || typeof value !== 'object') return false
  const b = value as Record<string, unknown>
  if (typeof b.count !== 'number' || typeof b.acquiredAtDays !== 'number') return false
  if (typeof b.accumulatedEffectiveAge !== 'number' || typeof b.lastCheckpointDays !== 'number') return false
  if (typeof b.decayModifier !== 'number') return false
  if (b.sourceSpecies !== undefined && !isFoodSourceSpecies(b.sourceSpecies)) return false
  return true
}

function isSaveFoodBatchArray(value: unknown): value is SaveFoodBatch[] {
  return Array.isArray(value) && value.every(isSaveFoodBatch)
}

function isFoodBatchesField(value: unknown): value is Partial<Record<ItemKind, SaveFoodBatch[]>> {
  if (!value || typeof value !== 'object') return false
  return Object.values(value as Record<string, unknown>).every(isSaveFoodBatchArray)
}

function isOptionalFoodBatchesField(value: unknown): boolean {
  return value === undefined || isFoodBatchesField(value)
}

function isTimedProcessField(value: unknown): value is SaveTimedProcess | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  if (
    typeof p.id !== 'string' ||
    p.kind !== 'drying' ||
    typeof p.startedAtDays !== 'number' ||
    typeof p.durationDays !== 'number' ||
    !Array.isArray(p.input) ||
    !Array.isArray(p.output)
  ) return false
  return p.inputBatches === undefined || isSaveFoodBatchArray(p.inputBatches)
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
      isSaveItemInstancesField(c.instances) &&
      isOptionalFoodBatchesField(c.foodBatches)
    )
  })
}

function isWorldGeneratedContainersField(value: unknown): value is SaveWorldGeneratedContainer[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const c = entry as Record<string, unknown>
    return (
      typeof c.id === 'string' &&
      typeof c.x === 'number' &&
      typeof c.z === 'number' &&
      typeof c.yaw === 'number' &&
      !!c.counts && typeof c.counts === 'object' &&
      isSaveItemInstancesField(c.instances) &&
      isOptionalFoodBatchesField(c.foodBatches)
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
    isSaveItemInstancesField(c.instances) &&
    isOptionalFoodBatchesField(c.foodBatches)
  )
}

const WELL_STAGES: ReadonlySet<string> = new Set<WellStage>(['pit', 'roof', 'well'])
const WELL_WATER_KINDS: ReadonlySet<string> = new Set<WellWaterKind>(['groundwater', 'reservoir', 'underground_stream'])

function isRepairProgressField(value: unknown): value is RepairProgress {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    typeof p.startedCondition === 'number'
    && typeof p.targetCondition === 'number'
    && typeof p.requiredWork === 'number'
    && typeof p.completedWork === 'number'
  )
}

function isPlayerWellsField(value: unknown): value is SavePlayerWell[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const w = entry as Record<string, unknown>
    const hasRoofCondition = w.roofCondition !== undefined
    const hasRoofAnchor = w.lastRoofConditionUpdateAtDays !== undefined
    if (hasRoofCondition !== hasRoofAnchor) return false
    if (hasRoofCondition && (typeof w.roofCondition !== 'number' || typeof w.lastRoofConditionUpdateAtDays !== 'number')) {
      return false
    }
    if (w.roofRepair !== undefined) {
      if (!hasRoofCondition || !isRepairProgressField(w.roofRepair)) return false
    }
    return (
      typeof w.id === 'string' &&
      typeof w.x === 'number' &&
      typeof w.z === 'number' &&
      typeof w.yaw === 'number' &&
      typeof w.stage === 'string' && WELL_STAGES.has(w.stage) &&
      typeof w.workProgress === 'number' &&
      typeof w.waterDepth === 'number' &&
      typeof w.waterKind === 'string' && WELL_WATER_KINDS.has(w.waterKind)
    )
  })
}

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
      typeof p.size === 'number' && isPreparationSize(p.size) &&
      typeof p.targetHeight === 'number' &&
      isHeightSamplesField(p.originalHeights) &&
      typeof p.requiredWork === 'number' &&
      typeof p.completedWork === 'number'
    )
  })
}

function isCompletedTerrainPreparationsField(value: unknown): value is SaveCompletedTerrainPreparation[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const p = entry as Record<string, unknown>
    return (
      typeof p.id === 'string' &&
      typeof p.x === 'number' &&
      typeof p.z === 'number' &&
      typeof p.size === 'number' && isPreparationSize(p.size)
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
      typeof t.lit === 'boolean' &&
      (t.burnUntilDays === null || typeof t.burnUntilDays === 'number') &&
      typeof t.completedWork === 'number'
    )
  })
}

function isPlayerTroughsField(value: unknown): value is SavePlayerTrough[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const t = entry as Record<string, unknown>
    return (
      typeof t.id === 'string' &&
      Number.isFinite(t.x) &&
      Number.isFinite(t.z) &&
      Number.isFinite(t.yaw) &&
      typeof t.completedWork === 'number' &&
      t.completedWork >= 0 &&
      t.completedWork <= PLAYER_TROUGH_REQUIRED_WORK &&
      typeof t.waterLitres === 'number' &&
      t.waterLitres >= 0 &&
      t.waterLitres <= PLAYER_TROUGH_CAPACITY_LITRES
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
      typeof p.yaw === 'number' &&
      typeof p.completedWork === 'number'
    )
  })
}

const RESIDENTIAL_KINDS = new Set(['medium_house', 'small_house'])
const RESIDENTIAL_STAGES = new Set(['completed', 'foundation', 'roof', 'structure'])

function isResidentialOwner(value: unknown): value is SaveResidentialOwner {
  if (!value || typeof value !== 'object') return false
  const owner = value as Record<string, unknown>
  if (owner.kind === 'player' || owner.kind === 'unowned') return true
  if (owner.kind === 'household') return typeof owner.householdId === 'string'
  if (owner.kind === 'settlement') return typeof owner.settlementId === 'string'
  return false
}

function isResidentialBuildingsField(value: unknown): value is SaveResidentialBuilding[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const b = entry as Record<string, unknown>
    return (
      typeof b.id === 'string' &&
      typeof b.kind === 'string' && RESIDENTIAL_KINDS.has(b.kind) &&
      typeof b.x === 'number' &&
      typeof b.z === 'number' &&
      typeof b.yaw === 'number' &&
      typeof b.stage === 'string' && RESIDENTIAL_STAGES.has(b.stage) &&
      typeof b.stageWorkProgress === 'number' &&
      typeof b.materialsSupplied === 'boolean' &&
      isResidentialOwner(b.owner) &&
      (b.settlementId === null || typeof b.settlementId === 'string') &&
      (b.homePlaceId === null || typeof b.homePlaceId === 'string')
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
      typeof b.lastConditionUpdateAtDays === 'number' &&
      (b.repair === undefined || isRepairProgressField(b.repair))
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
      typeof p.lastConditionUpdateAtDays === 'number' &&
      (p.repair === undefined || isRepairProgressField(p.repair))
    )
  })
}

const WORK_CONTRACT_STATES: ReadonlySet<string> = new Set([
  'active', 'advertised', 'available', 'cancelled', 'completed', 'invalidated', 'settling',
])

const WORK_CONTRACT_ASSIGNMENT_STATES: ReadonlySet<string> = new Set([
  'accepted', 'paid', 'payment_due', 'released', 'serving', 'travelling', 'uncollectable', 'unpaid', 'working',
])

const WORK_CONTRACT_TARGET_KINDS: ReadonlySet<string> = new Set([
  'construction', 'palisade', 'residential_building', 'standing_torch', 'terrain_preparation',
])

const ESCORT_COMPLETION_POLICIES: ReadonlySet<string> = new Set([
  'destination', 'destination_or_timeout', 'duration',
])

const ESCORT_DESTINATION_KINDS: ReadonlySet<string> = new Set(['location', 'settlement'])

function isWorkContractAssignment(value: unknown): value is SaveWorkContractAssignment {
  if (!value || typeof value !== 'object') return false
  const a = value as Record<string, unknown>
  return (
    typeof a.npcId === 'string' &&
    typeof a.state === 'string' && WORK_CONTRACT_ASSIGNMENT_STATES.has(a.state) &&
    typeof a.acceptedAt === 'number' &&
    (a.workStartedAt === null || typeof a.workStartedAt === 'number') &&
    typeof a.workCompleted === 'number' &&
    typeof a.rewardCoinsDue === 'number' &&
    (a.lastPaymentRequestAt === null || typeof a.lastPaymentRequestAt === 'number') &&
    (a.paymentDeadline === null || typeof a.paymentDeadline === 'number') &&
    (a.serviceStartedAt === null || a.serviceStartedAt === undefined || typeof a.serviceStartedAt === 'number') &&
    (a.serviceEndsAt === null || a.serviceEndsAt === undefined || typeof a.serviceEndsAt === 'number')
  )
}

function isMeasurableWorkContractScope(value: unknown): value is SaveMeasurableWorkContractScope {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  const target = s.target as Record<string, unknown> | undefined
  return (
    s.kind === 'measurable_work' &&
    typeof s.workType === 'string' && WORK_CONTRACT_TARGET_KINDS.has(s.workType) &&
    !!target && typeof target === 'object' &&
    typeof target.kind === 'string' && WORK_CONTRACT_TARGET_KINDS.has(target.kind) &&
    typeof target.targetId === 'string' &&
    typeof s.x === 'number' &&
    typeof s.z === 'number' &&
    typeof s.requestedWorkShare === 'number' &&
    typeof s.remainingWorkAtCreation === 'number' &&
    typeof s.committedWork === 'number' &&
    typeof s.npcWorkCompleted === 'number'
  )
}

function isEscortDestination(value: unknown): value is SaveExpeditionEscortDestination {
  if (!value || typeof value !== 'object') return false
  const d = value as Record<string, unknown>
  const ref = d.ref as Record<string, unknown> | undefined
  return (
    !!ref && typeof ref === 'object' &&
    typeof ref.kind === 'string' && ESCORT_DESTINATION_KINDS.has(ref.kind) &&
    (ref.kind !== 'settlement' || typeof ref.settlementId === 'string') &&
    (ref.kind !== 'location' || typeof ref.locationId === 'string') &&
    typeof d.x === 'number' &&
    typeof d.z === 'number'
  )
}

function isExpeditionEscortContractScope(value: unknown): value is SaveExpeditionEscortContractScope {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  if (s.kind !== 'expedition_escort') return false
  const terms = s.terms as Record<string, unknown> | undefined
  if (!terms || typeof terms !== 'object') return false
  return (
    typeof terms.completionPolicy === 'string' && ESCORT_COMPLETION_POLICIES.has(terms.completionPolicy) &&
    (terms.durationDays === undefined || typeof terms.durationDays === 'number') &&
    (terms.destination === undefined || isEscortDestination(terms.destination))
  )
}

function isWorkContractsField(value: unknown): value is SaveWorkContract[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const c = entry as Record<string, unknown>
    return (
      typeof c.id === 'string' &&
      typeof c.employer === 'string' &&
      typeof c.rewardCoins === 'number' &&
      typeof c.state === 'string' && WORK_CONTRACT_STATES.has(c.state) &&
      (c.advertisement === 'not_posted' || c.advertisement === 'posted') &&
      (c.postedBoardId === null || typeof c.postedBoardId === 'string') &&
      typeof c.createdAt === 'number' &&
      (c.postedAt === null || typeof c.postedAt === 'number') &&
      typeof c.requestedWorkerCount === 'number' && Number.isInteger(c.requestedWorkerCount) && c.requestedWorkerCount >= 1 &&
      Array.isArray(c.assignments) && c.assignments.every(isWorkContractAssignment) &&
      (isMeasurableWorkContractScope(c.scope) || isExpeditionEscortContractScope(c.scope))
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

const NPC_GOAL_IDS: ReadonlySet<string> = new Set(['buryDeceased', 'fulfilWorkDuty', 'obtainWood', 'secureFood', 'secureWater'])
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
  if (typeof p.goal !== 'string' || !NPC_GOAL_IDS.has(p.goal)) return false
  if (p.goal === 'buryDeceased') {
    if (typeof p.deceasedNpcId !== 'string') return false
  } else if (p.deceasedNpcId !== undefined) {
    return false
  }
  return (
    (p.strategy === null || (typeof p.strategy === 'string' && NPC_STRATEGY_IDS.has(p.strategy))) &&
    typeof p.state === 'string' && NPC_PLAN_STATES.has(p.state) &&
    !!progress && typeof progress.amount === 'number' &&
    typeof p.currentStep === 'string'
  )
}

function isInventoryContentsSnapshot(value: unknown): value is InventoryContentsSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const items = value as Record<string, unknown>
  if (!items.counts || typeof items.counts !== 'object' || Array.isArray(items.counts)) return false
  for (const amount of Object.values(items.counts as Record<string, unknown>)) {
    if (typeof amount !== 'number') return false
  }
  return isSaveItemInstancesField(items.instances) && isOptionalFoodBatchesField(items.foodBatches)
}

/** Validates one `NpcStateSnapshot` (plan persistence-001 / npc-010 /
 *  settlements-npcs-026) — mirrors `settlement/npcState.ts`'s own shape;
 *  `physicalInjury` is optional (absent means `0`), `injuryRecoveryUpdatedAtDays`
 *  is optional (absent means initialize on first lazy resolution), same as
 *  `helperAssignment`/`activePlan` being optional (absent means `null`).
 *  `postDeath` and `personalInventory` are required on the current schema. */
function isNpcStateSnapshot(value: unknown): value is NpcStateSnapshot {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  if (!isNpcHealth(s.health)) return false
  if (!isCurrentMaxNumbers(s.stamina)) return false
  if (!isCurrentMaxNumbers(s.vigor)) return false
  if (!isNpcNeeds(s.needs)) return false
  if (s.physicalInjury !== undefined && typeof s.physicalInjury !== 'number') return false
  if (s.injuryRecoveryUpdatedAtDays !== undefined && typeof s.injuryRecoveryUpdatedAtDays !== 'number') return false
  if (s.helperAssignment !== undefined && s.helperAssignment !== null && !isHelperAssignment(s.helperAssignment)) return false
  if (s.activePlan !== undefined && s.activePlan !== null && !isNpcPlan(s.activePlan)) return false
  if (s.temporaryConditions !== undefined && !isTemporaryConditionsSnapshotField(s.temporaryConditions)) return false
  if (!('postDeath' in s) || !isNpcPostDeathField(s.postDeath)) return false
  if (s.graveVisits !== undefined) {
    if (!Array.isArray(s.graveVisits)) return false
    for (const entry of s.graveVisits) {
      if (!entry || typeof entry !== 'object') return false
      const visit = entry as Record<string, unknown>
      if (typeof visit.deceasedNpcId !== 'string') return false
      if (typeof visit.lastVisitedAtDays !== 'number') return false
    }
  }
  if (!isInventoryContentsSnapshot(s.personalInventory)) return false
  if (s.transportCargo !== undefined && !isInventoryContentsSnapshot(s.transportCargo)) return false
  if (s.accompanyCommitment !== undefined && s.accompanyCommitment !== null && !isNpcAccompanyCommitment(s.accompanyCommitment)) return false
  if (s.travel !== undefined && s.travel !== null && !isNpcTravelContinuity(s.travel)) return false
  return true
}

function isNpcWorldPoint(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const p = value as Record<string, unknown>
  return typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number'
}

function isNpcTravelPoint(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const p = value as Record<string, unknown>
  return typeof p.x === 'number' && typeof p.z === 'number'
}

function isNpcAccompanyCommitment(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const c = value as Record<string, unknown>
  if (!c.target || typeof c.target !== 'object' || Array.isArray(c.target)) return false
  if ((c.target as Record<string, unknown>).kind !== 'player') return false
  if (!c.source || typeof c.source !== 'object' || Array.isArray(c.source)) return false
  const source = c.source as Record<string, unknown>
  if (source.kind === 'work-contract') {
    if (typeof source.contractId !== 'string') return false
  } else if (source.kind !== 'voluntary') {
    return false
  }
  if (c.mode !== 'follow' && c.mode !== 'stay') return false
  if (c.stayAnchor !== undefined && !isNpcWorldPoint(c.stayAnchor)) return false
  return typeof c.startedAtDays === 'number'
}

function isNpcTravelContinuity(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const t = value as Record<string, unknown>
  if (!isNpcTravelPoint(t.destination) || !isNpcTravelPoint(t.lastPosition)) return false
  if (t.execution === undefined) return true
  if (!t.execution || typeof t.execution !== 'object' || Array.isArray(t.execution)) return false
  const e = t.execution as Record<string, unknown>
  return e.mode === 'off-screen' && typeof e.departedAtDays === 'number' && typeof e.arrivesAtDays === 'number'
}

function isTemporaryConditionsSnapshotField(value: unknown): value is SaveTemporaryConditionsSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const e = entry as Record<string, unknown>
    if (typeof e.severity !== 'number' || typeof e.lastUpdatedAtDays !== 'number') return false
  }
  return true
}

function isPlayerConditionsField(value: unknown): value is SaveTemporaryConditionsSnapshot | undefined {
  if (value === undefined) return true
  return isTemporaryConditionsSnapshotField(value)
}

const NPC_POST_DEATH_STATUSES: ReadonlySet<string> = new Set(['active', 'claimed', 'terminal'])
const NPC_CORPSE_CLEANUP_REASONS: ReadonlySet<string> = new Set(['buried', 'decay', 'legacy'])

/** Corpse loot is a full `InventoryContentsSnapshot` (plan npc-036), not a
 *  separate corpse-only shape — same validator as `personalInventory`/
 *  `transportCargo`/household items, including optional `foodBatches`. */
function isNpcPostDeathField(value: unknown): boolean {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    typeof p.status === 'string' && NPC_POST_DEATH_STATUSES.has(p.status) &&
    typeof p.x === 'number' &&
    typeof p.z === 'number' &&
    typeof p.yaw === 'number' &&
    typeof p.deathAtDays === 'number' &&
    isInventoryContentsSnapshot(p.loot) &&
    (p.cleanupReason === null || (typeof p.cleanupReason === 'string' && NPC_CORPSE_CLEANUP_REASONS.has(p.cleanupReason))) &&
    (p.burialClaimantId === undefined || p.burialClaimantId === null || typeof p.burialClaimantId === 'string')
  )
}

function isNpcStatesField(value: unknown): value is Record<NpcId, NpcStateSnapshot> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every(isNpcStateSnapshot)
}

const TRANSPORT_ORDER_STATES: ReadonlySet<string> = new Set([
  'pending', 'assigned', 'in-transit', 'completed', 'failed', 'cancelled',
] satisfies TransportOrderState[])

function isTransportEndpointRef(value: unknown): value is TransportEndpointRef {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  if (r.type === 'household') return typeof r.householdId === 'string'
  if (r.type === 'settlement-storage') return typeof r.settlementId === 'string'
  return false
}

function isTransportExecutionField(value: unknown): value is TransportExecution | undefined {
  if (value === undefined) return true
  if (!value || typeof value !== 'object') return false
  const e = value as Record<string, unknown>
  return e.mode === 'off-screen' && typeof e.arrivesAtDays === 'number'
}

/** Validates one persisted `TransportOrder` (plan settlements-npcs-019) —
 *  mirrors `world/transportOrder.ts`'s own shape. Never reconstructs cargo
 *  from these fields; this only checks the commitment record round-trips. */
function isTransportOrder(value: unknown): value is TransportOrder {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    isTransportEndpointRef(o.source) &&
    isTransportEndpointRef(o.destination) &&
    typeof o.itemKind === 'string' &&
    typeof o.requestedQuantity === 'number' &&
    typeof o.claimedQuantity === 'number' &&
    typeof o.deliveredQuantity === 'number' &&
    (o.carrierNpcId === null || typeof o.carrierNpcId === 'string') &&
    typeof o.state === 'string' && TRANSPORT_ORDER_STATES.has(o.state) &&
    isTransportExecutionField(o.execution)
  )
}

function isTransportOrdersField(value: unknown): value is TransportOrder[] {
  return Array.isArray(value) && value.every(isTransportOrder)
}

/** Validates one `HouseholdSnapshot` (plan persistence-001) — `stock`/`items
 *  .counts` reuse the same loose "object of numbers" check `stock` already
 *  uses elsewhere in this file (`isSettlementEconomySnapshot`); `items` is
 *  optional (absent restores as an empty `Inventory`). */
function isHouseholdSnapshot(value: unknown): value is HouseholdSnapshot {
  if (!value || typeof value !== 'object') return false
  const h = value as Record<string, unknown>
  if (typeof h.water !== 'number') return false
  if (!isInventoryContentsSnapshot(h.items)) return false
  if (h.agriculture !== undefined) {
    if (!isHouseholdAgricultureState(h.agriculture)) return false
  }
  return true
}

function isHouseholdAgricultureState(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const a = value as Record<string, unknown>
  if (typeof a.starterSeedsGranted !== 'boolean') return false
  if (a.lastResolvedAtDays !== undefined && typeof a.lastResolvedAtDays !== 'number') return false
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

// Plan persistence-004 §2 — `'dog'` was missing here even though it's a real
// `LivestockKind` (`settlement/livestock.ts`'s `kindsForHouse` rolls a guard
// dog per house at `DOG_OWNERSHIP_CHANCE`), so a save from any settlement
// that ever gained a dog failed `isSaveData()` outright and could never be
// read back — the concrete invalid-snapshot producer this plan traced.
const ANIMAL_KINDS: ReadonlySet<string> = new Set<AnimalKind>([
  'bear', 'boar', 'chicken', 'cow', 'deer', 'dog', 'donkey', 'duck', 'fox', 'horse', 'rabbit',
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

function isAnimalOwnerField(value: unknown): boolean {
  if (value === undefined) return true
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  if (o.kind === 'player') return true
  return o.kind === 'household' && typeof o.houseId === 'string'
}

function isOwnedAnimalControlField(value: unknown): boolean {
  if (value === undefined) return true
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  if (c.mode !== 'follow' && c.mode !== 'stay') return false
  if (c.stayAnchor === undefined) return true
  if (!c.stayAnchor || typeof c.stayAnchor !== 'object') return false
  const a = c.stayAnchor as Record<string, unknown>
  return typeof a.x === 'number' && typeof a.z === 'number'
}

/** Optional sparse human affinity on livestock individuals (plan fauna-013). */
function isAnimalAffinityField(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const e = entry as Record<string, unknown>
    if (typeof e.humanId !== 'string' || e.humanId.length === 0) return false
    if (typeof e.value !== 'number' || !Number.isFinite(e.value)) return false
    return e.value >= 0 && e.value <= 1
  })
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
    isAnimalOwnerField(r.owner) &&
    isOwnedAnimalControlField(r.control) &&
    typeof r.x === 'number' &&
    typeof r.z === 'number' &&
    typeof r.yaw === 'number' &&
    isNpcHealth(r.health) &&
    isLivestockLife(r.life) &&
    (r.productionReadyAtDays === null || typeof r.productionReadyAtDays === 'number') &&
    typeof r.eggPending === 'boolean' &&
    (r.woolReadyAtDays === undefined || r.woolReadyAtDays === null || typeof r.woolReadyAtDays === 'number') &&
    isLivestockCorpse(r.corpse) &&
    isAnimalAffinityField(r.affinity) &&
    (r.rabid === undefined || typeof r.rabid === 'boolean') &&
    (r.stray === undefined || isAnimalStraySave(r.stray))
  )
}

function isLivestockField(value: unknown): value is LivestockSaveRecord[] {
  return Array.isArray(value) && value.every(isLivestockSaveRecord)
}

function isRemovedLivestockIdsField(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string')
}

function isRatSaveRecord(value: unknown): value is RatSaveRecord {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    typeof r.settlementId === 'string' &&
    typeof r.animalId === 'string' &&
    typeof r.x === 'number' &&
    typeof r.z === 'number' &&
    typeof r.yaw === 'number' &&
    isNpcHealth(r.health) &&
    isLivestockLife(r.life) &&
    (r.productionReadyAtDays === null || typeof r.productionReadyAtDays === 'number') &&
    typeof r.eggPending === 'boolean' &&
    isLivestockCorpse(r.corpse) &&
    (r.rabid === undefined || typeof r.rabid === 'boolean')
  )
}

function isRatsField(value: unknown): value is RatSaveRecord[] {
  return Array.isArray(value) && value.every(isRatSaveRecord)
}

function isRemovedRatIdsField(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string')
}

function isAnimalSaveState(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  return (
    typeof s.x === 'number' &&
    typeof s.z === 'number' &&
    typeof s.yaw === 'number' &&
    isNpcHealth(s.health) &&
    isLivestockLife(s.life) &&
    (s.productionReadyAtDays === null || typeof s.productionReadyAtDays === 'number') &&
    typeof s.eggPending === 'boolean' &&
    (s.woolReadyAtDays === undefined || s.woolReadyAtDays === null || typeof s.woolReadyAtDays === 'number') &&
    isLivestockCorpse(s.corpse) &&
    isAnimalOwnerField(s.owner) &&
    isOwnedAnimalControlField(s.control) &&
    isAnimalAffinityField(s.affinity) &&
    (s.name === undefined || typeof s.name === 'string') &&
    (s.rabid === undefined || typeof s.rabid === 'boolean') &&
    (s.stray === undefined || isAnimalStraySave(s.stray))
  )
}

function isPersistentOccupantSaveRecord(value: unknown): value is PersistentOccupantSaveRecord {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    typeof r.habitatId === 'string' &&
    typeof r.occupantKey === 'string' &&
    typeof r.animalId === 'string' &&
    typeof r.kind === 'string' && ANIMAL_KINDS.has(r.kind) &&
    isAnimalSaveState(r.state)
  )
}

function isPersistentHabitatOccupantsField(value: unknown): value is PersistentOccupantSaveRecord[] {
  return Array.isArray(value) && value.every(isPersistentOccupantSaveRecord)
}

function isRemovedPersistentOccupantSlotsField(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string')
}

function isRatInfestationState(value: unknown): value is RatInfestationState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return typeof entry.storageDamaged === 'boolean' && typeof entry.nestDestroyed === 'boolean'
}

function isStorageInfestationField(value: unknown): value is Record<string, RatInfestationState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every(isRatInfestationState)
}

function isSettlementStructureState(value: unknown): value is SettlementStructureState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const e = value as Record<string, unknown>
  if (typeof e.structureId !== 'string' || typeof e.settlementId !== 'string') return false
  if (typeof e.condition !== 'number' || typeof e.lastConditionUpdateAtDays !== 'number') return false
  if (e.repair !== undefined && !isRepairProgressField(e.repair)) return false
  return true
}

function isStructureStatesField(value: unknown): value is Record<string, SettlementStructureState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every(isSettlementStructureState)
}

function isQuestProgressEntry(value: unknown): value is QuestProgressEntry {
  if (!value || typeof value !== 'object') return false
  const e = value as Record<string, unknown>
  if (typeof e.id !== 'string') return false
  if (typeof e.state !== 'string' || !QUEST_STATES.has(e.state as QuestProgressEntry['state'])) return false
  if (typeof e.stageIndex !== 'number' || !Number.isInteger(e.stageIndex) || e.stageIndex < 0) return false
  if (e.resolvedOutcomeId !== undefined && typeof e.resolvedOutcomeId !== 'string') return false
  if (e.stageCount !== undefined && (typeof e.stageCount !== 'number' || !Number.isInteger(e.stageCount) || e.stageCount < 0)) return false
  return true
}

function isSaveQuests(value: unknown): value is SaveQuests {
  if (!value || typeof value !== 'object') return false
  const q = value as Record<string, unknown>
  if (!Array.isArray(q.progress) || !q.progress.every(isQuestProgressEntry)) return false
  if (!q.relations || typeof q.relations !== 'object' || Array.isArray(q.relations)) return false
  return Object.values(q.relations as Record<string, unknown>).every((relation) => typeof relation === 'number')
}

export function isSaveData(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== CURRENT_SAVE_VERSION) return false
  if (!isSaveConfig(v.config)) return false
  if (!isSavePlayer(v.player)) return false
  if (typeof v.savedAt !== 'number') return false
  if (!isSaveQuests(v.quests)) return false
  if (!v.inventory || typeof v.inventory !== 'object') return false
  if (!isSaveItemInstancesField(v.inventoryInstances)) return false
  if (!Array.isArray(v.collectedItemIds)) return false
  if (!isDroppedItemsField(v.droppedItems)) return false
  if (!Array.isArray(v.placedFires)) return false
  if (typeof v.timeOfDay !== 'number') return false
  if (typeof v.elapsedDays !== 'number') return false
  if (!isHeldToolField(v.heldTool)) return false
  if (!isPlayerEquipmentField(v.playerEquipment)) return false
  if (!isPrimaryWeaponChoiceField(v.primaryMeleeWeapon, 'melee')) return false
  if (!isPrimaryWeaponChoiceField(v.primaryRangedWeapon, 'ranged')) return false
  if (!isTreeOverridesField(v.treeOverrides)) return false
  if (!isPlayerTorchField(v.playerTorch)) return false
  if (!isPlacedTentsField(v.placedTents)) return false
  if (!isPlacedTrapsField(v.placedTraps)) return false
  if (!isCartsField(v.carts)) return false
  if (!isGravesField(v.graves)) return false
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
  if (v.worldGeneratedContainers !== undefined && !isWorldGeneratedContainersField(v.worldGeneratedContainers)) return false
  if (v.unlockedTreasureContainerIds !== undefined && !isResolvedHiddenFindSpotIdsField(v.unlockedTreasureContainerIds)) return false
  if (v.treasureChestMutations !== undefined && !isTreasureChestMutationsField(v.treasureChestMutations)) return false
  if (!isCarriedContainerField(v.carriedContainer)) return false
  if (!isPlayerWellsField(v.playerWells)) return false
  if (!isTerrainPreparationsField(v.terrainPreparations)) return false
  if (!isCompletedTerrainPreparationsField(v.completedTerrainPreparations)) return false
  if (!isTerrainModificationsField(v.terrainModifications)) return false
  if (!isPlantedTreesField(v.plantedTrees)) return false
  if (!isPlantedCropsField(v.plantedCrops)) return false
  if (!isPlayerGardensField(v.playerGardens)) return false
  if (!isStandingTorchesField(v.standingTorches)) return false
  if (!isPlayerTroughsField(v.playerTroughs)) return false
  if (!isPalisadesField(v.palisades)) return false
  if (!isResidentialBuildingsField(v.residentialBuildings)) return false
  if (!isBedrollsField(v.bedrolls)) return false
  if (!isPlatformsField(v.platforms)) return false
  if (!isResourceDepositsField(v.resourceDeposits)) return false
  if (!isWorkContractsField(v.workContracts)) return false
  if (v.npcStates !== undefined && !isNpcStatesField(v.npcStates)) return false
  if (v.transportOrders !== undefined && !isTransportOrdersField(v.transportOrders)) return false
  if (v.households !== undefined && !isHouseholdsField(v.households)) return false
  if (v.npcRelationships !== undefined && !isNpcRelationshipsField(v.npcRelationships)) return false
  if (v.livestock !== undefined && !isLivestockField(v.livestock)) return false
  if (v.removedLivestockIds !== undefined && !isRemovedLivestockIdsField(v.removedLivestockIds)) return false
  if (v.rats !== undefined && !isRatsField(v.rats)) return false
  if (v.removedRatIds !== undefined && !isRemovedRatIdsField(v.removedRatIds)) return false
  if (v.persistentHabitatOccupants !== undefined && !isPersistentHabitatOccupantsField(v.persistentHabitatOccupants)) return false
  if (v.removedPersistentOccupantSlots !== undefined && !isRemovedPersistentOccupantSlotsField(v.removedPersistentOccupantSlots)) return false
  if (v.storageInfestation !== undefined && !isStorageInfestationField(v.storageInfestation)) return false
  // Same sparse "object of numbers" shape as `resourceDeposits` above.
  if (v.grassForagePatches !== undefined && !isResourceDepositsField(v.grassForagePatches)) return false
  if (v.reputation !== undefined && !isSaveReputation(v.reputation)) return false
  if (v.socialNews !== undefined && !isSaveSocialNews(v.socialNews)) return false
  if (!isPlayerConditionsField(v.playerConditions)) return false
  if (v.waterDrinkEventCount !== undefined && typeof v.waterDrinkEventCount !== 'number') return false
  if (v.unsafeFoodEventCount !== undefined && typeof v.unsafeFoodEventCount !== 'number') return false
  if (v.structureStates !== undefined && !isStructureStatesField(v.structureStates)) return false
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

/** v2 → v3 (plan npc-015): adds the NPC worker-commitment fields to every
 *  persisted `SaveWorkContract` — every contract created before this plan
 *  landed had no worker assigned, so `workerNpcId`/`acceptedAt`/
 *  `workStartedAt` simply default to `null`, same "new field defaults to
 *  empty" contract `migrateSaveV1ToV2` already used for `map`. Every other
 *  field, including contracts with no `workContracts` array at all yet, is
 *  left untouched. */
function migrateSaveV2ToV3(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const workContracts = Array.isArray(v.workContracts) ? v.workContracts : []
  return {
    ...v,
    version: 3,
    workContracts: workContracts.map((entry) => {
      const c = entry as Record<string, unknown>
      return { ...c, workerNpcId: c.workerNpcId ?? null, acceptedAt: c.acceptedAt ?? null, workStartedAt: c.workStartedAt ?? null }
    }),
  }
}

/** v3 → v4 (plan world-004): adds the resolved groundwater result to every
 *  persisted `SavePlayerWell` — a well built before this plan had no
 *  depth/kind concept at all, so it defaults to an ordinary, safely-shallow
 *  `groundwater` reading (5, below `wellGroundwater.ts`'s
 *  `DEEP_WELL_DEPTH_THRESHOLD` of 7) that reproduces its old rope-free/no-
 *  extra-capability behaviour rather than retroactively making an existing
 *  well "deep". Every other field, including wells with no `playerWells`
 *  array at all yet, is left untouched. */
function migrateSaveV3ToV4(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const playerWells = Array.isArray(v.playerWells) ? v.playerWells : []
  return {
    ...v,
    version: 4,
    playerWells: playerWells.map((entry) => {
      const w = entry as Record<string, unknown>
      return { ...w, waterDepth: typeof w.waterDepth === 'number' ? w.waterDepth : 5, waterKind: w.waterKind ?? 'groundwater' }
    }),
  }
}

/** v4 → v5 (plan npc-018): adds the shared-work commitment snapshot to every
 *  persisted `SaveWorkContract`. A contract created before this plan had no
 *  work-share concept at all — the NPC always worked toward the target's
 *  full completion, never stopping early on its own commitment — so it
 *  defaults to `requestedWorkShare: 1` with a sentinel-large
 *  `remainingWorkAtCreation`/`committedWork` that reproduces that exact old
 *  behaviour (the commitment can never be "fulfilled" before the real
 *  target completes) rather than guessing a real remaining-work number this
 *  migration has no way to recompute. `npcWorkCompleted` starts at 0 — pre-
 *  npc-018 saves never tracked it. Every other field, including contracts
 *  with no `workContracts` array at all yet, is left untouched. */
function migrateSaveV4ToV5(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const workContracts = Array.isArray(v.workContracts) ? v.workContracts : []
  return {
    ...v,
    version: 5,
    workContracts: workContracts.map((entry) => {
      const c = entry as Record<string, unknown>
      return {
        ...c,
        requestedWorkShare: typeof c.requestedWorkShare === 'number' ? c.requestedWorkShare : 1,
        remainingWorkAtCreation: typeof c.remainingWorkAtCreation === 'number' ? c.remainingWorkAtCreation : Number.MAX_SAFE_INTEGER,
        committedWork: typeof c.committedWork === 'number' ? c.committedWork : Number.MAX_SAFE_INTEGER,
        npcWorkCompleted: typeof c.npcWorkCompleted === 'number' ? c.npcWorkCompleted : 0,
      }
    }),
  }
}

/** v5 → v6 (plan items-player-017): adds construction-progress
 *  (`completedWork`) to every persisted `SaveStandingTorch`/
 *  `SavePalisadeSegment`. A torch/segment built before this plan had no
 *  construction-progress concept at all — it was already a normal
 *  functional object — so it defaults to its own buildable's
 *  `..._REQUIRED_WORK` constant (already complete) rather than 0, per this
 *  plan's explicit "existing saves restore as completed structures, never
 *  retroactively unfinished" rule. Every other field, including arrays not
 *  present at all yet, is left untouched. */
function migrateSaveV5ToV6(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const standingTorches = Array.isArray(v.standingTorches) ? v.standingTorches : []
  const palisades = Array.isArray(v.palisades) ? v.palisades : []
  return {
    ...v,
    version: 6,
    standingTorches: standingTorches.map((entry) => {
      const t = entry as Record<string, unknown>
      return { ...t, completedWork: typeof t.completedWork === 'number' ? t.completedWork : STANDING_TORCH_REQUIRED_WORK }
    }),
    palisades: palisades.map((entry) => {
      const p = entry as Record<string, unknown>
      return { ...p, completedWork: typeof p.completedWork === 'number' ? p.completedWork : PALISADE_REQUIRED_WORK }
    }),
  }
}

function migrateSaveFoodBatch(entry: unknown, fallbackDecay: number): SaveFoodBatch {
  const b = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
  const acquiredAtDays = typeof b.acquiredAtDays === 'number' && Number.isFinite(b.acquiredAtDays) ? b.acquiredAtDays : 0
  const count = typeof b.count === 'number' && Number.isFinite(b.count) ? b.count : 0
  const batch: SaveFoodBatch = {
    count,
    acquiredAtDays,
    accumulatedEffectiveAge: typeof b.accumulatedEffectiveAge === 'number' && Number.isFinite(b.accumulatedEffectiveAge)
      ? Math.max(0, b.accumulatedEffectiveAge)
      : 0,
    lastCheckpointDays: typeof b.lastCheckpointDays === 'number' && Number.isFinite(b.lastCheckpointDays)
      ? b.lastCheckpointDays
      : acquiredAtDays,
    decayModifier: typeof b.decayModifier === 'number' && Number.isFinite(b.decayModifier) && b.decayModifier > 0
      ? b.decayModifier
      : fallbackDecay,
  }
  if (isFoodSourceSpecies(b.sourceSpecies)) batch.sourceSpecies = b.sourceSpecies
  return batch
}

function migrateSaveFoodBatchesMap(value: unknown, fallbackDecay: number): Partial<Record<ItemKind, SaveFoodBatch[]>> {
  if (!value || typeof value !== 'object') return {}
  const out: Partial<Record<ItemKind, SaveFoodBatch[]>> = {}
  for (const [kind, batches] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(batches)) continue
    out[kind as ItemKind] = batches.map((entry) => migrateSaveFoodBatch(entry, fallbackDecay))
  }
  return out
}

function migrateTimedProcessV6(process: unknown): unknown {
  if (!process || typeof process !== 'object') return process
  const p = process as Record<string, unknown>
  if (Array.isArray(p.inputBatches)) {
    return { ...p, inputBatches: p.inputBatches.map((entry) => migrateSaveFoodBatch(entry, 1)) }
  }
  const startedAtDays = typeof p.startedAtDays === 'number' ? p.startedAtDays : 0
  const input = Array.isArray(p.input) ? p.input : []
  const inputBatches = input.flatMap((stack) => {
    if (!stack || typeof stack !== 'object') return []
    const s = stack as Record<string, unknown>
    const count = typeof s.count === 'number' ? s.count : 0
    if (count <= 0) return []
    return [migrateSaveFoodBatch({ count, acquiredAtDays: startedAtDays }, 1)]
  })
  return { ...p, inputBatches }
}

/** v6 → v7 (plan items-player-002): persist lazy decay fields, container /
 *  household / settlement foodBatches, drying inputBatches, and dropped
 *  food provenance. Missing batches become `{}` rather than inventing
 *  current world-time (that would refresh food). Existing player batches
 *  keep `acquiredAtDays` and start with accumulated age 0 at that timestamp. */
function migrateSaveV6ToV7(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const dryingRacks = Array.isArray(v.dryingRacks) ? v.dryingRacks : []
  const placedContainers = Array.isArray(v.placedContainers) ? v.placedContainers : []
  const droppedItems = Array.isArray(v.droppedItems) ? v.droppedItems : []
  const settlementEconomies = v.settlementEconomies && typeof v.settlementEconomies === 'object'
    ? v.settlementEconomies as Record<string, Record<string, unknown>>
    : {}
  const households = v.households && typeof v.households === 'object'
    ? v.households as Record<string, Record<string, unknown>>
    : undefined

  const carried = v.carriedContainer && typeof v.carriedContainer === 'object'
    ? v.carriedContainer as Record<string, unknown>
    : null

  return {
    ...v,
    version: 7,
    foodBatches: migrateSaveFoodBatchesMap(v.foodBatches, 1),
    droppedItems: droppedItems.map((entry) => {
      const d = entry as Record<string, unknown>
      if (d.foodBatch === undefined) return d
      return { ...d, foodBatch: migrateSaveFoodBatch(d.foodBatch, 1) }
    }),
    dryingRacks: dryingRacks.map((entry) => {
      const r = entry as Record<string, unknown>
      return { ...r, process: r.process ? migrateTimedProcessV6(r.process) : null }
    }),
    placedContainers: placedContainers.map((entry) => {
      const c = entry as Record<string, unknown>
      return { ...c, foodBatches: migrateSaveFoodBatchesMap(c.foodBatches, 0.5) }
    }),
    carriedContainer: carried
      ? { ...carried, foodBatches: migrateSaveFoodBatchesMap(carried.foodBatches, 0.5) }
      : null,
    settlementEconomies: Object.fromEntries(
      Object.entries(settlementEconomies).map(([id, snapshot]) => {
        const food = snapshot.food && typeof snapshot.food === 'object'
          ? snapshot.food as Record<string, unknown>
          : {}
        return [id, {
          ...snapshot,
          food: { ...food, foodBatches: migrateSaveFoodBatchesMap(food.foodBatches, 0.5) },
        }]
      }),
    ),
    ...(households
      ? {
          households: Object.fromEntries(
            Object.entries(households).map(([id, snapshot]) => {
              const items = snapshot.items && typeof snapshot.items === 'object'
                ? snapshot.items as Record<string, unknown>
                : undefined
              if (!items) return [id, snapshot]
              return [id, {
                ...snapshot,
                items: { ...items, foodBatches: migrateSaveFoodBatchesMap(items.foodBatches, 0.5) },
              }]
            }),
          ),
        }
      : {}),
  }
}

/** v7 → v8 (plan quests-progression-002): drops `quests.exp` (global quest
 *  EXP is gone) and leaves progress/relations intact. Outcome ids are not
 *  invented here — `QuestManager` normalizes a legacy terminal entry that
 *  has a unique matching outcome. */
function migrateSaveV7ToV8(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const quests = v.quests && typeof v.quests === 'object' ? v.quests as Record<string, unknown> : {}
  return {
    ...v,
    version: 8,
    quests: {
      progress: Array.isArray(quests.progress) ? quests.progress : [],
      relations: quests.relations && typeof quests.relations === 'object' && !Array.isArray(quests.relations)
        ? quests.relations
        : {},
    },
  }
}

/** Registry of migrations, keyed by the version each one accepts as input.
 *  One entry per exact source version, chained by `migrateStoredSave()` —
 *  avoid a single monolithic function covering every historical step. */
function migrateSaveV8ToV9(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return {
    ...v,
    version: 9,
    primaryMeleeWeapon: normalizeSavePrimaryWeaponChoice(v.primaryMeleeWeapon, 'melee'),
    primaryRangedWeapon: normalizeSavePrimaryWeaponChoice(v.primaryRangedWeapon, 'ranged'),
  }
}

function migrateSaveV9ToV10(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return {
    ...v,
    version: 10,
  }
}

/** v10 → v11 (plan npc-010): adds persisted NPC post-death/corpse state.
 *  Alive records get `postDeath: null`. Dead records from before this plan
 *  have no recoverable death transform or loot, so they become terminal
 *  legacy corpses rather than inventing a home-position body or loadout. */
function migrateSaveV10ToV11(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const npcStates = v.npcStates
  if (!npcStates || typeof npcStates !== 'object' || Array.isArray(npcStates)) {
    return { ...v, version: 11 }
  }
  const next: Record<string, unknown> = {}
  for (const [id, snapshot] of Object.entries(npcStates as Record<string, unknown>)) {
    if (!snapshot || typeof snapshot !== 'object') {
      next[id] = snapshot
      continue
    }
    const s = snapshot as Record<string, unknown>
    const health = s.health as { dead?: boolean } | undefined
    next[id] = {
      ...s,
      postDeath: health?.dead
        ? {
            status: 'terminal',
            x: 0,
            z: 0,
            yaw: 0,
            deathAtDays: 0,
            loot: { counts: {}, instances: [] },
            cleanupReason: 'legacy',
          }
        : null,
    }
  }
  return { ...v, version: 11, npcStates: next }
}

/** v11 → v12 (plan world-019): adds compact completed terrain-preparation
 *  metadata. Older saves have no durable prepared-area facts — they restore
 *  as an empty collection rather than inferring footprints from terrain
 *  geometry. */
function migrateSaveV11ToV12(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return {
    ...v,
    version: 12,
    completedTerrainPreparations: Array.isArray(v.completedTerrainPreparations)
      ? v.completedTerrainPreparations
      : [],
  }
}

/** v12 → v13 (plan settlements-npcs-026): adds empty personal inventory to
 *  every existing NPC snapshot. Does not seed profession/role/household
 *  equipment — legacy saves restore as empty belongings. */
function migrateSaveV12ToV13(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const npcStates = v.npcStates
  if (!npcStates || typeof npcStates !== 'object' || Array.isArray(npcStates)) {
    return { ...v, version: 13 }
  }
  const next: Record<string, unknown> = {}
  for (const [id, snapshot] of Object.entries(npcStates as Record<string, unknown>)) {
    if (!snapshot || typeof snapshot !== 'object') {
      next[id] = snapshot
      continue
    }
    const s = snapshot as Record<string, unknown>
    next[id] = {
      ...s,
      personalInventory: s.personalInventory ?? { counts: {}, instances: [] },
    }
  }
  return { ...v, version: 13, npcStates: next }
}

function migrateContractStateV13ToV14(state: unknown): SaveWorkContractState {
  if (state === 'accepted' || state === 'travelling' || state === 'working') return 'active'
  if (state === 'payment_due') return 'settling'
  if (state === 'available' || state === 'advertised' || state === 'active' || state === 'settling'
    || state === 'completed' || state === 'cancelled' || state === 'invalidated') {
    return state
  }
  return 'available'
}

function migrateAssignmentStateV13ToV14(state: unknown): SaveWorkContractAssignmentState {
  if (state === 'accepted' || state === 'travelling' || state === 'working' || state === 'payment_due' || state === 'released') {
    return state
  }
  return 'accepted'
}

function migrateWorkContractV13ToV14(entry: unknown): Record<string, unknown> {
  const c = (entry && typeof entry === 'object') ? entry as Record<string, unknown> : {}
  const {
    workerNpcId,
    acceptedAt,
    workStartedAt,
    assignments: existingAssignments,
    requestedWorkerCount: existingCount,
    ...rest
  } = c
  const requestedWorkerCount = typeof existingCount === 'number' && Number.isInteger(existingCount) && existingCount >= 1
    ? existingCount
    : 1
  let assignments: SaveWorkContractAssignment[]
  if (Array.isArray(existingAssignments)) {
    assignments = existingAssignments.filter(isWorkContractAssignment)
  } else if (typeof workerNpcId === 'string') {
    assignments = [{
      npcId: workerNpcId,
      state: migrateAssignmentStateV13ToV14(c.state),
      acceptedAt: typeof acceptedAt === 'number' ? acceptedAt : 0,
      workStartedAt: typeof workStartedAt === 'number' ? workStartedAt : null,
      workCompleted: typeof c.npcWorkCompleted === 'number' ? c.npcWorkCompleted : 0,
      rewardCoinsDue: 0,
      lastPaymentRequestAt: null,
      paymentDeadline: null,
      serviceStartedAt: null,
      serviceEndsAt: null,
    }]
  } else {
    assignments = []
  }
  return {
    ...rest,
    state: migrateContractStateV13ToV14(c.state),
    requestedWorkerCount,
    assignments,
  }
}

/** v13 → v14 (plan npc-028): replaces the single-worker contract fields with
 *  `requestedWorkerCount` + `assignments[]`. An old unassigned contract
 *  becomes `requestedWorkerCount: 1` with an empty assignment list. A
 *  contract that had `workerNpcId` becomes one equivalent assignment; its
 *  `workCompleted` is copied from the existing aggregate `npcWorkCompleted`
 *  and is not added to the aggregate again. Old execution states
 *  (`accepted`/`travelling`/`working`/`payment_due`) move onto that
 *  assignment; the contract itself becomes `active` or `settling`. */
function migrateSaveV13ToV14(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const workContracts = Array.isArray(v.workContracts) ? v.workContracts : []
  return {
    ...v,
    version: 14,
    workContracts: workContracts.map(migrateWorkContractV13ToV14),
  }
}

/** v14 → v15 (plan items-player-018): tents gain persisted lazy condition.
 *  Old tents default to 100% with the save's `elapsedDays` as the weather
 *  anchor, so they do not retroactively decay from day 0. */
function migrateSaveV14ToV15(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const elapsedDays = typeof v.elapsedDays === 'number' ? v.elapsedDays : 0
  const placedTents = Array.isArray(v.placedTents) ? v.placedTents : []
  return {
    ...v,
    version: 15,
    placedTents: placedTents.map((raw) => {
      if (!raw || typeof raw !== 'object') return raw
      const t = raw as Record<string, unknown>
      return {
        ...t,
        condition: typeof t.condition === 'number' ? t.condition : 100,
        lastConditionUpdateAtDays: typeof t.lastConditionUpdateAtDays === 'number'
          ? t.lastConditionUpdateAtDays
          : elapsedDays,
      }
    }),
  }
}

/** v15 → v16 (plan world-020): completed well roofs gain persisted lazy
 *  condition. Old completed roofs default to 100% with the save's
 *  `elapsedDays` as the weather/time anchor, so they do not retroactively
 *  decay from day 0. Unfinished wells stay without roof-condition state. */
function migrateSaveV15ToV16(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const elapsedDays = typeof v.elapsedDays === 'number' ? v.elapsedDays : 0
  const playerWells = Array.isArray(v.playerWells) ? v.playerWells : []
  return {
    ...v,
    version: 16,
    playerWells: playerWells.map((raw) => {
      if (!raw || typeof raw !== 'object') return raw
      const w = raw as Record<string, unknown>
      const roofComplete = w.stage === 'roof'
        && typeof w.workProgress === 'number'
        && w.workProgress >= WELL_STAGE_WORK_HOURS.roof
      if (!roofComplete) {
        const rest = { ...w }
        delete rest.roofCondition
        delete rest.lastRoofConditionUpdateAtDays
        return rest
      }
      return {
        ...w,
        roofCondition: typeof w.roofCondition === 'number' ? w.roofCondition : CONDITION_MAX,
        lastRoofConditionUpdateAtDays: typeof w.lastRoofConditionUpdateAtDays === 'number'
          ? w.lastRoofConditionUpdateAtDays
          : elapsedDays,
      }
    }),
  }
}

/** v16 → v17 (plan world-021): optional `roofRepair` on a completed roof.
 *  Pre-plan wells have no active episode — absence is the correct default,
 *  so this step only advances the version. */
function migrateSaveV16ToV17(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return { ...v, version: 17 }
}

/** v17 → v18 (plan settlements-005): player-built residential houses. Older
 *  saves have none. */
function migrateSaveV17ToV18(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return { ...v, version: 18, residentialBuildings: [] }
}

function tentInstanceRow(id: string): SaveItemInstance {
  return { id, kind: 'tent', condition: 100 }
}

function migrateTentCountToInstances(
  counts: Partial<Record<ItemKind, number>> | undefined,
  instances: SaveItemInstance[] | undefined,
  seq: { n: number },
): { counts: Partial<Record<ItemKind, number>>, instances: SaveItemInstance[] } {
  const nextCounts = { ...(counts ?? {}) }
  const nextInstances = [...(instances ?? [])]
  const stacked = nextCounts.tent
  if (typeof stacked === 'number' && stacked > 0) {
    for (let i = 0; i < stacked; i++) {
      seq.n += 1
      nextInstances.push(tentInstanceRow(`tent:migrated:${seq.n}`))
    }
  }
  delete nextCounts.tent
  return { counts: nextCounts, instances: nextInstances }
}

function migrateInventoryContentsTents(
  contents: { counts?: Partial<Record<ItemKind, number>>, instances?: SaveItemInstance[] } | undefined,
  seq: { n: number },
): { counts: Partial<Record<ItemKind, number>>, instances: SaveItemInstance[], foodBatches?: unknown } | undefined {
  if (!contents || typeof contents !== 'object') return contents as undefined
  const migrated = migrateTentCountToInstances(contents.counts, contents.instances, seq)
  return { ...contents, counts: migrated.counts, instances: migrated.instances }
}

/** v18 → v19 (plan items-player-019): stacked tents become tent instances at
 *  condition 100; camp records may carry optional `repair` (absent is the
 *  correct default). */
function migrateSaveV18ToV19(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const seq = { n: 0 }
  const inventory = (v.inventory ?? {}) as Partial<Record<ItemKind, number>>
  const inventoryInstances = Array.isArray(v.inventoryInstances) ? v.inventoryInstances as SaveItemInstance[] : []
  const playerInv = migrateTentCountToInstances(inventory, inventoryInstances, seq)

  const droppedItems = Array.isArray(v.droppedItems)
    ? (v.droppedItems as Record<string, unknown>[]).map((item) => {
      if (!item || item.kind !== 'tent' || item.instance) return item
      seq.n += 1
      return { ...item, instance: tentInstanceRow(`tent:migrated:${seq.n}`) }
    })
    : v.droppedItems

  const placedContainers = Array.isArray(v.placedContainers)
    ? (v.placedContainers as Record<string, unknown>[]).map((container) => {
      if (!container) return container
      const migrated = migrateTentCountToInstances(
        container.counts as Partial<Record<ItemKind, number>> | undefined,
        container.instances as SaveItemInstance[] | undefined,
        seq,
      )
      return { ...container, counts: migrated.counts, instances: migrated.instances }
    })
    : v.placedContainers

  const carried = v.carriedContainer && typeof v.carriedContainer === 'object'
    ? (() => {
      const c = v.carriedContainer as Record<string, unknown>
      const migrated = migrateTentCountToInstances(
        c.counts as Partial<Record<ItemKind, number>> | undefined,
        c.instances as SaveItemInstance[] | undefined,
        seq,
      )
      return { ...c, counts: migrated.counts, instances: migrated.instances }
    })()
    : v.carriedContainer

  const households = v.households && typeof v.households === 'object'
    ? Object.fromEntries(Object.entries(v.households as Record<string, unknown>).map(([id, household]) => {
      if (!household || typeof household !== 'object') return [id, household]
      const h = household as Record<string, unknown>
      const items = migrateInventoryContentsTents(h.items as { counts?: Partial<Record<ItemKind, number>>, instances?: SaveItemInstance[] }, seq)
      return [id, items ? { ...h, items } : household]
    }))
    : v.households

  const npcStates = v.npcStates && typeof v.npcStates === 'object'
    ? Object.fromEntries(Object.entries(v.npcStates as Record<string, unknown>).map(([id, state]) => {
      if (!state || typeof state !== 'object') return [id, state]
      const s = state as Record<string, unknown>
      const personalInventory = migrateInventoryContentsTents(
        s.personalInventory as { counts?: Partial<Record<ItemKind, number>>, instances?: SaveItemInstance[] },
        seq,
      )
      return [id, personalInventory ? { ...s, personalInventory } : state]
    }))
    : v.npcStates

  return {
    ...v,
    version: 19,
    inventory: playerInv.counts,
    inventoryInstances: playerInv.instances,
    droppedItems,
    placedContainers,
    carriedContainer: carried,
    households,
    npcStates,
  }
}

function migrateAssignmentV19ToV20(
  assignment: unknown,
  rewardCoins: number,
  committedWork: number,
  alreadyFrozen: number,
): SaveWorkContractAssignment | null {
  if (!assignment || typeof assignment !== 'object') return null
  const a = assignment as Record<string, unknown>
  if (typeof a.npcId !== 'string') return null
  const state = (
    a.state === 'accepted' || a.state === 'travelling' || a.state === 'working'
    || a.state === 'payment_due' || a.state === 'paid' || a.state === 'unpaid'
    || a.state === 'uncollectable' || a.state === 'released'
  ) ? a.state : 'accepted'
  const workCompleted = typeof a.workCompleted === 'number' ? a.workCompleted : 0
  let rewardCoinsDue = typeof a.rewardCoinsDue === 'number' ? a.rewardCoinsDue : 0
  if (rewardCoinsDue <= 0 && state === 'payment_due' && workCompleted > 0 && committedWork > 0 && rewardCoins > 0) {
    const proportional = Math.floor(workCompleted * rewardCoins / committedWork)
    rewardCoinsDue = Math.min(proportional, Math.max(0, rewardCoins - alreadyFrozen))
  }
  return {
    npcId: a.npcId,
    state,
    acceptedAt: typeof a.acceptedAt === 'number' ? a.acceptedAt : 0,
    workStartedAt: typeof a.workStartedAt === 'number' ? a.workStartedAt : null,
    workCompleted,
    rewardCoinsDue,
    lastPaymentRequestAt: typeof a.lastPaymentRequestAt === 'number' ? a.lastPaymentRequestAt : null,
    paymentDeadline: typeof a.paymentDeadline === 'number' ? a.paymentDeadline : null,
    serviceStartedAt: null,
    serviceEndsAt: null,
  }
}

/** v19 → v20 (plan npc-016): assignment wage-claim fields. Does not credit
 *  coins into NPC inventories — old saves never transferred wages. */
function migrateSaveV19ToV20(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const workContracts = Array.isArray(v.workContracts)
    ? (v.workContracts as unknown[]).map((entry) => {
      if (!entry || typeof entry !== 'object') return entry
      const c = entry as Record<string, unknown>
      const rewardCoins = typeof c.rewardCoins === 'number' ? c.rewardCoins : 0
      const committedWork = typeof c.committedWork === 'number' ? c.committedWork : 0
      if (!Array.isArray(c.assignments)) return { ...c }
      let frozen = 0
      const assignments: SaveWorkContractAssignment[] = []
      for (const assignment of c.assignments) {
        const migrated = migrateAssignmentV19ToV20(assignment, rewardCoins, committedWork, frozen)
        if (!migrated) continue
        frozen += Math.max(0, migrated.rewardCoinsDue)
        assignments.push(migrated)
      }
      return { ...c, assignments }
    })
    : v.workContracts
  return { ...v, version: 20, workContracts }
}

/** v20 → v21 (plan npc-011): NPC burial graves + optional post-death claim owner. */
function migrateSaveV20ToV21(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const npcStates = v.npcStates && typeof v.npcStates === 'object' && !Array.isArray(v.npcStates)
    ? Object.fromEntries(Object.entries(v.npcStates as Record<string, unknown>).map(([id, state]) => {
      if (!state || typeof state !== 'object') return [id, state]
      const s = state as Record<string, unknown>
      const postDeath = s.postDeath
      if (!postDeath || typeof postDeath !== 'object' || postDeath === null) return [id, state]
      const p = postDeath as Record<string, unknown>
      if (p.burialClaimantId !== undefined) return [id, state]
      return [id, { ...s, postDeath: { ...p, burialClaimantId: null } }]
    }))
    : v.npcStates
  return { ...v, version: 21, graves: [], npcStates }
}

/** v21 → v22 (plan items-player-020): player-built animal troughs. */
function migrateSaveV21ToV22(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return { ...v, version: 22, playerTroughs: [] }
}

/** v22 → v23 (plan quests-progression-013): storage infestation becomes
 *  `{ storageDamaged, nestDestroyed }`. Legacy `'repaired'` keeps the nest
 *  intact — old saves only knew about storage repair. */
/** v23 → v24 (plan quests-progression-007): optional wolf-den scenario fields
 *  on spawn points — defaults applied on restore when absent. */
function migrateSaveV23ToV24(data: unknown): unknown {
  return { ...(data as Record<string, unknown>), version: 24 }
}

const REMOVED_GRAVE_BADGE_IDS = new Set(['desecrator', 'grave_robber'])

/** v24 → v25: drop the global grave-disturbance badge/counter. Social
 *  exposure + settlement reputation/renown remain the only social
 *  consequence of disturbing a grave. */
function migrateSaveV24ToV25(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const prev = v.badges
  if (!prev || typeof prev !== 'object' || Array.isArray(prev)) {
    return { ...v, version: 25 }
  }
  const b = prev as { earned?: unknown, hiddenFindsFound?: unknown }
  const earned = Array.isArray(b.earned)
    ? b.earned.filter((id) => !REMOVED_GRAVE_BADGE_IDS.has(id as string))
    : b.earned
  return {
    ...v,
    version: 25,
    badges: { earned, hiddenFindsFound: b.hiddenFindsFound },
  }
}

/** v25 → v26 (plan fauna-007): persistent movable carts. Empty means a demo
 *  cart is spawned near home on restore. */
function migrateSaveV25ToV26(data: unknown): unknown {
  return { ...(data as Record<string, unknown>), version: 26, carts: [] }
}

/** v26 → v27 (plan fauna-018): sparse persistent habitat occupants + tombstones.
 *  Absent records mean first construction of each declared occupant. */
function migrateSaveV26ToV27(data: unknown): unknown {
  return {
    ...(data as Record<string, unknown>),
    version: 27,
    persistentHabitatOccupants: [],
    removedPersistentOccupantSlots: [],
  }
}

/** v27 → v28 (plan items-player-022): standing-torch world-time burn
 *  deadline. A pre-plan lit torch has no ignition timestamp, so it becomes
 *  unlit rather than immortal or granted a fresh six hours. */
function migrateSaveV27ToV28(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const standingTorches = Array.isArray(v.standingTorches) ? v.standingTorches : []
  return {
    ...v,
    version: 28,
    standingTorches: standingTorches.map((entry) => {
      const t = entry as Record<string, unknown>
      if (typeof t.burnUntilDays === 'number' && Number.isFinite(t.burnUntilDays)) {
        return { ...t, burnUntilDays: t.burnUntilDays }
      }
      return { ...t, lit: false, burnUntilDays: null }
    }),
  }
}

/** v28 → v29 (plan items-player-023): raw-meat poisoning exposure gets its
 *  own deterministic event counter (`unsafeFoodEventCount`), parallel to
 *  `waterDrinkEventCount` but never shared with it. It's optional/sparse
 *  exactly like `waterDrinkEventCount` — a pre-plan save has never rolled
 *  one, so restore already defaults a missing field to `0`
 *  (`PlayerController.restoreTemporaryConditionsState`); nothing to backfill
 *  here beyond the version bump. */
function migrateSaveV28ToV29(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return { ...v, version: 29 }
}

/** v29 → v30 (plan world-024): sparse unlocked systemic treasure chests.
 *  A pre-plan save has never unlocked one, so restore already defaults a
 *  missing field to empty. */
function migrateSaveV29ToV30(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return { ...v, version: 30 }
}

/** v30 → v31 (plan items-player-026): sparse forced-entry/trap mutations.
 *  A pre-plan save has never attempted a systemic chest, so restore already
 *  defaults a missing field to empty. */
function migrateSaveV30ToV31(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return { ...v, version: 31 }
}

/** v31 → v32 (plan settlements-npcs-019): persistent transport cargo
 *  (`npcStates[id].transportCargo`) and active `TransportOrder` commitments
 *  (`transportOrders`). Both fields are optional/sparse and already default
 *  to empty on restore — no data to migrate, just the version bump this
 *  project's schema-change workflow requires for any new persisted field. */
function migrateSaveV31ToV32(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return { ...v, version: 32 }
}

/** v32 → v33 (plan npc-036): NPC corpse loot (`postDeath.loot`) becomes a
 *  full `InventoryContentsSnapshot` instead of a `{ counts, instances }`-only
 *  shape, so death handoff can carry perishable freshness batches too. The
 *  old shape already satisfies the new one with `foodBatches` absent — no
 *  historical freshness to fabricate — so this is a version bump only. */
function migrateSaveV32ToV33(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return { ...v, version: 33 }
}

/** v33 → v34 (plan fauna-024): optional `stray` on livestock/`AnimalSaveState`.
 *  Absent means no episode, matching pre-migration behaviour. */
function migrateSaveV33ToV34(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return { ...v, version: 34 }
}

/** v34 → v35 (plan settlements-npcs-030): household agriculture bootstrap
 *  marker + off-screen catch-up anchor. Existing households are marked
 *  unresolved so the first post-migration resolve can grant starter seeds
 *  once; `lastResolvedAtDays` starts at the saved `elapsedDays` so catch-up
 *  does not replay the world's entire history. */
function migrateSaveV34ToV35(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const elapsedDays = typeof v.elapsedDays === 'number' ? v.elapsedDays : 0
  const prev = v.households
  const households = prev && typeof prev === 'object' && !Array.isArray(prev)
    ? Object.fromEntries(Object.entries(prev as Record<string, unknown>).map(([id, household]) => {
      if (!household || typeof household !== 'object' || Array.isArray(household)) return [id, household]
      const h = household as Record<string, unknown>
      if (h.agriculture && typeof h.agriculture === 'object' && !Array.isArray(h.agriculture)) {
        return [id, household]
      }
      return [id, {
        ...h,
        agriculture: { starterSeedsGranted: false, lastResolvedAtDays: elapsedDays },
      }]
    }))
    : prev
  return { ...v, version: 35, ...(households ? { households } : {}) }
}

/** v35 → v36 (plan npc-029): optional `npcStates[id].accompanyCommitment`
 *  and `npcStates[id].travel`. Both are sparse/optional and already default
 *  to null on restore — version bump only. */
function migrateSaveV35ToV36(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return { ...v, version: 36 }
}

/** v36 → v37 (plan npc-030): generalizes `SaveWorkContract` into a
 *  discriminated `scope` — every contract persisted before this plan was
 *  implicitly measurable-work, so its existing
 *  `workType`/`target`/`x`/`z`/`requestedWorkShare`/`remainingWorkAtCreation`/
 *  `committedWork`/`npcWorkCompleted` fields move into
 *  `scope: { kind: 'measurable_work', ... }` losslessly, 1:1 — no escort
 *  records are inferred from old data. Every assignment also gains the new
 *  `serviceStartedAt`/`serviceEndsAt` fields, `null` for every pre-existing
 *  (measurable-work) assignment. Every other field is left untouched. */
function migrateSaveV36ToV37(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const workContracts = Array.isArray(v.workContracts) ? v.workContracts : []
  return {
    ...v,
    version: 37,
    workContracts: workContracts.map((entry) => {
      const c = entry as Record<string, unknown>
      const stampAssignments = (assignments: unknown): unknown => (
        Array.isArray(assignments)
          ? assignments.map((assignment) => {
            const a = assignment as Record<string, unknown>
            return { ...a, serviceStartedAt: a.serviceStartedAt ?? null, serviceEndsAt: a.serviceEndsAt ?? null }
          })
          : assignments
      )
      // Always strip the legacy flat measurable-work fields from the top
      // level — idempotent even against a contract that already carries a
      // discriminated `scope` (e.g. an intermediate fixture built from the
      // current schema for an older-version migration test), which must
      // never keep stray duplicate top-level fields alongside it.
      const {
        workType, target, x, z, requestedWorkShare, remainingWorkAtCreation, committedWork, npcWorkCompleted,
        assignments, scope, ...rest
      } = c
      const nextScope = scope && typeof scope === 'object'
        ? scope
        : { kind: 'measurable_work', workType, target, x, z, requestedWorkShare, remainingWorkAtCreation, committedWork, npcWorkCompleted }
      return {
        ...rest,
        assignments: stampAssignments(assignments),
        scope: nextScope,
      }
    }),
  }
}

function armorInstanceRow(id: string, kind: ItemKind): SaveItemInstance {
  return { id, kind, quality: 'common' }
}

function migrateArmorCountToInstances(
  counts: Partial<Record<ItemKind, number>> | undefined,
  instances: SaveItemInstance[] | undefined,
  seq: { n: number },
  mintedByKind: Partial<Record<ItemKind, string[]>>,
): { counts: Partial<Record<ItemKind, number>>, instances: SaveItemInstance[] } {
  const nextCounts = { ...(counts ?? {}) }
  const nextInstances = [...(instances ?? [])]
  for (const kind of ARMOR_KIND_LIST) {
    const stacked = nextCounts[kind]
    if (typeof stacked !== 'number' || stacked <= 0) continue
    const minted: string[] = mintedByKind[kind] ?? []
    for (let i = 0; i < stacked; i++) {
      seq.n += 1
      const id = `armor:migrated:${seq.n}`
      nextInstances.push(armorInstanceRow(id, kind))
      minted.push(id)
    }
    mintedByKind[kind] = minted
    delete nextCounts[kind]
  }
  return { counts: nextCounts, instances: nextInstances }
}

function migrateInventoryContentsArmor(
  contents: { counts?: Partial<Record<ItemKind, number>>, instances?: SaveItemInstance[] } | undefined,
  seq: { n: number },
  mintedByKind: Partial<Record<ItemKind, string[]>>,
): { counts: Partial<Record<ItemKind, number>>, instances: SaveItemInstance[], foodBatches?: unknown } | undefined {
  if (!contents || typeof contents !== 'object') return contents as undefined
  const migrated = migrateArmorCountToInstances(contents.counts, contents.instances, seq, mintedByKind)
  return { ...contents, counts: migrated.counts, instances: migrated.instances }
}

/** v37 → v38 (plan items-player-030): count-backed armor → common instances;
 *  `playerEquipment.body` ItemKind → instance id. */
/** v38 → v39 (plan settlements-npcs-034): household scalar `stock.wood` → `items.branch`. */
function migrateSaveV38ToV39(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const households = v.households && typeof v.households === 'object'
    ? Object.fromEntries(Object.entries(v.households as Record<string, unknown>).map(([id, household]) => {
      if (!household || typeof household !== 'object') return [id, household]
      const h = household as Record<string, unknown>
      const stock = h.stock && typeof h.stock === 'object' && !Array.isArray(h.stock)
        ? h.stock as Record<string, unknown>
        : null
      const legacyWood = stock && typeof stock.wood === 'number' && Number.isFinite(stock.wood) && stock.wood > 0
        ? Math.floor(stock.wood)
        : 0
      const itemsRaw = h.items && typeof h.items === 'object' && !Array.isArray(h.items)
        ? { ...(h.items as Record<string, unknown>) }
        : { counts: {}, instances: [] }
      const counts = itemsRaw.counts && typeof itemsRaw.counts === 'object' && !Array.isArray(itemsRaw.counts)
        ? { ...(itemsRaw.counts as Record<string, number>) }
        : {}
      if (legacyWood > 0) counts.branch = (counts.branch ?? 0) + legacyWood
      const { stock: _removed, ...rest } = h
      return [id, { ...rest, items: { ...itemsRaw, counts } }]
    }))
    : v.households
  return { ...v, version: 39, households }
}

/** v39 → v40 (plan quests-progression-022): optional `socialNews` pending
 *  social-news queue. Absent already restores as an empty ledger (see
 *  `SaveSocialNews`'s doc) — version bump only. */
function migrateSaveV39ToV40(data: unknown): unknown {
  const v = data as Record<string, unknown>
  return { ...v, version: 40 }
}

function migrateSaveV37ToV38(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const seq = { n: 0 }
  const playerMinted: Partial<Record<ItemKind, string[]>> = {}
  const inventory = (v.inventory ?? {}) as Partial<Record<ItemKind, number>>
  const inventoryInstances = Array.isArray(v.inventoryInstances) ? v.inventoryInstances as SaveItemInstance[] : []
  const playerInv = migrateArmorCountToInstances(inventory, inventoryInstances, seq, playerMinted)

  const droppedItems = Array.isArray(v.droppedItems)
    ? (v.droppedItems as Record<string, unknown>[]).map((item) => {
      if (!item || typeof item.kind !== 'string' || !isArmorKind(item.kind as ItemKind) || item.instance) return item
      seq.n += 1
      return { ...item, instance: armorInstanceRow(`armor:migrated:${seq.n}`, item.kind as ItemKind) }
    })
    : v.droppedItems

  const otherMinted: Partial<Record<ItemKind, string[]>> = {}
  const placedContainers = Array.isArray(v.placedContainers)
    ? (v.placedContainers as Record<string, unknown>[]).map((container) => {
      if (!container) return container
      const migrated = migrateArmorCountToInstances(
        container.counts as Partial<Record<ItemKind, number>> | undefined,
        container.instances as SaveItemInstance[] | undefined,
        seq,
        otherMinted,
      )
      return { ...container, counts: migrated.counts, instances: migrated.instances }
    })
    : v.placedContainers

  const carried = v.carriedContainer && typeof v.carriedContainer === 'object'
    ? (() => {
      const c = v.carriedContainer as Record<string, unknown>
      const migrated = migrateArmorCountToInstances(
        c.counts as Partial<Record<ItemKind, number>> | undefined,
        c.instances as SaveItemInstance[] | undefined,
        seq,
        otherMinted,
      )
      return { ...c, counts: migrated.counts, instances: migrated.instances }
    })()
    : v.carriedContainer

  const households = v.households && typeof v.households === 'object'
    ? Object.fromEntries(Object.entries(v.households as Record<string, unknown>).map(([id, household]) => {
      if (!household || typeof household !== 'object') return [id, household]
      const h = household as Record<string, unknown>
      const items = migrateInventoryContentsArmor(
        h.items as { counts?: Partial<Record<ItemKind, number>>, instances?: SaveItemInstance[] },
        seq,
        otherMinted,
      )
      return [id, items ? { ...h, items } : household]
    }))
    : v.households

  const npcStates = v.npcStates && typeof v.npcStates === 'object'
    ? Object.fromEntries(Object.entries(v.npcStates as Record<string, unknown>).map(([id, state]) => {
      if (!state || typeof state !== 'object') return [id, state]
      const s = state as Record<string, unknown>
      const personalInventory = migrateInventoryContentsArmor(
        s.personalInventory as { counts?: Partial<Record<ItemKind, number>>, instances?: SaveItemInstance[] },
        seq,
        otherMinted,
      )
      return [id, personalInventory ? { ...s, personalInventory } : state]
    }))
    : v.npcStates

  let playerEquipment: SavePlayerEquipment | undefined
  const prevEquip = v.playerEquipment
  if (prevEquip && typeof prevEquip === 'object' && !Array.isArray(prevEquip)) {
    const pe = prevEquip as Record<string, unknown>
    const next: SavePlayerEquipment = {}
    for (const slot of EQUIPMENT_SLOTS) {
      const raw = pe[slot]
      if (typeof raw !== 'string' || raw.length === 0) continue
      if (slot === 'body' && isArmorKind(raw as ItemKind)) {
        const fromMinted = playerMinted[raw as ItemKind]?.[0]
        if (fromMinted) {
          next.body = fromMinted
          continue
        }
        const existing = playerInv.instances.find((row) => row.kind === raw)
        if (existing) next.body = existing.id
        continue
      }
      next[slot] = raw
    }
    if (Object.keys(next).length > 0) playerEquipment = next
  }

  return {
    ...v,
    version: 38,
    inventory: playerInv.counts,
    inventoryInstances: playerInv.instances,
    droppedItems,
    placedContainers,
    carriedContainer: carried,
    households,
    npcStates,
    playerEquipment,
  }
}

function migrateSaveV22ToV23(data: unknown): unknown {
  const v = data as Record<string, unknown>
  const prev = v.storageInfestation
  if (!prev || typeof prev !== 'object' || Array.isArray(prev)) {
    return { ...v, version: 23 }
  }
  const storageInfestation: Record<string, RatInfestationState> = {}
  for (const [id, entry] of Object.entries(prev as Record<string, unknown>)) {
    if (entry === 'active') storageInfestation[id] = { storageDamaged: true, nestDestroyed: false }
    else if (entry === 'repaired') storageInfestation[id] = { storageDamaged: false, nestDestroyed: false }
  }
  return { ...v, version: 23, storageInfestation }
}

const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  1: migrateSaveV1ToV2,
  2: migrateSaveV2ToV3,
  3: migrateSaveV3ToV4,
  4: migrateSaveV4ToV5,
  5: migrateSaveV5ToV6,
  6: migrateSaveV6ToV7,
  7: migrateSaveV7ToV8,
  8: migrateSaveV8ToV9,
  9: migrateSaveV9ToV10,
  10: migrateSaveV10ToV11,
  11: migrateSaveV11ToV12,
  12: migrateSaveV12ToV13,
  13: migrateSaveV13ToV14,
  14: migrateSaveV14ToV15,
  15: migrateSaveV15ToV16,
  16: migrateSaveV16ToV17,
  17: migrateSaveV17ToV18,
  18: migrateSaveV18ToV19,
  19: migrateSaveV19ToV20,
  20: migrateSaveV20ToV21,
  21: migrateSaveV21ToV22,
  22: migrateSaveV22ToV23,
  23: migrateSaveV23ToV24,
  24: migrateSaveV24ToV25,
  25: migrateSaveV25ToV26,
  26: migrateSaveV26ToV27,
  27: migrateSaveV27ToV28,
  28: migrateSaveV28ToV29,
  29: migrateSaveV29ToV30,
  30: migrateSaveV30ToV31,
  31: migrateSaveV31ToV32,
  32: migrateSaveV32ToV33,
  33: migrateSaveV33ToV34,
  34: migrateSaveV34ToV35,
  35: migrateSaveV35ToV36,
  36: migrateSaveV36ToV37,
  37: migrateSaveV37ToV38,
  38: migrateSaveV38ToV39,
  39: migrateSaveV39ToV40,
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
