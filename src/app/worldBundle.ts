import type { WorldConfig } from '../config/worldConfig'
import type { Settlement } from '../settlement/createSettlement'
import type { ChunkCoord } from '../terrain/chunkGrid'
import type { ResourceEnv } from '../terrain/naturalResources'
import type { SettlementForestHooks } from '../world/settlementForestHooks'
import type { TreeLifecycle } from '../world/treeLifecycle'
import { createFauna, type Fauna } from '../fauna/createFauna'
import { createDroppedItems, type DroppedItem, type DroppedItems } from '../items/createDroppedItems'
import { createItemSpawners, type ItemSpawners } from '../items/createItemSpawners'
import { createPlacedFires, type PlacedFire, type PlacedFires } from '../settlement/PlacedFires'
import { clearRoadNetworkCaches } from '../settlement/roadNetwork'
import { createSettlementsManager, type SettlementsManager } from '../settlement/SettlementsManager'
import {
  type ChunkManager,
  type ChunkManagerConfig,
  createChunkManager,
} from '../terrain/chunkManager'
import { createResourceDeposits, type ResourceDeposits } from '../terrain/resourceDeposits'
import { createOcean, type WorldOcean } from '../world/createOcean'
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

/** The eight world systems that are always created/disposed/rebuilt together
 *  (new seed, terrain-param change) — see `docs/plans/2026-08-10--053`. A
 *  single mutable container, not a `let` reassigned to a new object: every
 *  closure created before a rebuild (`ambientSamplers`/`resourceEnv` in
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
}

function buildChunkManager(
  scene: Scene,
  config: WorldConfig,
  collectedItemIds: Set<string>,
  treeLifecycle: TreeLifecycle,
  getWorldDays: () => number,
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
    grass: config.terrain.grass,
    detailNormal: config.terrain.detailNormal,
    treeLifecycle,
    getWorldDays,
  }
  return createChunkManager(scene, cfg)
}

function buildOcean(scene: Scene, config: WorldConfig): WorldOcean {
  // Generously covers the loaded region so it never runs out under the player;
  // repositioned (not resized) as the player moves — see createOcean.follow().
  const size = (config.terrain.unloadRadius * 2 + 4) * config.terrain.chunkSize
  const ocean = createOcean(size, config.terrain.waterLevel)
  ocean.addTo(scene)
  return ocean
}

function buildSettlementsManager(
  scene: Scene,
  chunkManager: ChunkManager,
  seed: number,
  playSound: (url: string, volume?: number) => void,
  config: WorldConfig,
  forest: SettlementForestHooks,
): Promise<SettlementsManager> {
  return createSettlementsManager(
    scene,
    chunkManager.sampleHeight,
    chunkManager.waterLevel,
    HOME_RADIUS,
    seed,
    playSound,
    SETTLEMENT_LOAD_RADIUS,
    SETTLEMENT_UNLOAD_RADIUS,
    {
      sampleContinentalness: chunkManager.sampleContinentalness,
      sampleMountainRidge: chunkManager.sampleMountainRidge,
      sampleMoistureRegion: chunkManager.sampleMoistureRegion,
    },
    config.terrain.heightScale,
    config.terrain.region,
    chunkManager.waitForChunks,
    config.terrain.chunkSize,
    forest,
    config.settlements.homeSize,
  )
}

function buildFauna(
  scene: Scene,
  chunkManager: ChunkManager,
  settlement: Settlement,
  seed: number,
  coastThreshold: number,
): Promise<Fauna> {
  // Spawner ring is 45–65 m from home; querySize 150 → half 75 covers the ring
  // plus road halfWidth margin for corridor rejection in createFauna.
  const roadSegments = chunkManager.roadCorridorsNear(
    settlement.center.x,
    settlement.center.z,
    150,
  )
  return createFauna(
    scene,
    chunkManager.sampleHeight,
    chunkManager.sampleForestFactor,
    chunkManager.waterLevel,
    HOME_RADIUS,
    settlement.center,
    seed,
    roadSegments,
    {
      sampleContinentalness: chunkManager.sampleContinentalness,
      coastThreshold,
    },
  )
}

function buildItemSpawners(
  scene: Scene,
  chunkManager: ChunkManager,
  settlement: Settlement,
  seed: number,
): ItemSpawners {
  return createItemSpawners(
    scene,
    chunkManager.sampleHeight,
    chunkManager.waterLevel,
    HOME_RADIUS,
    settlement.center,
    settlement.landmarks.trees.map((t) => t.position),
    seed,
    { campfire: settlement.landmarks.campfire?.position, garden: settlement.landmarks.garden },
  )
}

/** `env` is rebuilt fresh from `chunkManager` on every call rather than kept
 *  as a long-lived indirection — unlike `ambientSamplers`/`resourceEnv` used
 *  to be in `createApp.ts`, this `ResourceDeposits` instance's lifetime is
 *  already tied 1:1 to the `chunkManager` passed in (both disposed/rebuilt
 *  together by `rebuildWorldBundle`), so there's no reassignment for it to
 *  survive. */
