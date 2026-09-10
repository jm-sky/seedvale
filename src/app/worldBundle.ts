import { type Scene, Vector3 } from 'three'
import type { PlayerSocialLookup } from '../ai/reactionChance'
import type { PlayAt } from '../audio/createWorldAudio'
import type { WorldConfig } from '../config/worldConfig'
import type { SettlementEconomySnapshot } from '../economy/settlementEconomy'
import type { SettlementHuntingHooks } from '../fauna/huntingHooks'
import type { PersistentOccupantSnapshot } from '../fauna/persistentOccupants'
import type { Settlement } from '../settlement/createSettlement'
import type { HouseholdId, HouseholdSnapshot } from '../settlement/household'
import type { LivestockSaveRecord } from '../settlement/livestock'
import type { NpcRelationshipEntry } from '../settlement/npcRelationships'
import type { NpcId, NpcStateSnapshot } from '../settlement/npcState'
import type { SettlementDef } from '../settlement/settlementGenerator'
import type { ChunkCoord } from '../terrain/chunkGrid'
import type { ResourceDepletionState } from '../terrain/depositMining'
import type { CompletedTerrainPreparation, TerrainPreparationRecord } from '../terrain/terrainPreparation'
import type { PlacedTrapRecord } from '../world/animalTraps'
import type { BeehiveRecord } from '../world/beehives'
import type { CropPlacement } from '../world/cropLifecycle'
import type { DayNightState } from '../world/dayNight'
import type { DryingRackRecord } from '../world/dryingRacks'
import type { SettlementFoodSourceHooks } from '../world/foodSources'
import type { GrassForageOverrides } from '../world/grassForage'
import type { HelperDeliveryHooks } from '../world/helperDeliveryHooks'
import type { NpcGraves, SaveGrave } from '../world/npcGraves'
import type { PalisadeSegmentRecord } from '../world/palisade'
import type { PlantedTreeRecord } from '../world/plantedTrees'
import type { PlayerGardenRecord } from '../world/playerGarden'
import type { PlayerTroughRecord } from '../world/playerTrough'
import type { NearbyPlayerWellLookup, PlayerWellRecord } from '../world/playerWell'
import type { PointLightBudget } from '../world/pointLightBudget'
import type { ResidentialBuildingRecord } from '../world/residentialBuilding'
import type { SettlementForestHooks } from '../world/settlementForestHooks'
import type { BedrollRecord, PlatformRecord } from '../world/sleepingUtilities'
import type { StandingTorchRecord } from '../world/standingTorch'
import type { TreeLifecycle } from '../world/treeLifecycle'
import type { WorkContractRecord } from '../world/workContract'
import { type SavedSpawnPointState, snapshotSpawnPointState } from '../fauna/AnimalSpawner'
import { createFauna, type Fauna, SPAWNER_RING_OFFSET } from '../fauna/createFauna'
import { createHuntingHooks } from '../fauna/huntingHooks'
import { createDroppedItems, type DroppedItem, type DroppedItems } from '../items/createDroppedItems'
import { createItemSpawners, type ItemSpawners } from '../items/createItemSpawners'
import { createPlacedTents, type PlacedTent, type PlacedTents } from '../items/createPlacedTents'
import { preloadHeldToolModels } from '../items/heldToolVisual'
import { preloadItemGlbModels } from '../items/itemModels'
import { villageSizeConfig } from '../settlement/families'
import { createPlacedFires, type PlacedFire, type PlacedFires } from '../settlement/PlacedFires'
import { clearRoadNetworkCaches } from '../settlement/roadNetwork'
import { settlementDefFor } from '../settlement/settlementPlanCache'
import { createSettlementsManager, type SettlementsManager } from '../settlement/SettlementsManager'
import { preloadAnimalTroughVisual } from '../settlement/settlementStructures'
import { useBootMark } from '../shared/bootMark'
import {
  type ChunkManager,
  type ChunkManagerConfig,
  createChunkManager,
  type TerrainModification,
} from '../terrain/chunkManager'
import {
  createResourceDeposits,
  type ResourceDeposits,
  type SettlementMiningHooks,
} from '../terrain/resourceDeposits'
import { type BloodTrace, type BloodTraceSystem, createBloodTraceSystem } from '../world/bloodTraces'
import { preloadCartProp } from '../world/cartProp'
import { type Beehives, createBeehives } from '../world/createBeehives'
import { type CartRecord, createWorldCarts, type WorldCarts } from '../world/createCarts'
import { type Caves, createCaves } from '../world/createCaves'
import { createDryingRacks, type DryingRacks } from '../world/createDryingRacks'
import { createGrassForagePatches, type GrassForageService } from '../world/createGrassForagePatches'
import { createOcean, type WorldOcean } from '../world/createOcean'
import { createPalisades, type Palisades } from '../world/createPalisades'
import {
  createPlacedContainers,
  type PlacedContainerRecord,
  type PlacedContainers,
  type SaveCarriedContainer,
} from '../world/createPlacedContainers'
import { createPlacedTraps, type PlacedTraps, type PlacedTrapsHooks } from '../world/createPlacedTraps'
import { createPlayerGardens, type PlayerGardens } from '../world/createPlayerGardens'
import { createPlayerTroughs, type PlayerTroughs } from '../world/createPlayerTroughs'
import { createPlayerWells, type PlayerWells } from '../world/createPlayerWells'
import { createResidentialBuildings, type ResidentialBuildings } from '../world/createResidentialBuildings'
import { createSleepingUtilities, type SleepingUtilities } from '../world/createSleepingUtilities'
import { createStandingTorches, type StandingTorches } from '../world/createStandingTorches'
import { createTerrainPreparations, type TerrainPreparations } from '../world/createTerrainPreparations'
import { createTransportOrders, type TransportOrders } from '../world/createTransportOrders'
import { createWorkContracts, type WorkContracts } from '../world/createWorkContracts'
import { createFoodSourceHooks } from '../world/foodSources'
import { createHelperDeliveryHooks } from '../world/helperDeliveryHooks'
import {
  DARK_FOREST_TREASURE_CHEST_COINS,
  resolveDarkForestTreasureSite,
  resolveTreasureMapSourcePlace,
  withTreasureMapSourcePlace,
} from '../world/locations/darkForestTreasureSite'
import { getActiveDarkForestTreasureSite } from '../world/locations/darkForestTreasureSiteRuntime'
import { setActiveDarkForestTreasureSite } from '../world/locations/darkForestTreasureSiteRuntime'
import { rawSampleParamsFromWorld } from '../world/map/mapProjection'
import { createNpcGraves } from '../world/npcGraves'
import { createRiverWaterQualityResolver, type RiverWaterQualityResolver } from '../world/riverWaterQualityResolver'
import { querySiteInfrastructure as collectSiteInfrastructure, type SiteBounds, type SiteInfrastructure } from '../world/siteInfrastructure'
import { preloadTrapProps } from '../world/trapProp'
import { createWaterMirror, type WaterMirror } from '../world/waterMirror'
import { createWorldContext, type WorldContext } from '../world/worldContext'
import {
  createWorldGeneratedContainers,
  type SaveWorldGeneratedContainer,
  type WorldGeneratedContainers,
} from '../world/worldGeneratedContainers'

/** Fixed radius (world units) for settlement/fauna spatial logic — deliberately
 *  independent of the streamed terrain's loaded region, so the village and its
 *  animals behave identically whether the player is standing right there or has
 *  wandered many chunks away. */
export const HOME_RADIUS = 56

/** How far (world units) from the player a settlement streams in. Analogous to
 *  chunk load/unload radii — see multi-settlements plan. */
const SETTLEMENT_LOAD_RADIUS = 300
/** Must be > SETTLEMENT_LOAD_RADIUS — hysteresis ring avoiding load/unload
 *  thrashing right at the boundary. */
const SETTLEMENT_UNLOAD_RADIUS = 420

/** 3×3 block of chunks around the origin, pinned so the settlement never streams
 *  out from under itself. */
export function homeChunks(): ChunkCoord[] {
  const coords: ChunkCoord[] = []
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) coords.push({ cx, cz })
  }
  return coords
}

/** The eleven world systems that are always created/disposed/rebuilt together
 *  (new seed, terrain-param change) — see `docs/plans/archive/2026-08-10--053`. A
 *  single mutable container, not a `let` reassigned to a new object: every
 *  closure created before a rebuild (`worldContext`/`ambientAudio` in
 *  `createApp.ts`, the game loop) holds this same object reference, so it
 *  must keep seeing the live world through field reads (`bundle.chunkManager`),
 *  never by capturing a field's value up front. Only `rebuildWorldBundle`
 *  reassigns fields — nothing else should.
 *
 * @system world-bundle
 * @role Owns the lifetime/rebuild boundary for all world systems (terrain,
 *  settlements, fauna, items, player-placed structures).
 * @owns WorldBundle
 * @lifecycle rebuild
 */
export type WorldBundle = {
  chunkManager: ChunkManager
  bloodTraces: BloodTraceSystem
  ocean: WorldOcean
  settlementsManager: SettlementsManager
  fauna: Fauna
  itemSpawners: ItemSpawners
  resourceDeposits: ResourceDeposits
  droppedItems: DroppedItems
  placedFires: PlacedFires
  placedTents: PlacedTents
  placedTraps: PlacedTraps
  /** Movable draft carts (plan fauna-007) — world-owned, no AI. */
  carts: WorldCarts
  /** NPC burial graves (plan npc-011) — persistent completed burial results. */
  npcGraves: NpcGraves
  placedContainers: PlacedContainers
  worldGeneratedContainers: WorldGeneratedContainers
  playerWells: PlayerWells
  playerGardens: PlayerGardens
  standingTorches: StandingTorches
  playerTroughs: PlayerTroughs
  palisades: Palisades
  residentialBuildings: ResidentialBuildings
  sleepingUtilities: SleepingUtilities
  terrainPreparations: TerrainPreparations
  /** On-demand bounded lookup over completed preparations, usable Player
   *  wells and live Player gardens (plan world-019). Read-only aggregation;
   *  never persisted. */
  querySiteInfrastructure: (site: SiteBounds) => SiteInfrastructure
  caves: Caves
  dryingRacks: DryingRacks
  hives: Beehives
  workContracts: WorkContracts
  /** Runtime-only physical transport commitments (plan settlements-npcs-018).
   *  Not persisted and not carried across rebuild — in-transit cargo lives
   *  in transient `NpcAgent.carried`. */
  transportOrders: TransportOrders
  /** Plan fauna-010 §3/§4 — world-owned deterministic grass forage patches,
   *  shared by wild herbivores (`fauna`) and settlement livestock alike. */
  grassForage: GrassForageService
  /** Plan world-017 — lazy, cached contextual river water quality, composing
   *  `chunkManager.riverWaterContext` and `settlementsManager.peekDef`.
   *  World-scoped: built fresh alongside `settlementsManager` below and never
   *  persisted, so it's naturally discarded on a `WorldBundle` rebuild. */
  riverWaterQuality: RiverWaterQualityResolver
}

