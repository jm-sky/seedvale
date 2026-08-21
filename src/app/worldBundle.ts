import type { PlayerSocialLookup } from '../ai/reactionChance'
import type { PlayAt } from '../audio/createWorldAudio'
import type { WorldConfig } from '../config/worldConfig'
import type { EconomicKind } from '../economy/kinds'
import type { Settlement } from '../settlement/createSettlement'
import type { ChunkCoord } from '../terrain/chunkGrid'
import type { PlacedTrapRecord } from '../world/animalTraps'
import type { BeehiveRecord } from '../world/beehives'
import type { CropPlacement } from '../world/cropLifecycle'
import type { DayNightState } from '../world/dayNight'
import type { DryingRackRecord } from '../world/dryingRacks'
import type { PlantedTreeRecord } from '../world/plantedTrees'
import type { NearbyPlayerWellLookup, PlayerWellRecord } from '../world/playerWell'
import type { PointLightBudget } from '../world/pointLightBudget'
import type { SettlementForestHooks } from '../world/settlementForestHooks'
import type { TreeLifecycle } from '../world/treeLifecycle'
import { type SavedSpawnPointState, snapshotSpawnPointState } from '../fauna/AnimalSpawner'
import { createFauna, type Fauna, SPAWNER_RING_OFFSET } from '../fauna/createFauna'
import { createDroppedItems, type DroppedItem, type DroppedItems } from '../items/createDroppedItems'
import { createItemSpawners, type ItemSpawners } from '../items/createItemSpawners'
import { createPlacedTents, type PlacedTent, type PlacedTents } from '../items/createPlacedTents'
import { preloadHeldToolModels } from '../items/heldToolVisual'
import { preloadItemGlbModels } from '../items/itemModels'
import { villageSizeConfig } from '../settlement/families'
import { createPlacedFires, type PlacedFire, type PlacedFires } from '../settlement/PlacedFires'
import { clearRoadNetworkCaches } from '../settlement/roadNetwork'
import { createSettlementsManager, type SettlementsManager } from '../settlement/SettlementsManager'
import {
  type ChunkManager,
  type ChunkManagerConfig,
  createChunkManager,
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
import { createPlayerWells, type PlayerWells } from '../world/createPlayerWells'
import { createWaterMirror, type WaterMirror } from '../world/waterMirror'
import { createWorldContext, type WorldContext } from '../world/worldContext'
import type { Scene } from 'three'

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
  )
}

