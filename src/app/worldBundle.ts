import { type Scene, Vector3 } from 'three'
import type { PlayerSocialLookup } from '../ai/reactionChance'
import type { PlayAt } from '../audio/createWorldAudio'
import type { WorldConfig } from '../config/worldConfig'
import type { EconomicKind } from '../economy/kinds'
import type { SettlementHuntingHooks } from '../fauna/huntingHooks'
import type { Settlement } from '../settlement/createSettlement'
import type { HouseholdId, HouseholdSnapshot } from '../settlement/household'
import type { NpcId, NpcStateSnapshot } from '../settlement/npcState'
import type { SettlementDef } from '../settlement/settlementGenerator'
import type { ChunkCoord } from '../terrain/chunkGrid'
import type { ResourceDepletionState } from '../terrain/depositMining'
import type { TerrainPreparationRecord } from '../terrain/terrainPreparation'
import type { PlacedTrapRecord } from '../world/animalTraps'
import type { BeehiveRecord } from '../world/beehives'
import type { CropPlacement } from '../world/cropLifecycle'
import type { DayNightState } from '../world/dayNight'
import type { DryingRackRecord } from '../world/dryingRacks'
import type { SettlementFoodSourceHooks } from '../world/foodSources'
import type { HelperDeliveryHooks } from '../world/helperDeliveryHooks'
import type { PlantedTreeRecord } from '../world/plantedTrees'
import type { PlayerGardenRecord } from '../world/playerGarden'
import type { NearbyPlayerWellLookup, PlayerWellRecord } from '../world/playerWell'
import type { PointLightBudget } from '../world/pointLightBudget'
import type { SettlementForestHooks } from '../world/settlementForestHooks'
import type { TreeLifecycle } from '../world/treeLifecycle'
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
import { createSettlementsManager, type SettlementsManager } from '../settlement/SettlementsManager'
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
import { type Beehives, createBeehives } from '../world/createBeehives'
import { createDryingRacks, type DryingRacks } from '../world/createDryingRacks'
import { createLargeCaves, type LargeCaves } from '../world/createLargeCaves'
import { createOcean, type WorldOcean } from '../world/createOcean'
import {
  createPlacedContainers,
  type PlacedContainerRecord,
  type PlacedContainers,
  type SaveCarriedContainer,
} from '../world/createPlacedContainers'
import { createPlacedTraps, type PlacedTraps, type PlacedTrapsHooks } from '../world/createPlacedTraps'
import { createPlayerGardens, type PlayerGardens } from '../world/createPlayerGardens'
import { createPlayerWells, type PlayerWells } from '../world/createPlayerWells'
import { createTerrainPreparations, type TerrainPreparations } from '../world/createTerrainPreparations'
import { createFoodSourceHooks } from '../world/foodSources'
import { createHelperDeliveryHooks } from '../world/helperDeliveryHooks'
import { createWaterMirror, type WaterMirror } from '../world/waterMirror'
import { createWorldContext, type WorldContext } from '../world/worldContext'

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
 *  reassigns fields — nothing else should. */