function buildChunkManager(
  scene: Scene,
  config: WorldConfig,
  collectedItemIds: Set<string>,
  removedCropIds: Set<string>,
  /** Player-planted trees/crops (plan 126) — same "caller-owned, mutated in
   *  place, carried across rebuild" contract as `collectedItemIds`/
   *  `removedCropIds` above. */
  plantedTrees: PlantedTreeRecord[],
  plantedCrops: CropPlacement[],
  /** Runtime terrain-deformation records (plan `world-terrain-save`) — same
   *  "caller-owned, mutated in place, carried across rebuild" contract as
   *  `plantedTrees`/`plantedCrops` above. */
  modifications: TerrainModification[],
  treeLifecycle: TreeLifecycle,
  getWorldDays: () => number,
  waterMirror: WaterMirror,
): ChunkManager {
  const cfg: ChunkManagerConfig = {
    chunkSize: config.terrain.chunkSize,
    resolution: config.terrain.resolution,
    loadRadius: config.terrain.loadRadius,
    unloadRadius: config.terrain.unloadRadius,
    homeChunks: homeChunks(),
    seed: config.seed,
    heightScale: config.terrain.heightScale,
    waterLevel: config.terrain.waterLevel,
    noiseScale: config.terrain.noiseScale,
    detailAmplitude: config.terrain.detailAmplitude,
    hillsScale: config.terrain.hillsScale,
    hillsAmplitude: config.terrain.hillsAmplitude,
    hillsFbm: config.terrain.hillsFbm,
    fbm: config.terrain.fbm,
    biome: config.terrain.biome,
    region: config.terrain.region,
    settlementSearchRadius: HOME_RADIUS,
    flatShading: config.terrain.flatShading,
    collectedItemIds,
    removedCropIds,
    plantedTrees,
    plantedCrops,
    modifications,
    grass: config.terrain.grass,
    detailNormal: config.terrain.detailNormal,
    terrainCastsShadow: config.postProcessing.terrainCastsShadow,
    treeLifecycle,
    getWorldDays,
    waterMirror,
    lodScale: config.quality.lodScale,
    grassFillerCoverage: config.quality.grassFillerCoverage,
  }
  return createChunkManager(scene, cfg)
}

function buildOcean(scene: Scene, config: WorldConfig, waterMirror: WaterMirror): WorldOcean {
  // Generously covers the loaded region so it never runs out under the player;
  // repositioned (not resized) as the player moves — see createOcean.follow().
  const { chunkSize, loadRadius, unloadRadius, waterLevel } = config.terrain
  const size = (unloadRadius * 2 + 4) * chunkSize
  // Hide the singleton where chunk water already draws (incl. coastal fade).
  // Radial, not a height clipmap — follow() is every frame.
  const fadeInner = loadRadius * chunkSize
  const fadeOuter = (loadRadius + 1) * chunkSize
  const ocean = createOcean(size, waterLevel, fadeInner, fadeOuter, waterMirror)
  ocean.addTo(scene)
  return ocean
}

function buildSettlementsManager(
  scene: Scene,
  chunkManager: ChunkManager,
  seed: number,
  playAt: PlayAt,
  config: WorldConfig,
  forest: SettlementForestHooks,
  worldContext: WorldContext,
  mining: SettlementMiningHooks,
  initialEconomies?: Record<string, SettlementEconomySnapshot>,
  onAnimalDeath?: (animalId: string) => void,
  getPlayerSocial?: PlayerSocialLookup,
  isLandPlotOwned?: (settlementId: string, plotId: string) => boolean,
  pointLightBudget?: PointLightBudget,
  /** Bounded lookup for a nearby completed player-built well (plan 127 §10)
   *  — forwarded into every `createSettlement` call → every `NpcAgent`, the
   *  same way `getPlayerSocial` is above. */
  getNearbyPlayerWell?: NearbyPlayerWellLookup,
  /** NPC hunger-source discovery hooks over natural world items + crops
   *  (plan 174) — forwarded into every `createSettlement` call → every
   *  `NpcAgent`, the same way `mining` is above. */
  foodSources?: SettlementFoodSourceHooks,
  /** Hunter target discovery + harvest hooks over the live `Fauna` (plan 178)
   *  — forwarded into every `createSettlement` call → every `NpcAgent`, the
   *  same way `mining`/`foodSources` are above. Late-bound by the caller
   *  (see `buildWorldSystems`): `Fauna` itself is only constructed *after*
   *  `SettlementsManager`/every `NpcAgent`, so this closes over an accessor
   *  rather than a direct `Fauna` reference. */
  hunting?: SettlementHuntingHooks,
  /** Carried across an in-session `rebuildWorldBundle` (plan 197 §8) — not
   *  part of `SaveData`, so `createWorldBundle`'s own call site below never
   *  passes this (a genuinely fresh bundle has nothing to carry). */
  initialHouseholds?: Record<HouseholdId, HouseholdSnapshot>,
  /** Carried across an in-session `rebuildWorldBundle` the same way as
   *  `initialHouseholds` above (plan 197 §7) — also never passed by
   *  `createWorldBundle`, for the same reason. */
  initialNpcStates?: Record<NpcId, NpcStateSnapshot>,
  /** Helper resource-delivery target hooks over the player's placed
   *  `Container`s (plan 167) — forwarded into every `createSettlement` call
   *  → every `NpcAgent`, the same way `foodSources`/`hunting` are above. */
  helperDelivery?: HelperDeliveryHooks,
  /** Plan persistence-001 — forwarded into `createSettlementsManager` the
   *  same way `initialHouseholds`/`initialNpcStates` are above. */
  initialNpcRelationships?: readonly NpcRelationshipEntry[],
  initialLivestock?: readonly LivestockSaveRecord[],
  initialRemovedLivestockIds?: readonly string[],
  initialRats?: readonly import('../settlement/ratPersistence').RatSaveRecord[],
  initialRemovedRatIds?: readonly string[],
  initialStorageInfestation?: Record<string, import('../settlement/ratInfestation').RatInfestationState>,
  seedHomeStorageInfestation?: boolean,
  /** Forwarded into every `createSettlement` call → every `NpcAgent` the
   *  same way `helperDelivery`/`hunting` are above (plan npc-015). Unlike
   *  `hunting`, these are built *before* `SettlementsManager` (see
   *  `buildWorldSystems`), so they're passed directly rather than late-bound. */
  workContracts?: WorkContracts,
  transportOrders?: TransportOrders,
  playerWells?: PlayerWells,
  droppedItems?: DroppedItems,
  /** Shared world-owned grass forage service (plan fauna-010 §3/§4) —
   *  forwarded into `createSettlementsManager`. */
  grassForage?: GrassForageService,
  /** Player-built animal troughs (plan items-player-020) — forwarded as the
   *  fauna water provider into every `createSettlement` call. */
  playerTroughs?: PlayerTroughs,
  /** Active terrain-preparation work sites (plan npc-018) — forwarded into
   *  every `createSettlement` call → every `NpcAgent`, built ahead of
   *  `SettlementsManager` the same way as `workContracts`/`playerWells`. */
  terrainPreparations?: TerrainPreparations,
  /** Player-built palisade segments (plan items-player-017) — forwarded the
   *  same way as `terrainPreparations`, also built ahead of
   *  `SettlementsManager` (see this function's call site). */
  palisades?: Palisades,
  /** Player-built standing torches (plan items-player-017) — forwarded the
   *  same way as `palisades`. */
  standingTorches?: StandingTorches,
  /** Player-built residential houses (plan settlements-005) — forwarded the
   *  same way as `palisades`/`standingTorches`. */
  residentialBuildings?: ResidentialBuildings,
  /** NPC burial graves (plan npc-011) — forwarded into every `createSettlement`. */
  npcGraves?: import('../world/npcGraves').NpcGraves,
): Promise<SettlementsManager> {
  return createSettlementsManager(
    scene,
    chunkManager.sampleHeight,
    chunkManager.waterLevel,
    chunkManager.sampleLocalWater,
    HOME_RADIUS,
    seed,
    playAt,
    SETTLEMENT_LOAD_RADIUS,
    SETTLEMENT_UNLOAD_RADIUS,
    worldContext,
    config.terrain.heightScale,
    config.terrain.region,
    chunkManager.waitForChunks,
    config.terrain.chunkSize,
    chunkManager.collidersNear,
    chunkManager.registerColliders,
    chunkManager.clearColliders,
    forest,
    config.settlements.homeSize,
    initialEconomies,
    onAnimalDeath,
    getPlayerSocial,
    mining,
    isLandPlotOwned,
    pointLightBudget,
    getNearbyPlayerWell,
    foodSources,
    hunting,
    initialHouseholds,
    initialNpcStates,
    helperDelivery,
    initialNpcRelationships,
    initialLivestock,
    initialRemovedLivestockIds,
    initialRats,
    initialRemovedRatIds,
    initialStorageInfestation,
    seedHomeStorageInfestation,
    workContracts,
    transportOrders,
    playerWells,
    droppedItems,
    grassForage,
    playerTroughs,
    terrainPreparations,
    palisades,
    standingTorches,
    residentialBuildings,
    npcGraves,
  )
}