function buildFauna(
  scene: Scene,
  chunkManager: ChunkManager,
  settlement: Settlement,
  seed: number,
  coastThreshold: number,
  onAnimalDeath?: (animalId: string) => void,
  /** Saved spawn-point lifecycle (plan 125 persistence follow-up) — see
   *  `createFauna`'s `initialSpawnerState` doc. */
  initialSpawnerState?: ReadonlyMap<string, SavedSpawnPointState>,
): Promise<Fauna> {
  const footprintRadius = villageSizeConfig(settlement.size).footprintRadius
  // Spawner ring now reaches `footprintRadius + SPAWNER_RING_OFFSET[1]` (plan
  // 080 — was a flat 45–65 m from home); size the query so its half-extent
  // covers that reach plus a road halfWidth clearance margin, same 10 m
  // margin the original fixed 150 (→ half 75, ring max 65) already implied.
  const spawnerMaxReach = footprintRadius + SPAWNER_RING_OFFSET[1]
  const roadSegments = chunkManager.roadCorridorsNear(
    settlement.center.x,
    settlement.center.z,
    (spawnerMaxReach + 10) * 2,
  )
  return createFauna(
    scene,
    chunkManager.sampleHeight,
    chunkManager.sampleForestFactor,
    chunkManager.waterLevel,
    chunkManager.collidersNear,
    HOME_RADIUS,
    settlement.center,
    settlement.id,
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
  )
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
 *  no reassignment for it to survive. */
function buildResourceDeposits(
  scene: Scene,
  worldContext: WorldContext,
  seed: number,
): ResourceDeposits {
  return createResourceDeposits(scene, worldContext, seed)
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
): Promise<WorldBundle> {
  const waterMirror = createWaterMirror({
    waterLevel: config.terrain.waterLevel,
    enabled: config.postProcessing.waterReflections,
  })
  const chunkManager = buildChunkManager(scene, config, collectedItemIds, removedCropIds, plantedTrees, plantedCrops, treeLifecycle, getWorldDays, waterMirror)
  chunkManager.update(0, 0)
  await chunkManager.waitForChunks(homeChunks())

  const worldContext = createWorldContext(() => chunkManager, config, dayNight)
  const forest: SettlementForestHooks = {
    lifecycle: treeLifecycle,
    getWorldDays,
    sampleEnv: worldContext.sampleTreeEnv,
  }
  const ocean = buildOcean(scene, config, waterMirror)
  const resourceDeposits = buildResourceDeposits(scene, worldContext, config.seed)
  const mining: SettlementMiningHooks = { queryNearest: resourceDeposits.queryNearest, mine: resourceDeposits.mine }
  const settlementsManager = await buildSettlementsManager(scene, chunkManager, config.seed, playAt, config, forest, worldContext, mining, initialEconomies, onAnimalDeath, getPlayerSocial, isLandPlotOwned, pointLightBudget, getNearbyPlayerWell)
  const fauna = await buildFauna(scene, chunkManager, settlementsManager.home, config.seed, config.terrain.region.coastThreshold, onAnimalDeath, initialSpawnerState)
  await preloadItemGlbModels()
  await preloadHeldToolModels()
  const itemSpawners = buildItemSpawners(scene, chunkManager, settlementsManager.home, config.seed)
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
  const placedContainers = createPlacedContainers(
    scene,
    chunkManager.sampleHeight,
    initialPlacedContainers,
    initialCarriedContainer,
  )
  const playerWells = createPlayerWells(
    scene,
    chunkManager.sampleHeight,
    chunkManager.registerColliders,
    chunkManager.clearColliders,
    initialPlayerWells,
  )
  const largeCaves = createLargeCaves(
    scene,
    chunkManager,
    config.seed,
    villageSizeConfig(settlementsManager.home.size).footprintRadius,
    config.terrain.region.coastThreshold,
  )
  const dryingRacks = createDryingRacks(
    scene,
    chunkManager.sampleHeight,
    settlementsManager.home.landmarks.stockpile,
    initialDryingRacks,
  )
  const hives = createBeehives(
    scene,
    chunkManager.sampleHeight,
    settlementsManager.home.landmarks.trees.map((t) => t.position),
    config.seed,
    initialHives,
  )

  return { chunkManager, ocean, settlementsManager, fauna, itemSpawners, resourceDeposits, droppedItems, placedFires, placedTents, placedTraps, placedContainers, playerWells, largeCaves, dryingRacks, hives }
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
  const carriedDryingRacks = resetCollectedItems ? [] : [...bundle.dryingRacks.nodes()]
  bundle.dryingRacks.dispose()
  const carriedHives = resetCollectedItems ? [] : [...bundle.hives.nodes()]
  bundle.hives.dispose()
  const carriedEconomies = resetCollectedItems ? undefined : bundle.settlementsManager.snapshotEconomies()
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

  const waterMirror = createWaterMirror({
    waterLevel: config.terrain.waterLevel,
    enabled: config.postProcessing.waterReflections,
  })
  bundle.chunkManager = buildChunkManager(scene, config, collectedItemIds, removedCropIds, plantedTrees, plantedCrops, treeLifecycle, getWorldDays, waterMirror)
  bundle.chunkManager.update(0, 0)
  await bundle.chunkManager.waitForChunks(homeChunks())

  const worldContext = createWorldContext(() => bundle.chunkManager, config, dayNight)
  const forest: SettlementForestHooks = {
    lifecycle: treeLifecycle,
    getWorldDays,
    sampleEnv: worldContext.sampleTreeEnv,
  }
  bundle.ocean = buildOcean(scene, config, waterMirror)
  bundle.resourceDeposits = buildResourceDeposits(scene, worldContext, config.seed)
  const mining: SettlementMiningHooks = {
    queryNearest: bundle.resourceDeposits.queryNearest,
    mine: bundle.resourceDeposits.mine,
  }
  bundle.settlementsManager = await buildSettlementsManager(scene, bundle.chunkManager, config.seed, playAt, config, forest, worldContext, mining, carriedEconomies, onAnimalDeath, getPlayerSocial, isLandPlotOwned, pointLightBudget, getNearbyPlayerWell)
  bundle.fauna = await buildFauna(scene, bundle.chunkManager, bundle.settlementsManager.home, config.seed, config.terrain.region.coastThreshold, onAnimalDeath, carriedSpawnerState)
  await preloadItemGlbModels()
  await preloadHeldToolModels()
  bundle.itemSpawners = buildItemSpawners(scene, bundle.chunkManager, bundle.settlementsManager.home, config.seed)
  bundle.droppedItems = createDroppedItems(scene, bundle.chunkManager.sampleHeight, carriedDrops)
  bundle.placedFires = createPlacedFires(scene, bundle.chunkManager.sampleHeight, carriedFires, playAt, pointLightBudget)
  bundle.placedTents = createPlacedTents(scene, bundle.chunkManager.sampleHeight, carriedTents)
  bundle.placedTraps = createPlacedTraps(
    scene,
    bundle.chunkManager.sampleHeight,
    config.seed,
    { onCapture: onTrapCapture, onBaitReturned: onTrapBaitReturned },
    carriedTraps,
  )
  bundle.placedContainers = createPlacedContainers(
    scene,
    bundle.chunkManager.sampleHeight,
    carriedContainerNodes,
    carriedContainerHeld,
  )
  bundle.playerWells = createPlayerWells(
    scene,
    bundle.chunkManager.sampleHeight,
    bundle.chunkManager.registerColliders,
    bundle.chunkManager.clearColliders,
    carriedPlayerWells,
  )
  bundle.largeCaves = createLargeCaves(
    scene,
    bundle.chunkManager,
    config.seed,
    villageSizeConfig(bundle.settlementsManager.home.size).footprintRadius,
    config.terrain.region.coastThreshold,
  )
  bundle.dryingRacks = createDryingRacks(
    scene,
    bundle.chunkManager.sampleHeight,
    bundle.settlementsManager.home.landmarks.stockpile,
    carriedDryingRacks,
  )
  bundle.hives = createBeehives(
    scene,
    bundle.chunkManager.sampleHeight,
    bundle.settlementsManager.home.landmarks.trees.map((t) => t.position),
    config.seed,
    carriedHives,
  )
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
  bundle.largeCaves.dispose()
  bundle.dryingRacks.dispose()
  bundle.hives.dispose()
  bundle.resourceDeposits.dispose()
  bundle.settlementsManager.dispose()
  bundle.ocean.dispose()
  bundle.chunkManager.dispose()
}