export type WorldBundle = {
  chunkManager: ChunkManager
  ocean: WorldOcean
  settlementsManager: SettlementsManager
  fauna: Fauna
  itemSpawners: ItemSpawners
  resourceDeposits: ResourceDeposits
  droppedItems: DroppedItems
  placedFires: PlacedFires
  placedTents: PlacedTents
  placedTraps: PlacedTraps
  placedContainers: PlacedContainers
  playerWells: PlayerWells
  playerGardens: PlayerGardens
  terrainPreparations: TerrainPreparations
  largeCaves: LargeCaves
  dryingRacks: DryingRacks
  hives: Beehives
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
  initialEconomies?: Record<string, Partial<Record<EconomicKind, number>>>,
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
): Promise<SettlementsManager> {
  return createSettlementsManager(
    scene,
    chunkManager.sampleHeight,
    chunkManager.waterLevel,
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
  placedContainers: readonly PlacedContainerRecord[]
  carriedContainer: SaveCarriedContainer | null
  playerWells: readonly PlayerWellRecord[]
  playerGardens: readonly PlayerGardenRecord[]
  terrainPreparations: readonly TerrainPreparationRecord[]
  dryingRacks: readonly DryingRackRecord[]
  hives: readonly BeehiveRecord[]
  economies?: Record<string, Partial<Record<EconomicKind, number>>>
  households?: Record<HouseholdId, HouseholdSnapshot>
  npcStates?: Record<NpcId, NpcStateSnapshot>
  spawnerState?: ReadonlyMap<string, SavedSpawnPointState>
  resourceDepletion: ResourceDepletionState
  onAnimalDeath?: (animalId: string) => void
  getPlayerSocial?: PlayerSocialLookup
  isLandPlotOwned?: (settlementId: string, plotId: string) => boolean
  onTrapCapture?: PlacedTrapsHooks['onCapture']
  onTrapBaitReturned?: PlacedTrapsHooks['onBaitReturned']
  pointLightBudget?: PointLightBudget
  getNearbyPlayerWell?: NearbyPlayerWellLookup
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
    placedContainers: initialPlacedContainers,
    carriedContainer: initialCarriedContainer,
    playerWells: initialPlayerWells,
    playerGardens: initialPlayerGardens,
    terrainPreparations: initialTerrainPreparations,
    dryingRacks: initialDryingRacks,
    hives: initialHives,
    economies: initialEconomies,
    households: initialHouseholds,
    npcStates: initialNpcStates,
    spawnerState: initialSpawnerState,
    resourceDepletion,
    onAnimalDeath, getPlayerSocial, isLandPlotOwned, onTrapCapture, onTrapBaitReturned,
    pointLightBudget, getNearbyPlayerWell,
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
  const helperDelivery = createHelperDeliveryHooks(placedContainers)

  // Now fast: returns as soon as `homeDef` (the home site's position/id/size
  // — a pure function of seed+terrain) is resolved and the home settlement's
  // own full build (houses/NPCs/livestock) has been kicked off in the
  // background, not awaited here (world-003 §3) — see
  // `SettlementsManager.homeReady`.
  bootMark('buildSettlementsManager')
  const settlementsManager = await buildSettlementsManager(scene, chunkManager, config.seed, playAt, config, forest, worldContext, mining, initialEconomies, onAnimalDeath, getPlayerSocial, isLandPlotOwned, pointLightBudget, getNearbyPlayerWell, foodSources, hunting, initialHouseholds, initialNpcStates, helperDelivery)
  bootMarkEnd('buildSettlementsManager')
  const homeDef = settlementsManager.getHomeDef()

  bootMark('droppedItems+placed+wells+terrainPrep')
  const droppedItems = createDroppedItems(scene, chunkManager.sampleHeight, initialDroppedItems)
  const placedFires = createPlacedFires(scene, chunkManager.sampleHeight, initialPlacedFires, playAt, pointLightBudget)
  const placedTents = createPlacedTents(scene, chunkManager.sampleHeight, initialPlacedTents)
  const placedTraps = createPlacedTraps(
    scene,
    chunkManager.sampleHeight,
    config.seed,
    { onCapture: onTrapCapture, onBaitReturned: onTrapBaitReturned },
    initialPlacedTraps,
  )
  const playerWells = createPlayerWells(
    scene,
    chunkManager.sampleHeight,
    chunkManager.registerColliders,
    chunkManager.clearColliders,
    initialPlayerWells,
  )
  const terrainPreparations = createTerrainPreparations(
    scene,
    chunkManager,
    chunkManager.sampleHeight,
    initialTerrainPreparations,
  )
  bootMarkEnd('droppedItems+placed+wells+terrainPrep')

  // Only needs `homeDef.size` (sync, see §4's `buildFauna` doc above) — kept
  // on the critical path rather than deferred, unlike `itemSpawners`/
  // `dryingRacks`/`hives` below, which need the home settlement's built
  // `landmarks` and so must wait for `homeReady` regardless.
  bootMark('createLargeCaves')
  const largeCaves = createLargeCaves(
    scene,
    chunkManager,
    config.seed,
    villageSizeConfig(homeDef.size).footprintRadius,
    config.terrain.region.coastThreshold,
  )
  bootMarkEnd('createLargeCaves')

  const bundle: WorldBundle = {
    chunkManager,
    ocean,
    settlementsManager,
    fauna: createEmptyFauna(),
    itemSpawners: createEmptyItemSpawners(),
    resourceDeposits,
    droppedItems,
    placedFires,
    placedTents,
    placedTraps,
    placedContainers,
    playerWells,
    playerGardens,
    terrainPreparations,
    largeCaves,
    dryingRacks: createEmptyDryingRacks(),
    hives: createEmptyBeehives(),
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
            return await buildFauna(scene, chunkManager, homeDef, config.seed, config.terrain.region.coastThreshold, onAnimalDeath, initialSpawnerState)
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
  /** Plan 164 — persistent player-placed storage containers, same "carried
   *  across rebuild, reset only on a genuinely new world" contract as
   *  `initialPlacedTents`/`initialPlacedTraps`. */
  initialPlacedContainers: readonly PlacedContainerRecord[],
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
  initialEconomies?: Record<string, Partial<Record<EconomicKind, number>>>,
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
): Promise<BuiltWorldSystems> {
  return buildWorldSystems({
    scene, config, collectedItemIds, removedCropIds, plantedTrees, plantedCrops, modifications, playAt,
    treeLifecycle, getWorldDays, dayNight,
    droppedItems: initialDroppedItems,
    placedFires: initialPlacedFires,
    placedTents: initialPlacedTents,
    placedTraps: initialPlacedTraps,
    placedContainers: initialPlacedContainers,
    carriedContainer: initialCarriedContainer,
    playerWells: initialPlayerWells,
    playerGardens: initialPlayerGardens,
    terrainPreparations: initialTerrainPreparations,
    dryingRacks: initialDryingRacks,
    hives: initialHives,
    economies: initialEconomies,
    spawnerState: initialSpawnerState,
    resourceDepletion,
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
): Promise<void> {
  // Snapshot before dispose() — a same-session rebuild (config change, not a
  // new seed) recreates `Fauna` from scratch just like every other bundle
  // member; spawn-point lifecycle would otherwise silently reset to `active`
  // mid-session too (not just across a real save/load).
  const carriedSpawnerState = resetCollectedItems
    ? undefined
    : new Map(bundle.fauna.getSpawners().map((s) => [s.id, snapshotSpawnPointState(s)]))
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
  const carriedContainerNodes = resetCollectedItems ? [] : [...bundle.placedContainers.nodes()]
  const carriedContainerHeld = resetCollectedItems ? null : bundle.placedContainers.carriedNode()
  bundle.placedContainers.dispose()
  // Player-built wells are positioned by the player, not seed-derived — kept
  // across an unrelated terrain-param rebuild, same reset contract as tents/
  // traps/containers above.
  const carriedPlayerWells = resetCollectedItems ? [] : [...bundle.playerWells.nodes()]
  bundle.playerWells.dispose()
  // Player-built garden plots are positioned by the player, not seed-derived
  // — same carry-across-rebuild contract as `playerWells` above.
  const carriedPlayerGardens = resetCollectedItems ? [] : [...bundle.playerGardens.nodes()]
  bundle.playerGardens.dispose()
  // Active terrain-preparation work sites are positioned by the player, not
  // seed-derived — same carry-across-rebuild contract as `playerWells`/
  // `playerGardens` above.
  const carriedTerrainPreparations = resetCollectedItems ? [] : [...bundle.terrainPreparations.nodes()]
  bundle.terrainPreparations.dispose()
  const carriedDryingRacks = resetCollectedItems ? [] : [...bundle.dryingRacks.nodes()]
  bundle.dryingRacks.dispose()
  const carriedHives = resetCollectedItems ? [] : [...bundle.hives.nodes()]
  bundle.hives.dispose()
  const carriedEconomies = resetCollectedItems ? undefined : bundle.settlementsManager.snapshotEconomies()
  // Households (plan 197 §8) and NPC authoritative state (plan 197 §7) get
  // the same same-seed-only carry contract as `carriedEconomies` above —
  // reset to fresh on a genuinely new world, reused on an in-session rebuild.
  const carriedHouseholds = resetCollectedItems ? undefined : bundle.settlementsManager.snapshotHouseholds()
  const carriedNpcStates = resetCollectedItems ? undefined : bundle.settlementsManager.snapshotNpcStates()
  bundle.largeCaves.dispose()
  bundle.resourceDeposits.dispose()
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
    placedContainers: carriedContainerNodes,
    carriedContainer: carriedContainerHeld,
    playerWells: carriedPlayerWells,
    playerGardens: carriedPlayerGardens,
    terrainPreparations: carriedTerrainPreparations,
    dryingRacks: carriedDryingRacks,
    hives: carriedHives,
    economies: carriedEconomies,
    households: carriedHouseholds,
    npcStates: carriedNpcStates,
    spawnerState: carriedSpawnerState,
    resourceDepletion,
    onAnimalDeath, getPlayerSocial, isLandPlotOwned, onTrapCapture, onTrapBaitReturned,
    pointLightBudget, getNearbyPlayerWell,
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
  bundle.fauna.dispose()
  bundle.itemSpawners.dispose()
  bundle.droppedItems.dispose()
  bundle.placedFires.dispose()
  bundle.placedTents.dispose()
  bundle.placedTraps.dispose()
  bundle.placedContainers.dispose()
  bundle.playerWells.dispose()
  bundle.playerGardens.dispose()
  bundle.terrainPreparations.dispose()
  bundle.largeCaves.dispose()
  bundle.dryingRacks.dispose()
  bundle.hives.dispose()
  bundle.resourceDeposits.dispose()
  bundle.settlementsManager.dispose()
  bundle.ocean.dispose()
  bundle.chunkManager.dispose()
}