/** Takes `homeDef` (site/id/size — synchronous the moment `SettlementsManager`
 *  computes it) rather than the fully-built `Settlement` it used to: fauna's
 *  only real dependency on the home settlement is its center/id/size, all of
 *  which live on `SettlementDef` already — never its landmarks/NPCs/livestock.
 *  Decoupling this (world-003 "faster application startup" §4) lets fauna
 *  build concurrently with the home settlement's own (much slower)
 *  `buildSettlementProps`/NPC pipeline instead of waiting for it, via
 *  `Promise.all` in `buildWorldSystems` below. */
function buildFauna(
  scene: Scene,
  chunkManager: ChunkManager,
  homeDef: SettlementDef,
  seed: number,
  coastThreshold: number,
  onAnimalDeath?: (animalId: string) => void,
  /** Saved spawn-point lifecycle (plan 125 persistence follow-up) — see
   *  `createFauna`'s `initialSpawnerState` doc. */
  initialSpawnerState?: ReadonlyMap<string, SavedSpawnPointState>,
  /** Shared world-owned grass forage service (plan fauna-010 §3/§4) —
   *  forwarded unchanged into `createFauna`. */
  grassForage?: GrassForageService,
  waterSourceProvider?: import('../fauna/animalForaging').AnimalWaterSourceProvider,
  extraHabitatSpawners?: readonly {
    id: string
    x: number
    z: number
    type: 'wolfDen'
    kind: 'wolf'
    respawnIntervalDays: number
    maxPreyCount: number
  }[],
  initialPersistentOccupants?: PersistentOccupantSnapshot,
): Promise<Fauna> {
  const { bootMark, bootMarkEnd } = useBootMark('buildFauna')

  bootMark('prepareRoadQuery')
  let footprintRadius: number
  let center: Vector3
  let roadSegments: ReturnType<ChunkManager['roadCorridorsNear']>
  try {
    footprintRadius = villageSizeConfig(homeDef.size).footprintRadius
    // Spawner ring now reaches `footprintRadius + SPAWNER_RING_OFFSET[1]` (plan
    // 080 — was a flat 45–65 m from home); size the query so its half-extent
    // covers that reach plus a road halfWidth clearance margin, same 10 m
    // margin the original fixed 150 (→ half 75, ring max 65) already implied.
    const spawnerMaxReach = footprintRadius + SPAWNER_RING_OFFSET[1]
    center = new Vector3(homeDef.x, homeDef.y, homeDef.z)
    roadSegments = chunkManager.roadCorridorsNear(
      center.x,
      center.z,
      (spawnerMaxReach + 10) * 2,
    )
  } finally {
    bootMarkEnd('prepareRoadQuery')
  }

  bootMark('createFauna')
  return createFauna(
    scene,
    chunkManager.sampleHeight,
    chunkManager.sampleForestFactor,
    chunkManager.waterLevel,
    chunkManager.sampleLocalWater,
    chunkManager.collidersNear,
    HOME_RADIUS,
    center,
    homeDef.id,
    seed,
    footprintRadius,
    roadSegments,
    {
      sampleContinentalness: chunkManager.sampleContinentalness,
      coastThreshold,
    },
    {
      modifyTerrain: chunkManager.modifyTerrain,
      scorchTerrain: chunkManager.scorchTerrain,
      sampleMountainRidge: chunkManager.sampleMountainRidge,
    },
    onAnimalDeath,
    initialSpawnerState,
    grassForage,
    waterSourceProvider,
    chunkManager.riverShoreDistance,
    extraHabitatSpawners,
    // Persistent occupant declarations stay empty until a consumer (the
    // treasure-map bear cave) supplies them; restore still accepts carried
    // snapshots so in-session rebuild/save wiring is live.
    undefined,
    initialPersistentOccupants,
  ).finally(() => bootMarkEnd('createFauna'))
}

function buildItemSpawners(
  scene: Scene,
  chunkManager: ChunkManager,
  settlement: Settlement,
  seed: number,
): ItemSpawners {
  const gardens =
    settlement.landmarks.gardens.length > 0
      ? settlement.landmarks.gardens
      : [settlement.landmarks.garden]
  const treasureSite = getActiveDarkForestTreasureSite()
  const mapSource = treasureSite?.treasureMap
  const extraOneTimePickups = mapSource
    ? [{
        id: mapSource.pickupId,
        kind: 'treasure_map_dark_forest' as const,
        x: mapSource.pickupX,
        z: mapSource.pickupZ,
        /** Owned by an existing cave/cemetery place — always materialize. */
        anchoredToWorldPlace: true,
      }]
    : []
  return createItemSpawners(
    scene,
    chunkManager.sampleHeight,
    chunkManager.waterLevel,
    HOME_RADIUS,
    settlement.center,
    settlement.landmarks.trees.map((t) => t.position),
    seed,
    { campfire: settlement.landmarks.campfire?.position, garden: settlement.landmarks.garden, stockpile: settlement.landmarks.stockpile },
    gardens,
    extraOneTimePickups,
  )
}

/** `worldContext` here is the call-scoped instance built fresh in
 *  `createWorldBundle`/`rebuildWorldBundle` — this `ResourceDeposits`
 *  instance's lifetime is already tied 1:1 to the `chunkManager` it closes
 *  over (both disposed/rebuilt together by `rebuildWorldBundle`), so there's
 *  no reassignment for it to survive. `resourceDepletion` is what actually
 *  survives (plan 198) — same "caller-owned, mutated in place, carried across
 *  rebuild" contract as `collectedItemIds`/`removedCropIds`. */
function buildResourceDeposits(
  scene: Scene,
  worldContext: WorldContext,
  seed: number,
  resourceDepletion: ResourceDepletionState,
): ResourceDeposits {
  return createResourceDeposits(scene, worldContext, seed, resourceDepletion)
}

/** Every already-resolved input `buildWorldSystems` needs to construct all 15
 *  `WorldBundle` members in one pass — shared shape between `createWorldBundle`
 *  (values sourced from `SaveData`/fresh defaults) and `rebuildWorldBundle`
 *  (values sourced from a live snapshot of the bundle being replaced). See
 *  each exported function below for the semantic contract of each field —
 *  not restated here to avoid doc drift between the two. */
type WorldSystemsSeed = {
  scene: Scene
  config: WorldConfig
  collectedItemIds: Set<string>
  removedCropIds: Set<string>
  plantedTrees: PlantedTreeRecord[]
  plantedCrops: CropPlacement[]
  modifications: TerrainModification[]
  playAt: PlayAt
  treeLifecycle: TreeLifecycle
  getWorldDays: () => number
  dayNight: DayNightState
  droppedItems: readonly DroppedItem[]
  placedFires: readonly PlacedFire[]
  placedTents: readonly PlacedTent[]
  placedTraps: readonly PlacedTrapRecord[]
  carts: readonly CartRecord[]
  graves: readonly SaveGrave[]
  placedContainers: readonly PlacedContainerRecord[]
  worldGeneratedContainers: readonly SaveWorldGeneratedContainer[]
  carriedContainer: SaveCarriedContainer | null
  playerWells: readonly PlayerWellRecord[]
  playerGardens: readonly PlayerGardenRecord[]
  standingTorches: readonly StandingTorchRecord[]
  playerTroughs: readonly PlayerTroughRecord[]
  palisades: readonly PalisadeSegmentRecord[]
  residentialBuildings: readonly ResidentialBuildingRecord[]
  sleepingUtilityBedrolls: readonly BedrollRecord[]
  sleepingUtilityPlatforms: readonly PlatformRecord[]
  terrainPreparations: readonly TerrainPreparationRecord[]
  /** Compact completed prepared-area facts (plan world-019). */
  completedTerrainPreparations: readonly CompletedTerrainPreparation[]
  dryingRacks: readonly DryingRackRecord[]
  hives: readonly BeehiveRecord[]
  /** Plan npc-014 — persistent player-issued work contracts, same "carried
   *  across rebuild, reset only on a genuinely new world" contract as
   *  `standingTorches`/`palisades` above. */
  workContracts: readonly WorkContractRecord[]
  economies?: Record<string, SettlementEconomySnapshot>
  households?: Record<HouseholdId, HouseholdSnapshot>
  npcStates?: Record<NpcId, NpcStateSnapshot>
  /** Plan persistence-001 — seeds `NpcRelationships`, same "carried across
   *  rebuild, sourced from `SaveData` on a fresh boot" contract as
   *  `households`/`npcStates` above. */
  npcRelationships?: readonly NpcRelationshipEntry[]
  /** Plan persistence-001 — seeds the manager-lifetime `LivestockRegistry`,
   *  same contract as `npcRelationships` above. */
  livestock?: readonly LivestockSaveRecord[]
  removedLivestockIds?: readonly string[]
  rats?: readonly import('../settlement/ratPersistence').RatSaveRecord[]
  removedRatIds?: readonly string[]
  storageInfestation?: Record<string, import('../settlement/ratInfestation').RatInfestationState>
  /** Authored V1 trigger for home storage infestation on a fresh world. */
  seedHomeStorageInfestation?: boolean
  spawnerState?: ReadonlyMap<string, SavedSpawnPointState>
  persistentOccupants?: PersistentOccupantSnapshot
  resourceDepletion: ResourceDepletionState
  onAnimalDeath?: (animalId: string) => void
  getPlayerSocial?: PlayerSocialLookup
  isLandPlotOwned?: (settlementId: string, plotId: string) => boolean
  onTrapCapture?: PlacedTrapsHooks['onCapture']
  onTrapBaitReturned?: PlacedTrapsHooks['onBaitReturned']
  pointLightBudget?: PointLightBudget
  getNearbyPlayerWell?: NearbyPlayerWellLookup
  /** Live blood-trace world state carried across an in-session rebuild
   *  (config change, not a new seed) — same "carried across rebuild, reset
   *  only on a genuinely new world" contract as `plantedTrees`/`modifications`
   *  above. `createWorldBundle` always leaves this unset (a genuinely new
   *  world starts with no traces); only `rebuildWorldBundle` snapshots and
   *  forwards it. */
  bloodTraces?: readonly BloodTrace[]
  /** Sparse grass forage patch depletion overrides (plan fauna-010 §3/§4) —
   *  mutated in place by the constructed `GrassForageService`, same
   *  "caller-owned, mutated in place, carried across rebuild" contract as
   *  `resourceDepletion` above (patch *placement* is never persisted, only
   *  which ids are currently depleted — see `world/grassForage.ts`). */
  grassForageOverrides: GrassForageOverrides
}