function buildResourceDeposits(
  scene: Scene,
  chunkManager: ChunkManager,
  config: WorldConfig,
  seed: number,
): ResourceDeposits {
  const env: ResourceEnv = {
    sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
    sampleContinentalness: (x, z) => chunkManager.sampleContinentalness(x, z),
    sampleMountainRidge: (x, z) => chunkManager.sampleMountainRidge(x, z),
    sampleMoistureRegion: (x, z) => chunkManager.sampleMoistureRegion(x, z),
    get waterLevel() { return chunkManager.waterLevel },
    get heightScale() { return config.terrain.heightScale },
    get region() { return config.terrain.region },
  }
  return createResourceDeposits(scene, env, seed)
}

export async function createWorldBundle(
  scene: Scene,
  config: WorldConfig,
  collectedItemIds: Set<string>,
  playSound: (url: string, volume?: number) => void,
  initialDroppedItems: readonly DroppedItem[],
  initialPlacedFires: readonly PlacedFire[],
  treeLifecycle: TreeLifecycle,
  getWorldDays: () => number,
): Promise<WorldBundle> {
  const chunkManager = buildChunkManager(scene, config, collectedItemIds, treeLifecycle, getWorldDays)
  chunkManager.update(0, 0)
  await chunkManager.waitForChunks(homeChunks())

  const forest: SettlementForestHooks = {
    lifecycle: treeLifecycle,
    getWorldDays,
    sampleEnv: (x, z) => chunkManager.sampleTreeEnv(x, z),
  }
  const ocean = buildOcean(scene, config)
  const settlementsManager = await buildSettlementsManager(scene, chunkManager, config.seed, playSound, config, forest)
  const fauna = await buildFauna(scene, chunkManager, settlementsManager.home, config.seed, config.terrain.region.coastThreshold)
  const itemSpawners = buildItemSpawners(scene, chunkManager, settlementsManager.home, config.seed)
  const resourceDeposits = buildResourceDeposits(scene, chunkManager, config, config.seed)
  const droppedItems = createDroppedItems(scene, chunkManager.sampleHeight, initialDroppedItems)
  const placedFires = createPlacedFires(scene, chunkManager.sampleHeight, initialPlacedFires)

  return { chunkManager, ocean, settlementsManager, fauna, itemSpawners, resourceDeposits, droppedItems, placedFires }
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
  playSound: (url: string, volume?: number) => void,
  treeLifecycle: TreeLifecycle,
  getWorldDays: () => number,
): Promise<void> {
  bundle.fauna.dispose()
  bundle.itemSpawners.dispose()
  // Copy before dispose() — nodes() returns a live reference to the internal
  // array, and dispose() clears it in place.
  const carriedDrops = resetCollectedItems ? [] : [...bundle.droppedItems.nodes()]
  bundle.droppedItems.dispose()
  const carriedFires = resetCollectedItems ? [] : [...bundle.placedFires.nodes()]
  bundle.placedFires.dispose()
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

  bundle.chunkManager = buildChunkManager(scene, config, collectedItemIds, treeLifecycle, getWorldDays)
  bundle.chunkManager.update(0, 0)
  await bundle.chunkManager.waitForChunks(homeChunks())

  const forest: SettlementForestHooks = {
    lifecycle: treeLifecycle,
    getWorldDays,
    sampleEnv: (x, z) => bundle.chunkManager.sampleTreeEnv(x, z),
  }
  bundle.ocean = buildOcean(scene, config)
  bundle.settlementsManager = await buildSettlementsManager(scene, bundle.chunkManager, config.seed, playSound, config, forest)
  bundle.fauna = await buildFauna(scene, bundle.chunkManager, bundle.settlementsManager.home, config.seed, config.terrain.region.coastThreshold)
  bundle.itemSpawners = buildItemSpawners(scene, bundle.chunkManager, bundle.settlementsManager.home, config.seed)
  bundle.resourceDeposits = buildResourceDeposits(scene, bundle.chunkManager, config, config.seed)
  bundle.droppedItems = createDroppedItems(scene, bundle.chunkManager.sampleHeight, carriedDrops)
  bundle.placedFires = createPlacedFires(scene, bundle.chunkManager.sampleHeight, carriedFires)
}

export function disposeWorldBundle(bundle: WorldBundle): void {
  bundle.fauna.dispose()
  bundle.itemSpawners.dispose()
  bundle.droppedItems.dispose()
  bundle.placedFires.dispose()
  bundle.resourceDeposits.dispose()
  bundle.settlementsManager.dispose()
  bundle.ocean.dispose()
  bundle.chunkManager.dispose()
}