/** Inert stand-ins for the `WorldBundle` members deferred off the critical
 *  path below (world-003 "faster application startup") — every consumer of
 *  `bundle.fauna`/`itemSpawners`/`dryingRacks`/`hives` either reads them
 *  through a closure invoked later during gameplay (never synchronously
 *  during `createApp.ts` setup — verified by inspection, not just belief:
 *  every direct read outside `worldBundle.ts` itself is inside a `gameLoop.ts`
 *  per-frame callback, a `QuestManager` resolver, a user-triggered action, or
 *  `saveState.ts`'s `buildSaveData()`) or a `dispose()`/`nodes()` call from
 *  `rebuildWorldBundle`/`disposeWorldBundle` below, which these support as a
 *  harmless no-op. Real instances replace these in place (`Object.assign`,
 *  same mechanism `rebuildWorldBundle` already used for a full rebuild)
 *  once the deferred background phase finishes — see `buildWorldSystems`. */
function createEmptyFauna(): Fauna {
  return {
    update: () => {},
    dispose: () => {},
    resolveTimeSkip: () => {},
    getAgents: () => [],
    getSpawners: () => [],
    isWolfDenCleared: () => false,
    setSpawnerMarker: () => {},
    destroySpawner: () => false,
    isQuestSpawnPointPermanentlyDestroyed: () => false,
    snapshotPersistentOccupants: () => ({ entries: [], removedSlots: [] }),
  }
}

function createEmptyItemSpawners(): ItemSpawners {
  return {
    nodes: () => [],
    collect: () => null,
    update: () => {},
    dispose: () => {},
  }
}

function createEmptyDryingRacks(): DryingRacks {
  return {
    list: () => [],
    nodes: () => [],
    startProcess: () => false,
    clearProcess: () => null,
    dispose: () => {},
  }
}

function createEmptyBeehives(): Beehives {
  return {
    list: () => [],
    nodes: () => [],
    collect: () => 0,
    burn: () => 0,
    dispose: () => {},
  }
}

export type BuiltWorldSystems = {
  bundle: WorldBundle
  /** Resolves once the fields deferred off the initial critical path above
   *  (fauna, item spawners, drying racks, hives) have replaced their stub
   *  placeholders on `bundle` in place — the same "mutate fields on the
   *  stable object, never replace it" mechanism `rebuildWorldBundle` already
   *  uses for a full rebuild, just applied to the tail of the initial build
   *  too. `rebuildWorldBundle` awaits this itself before returning, so only
   *  `createWorldBundle`'s caller (a fresh boot) ever sees the gap. */
  backgroundReady: Promise<void>
}

/** Constructs all 15 `WorldBundle` members, in dependency order, from an
 *  already-resolved seed. The single body shared by `createWorldBundle`
 *  (fresh values) and `rebuildWorldBundle` (a snapshot of the bundle it is
 *  about to replace) — previously duplicated in full between the two.
 *
 *  Returns as soon as the systems required for the player to spawn/move/
 *  interact are ready — `fauna`/`itemSpawners`/`dryingRacks`/`hives` are
 *  handed back as inert stubs (see `createEmpty*` above), replaced in place
 *  once `backgroundReady` resolves (world-003 "faster application startup").
 *  `isStale` is checked right before that in-place replacement — pass one
 *  that reports `true` once whatever's holding `bundle` no longer wants this
 *  particular background result (a later rebuild superseded it, or the app
 *  tore down); the freshly-built systems are disposed instead of kept. */
async function buildWorldSystems(
  seed: WorldSystemsSeed,
  isStale: () => boolean = () => false,
): Promise<BuiltWorldSystems> {
  const { bootMark, bootMarkEnd } = useBootMark('buildWorldSystems')

  const {
    scene, config, collectedItemIds, removedCropIds, plantedTrees, plantedCrops, modifications,
    playAt, treeLifecycle, getWorldDays, dayNight,
    droppedItems: initialDroppedItems,
    placedFires: initialPlacedFires,
    placedTents: initialPlacedTents,
    placedTraps: initialPlacedTraps,
    carts: initialCarts,
    graves: initialGraves,
    placedContainers: initialPlacedContainers,
    worldGeneratedContainers: initialWorldGeneratedContainers,
    carriedContainer: initialCarriedContainer,
    playerWells: initialPlayerWells,
    playerGardens: initialPlayerGardens,
    standingTorches: initialStandingTorches,
    playerTroughs: initialPlayerTroughs,
    palisades: initialPalisades,
    residentialBuildings: initialResidentialBuildings,
    sleepingUtilityBedrolls: initialSleepingUtilityBedrolls,
    sleepingUtilityPlatforms: initialSleepingUtilityPlatforms,
    terrainPreparations: initialTerrainPreparations,
    completedTerrainPreparations: initialCompletedTerrainPreparations,
    dryingRacks: initialDryingRacks,
    hives: initialHives,
    workContracts: initialWorkContracts,
    economies: initialEconomies,
    households: initialHouseholds,
    npcStates: initialNpcStates,
    npcRelationships: initialNpcRelationships,
    livestock: initialLivestock,
    removedLivestockIds: initialRemovedLivestockIds,
    rats: initialRats,
    removedRatIds: initialRemovedRatIds,
    storageInfestation: initialStorageInfestation,
    seedHomeStorageInfestation,
    spawnerState: initialSpawnerState,
    persistentOccupants: initialPersistentOccupants,
    resourceDepletion,
    grassForageOverrides,
    onAnimalDeath, getPlayerSocial, isLandPlotOwned, onTrapCapture, onTrapBaitReturned,
    pointLightBudget, getNearbyPlayerWell,
    bloodTraces: initialBloodTraces,
  } = seed

  bootMark('createWaterMirror')
  const waterMirror = createWaterMirror({
    waterLevel: config.terrain.waterLevel,
    enabled: config.postProcessing.waterReflections,
  })
  bootMarkEnd('createWaterMirror')

  bootMark('buildChunkManager')
  const chunkManager = buildChunkManager(scene, config, collectedItemIds, removedCropIds, plantedTrees, plantedCrops, modifications, treeLifecycle, getWorldDays, waterMirror)
  bootMarkEnd('buildChunkManager')

  const homeDefForSite = settlementDefFor({ gx: 0, gz: 0 }, {
    seed: config.seed,
    sampleHeight: chunkManager.sampleHeight,
    waterLevel: config.terrain.waterLevel,
    localSearchRadius: HOME_RADIUS,
    terrainSamplers: {
      sampleContinentalness: chunkManager.sampleContinentalness,
      sampleMountainRidge: chunkManager.sampleMountainRidge,
      sampleMoistureRegion: chunkManager.sampleMoistureRegion,
    },
    heightScale: config.terrain.heightScale,
    region: config.terrain.region,
    homeSize: config.settlements.homeSize,
  })
  if (!homeDefForSite) {
    throw new Error('[worldBundle] home settlement (0,0) failed to resolve for treasure site')
  }
  const darkForestTreasureSite = resolveDarkForestTreasureSite({
    seed: config.seed,
    homeX: homeDefForSite.x,
    homeZ: homeDefForSite.z,
    sampleParams: rawSampleParamsFromWorld(config),
  })
  setActiveDarkForestTreasureSite(darkForestTreasureSite)

  // Plan world-009 — bounded to roughly the streamed terrain footprint
  // (chunkSize * loadRadius) rather than depending on ChunkManager's own
  // loaded-chunk bookkeeping; see bloodTraces.ts's `createBloodTraceSystem` doc.
  const bloodTraces = createBloodTraceSystem(
    scene,
    chunkManager.sampleHeight,
    config.seed,
    dayNight,
    config.terrain.chunkSize * config.terrain.loadRadius,
    initialBloodTraces,
  )

  chunkManager.update(0, 0)

  bootMark('waitForChunks')
  await chunkManager.waitForChunks(homeChunks())
  bootMarkEnd('waitForChunks')

  bootMark('createWorldContext')
  const worldContext = createWorldContext(() => chunkManager, config, dayNight)
  bootMarkEnd('createWorldContext')
  const forest: SettlementForestHooks = {
    lifecycle: treeLifecycle,
    getWorldDays,
    sampleEnv: worldContext.sampleTreeEnv,
  }

  bootMark('buildOcean')
  const ocean = buildOcean(scene, config, waterMirror)
  bootMarkEnd('buildOcean')

  // World-owned, not settlement-scoped (plan fauna-010 §3/§4) — built once
  // here, ahead of both `buildFauna` (wild herbivores) and
  // `buildSettlementsManager` (livestock), and forwarded unchanged into
  // both so a deer near one settlement and a cow at another read the same
  // deterministic patch grid. `isOpenGround` gates deterministic placement
  // by terrain only (openness), never dynamic colliders — see
  // `grassPatchCandidatesNear`'s doc.
  bootMark('createGrassForagePatches')
  const grassForage = createGrassForagePatches(
    scene,
    worldContext.sampleHeight,
    worldContext.waterLevel,
    config.seed,
    (x, z) => worldContext.sampleForestFactor(x, z) < 0.5,
    grassForageOverrides,
  )
  bootMarkEnd('createGrassForagePatches')

  bootMark('buildResourceDeposits')
  const resourceDeposits = buildResourceDeposits(scene, worldContext, config.seed, resourceDepletion)
  bootMarkEnd('buildResourceDeposits')
  const mining: SettlementMiningHooks = { queryNearest: resourceDeposits.queryNearest, mine: resourceDeposits.mine }

  // Built ahead of `foodSources`/`settlementsManager` (plan 176) — the food
  // source hooks need a live `PlayerGardens` to resolve which crops belong
  // to a garden plot for the yield-productivity modifier and the NPC
  // maintenance hook, unlike `playerWells` below which is only reachable
  // through `createApp.ts`'s live `getNearbyPlayerWell` accessor.
  bootMark('createPlayerGardens')
  const playerGardens = createPlayerGardens(
    scene,
    chunkManager.sampleHeight,
    chunkManager.registerColliders,
    chunkManager.clearColliders,
    initialPlayerGardens,
    getWorldDays(),
    config.seed,
  )
  bootMarkEnd('createPlayerGardens')

  bootMark('createFoodSourceHooks')
  const foodSources = createFoodSourceHooks(chunkManager, playerGardens, getWorldDays)
  bootMarkEnd('createFoodSourceHooks')

  // Late-bound (plan 178, now also world-003 §4): `Fauna` is only built in
  // the background phase below, so `hunting` closes over a mutable accessor
  // instead of a direct `Fauna` reference — `faunaForHunting` is assigned
  // once the background `buildFauna` resolves. A hunter that acts before
  // that just sees "no fauna yet", the same no-op `mining`/`foodSources`
  // already fall back to when unset.
  let faunaForHunting: Fauna | null = null
  bootMark('createHuntingHooks')
  const hunting = createHuntingHooks(() => faunaForHunting, getWorldDays)
  bootMarkEnd('createHuntingHooks')

  // Built ahead of `settlementsManager` (plan 167) — every `NpcAgent`'s
  // `helperDelivery` hooks need a live `PlacedContainers` to resolve a helper
  // assignment's target, the same "built before settlementsManager, forwarded
  // in" shape as `foodSources`/`hunting` above.
  bootMark('createPlacedContainers')
  const placedContainers = createPlacedContainers(
    scene,
    chunkManager.sampleHeight,
    initialPlacedContainers,
    initialCarriedContainer,
  )
  bootMarkEnd('createPlacedContainers')
  const chestYaw = darkForestTreasureSite.rotationY + 0.35
  const chestX = darkForestTreasureSite.x + Math.cos(chestYaw) * 2.8
  const chestZ = darkForestTreasureSite.z + Math.sin(chestYaw) * 2.8
  const worldGeneratedContainers = createWorldGeneratedContainers(
    scene,
    chunkManager.sampleHeight,
    [{
      id: darkForestTreasureSite.chestId,
      kind: 'chest',
      x: chestX,
      z: chestZ,
      yaw: chestYaw,
      initialCounts: { coin: DARK_FOREST_TREASURE_CHEST_COINS, ruby: 1 },
    }],
    initialWorldGeneratedContainers,
  )
  const helperDelivery = createHelperDeliveryHooks(placedContainers)

  bootMark('preloadAnimalTroughAndTrapProps')
  await Promise.all([preloadAnimalTroughVisual(), preloadTrapProps(), preloadCartProp()])
  bootMarkEnd('preloadAnimalTroughAndTrapProps')

  // Built ahead of `SettlementsManager` (plan npc-015, extended npc-018/
  // items-player-017) — unlike `hunting`/`Fauna`, none of these six depend on
  // anything settlements produce, and `NpcAgent`'s own Work Contract
  // decision/construction/terrain-preparation/buildable integration needs
  // live instances forwarded in, not a late-bound accessor.
  bootMark('droppedItems+wells+workContracts+terrainPrep+buildables')
  const droppedItems = createDroppedItems(scene, chunkManager.sampleHeight, initialDroppedItems)
  const playerWells = createPlayerWells(
    scene,
    chunkManager.sampleHeight,
    chunkManager.registerColliders,
    chunkManager.clearColliders,
    initialPlayerWells,
    config.seed,
    config.terrain.waterLevel,
  )
  const workContracts = createWorkContracts(scene, chunkManager.sampleHeight, initialWorkContracts)
  // Runtime-only: 018 does not persist or carry in-transit orders because
  // cargo still lives in transient `NpcAgent.carried` (see settlements-npcs-019).
  const transportOrders = createTransportOrders()
  const terrainPreparations = createTerrainPreparations(
    scene,
    chunkManager,
    chunkManager.sampleHeight,
    initialTerrainPreparations,
    initialCompletedTerrainPreparations,
  )
  const standingTorches = createStandingTorches(scene, chunkManager.sampleHeight, initialStandingTorches, pointLightBudget, getWorldDays())
  const playerTroughs = createPlayerTroughs(scene, chunkManager.sampleHeight, initialPlayerTroughs)
  const palisades = createPalisades(
    scene,
    chunkManager.sampleHeight,
    chunkManager.registerColliders,
    chunkManager.clearColliders,
    initialPalisades,
  )
  const residentialBuildings = createResidentialBuildings(
    scene,
    chunkManager.sampleHeight,
    chunkManager.registerColliders,
    chunkManager.clearColliders,
    initialResidentialBuildings,
  )
  bootMarkEnd('droppedItems+wells+workContracts+terrainPrep+buildables')

  bootMark('createNpcGraves')
  const npcGraves = createNpcGraves(scene, chunkManager.sampleHeight, initialGraves)
  bootMarkEnd('createNpcGraves')

  // Now fast: returns as soon as `homeDef` (the home site's position/id/size
  // — a pure function of seed+terrain) is resolved and the home settlement's
  // own full build (houses/NPCs/livestock) has been kicked off in the
  // background, not awaited here (world-003 §3) — see
  // `SettlementsManager.homeReady`.
  bootMark('buildSettlementsManager')
  const settlementsManager = await buildSettlementsManager(scene, chunkManager, config.seed, playAt, config, forest, worldContext, mining, initialEconomies, onAnimalDeath, getPlayerSocial, isLandPlotOwned, pointLightBudget, getNearbyPlayerWell, foodSources, hunting, initialHouseholds, initialNpcStates, helperDelivery, initialNpcRelationships, initialLivestock, initialRemovedLivestockIds, initialRats, initialRemovedRatIds, initialStorageInfestation, seedHomeStorageInfestation, workContracts, transportOrders, playerWells, droppedItems, grassForage, playerTroughs, terrainPreparations, palisades, standingTorches, residentialBuildings, npcGraves)
  bootMarkEnd('buildSettlementsManager')
  const homeDef = settlementsManager.getHomeDef()
  const riverWaterQuality = createRiverWaterQualityResolver(chunkManager.riverWaterContext, settlementsManager.peekDef)

  bootMark('placed')
  const placedFires = createPlacedFires(scene, chunkManager.sampleHeight, initialPlacedFires, playAt, pointLightBudget)
  const placedTents = createPlacedTents(scene, chunkManager.sampleHeight, initialPlacedTents, config.seed)
  const placedTraps = createPlacedTraps(
    scene,
    chunkManager.sampleHeight,
    config.seed,
    { onCapture: onTrapCapture, onBaitReturned: onTrapBaitReturned },
    initialPlacedTraps,
  )
  const carts = createWorldCarts(
    scene,
    chunkManager.sampleHeight,
    initialCarts,
    initialCarts.length === 0
      ? { x: homeDef.x + 14, z: homeDef.z - 8, yaw: 0 }
      : undefined,
  )
  const sleepingUtilities = createSleepingUtilities(
    scene,
    chunkManager.sampleHeight,
    initialSleepingUtilityBedrolls,
    initialSleepingUtilityPlatforms,
    config.seed,
  )
  bootMarkEnd('placed')

  // Only needs `homeDef.size` (sync, see §4's `buildFauna` doc above) — kept
  // on the critical path rather than deferred, unlike `itemSpawners`/
  // `dryingRacks`/`hives` below, which need the home settlement's built
  // `landmarks` and so must wait for `homeReady` regardless.
  bootMark('createCaves')
  const caves = createCaves(
    scene,
    chunkManager,
    config.seed,
    villageSizeConfig(homeDef.size).footprintRadius,
    config.terrain.region.coastThreshold,
  )
  bootMarkEnd('createCaves')

  // Physical treasure map binds to an existing cave (preferred) or the home
  // cemetery — after caves exist, still pure of loaded-chunk landmark scans.
  const activeTreasureSite = getActiveDarkForestTreasureSite()
  if (activeTreasureSite && !activeTreasureSite.treasureMap) {
    const cemetery = chunkManager.resolveCemeteryForSettlement(homeDef.id)
    const mapSource = resolveTreasureMapSourcePlace({
      seed: config.seed,
      homeX: homeDef.x,
      homeZ: homeDef.z,
      caves: caves.definitions(),
      cemetery: cemetery ? { id: cemetery.id, x: cemetery.x, z: cemetery.z } : null,
    })
    if (mapSource) {
      setActiveDarkForestTreasureSite(withTreasureMapSourcePlace(activeTreasureSite, mapSource))
    } else {
      console.warn('[worldBundle] no cave/cemetery source place for treasure map')
    }
  }

  const bundle: WorldBundle = {
    chunkManager,
    bloodTraces,
    ocean,
    settlementsManager,
    fauna: createEmptyFauna(),
    itemSpawners: createEmptyItemSpawners(),
    resourceDeposits,
    droppedItems,
    placedFires,
    placedTents,
    placedTraps,
    carts,
    npcGraves,
    placedContainers,
    worldGeneratedContainers,
    playerWells,
    playerGardens,
    standingTorches,
    playerTroughs,
    palisades,
    residentialBuildings,
    sleepingUtilities,
    terrainPreparations,
    querySiteInfrastructure: (site) => collectSiteInfrastructure(site, {
      completedPreparations: terrainPreparations.completed(),
      wells: playerWells.nodes(),
      gardens: playerGardens.nodes(),
    }),
    caves,
    dryingRacks: createEmptyDryingRacks(),
    hives: createEmptyBeehives(),
    workContracts,
    transportOrders,
    grassForage,
    riverWaterQuality,
  }

  // Deferred: fauna (§4), item preloads (§5), item spawners/drying racks/
  // hives (need the home settlement's built `landmarks`, so wait on
  // `homeReady` regardless — see `buildWorldSystems`'s doc comment). Fauna
  // only needs `homeDef`, so it (and the preloads) run concurrently with the
  // home settlement's own build instead of serially after it.
  const backgroundReady = (async () => {
    let fauna: Fauna | undefined
    let itemSpawners: ItemSpawners | undefined
    let dryingRacks: DryingRacks | undefined
    let hives: Beehives | undefined
    try {
      bootMark('background:fauna+preloads')
      ;[fauna] = await Promise.all([
        (async () => {
          bootMark('background:buildFauna')
          try {
            return await buildFauna(
              scene,
              chunkManager,
              homeDef,
              config.seed,
              config.terrain.region.coastThreshold,
              onAnimalDeath,
              initialSpawnerState,
              grassForage,
              playerTroughs,
              darkForestTreasureSite.wolfDens.map((den) => ({
                id: den.id,
                x: den.x,
                z: den.z,
                type: 'wolfDen' as const,
                kind: 'wolf' as const,
                respawnIntervalDays: Infinity,
                maxPreyCount: 2,
              })),
              initialPersistentOccupants,
            )
          } finally {
            bootMarkEnd('background:buildFauna')
          }
        })(),
        (async () => {
          bootMark('background:preloadItemGlbModels')
          try {
            await preloadItemGlbModels()
          } finally {
            bootMarkEnd('background:preloadItemGlbModels')
          }
        })(),
        (async () => {
          bootMark('background:preloadHeldToolModels')
          try {
            await preloadHeldToolModels()
          } finally {
            bootMarkEnd('background:preloadHeldToolModels')
          }
        })(),
      ])
      bootMarkEnd('background:fauna+preloads')

      bootMark('background:homeReady')
      const home = await settlementsManager.homeReady
      bootMarkEnd('background:homeReady')

      bootMark('background:itemSpawners+dryingRacks+hives')
      itemSpawners = buildItemSpawners(scene, chunkManager, home, config.seed)
      dryingRacks = createDryingRacks(scene, chunkManager.sampleHeight, home.landmarks.stockpile, initialDryingRacks)
      hives = createBeehives(scene, chunkManager.sampleHeight, home.landmarks.trees.map((t) => t.position), config.seed, initialHives)
      bootMarkEnd('background:itemSpawners+dryingRacks+hives')
    } catch (err) {
      console.error('[worldBundle] background world-system init failed', err)
      fauna?.dispose()
      itemSpawners?.dispose()
      dryingRacks?.dispose()
      hives?.dispose()
      throw err
    }

    if (isStale()) {
      // Superseded by a rebuild (or the app tore down) while this was still
      // building — same cancellation as `SettlementsManager`'s own
      // `ensureLoaded`/home-build guards; never touch `bundle`.
      fauna.dispose()
      itemSpawners.dispose()
      dryingRacks.dispose()
      hives.dispose()
      return
    }
    faunaForHunting = fauna
    Object.assign(bundle, { fauna, itemSpawners, dryingRacks, hives })
  })()

  return { bundle, backgroundReady }
}

export async function createWorldBundle(
  scene: Scene,
  config: WorldConfig,
  collectedItemIds: Set<string>,
  /** Ids of naturally-generated crops already harvested (plan 172) — same
   *  "carried across rebuild, reset only on a genuinely new world" contract
   *  as `collectedItemIds`. */
  removedCropIds: Set<string>,
  /** Player-planted trees/crops (plan 126) — same "carried across rebuild,
   *  reset only on a genuinely new world" contract as `collectedItemIds`/
   *  `removedCropIds` above. */
  plantedTrees: PlantedTreeRecord[],
  plantedCrops: CropPlacement[],
  /** Runtime terrain-deformation records (plan `world-terrain-save`) — same
   *  "carried across rebuild, reset only on a genuinely new world" contract
   *  as `plantedTrees`/`plantedCrops` above. */
  modifications: TerrainModification[],
  playAt: PlayAt,
  initialDroppedItems: readonly DroppedItem[],
  initialPlacedFires: readonly PlacedFire[],
  initialPlacedTents: readonly PlacedTent[],
  initialPlacedTraps: readonly PlacedTrapRecord[],
  /** NPC burial graves (plan npc-011) — same carry contract as `initialPlacedTraps`. */
  initialGraves: readonly SaveGrave[] = [],
  /** Plan 164 — persistent player-placed storage containers, same "carried
   *  across rebuild, reset only on a genuinely new world" contract as
   *  `initialPlacedTents`/`initialPlacedTraps`. */
  initialPlacedContainers: readonly PlacedContainerRecord[],
  initialWorldGeneratedContainers: readonly SaveWorldGeneratedContainer[] = [],
  /** Plan 164 — the container currently in the player's hands (if any),
   *  same reset contract. */
  initialCarriedContainer: SaveCarriedContainer | null,
  /** Plan 127 — persistent player-built wells, same "carried across rebuild,
   *  reset only on a genuinely new world" contract as the placed-* arrays
   *  above. */
  initialPlayerWells: readonly PlayerWellRecord[],
  treeLifecycle: TreeLifecycle,
  getWorldDays: () => number,
  dayNight: DayNightState,
  /** Plan 159 — persistent drying racks/hives, same "carried across rebuild,
   *  reset only on a genuinely new world" contract as the placed-* arrays
   *  above. */
  initialDryingRacks: readonly DryingRackRecord[] = [],
  initialHives: readonly BeehiveRecord[] = [],
  initialEconomies?: Record<string, SettlementEconomySnapshot>,
  /** Reports any wild-fauna or livestock death (any cause) by `animalId` —
   *  threaded down into `buildFauna`/`buildSettlementsManager` so
   *  `QuestManager` can observe `animal_died` generically (plan 110). */
  onAnimalDeath?: (animalId: string) => void,
  /** Resolves an NPC's relation level + general player standing by name —
   *  threaded down into `buildSettlementsManager` → `NpcAgent`'s reaction
   *  chance (plan 117). Same `QuestManager`-not-ready-yet indirection as
   *  `onAnimalDeath` above; see that hook's call site in `createApp.ts`. */
  getPlayerSocial?: PlayerSocialLookup,
  /** Persistent land-plot ownership query (plan 129) — threaded down into
   *  `buildSettlementsManager` → every `createSettlement` call, same
   *  indirection-free wiring as `onAnimalDeath`/`getPlayerSocial` above
   *  (ownership doesn't depend on `QuestManager`, so no mutable-target trick
   *  is needed — see that hook's call site in `createApp.ts`). */
  isLandPlotOwned?: (settlementId: string, plotId: string) => boolean,
  /** Reports a completed trap catch (plan 141) — the single place Traps XP is
   *  awarded and the catch is announced, owned by `createApp.ts`. */
  onTrapCapture?: PlacedTrapsHooks['onCapture'],
  /** Plan 159 §12 — bait returned to inventory on disarm/collect before a
   *  capture; same indirection as `onTrapCapture` above. */
  onTrapBaitReturned?: PlacedTrapsHooks['onBaitReturned'],
  /** Saved spawn-point lifecycle (plan 125 persistence follow-up), keyed by
   *  `PreySpawner.id` — see `createFauna`'s `initialSpawnerState` doc. */
  initialSpawnerState?: ReadonlyMap<string, SavedSpawnPointState>,
  /** Plan 157 — production `NUM_POINT_LIGHTS` stabilization, created once in
   *  `createApp.ts` (tied to `scene`'s lifetime, not the bundle's) and
   *  threaded down into `createSettlementsManager`/`createPlacedFires` the
   *  same way `playAt` is above. */
  pointLightBudget?: PointLightBudget,
  /** Bounded lookup for a nearby completed player-built well (plan 127 §10)
   *  — forwarded into `buildSettlementsManager` the same way `getPlayerSocial`
   *  is above. */
  getNearbyPlayerWell?: NearbyPlayerWellLookup,
  /** Plan 174 — persistent player-built garden plots, same "carried across
   *  rebuild, reset only on a genuinely new world" contract as
   *  `initialPlayerWells` above. */
  initialPlayerGardens: readonly PlayerGardenRecord[] = [],
  /** Plan 198/201 — authoritative ore-deposit mining-hits-remaining, sparse
   *  and keyed by `NaturalResource.id`; same "carried across rebuild, reset
   *  only on a genuinely new world" contract as `collectedItemIds`, and
   *  persisted the same way (`SaveData.resourceDeposits`). */
  resourceDepletion: ResourceDepletionState = new Map(),
  /** Plan `world-terrain-002` — persistent active terrain-preparation work
   *  sites, same "carried across rebuild, reset only on a genuinely new
   *  world" contract as `initialPlayerWells`/`initialPlayerGardens` above. */
  initialTerrainPreparations: readonly TerrainPreparationRecord[] = [],
  /** World-003 "faster application startup" — reports `true` once the
   *  caller no longer wants this build's deferred background result (a
   *  rebuild superseded it, or the app tore down before it finished); see
   *  `buildWorldSystems`'s doc comment. Defaults to "never stale" for
   *  existing callers/tests. */
  isStale?: () => boolean,
  /** Plan items-player-009 — persistent player-built standing torches, same
   *  "carried across rebuild, reset only on a genuinely new world" contract
   *  as `initialPlayerWells`/`initialPlayerGardens` above. */
  initialStandingTorches: readonly StandingTorchRecord[] = [],
  /** Plan items-player-020 — persistent player-built animal troughs, same
   *  "carried across rebuild, reset only on a genuinely new world" contract
   *  as `initialStandingTorches` above. */
  initialPlayerTroughs: readonly PlayerTroughRecord[] = [],
  /** Plan items-player-010 — persistent player-built palisade segments, same
   *  "carried across rebuild, reset only on a genuinely new world" contract
   *  as `initialStandingTorches` above. */
  initialPalisades: readonly PalisadeSegmentRecord[] = [],
  /** Plan items-player-013 — persistent player-built bedrolls/sleeping
   *  platforms, same "carried across rebuild, reset only on a genuinely new
   *  world" contract as `initialStandingTorches`/`initialPalisades` above. */
  initialSleepingUtilityBedrolls: readonly BedrollRecord[] = [],
  initialSleepingUtilityPlatforms: readonly PlatformRecord[] = [],
  /** Plan npc-014 — persistent player-issued work contracts, same "carried
   *  across rebuild, reset only on a genuinely new world" contract as
   *  `initialStandingTorches`/`initialPalisades` above. */
  initialWorkContracts: readonly WorkContractRecord[] = [],
  /** Plan persistence-001 — NPC authoritative state/households/relationships/
   *  livestock, sourced from `SaveData` on a fresh boot (`createApp.ts`).
   *  Previously only threaded through `rebuildWorldBundle`'s in-session carry
   *  (see that function's `carriedHouseholds`/`carriedNpcStates`) — a real
   *  save/load never restored these before this plan; same "carried across
   *  rebuild, reset only on a genuinely new world" contract as
   *  `initialEconomies` above, just also sourced from `SaveData` now. */
  initialHouseholds?: Record<HouseholdId, HouseholdSnapshot>,
  initialNpcStates?: Record<NpcId, NpcStateSnapshot>,
  initialNpcRelationships?: readonly NpcRelationshipEntry[],
  initialLivestock?: readonly LivestockSaveRecord[],
  initialRemovedLivestockIds?: readonly string[],
  initialRats?: readonly import('../settlement/ratPersistence').RatSaveRecord[],
  initialRemovedRatIds?: readonly string[],
  initialStorageInfestation?: Record<string, import('../settlement/ratInfestation').RatInfestationState>,
  seedHomeStorageInfestation: boolean = false,
  /** Plan fauna-010 §3/§4 — sparse grass forage depletion overrides, same
   *  "long-lived object owned by `createApp.ts`, mutated in place, threaded
   *  through both `createWorldBundle` and `rebuildWorldBundle`" contract as
   *  `resourceDepletion` above. */
  grassForageOverrides: GrassForageOverrides = {},
  /** Plan world-019 — compact completed prepared-area facts, same carry/
   *  restore contract as `initialTerrainPreparations`. */
  initialCompletedTerrainPreparations: readonly CompletedTerrainPreparation[] = [],
  /** Plan settlements-005 — persistent player-built residential houses, same
   *  carry/restore contract as `initialPalisades`. */
  initialResidentialBuildings: readonly ResidentialBuildingRecord[] = [],
  /** Movable draft carts (plan fauna-007) — same carry/restore contract as
   *  `initialPlacedTents`. Empty on a fresh world spawns one demo cart near home. */
  initialCarts: readonly CartRecord[] = [],
  /** Sparse persistent habitat occupants (plan fauna-018) — same
   *  carry/restore contract as spawn-point lifecycle. */
  initialPersistentOccupants?: PersistentOccupantSnapshot,
): Promise<BuiltWorldSystems> {
  return buildWorldSystems({
    scene, config, collectedItemIds, removedCropIds, plantedTrees, plantedCrops, modifications, playAt,
    treeLifecycle, getWorldDays, dayNight,
    droppedItems: initialDroppedItems,
    placedFires: initialPlacedFires,
    placedTents: initialPlacedTents,
    placedTraps: initialPlacedTraps,
    carts: initialCarts,
    graves: initialGraves,
    placedContainers: initialPlacedContainers,
    worldGeneratedContainers: initialWorldGeneratedContainers,
    carriedContainer: initialCarriedContainer,
    playerWells: initialPlayerWells,
    playerGardens: initialPlayerGardens,
    standingTorches: initialStandingTorches,
    playerTroughs: initialPlayerTroughs,
    palisades: initialPalisades,
    residentialBuildings: initialResidentialBuildings,
    sleepingUtilityBedrolls: initialSleepingUtilityBedrolls,
    sleepingUtilityPlatforms: initialSleepingUtilityPlatforms,
    terrainPreparations: initialTerrainPreparations,
    completedTerrainPreparations: initialCompletedTerrainPreparations,
    dryingRacks: initialDryingRacks,
    hives: initialHives,
    workContracts: initialWorkContracts,
    economies: initialEconomies,
    households: initialHouseholds,
    npcStates: initialNpcStates,
    npcRelationships: initialNpcRelationships,
    livestock: initialLivestock,
    removedLivestockIds: initialRemovedLivestockIds,
    rats: initialRats,
    removedRatIds: initialRemovedRatIds,
    storageInfestation: initialStorageInfestation,
    seedHomeStorageInfestation,
    spawnerState: initialSpawnerState,
    persistentOccupants: initialPersistentOccupants,
    resourceDepletion,
    grassForageOverrides,
    onAnimalDeath, getPlayerSocial, isLandPlotOwned, onTrapCapture, onTrapBaitReturned,
    pointLightBudget, getNearbyPlayerWell,
  }, isStale)
}

/** Disposes every member's current instance and mutates `bundle`'s fields in
 *  place with fresh ones — callers holding `bundle` (not a destructured
 *  field) see the new world on their next read, no different from the old
 *  single-scope `let chunkManager = ...` reassignment this replaced. Never
 *  replace `bundle` itself with a new object.
 *
 *  Pass `resetCollectedItems: true` only for a genuinely new world (new seed)
 *  — an unrelated terrain-param rebuild on the same seed keeps dropped items/
 *  placed fires, since their positions aren't seed-derived. `collectedItemIds`
 *  must already reflect the caller's reset decision (a fresh empty `Set` if
 *  `resetCollectedItems`) — it's just threaded through to the new
 *  `chunkManager`, this function doesn't decide that part. */
export async function rebuildWorldBundle(
  bundle: WorldBundle,
  scene: Scene,
  config: WorldConfig,
  resetCollectedItems: boolean,
  collectedItemIds: Set<string>,
  /** Same reset contract as `collectedItemIds` — `resetCollectedItems`
   *  governs both. */
  removedCropIds: Set<string>,
  /** Same reset contract as `collectedItemIds`/`removedCropIds` above (plan 126). */
  plantedTrees: PlantedTreeRecord[],
  plantedCrops: CropPlacement[],
  /** Same reset contract as `collectedItemIds`/`plantedTrees` above (plan
   *  `world-terrain-save`). */
  modifications: TerrainModification[],
  playAt: PlayAt,
  treeLifecycle: TreeLifecycle,
  getWorldDays: () => number,
  dayNight: DayNightState,
  onAnimalDeath?: (animalId: string) => void,
  getPlayerSocial?: PlayerSocialLookup,
  isLandPlotOwned?: (settlementId: string, plotId: string) => boolean,
  onTrapCapture?: PlacedTrapsHooks['onCapture'],
  onTrapBaitReturned?: PlacedTrapsHooks['onBaitReturned'],
  /** Plan 157 — same instance passed to `createWorldBundle`; a rebuild
   *  disposes/recreates `settlementsManager`/`placedFires` but the budget
   *  itself (and its pad, added directly to `scene`) survives, matching
   *  `scene`'s own lifetime rather than the bundle's. */
  pointLightBudget?: PointLightBudget,
  /** Bounded lookup for a nearby completed player-built well (plan 127 §10)
   *  — forwarded into `buildSettlementsManager` the same way `getPlayerSocial`
   *  is above. */
  getNearbyPlayerWell?: NearbyPlayerWellLookup,
  /** Plan 198 — same reset contract as `collectedItemIds`: `resetCollectedItems`
   *  governs both (caller passes a fresh empty `Map` alongside it). */
  resourceDepletion: ResourceDepletionState = new Map(),
  /** World-003 "faster application startup" — forwarded into
   *  `buildWorldSystems` the same way `createWorldBundle`'s own `isStale` is;
   *  guards this rebuild's *own* deferred background phase (fauna/item
   *  spawners/drying racks/hives) against the app tearing down mid-rebuild.
   *  Not needed to guard against a *second* rebuild superseding this one —
   *  this function already fully awaits its background phase (see
   *  `await backgroundReady` below) before returning, so there's never a
   *  dangling background result left over from a rebuild the way there can
   *  be from the initial `createWorldBundle`. */
  isStale?: () => boolean,
  /** Same contract as `createWorldBundle`'s own `grassForageOverrides`
   *  (plan fauna-010 §3/§4) — the same long-lived object `createApp.ts`
   *  owns and threads through both. */
  grassForageOverrides: GrassForageOverrides = {},
): Promise<void> {
  // Snapshot before dispose() — a same-session rebuild (config change, not a
  // new seed) recreates `Fauna` from scratch just like every other bundle
  // member; spawn-point lifecycle would otherwise silently reset to `active`
  // mid-session too (not just across a real save/load).
  const carriedSpawnerState = resetCollectedItems
    ? undefined
    : new Map(bundle.fauna.getSpawners().map((s) => [s.id, snapshotSpawnPointState(s)]))
  const carriedPersistentOccupants = resetCollectedItems
    ? undefined
    : bundle.fauna.snapshotPersistentOccupants()
  // Blood traces (plan world-009) are positioned by real damage events, not
  // seed-derived — same "carried across rebuild, reset only on a genuinely
  // new world" contract as the placed-* arrays below.
  const carriedBloodTraces = resetCollectedItems ? undefined : bundle.bloodTraces.snapshot()
  bundle.bloodTraces.dispose()
  bundle.fauna.dispose()
  bundle.itemSpawners.dispose()
  // Copy before dispose() — nodes() returns a live reference to the internal
  // array, and dispose() clears it in place.
  const carriedDrops = resetCollectedItems ? [] : [...bundle.droppedItems.nodes()]
  bundle.droppedItems.dispose()
  const carriedFires = resetCollectedItems ? [] : [...bundle.placedFires.nodes()]
  bundle.placedFires.dispose()
  const carriedTents = resetCollectedItems ? [] : [...bundle.placedTents.nodes()]
  bundle.placedTents.dispose()
  const carriedTraps = resetCollectedItems ? [] : [...bundle.placedTraps.nodes()]
  bundle.placedTraps.dispose()
  const carriedCarts = resetCollectedItems ? [] : [...bundle.carts.nodes()]
  bundle.carts.dispose()
  const carriedGraves = resetCollectedItems ? [] : [...bundle.npcGraves.nodes()]
  bundle.npcGraves.dispose()
  const carriedContainerNodes = resetCollectedItems ? [] : [...bundle.placedContainers.nodes()]
  const carriedContainerHeld = resetCollectedItems ? null : bundle.placedContainers.carriedNode()
  bundle.placedContainers.dispose()
  const carriedWorldGeneratedContainers = resetCollectedItems ? [] : [...bundle.worldGeneratedContainers.nodes()]
  bundle.worldGeneratedContainers.dispose()
  // Player-built wells are positioned by the player, not seed-derived — kept
  // across an unrelated terrain-param rebuild, same reset contract as tents/
  // traps/containers above.
  const carriedPlayerWells = resetCollectedItems ? [] : [...bundle.playerWells.nodes()]
  bundle.playerWells.dispose()
  // Player-built garden plots are positioned by the player, not seed-derived
  // — same carry-across-rebuild contract as `playerWells` above.
  const carriedPlayerGardens = resetCollectedItems ? [] : [...bundle.playerGardens.nodes()]
  bundle.playerGardens.dispose()
  // Player-built standing torches are positioned by the player, not
  // seed-derived — same carry-across-rebuild contract as `playerGardens` above.
  const carriedStandingTorches = resetCollectedItems ? [] : [...bundle.standingTorches.nodes()]
  bundle.standingTorches.dispose()
  const carriedPlayerTroughs = resetCollectedItems ? [] : [...bundle.playerTroughs.nodes()]
  bundle.playerTroughs.dispose()
  // Player-built palisade segments are positioned by the player, not
  // seed-derived — same carry-across-rebuild contract as `standingTorches` above.
  const carriedPalisades = resetCollectedItems ? [] : [...bundle.palisades.nodes()]
  bundle.palisades.dispose()
  const carriedResidentialBuildings = resetCollectedItems ? [] : [...bundle.residentialBuildings.nodes()]
  bundle.residentialBuildings.dispose()
  // Player-built bedrolls/platforms are positioned by the player, not
  // seed-derived — same carry-across-rebuild contract as `palisades` above.
  const carriedBedrolls = resetCollectedItems ? [] : [...bundle.sleepingUtilities.bedrolls.nodes()]
  const carriedPlatforms = resetCollectedItems ? [] : [...bundle.sleepingUtilities.platforms.nodes()]
  bundle.sleepingUtilities.dispose()
  // Active terrain-preparation work sites are positioned by the player, not
  // seed-derived — same carry-across-rebuild contract as `playerWells`/
  // `playerGardens` above. Completed-area facts (plan world-019) ride along
  // so they survive an in-session rebuild the same way a save/load does.
  const carriedTerrainPreparations = resetCollectedItems ? [] : [...bundle.terrainPreparations.nodes()]
  const carriedCompletedTerrainPreparations = resetCollectedItems ? [] : [...bundle.terrainPreparations.completed()]
  bundle.terrainPreparations.dispose()
  const carriedDryingRacks = resetCollectedItems ? [] : [...bundle.dryingRacks.nodes()]
  bundle.dryingRacks.dispose()
  const carriedHives = resetCollectedItems ? [] : [...bundle.hives.nodes()]
  bundle.hives.dispose()
  // Player-issued work contracts are positioned by the player, not
  // seed-derived — same carry-across-rebuild contract as `hives`/
  // `terrainPreparations` above (plan npc-014).
  const carriedWorkContracts = resetCollectedItems ? [] : [...bundle.workContracts.nodes()]
  bundle.workContracts.dispose()
  // In-transit cargo is still on transient `NpcAgent.carried` — do not keep
  // orders across rebuild (plan settlements-npcs-018 explicit boundary).
  bundle.transportOrders.dispose()
  const carriedEconomies = resetCollectedItems ? undefined : bundle.settlementsManager.snapshotEconomies()
  // Households (plan 197 §8) and NPC authoritative state (plan 197 §7) get
  // the same same-seed-only carry contract as `carriedEconomies` above —
  // reset to fresh on a genuinely new world, reused on an in-session rebuild.
  const carriedHouseholds = resetCollectedItems ? undefined : bundle.settlementsManager.snapshotHouseholds()
  const carriedNpcStates = resetCollectedItems ? undefined : bundle.settlementsManager.snapshotNpcStates()
  // Same same-seed-only carry contract as `carriedEconomies`/`carriedHouseholds`
  // above, applied to NPC relationships/livestock (plan persistence-001).
  const carriedNpcRelationships = resetCollectedItems ? undefined : bundle.settlementsManager.snapshotRelationships()
  const carriedLivestock = resetCollectedItems ? undefined : bundle.settlementsManager.snapshotLivestock()
  const carriedRats = resetCollectedItems ? undefined : bundle.settlementsManager.snapshotRats()
  const carriedStorageInfestation = resetCollectedItems ? undefined : bundle.settlementsManager.snapshotStorageInfestation()
  bundle.caves.dispose()
  bundle.resourceDeposits.dispose()
  bundle.grassForage.dispose()
  bundle.settlementsManager.dispose()
  bundle.ocean.dispose()
  bundle.chunkManager.dispose()

  // roadNetwork's def/route caches are module-level and keyed by cell/id, not
  // by seed — must be dropped before generating the new world's chunks,
  // otherwise roads/village clearings from the old seed leak in.
  clearRoadNetworkCaches()

  // Presence index is chunk/settlement owned — clear before rebuild so stale
  // ids from the previous world don't pollute canopy queries.
  treeLifecycle.clearPresence()
  if (resetCollectedItems) treeLifecycle.clearOverrides()

  const { bundle: fresh, backgroundReady } = await buildWorldSystems({
    scene, config, collectedItemIds, removedCropIds, plantedTrees, plantedCrops, modifications, playAt,
    treeLifecycle, getWorldDays, dayNight,
    droppedItems: carriedDrops,
    placedFires: carriedFires,
    placedTents: carriedTents,
    placedTraps: carriedTraps,
    carts: carriedCarts,
    graves: carriedGraves,
    placedContainers: carriedContainerNodes,
    worldGeneratedContainers: carriedWorldGeneratedContainers,
    carriedContainer: carriedContainerHeld,
    playerWells: carriedPlayerWells,
    playerGardens: carriedPlayerGardens,
    standingTorches: carriedStandingTorches,
    playerTroughs: carriedPlayerTroughs,
    palisades: carriedPalisades,
    residentialBuildings: carriedResidentialBuildings,
    sleepingUtilityBedrolls: carriedBedrolls,
    sleepingUtilityPlatforms: carriedPlatforms,
    terrainPreparations: carriedTerrainPreparations,
    completedTerrainPreparations: carriedCompletedTerrainPreparations,
    dryingRacks: carriedDryingRacks,
    hives: carriedHives,
    workContracts: carriedWorkContracts,
    economies: carriedEconomies,
    households: carriedHouseholds,
    npcStates: carriedNpcStates,
    npcRelationships: carriedNpcRelationships,
    livestock: carriedLivestock?.entries,
    removedLivestockIds: carriedLivestock?.removedIds,
    rats: carriedRats?.entries,
    removedRatIds: carriedRats?.removedIds,
    storageInfestation: carriedStorageInfestation,
    seedHomeStorageInfestation: false,
    spawnerState: carriedSpawnerState,
    persistentOccupants: carriedPersistentOccupants,
    resourceDepletion,
    grassForageOverrides,
    onAnimalDeath, getPlayerSocial, isLandPlotOwned, onTrapCapture, onTrapBaitReturned,
    pointLightBudget, getNearbyPlayerWell,
    bloodTraces: carriedBloodTraces,
  }, isStale)
  // A rebuild keeps its historical fully-synchronous contract — callers
  // (`app/createApp.ts`) still see every system, including fauna/item
  // spawners/drying racks/hives, ready by the time this resolves. Only a
  // fresh `createWorldBundle()` boot returns before `backgroundReady`.
  await backgroundReady
  // `bundle` itself must stay the same object reference (see this file's
  // `WorldBundle` doc comment / ARCHITECTURE.md's rebuild invariants) — this
  // reassigns every field in place, in one synchronous step, rather than
  // replacing `bundle`.
  Object.assign(bundle, fresh)
}

export function disposeWorldBundle(bundle: WorldBundle): void {
  bundle.bloodTraces.dispose()
  bundle.fauna.dispose()
  bundle.itemSpawners.dispose()
  bundle.droppedItems.dispose()
  bundle.placedFires.dispose()
  bundle.placedTents.dispose()
  bundle.placedTraps.dispose()
  bundle.carts.dispose()
  bundle.npcGraves.dispose()
  bundle.placedContainers.dispose()
  bundle.worldGeneratedContainers.dispose()
  bundle.playerWells.dispose()
  bundle.playerGardens.dispose()
  bundle.standingTorches.dispose()
  bundle.playerTroughs.dispose()
  bundle.palisades.dispose()
  bundle.residentialBuildings.dispose()
  bundle.sleepingUtilities.dispose()
  bundle.terrainPreparations.dispose()
  bundle.caves.dispose()
  bundle.dryingRacks.dispose()
  bundle.hives.dispose()
  bundle.workContracts.dispose()
  bundle.transportOrders.dispose()
  bundle.resourceDeposits.dispose()
  bundle.grassForage.dispose()
  bundle.settlementsManager.dispose()
  bundle.ocean.dispose()
  bundle.chunkManager.dispose()
}
