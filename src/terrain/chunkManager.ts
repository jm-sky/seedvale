import * as THREE from 'three'
import type { DetailNormalConfig } from '../config/worldConfig'
import type { HeightSampler } from '../player/PlayerController'
import type { PropPlacement } from '../render/instancedProps'
import type { TreeEnvSample, TreeGrowthStage, TreeLifecycle, TreePresence } from '../world/treeLifecycle'
import type { ChunkTileResult, GrassRequestParams } from './chunkHeightmapProtocol'
import type { ChunkMeshData, ChunkMeshTileGrids } from './chunkMeshData'
import type { FbmParams } from './fbm'
import { disposeObject3D } from '../assets/loadGltf'
import { isSystemEnabled } from '../debug/debugMode'
import { createItemMesh, type ItemKind } from '../items/items'
import { getMonitor } from '../perf/active'
import { getProgramCensus } from '../perf/programCensus'
import {
  BUSH_SPECS,
  CACTUS_SPECS,
  CEMETERY_SPECS,
  type CemeterySize,
  createBush,
  createCactus,
  createCampfire,
  createCemetery,
  createCemeteryPlot,
  createFallenLog,
  createFern,
  createGraveStone,
  createLargeRock,
  createLilyPad,
  createMonolith,
  createReed,
  createRockCluster,
  createSmallRuins,
  createStoneCircle,
  createTree,
  FALLEN_LOG_SPECS,
  FERN_SPECS,
  GRAVE_SPECS,
  LILY_SPECS,
  loadPropTemplates,
  placeOnGround,
  preloadCampfireTemplates,
  REED_SPECS,
  ROCK_CLUSTER_SPECS,
  ROCK_SPECS,
  TREE_SPECS,
} from '../settlement/props'
import { type RoadNetworkContext, segmentsNear, villageSegmentsNear } from '../settlement/roadNetwork'
import { type Collider, createColliderRegistry } from '../world/collision'
import { createChunkRiver, type WorldRiver } from '../world/createRiverWater'
import { createChunkWater, type WorldWater } from '../world/createWater'
import {
  CROP_DEFS,
  type CropGrowthStage,
  type CropId,
  type CropPlacement,
  resolveCropHarvest,
  resolveCropStage,
} from '../world/cropLifecycle'
import { createCropStageMesh } from '../world/cropVisuals'
import { makePlantedCropId } from '../world/plantedCrops'
import { makePlantedTreeId, pickPlantedTreeSpecies, type PlantedTreeRecord } from '../world/plantedTrees'
import { coastalFactor, rollSizeClass, type TreeSizeClass } from '../world/treeLifecycle'
import { createTreeStageMesh, preloadTreeStumpTemplate, tagTreeMesh } from '../world/treeVisuals'
import { assignRenderLayer, REFLECTION_DISTANT_LAYER, REFLECTION_SKIPPED_LAYER, type WaterMirror } from '../world/waterMirror'
import { biomeWeightsAt, type ForestBiome, forestBiomeAt, forestDensityAt } from './biomeRegions'
import { buildChunkGeometry, createTerrainMaterial } from './buildChunkGeometry'
import { computeChunkEnvironment, type EnvironmentKind, type LandmarkKind } from './chunkEnvironment'
import {
  chebyshevDistance,
  chunkCenter,
  type ChunkCoord,
  chunkKey,
  worldToChunk,
} from './chunkGrid'
import {
  apronOriginWorld,
  type ChunkTileParams,
  computeChunkTile,
  extractCoreGrid,
  type RawSampleParams,
  type RegionParams,
  type RiverChannelSegment,
  type RoadCorridorSegment,
  sampleApronGrid,
  sampleBiomeAt,
  sampleContinentalnessAt,
  sampleFloorAt,
  sampleHeightAt,
  sampleMoistureRegionAt,
  sampleMountainRidgeAt,
} from './chunkHeightmap'
import { createChunkMeshDataCache } from './chunkMeshCache'
import {
  cancelChunkGrass,
  cancelChunkMesh,
  cancelChunkTile,
  HeightmapGenerationCancelledError,
  requestChunkGrass,
  requestChunkMesh,
  requestChunkTile,
} from './chunkWorkerPool'
import { densityLodFraction, grassFillerLodFraction, grassGeometryLodTier } from './distanceLod'
import { createGrassSystem, type WorldGrassChunk } from './grass'
import {
  nearestRiverBankDistance,
  nearestRiverBankPoint,
  overlappingRiverTiles,
  type RiverChain,
  riverChannelSegmentsNear,
  type RiverTileCoord,
} from './riverNetwork'
import { createRiverTileCache } from './riverTileCache'
import { createVegetationRegionBatcher } from './vegetationRegionBatcher'
import { type LocalWaterSample, sampleLocalWater as sampleLocalWaterPure } from './waterSample'

// Loaded once and reused across every chunk (GLTF loader also caches by URL, but
// this avoids rebuilding the template array + re-running `prepareProp` per chunk).
// `peek()` is sync so chunk content finalization never `await`s a shared GLB
// promise (plan 119 — that await was the vegetation stampede).
type TemplateCache = {
  start: () => Promise<THREE.Object3D[]>
  peek: () => THREE.Object3D[] | null
}

function memoTemplates(
  specs: Parameters<typeof loadPropTemplates>[0],
  fallback: () => THREE.Object3D,
  fit?: Parameters<typeof loadPropTemplates>[2],
): TemplateCache {
  let promise: Promise<THREE.Object3D[]> | null = null
  let value: THREE.Object3D[] | null = null
  return {
    start() {
      promise ??= loadPropTemplates(specs, fallback, fit).then(
        (templates) => {
          value = templates
          return templates
        },
        (err: unknown) => {
          console.error('[chunkManager] prop template load failed', err)
          value = []
          return value
        },
      )
      return promise
    },
    peek: () => value,
  }
}
const getTreeTemplates = memoTemplates(TREE_SPECS, () => createTree(1))
const getBushTemplates = memoTemplates(BUSH_SPECS, () => createBush(1))
const getCactusTemplates = memoTemplates(CACTUS_SPECS, () => createCactus(1))
const getReedTemplates = memoTemplates(REED_SPECS, () => createReed(1))
const getFernTemplates = memoTemplates(FERN_SPECS, () => createFern(1))
const getLilyTemplates = memoTemplates(LILY_SPECS, () => createLilyPad(1), 'max')
const getRockTemplates = memoTemplates(ROCK_SPECS, () => createLargeRock(1))
const getRockClusterTemplates = memoTemplates(ROCK_CLUSTER_SPECS, () => createRockCluster(1))
const getFallenLogTemplates = memoTemplates(FALLEN_LOG_SPECS, () => createFallenLog(1))
const getCemeteryTemplates = memoTemplates(CEMETERY_SPECS, () => createCemeteryPlot(1))
const getGraveTemplates = memoTemplates(GRAVE_SPECS, () => createGraveStone(1))

function preloadPropTemplates(): void {
  void getTreeTemplates.start()
  void getBushTemplates.start()
  void getCactusTemplates.start()
  void getReedTemplates.start()
  void getFernTemplates.start()
  void getLilyTemplates.start()
  void getRockTemplates.start()
  void getRockClusterTemplates.start()
  void getFallenLogTemplates.start()
  void getCemeteryTemplates.start()
  void getGraveTemplates.start()
  void preloadCampfireTemplates()
  preloadTreeStumpTemplate()
}

const GLB_ENV_KINDS = new Set<EnvironmentKind>(['fallenLog', 'largeRock', 'rockCluster'])

/** Base collision radius (world meters, before `* placement.scale`) per
 *  environment kind — plan 097 §2.2. `stoneCircle`/`smallRuins`/`cemetery`
 *  are left at 0 (no collider): walkable interiors / grave rows that a
 *  single circle would misrepresent. */
const ENVIRONMENT_COLLISION_RADIUS: Record<EnvironmentKind, number> = {
  largeRock: 0.9,
  rockCluster: 0.5,
  fallenLog: 0.4,
  campfire: 0.5,
  monolith: 0.4,
  stoneCircle: 0,
  smallRuins: 0,
  cemetery: 0,
}

/** Flat trunk collision radius for every tree — `VegetationPlacement.scale`
 *  is documented "unused" for trees (size varies via `sizeJitter`/lifecycle
 *  stage instead), so v1 doesn't attempt to scale this per placement. */
const TREE_COLLISION_RADIUS = 0.4

/** Box side (world units) `riverShoreDistance` asks `riverChannelSegmentsNear`
 *  to search around a query point — comfortably past `GAZE_RANGE`/max river
 *  half-width + bank reach, so a segment whose channel actually passes
 *  through the query point is never missed just for sitting slightly outside
 *  a too-tight box. */
const RIVER_SHORE_QUERY_SIZE = 32

/** Chunk-coord offsets in expanding Chebyshev rings out to `maxRadius`,
 *  center first — the deterministic search order `findLandmarkNear` walks
 *  so it always returns the same landmark for the same `(kind, center)` and
 *  stops at the first hit instead of scanning a whole radius up front
 *  (plan 132). Pure/small enough to recompute per call rather than cache. */
export function ringChunkOffsets(maxRadius: number): { dx: number, dz: number }[] {
  const offsets: { dx: number, dz: number }[] = [{ dx: 0, dz: 0 }]
  for (let r = 1; r <= maxRadius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        offsets.push({ dx, dz })
      }
    }
  }
  return offsets
}

/** Decorative prop for landmark kinds that stay individual Object3Ds.
 *  Campfire uses a preloaded GLB (`preloadCampfireTemplates`) with this
 *  procedural fallback. Rocks and fallen logs use instanced GLB templates. */
function createProceduralEnvironmentProp(
  kind: EnvironmentKind,
  scale: number,
  variant: number,
): THREE.Object3D {
  switch (kind) {
    case 'campfire':
      return createCampfire(scale)
    case 'cemetery':
      return createCemetery(scale, variant)
    case 'fallenLog':
      return createFallenLog(scale, variant)
    case 'largeRock':
      return createLargeRock(scale, variant)
    case 'monolith':
      return createMonolith(scale, variant)
    case 'rockCluster':
      return createRockCluster(scale, variant)
    case 'smallRuins':
      return createSmallRuins(scale, variant)
    case 'stoneCircle':
      return createStoneCircle(scale, variant)
  }
}

export type ChunkManagerConfig = {
  chunkSize: number
  /** Core texels per chunk edge. */
  resolution: number
  /** Chunks (Chebyshev distance) kept loaded around the player. */
  loadRadius: number
  /** Must be > loadRadius — the hysteresis ring that avoids load/unload thrashing. */
  unloadRadius: number
  /** Pinned chunks (e.g. the settlement footprint) — loaded once, never unloaded. */
  homeChunks: ChunkCoord[]
  seed: number
  heightScale: number
  waterLevel: number
  noiseScale: number
  detailAmplitude: number
  hillsScale: number
  hillsAmplitude: number
  hillsFbm: FbmParams
  fbm: FbmParams
  biome: { noiseScale: number; fbm: FbmParams }
  region: RegionParams
  /** `findSettlementSite`'s local flat-site search radius (`HOME_RADIUS` in
   *  `createApp.ts`) — needed here only to resolve `SettlementDef`s for road
   *  segments near a chunk (`roadNetwork.ts`), same value `SettlementsManager`
   *  uses so both sides resolve identical settlement sites. */
  settlementSearchRadius: number
  flatShading: boolean
  /** Ids of world-generated items (`terrain/chunkItems.ts`) already collected —
   *  shared/mutated in place so a chunk regenerated after unload/reload skips
   *  placements the player already picked up. Reset only on a genuinely new
   *  world (new seed), not on unrelated terrain-param rebuilds. */
  collectedItemIds: Set<string>
  /** Ids of naturally-generated crops (`terrain/chunkCrops.ts`) already
   *  harvested/removed (plan 172) — same "shared/mutated in place, survives
   *  chunk unload/reload" contract as `collectedItemIds`, kept as a separate
   *  set since a harvested crop is a removal, not a collected pickup. */
  removedCropIds: Set<string>
  /** Player-planted trees (plan 126) — persistent world mutations distinct
   *  from procedural generation; merged into each owning chunk's tree loop
   *  alongside `tile.vegetation`'s trees whenever that chunk (re)loads.
   *  Mutated in place by `plantTree()` — same "caller-owned `Set`/array
   *  passed by reference" convention as `collectedItemIds`/`removedCropIds`. */
  plantedTrees: PlantedTreeRecord[]
  /** Player-planted crops (plan 126) — same relationship to `tile.crops` as
   *  `plantedTrees` has to `tile.vegetation`. A harvested planted crop is
   *  simply removed from this array (unlike a procedural crop, which needs
   *  `removedCropIds` to stop its deterministic generator from recreating it). */
  plantedCrops: CropPlacement[]
  /** Runtime terrain-deformation records (dig/scorch/prepare) — same
   *  "caller-owned array, mutated in place, survives chunk unload/reload"
   *  convention as `plantedTrees`/`plantedCrops` above. Owning it here
   *  (rather than as `createChunkManager`'s own closure-local state) is what
   *  lets `createApp.ts` read it back for `SaveData.terrainModifications`
   *  and carries it across an in-session `rebuildWorldBundle` for free — the
   *  same array reference is simply threaded through again. Reset to `[]`
   *  only on a genuinely new world (new seed), not on unrelated terrain-param
   *  rebuilds — same reset contract as `plantedTrees`. */
  modifications: TerrainModification[]
  grass: {
    enabled: boolean
    /** Chunks (Chebyshev distance) that get grass — deliberately smaller than
     *  `loadRadius`; grass hides one ring earlier than that (`radius + 1`) so it
     *  doesn't pop in/out right at the terrain load boundary. */
    radius: number
    /** Raw position candidates rolled per chunk before eligibility/density
     *  rejection — the GUI "density" knob. */
    density: number
  }
  /** Close-up surface grain on the chunk material (`buildChunkGeometry.ts`). */
  detailNormal: DetailNormalConfig
  /** Terrain self-shadows — cheap live toggle (`setTerrainCastsShadow`), not
   *  a rebuild-driven field like the rest of this config despite living here
   *  (perf review A2/#13). */
  terrainCastsShadow: boolean
  /** Living-forest lifecycle (plan 058) — sparse overrides + canopy queries. */
  treeLifecycle: TreeLifecycle
  /** Absolute game-days (`DayNightState.elapsedDays`) for lazy growth resolve. */
  getWorldDays: () => number
  /** Shared planar water mirror — bound onto every chunk-water material. */
  waterMirror: WaterMirror
  /** Quality-profile multiplier on grass/vegetation LOD (plan 103). Live. */
  lodScale: number
  /** Quality-profile grass filler-coverage knob (plan world-terrain-005,
   *  0..1). Live — see `ChunkManager.setGrassFillerCoverage`. */
  grassFillerCoverage: number
}

type ChunkState = 'generating' | 'ready'
/** Mesh attach vs vegetation/env/items. Same `finalizeQueue`; mesh wins when both wait. */
export type FinalizeStage = 'mesh' | 'content'
type ChunkRecord = {
  coord: ChunkCoord
  key: string
  state: ChunkState
  pinned: boolean
  tile?: ChunkTileResult
  mesh?: THREE.Mesh
  meshDispose?: () => void
  /** Bumped by every `buildAndAttachMesh` call for this record — lets a call
   *  whose worker/cache round-trip resolves late detect it's been superseded
   *  by a newer one (rapid consecutive digs) and skip attaching stale
   *  geometry (plan world-terrain-004). */
  meshRequestSeq?: number
  water?: WorldWater | null
  river?: WorldRiver | null
  /** River tiles this chunk retained in `riverTileCache` — released in `unload`.
   *  Empty/undefined for the common case of a chunk with no nearby river. */
  riverTiles?: RiverTileCoord[]
  /** Chains from `riverTiles`, resolved once in `ensureLoaded` (before the
   *  tile is requested, so river channel carving can feed into terrain
   *  generation — plan 189) and reused by `attachChunkMesh` for the water
   *  ribbon, instead of retaining `riverTiles` a second time. */
  riverChains?: RiverChain[]
  /** Non-living tree stage meshes (limbed/felled/stump) — few and mutated
   *  individually, so never instanced (plan 087 §2.3/§2.5). Also receives
   *  whatever `refreshTreeVisual` swaps a tree into afterward, including a
   *  regrown sapling: once a tree needs a runtime refresh it stays a plain
   *  `Object3D` here rather than re-joining the region's `tree-living`
   *  instances (`vegetationRegionBatcher.ts`, plan 143). */
  vegetationExtras?: THREE.Group
  /** `treeId` -> placement yaw — the one piece of tree identity `TreePresence`
   *  doesn't carry (see `TreeLifecycle.getPresence`), needed by
   *  `refreshTreeVisual` to re-place a tree it no longer has a mesh for. */
  treeYaw?: Map<string, number>
  items?: THREE.Group
  /** Naturally-generated crop meshes (plan 172) — same per-placement `Object3D`
   *  group as `items`, not instanced (crop density per chunk is small, same
   *  order of magnitude as flora pickups). */
  crops?: THREE.Group
  /** Procedural-only landmark kinds (campfire/monolith/stoneCircle/smallRuins/
   *  cemetery) — geometry is built per placement, not from a shared template, so these
   *  stay unbatched (plan 087 §2.5). Cemetery clones GLB graves into one Group. */
  environment?: THREE.Group
  /** TreeIds registered into `treeLifecycle` for this chunk — cleared on unload. */
  treeIds?: string[]
  /** `undefined` = not yet decided (chunk not ready or outside grass radius);
   *  `null` = decided ineligible (no blades survived rejection, e.g. all rock/sand). */
  grass?: WorldGrassChunk | null
  /** A `requestChunkGrass` request is in flight for this chunk (plan 086) —
   *  `grass` stays `undefined` until it resolves. */
  grassPending?: boolean
  pendingPromise?: Promise<void>
  /** Set while this chunk is waiting for a per-frame finalize slot (plan 112/119).
   *  `mesh` = `buildAndAttachMesh`; `content` = vegetation/env/items after terrain
   *  is already `ready`. Resolved when both stages finish, or by `unload`. */
  finalizeStage?: FinalizeStage
  finalizeWaiter?: { resolve: () => void, reject: (err: unknown) => void }
}

export type ChunkManager = {
  /** Cheap to call every frame — internally throttled to a recheck distance. */
  update: (playerX: number, playerZ: number) => void
  tickWater: (dt: number) => void
  setWaterDayNight: (dayFactor: number, sunDirection: THREE.Vector3) => void
  setWaterReflections: (enabled: boolean) => void
  tickGrass: (dt: number) => void
  setGrassDayNight: (dayFactor: number, sunDirection: THREE.Vector3) => void
  /** Updates the shared terrain material's weather-surface uniforms in
   *  place (plan 133) — a couple of `.value` writes, not a per-chunk update;
   *  every loaded (and later-loaded) chunk shares this one material. */
  setWeatherSurface: (wetness: number, snowAmount: number) => void
  sampleHeight: HeightSampler
  sampleFloor: HeightSampler
  sampleBiome: (x: number, z: number) => number
  sampleContinentalness: (x: number, z: number) => number
  sampleMountainRidge: (x: number, z: number) => number
  sampleMoistureRegion: (x: number, z: number) => number
  /** Signed distance from `(worldX, worldZ)` to the nearest loaded river's own
   *  bank edge (`riverNetwork.ts`'s `nearestRiverBankDistance`, fed by each
   *  loaded chunk's already-cached `riverChains` — no separate river query
   *  system) — negative inside the channel, `null` when no river tile is
   *  loaded nearby. Used by `app/interactables.ts`'s shoreline resolver so
   *  drinking/fishing work at a river the same way they already do at a lake
   *  (plan `ui-input-006`). */
  riverShoreDistance: (worldX: number, worldZ: number) => number | null
  /** The actual point on the nearest loaded river's bank edge closest to
   *  `(worldX, worldZ)` (`riverNetwork.ts`'s `nearestRiverBankPoint`) — same
   *  segment search as `riverShoreDistance`, for callers that need a real
   *  interaction position rather than a proximity distance
   *  (`app/interactables.ts`'s `waterEdge` candidate, plan `ui-input-006`
   *  ocean/river fishing fix). `null` when no river tile is loaded nearby. */
  riverShorePoint: (worldX: number, worldZ: number) => { x: number, z: number } | null
  /** Cheap, hot-path-safe physical water sample at `(worldX, worldZ)` (plan
   *  fauna-015) — lake/ocean depth from `floorHeights` vs `waterLevel`, or a
   *  loaded river's own canonical water/bed geometry when the point sits
   *  inside that river's channel. Bounded to the point's own owning chunk's
   *  cached river chains (one map lookup, no `riverShoreDistance`-style scan
   *  over every loaded chunk) — safe to call every tick from fauna's
   *  movement path, unlike `riverShoreDistance`/`riverShorePoint` above. */
  sampleLocalWater: (worldX: number, worldZ: number) => LocalWaterSample
  /** 0 (open / poor forest habitat) – 1 (dense forest) continuous suitability
   *  at (x, z) via `forestDensityAt` (`biomeRegions.ts`) — same signal
   *  `chunkVegetation.ts` uses for tree-density modulation. Runtime bridge
   *  for fauna (`createFauna.ts`) and other habitat consumers (plan 063). */
  sampleForestFactor: (x: number, z: number) => number
  /** Discrete `open`/`forest`/`deepForest` classification (plan 182) of the
   *  same `sampleForestFactor` reading via `forestBiomeAt` — the one shared
   *  source of truth for "is this Deep Forest" world queries (quests, etc.),
   *  instead of every consumer re-deriving thresholds from the raw density. */
  sampleForestBiome: (x: number, z: number) => ForestBiome
  /** World-generated pickup items (`terrain/chunkItems.ts`) within `radius` of
   *  `pos` among currently loaded chunks — sufficient given `radius` is only
   *  ever the small interact range, and the player's own chunk is always loaded. */
  getNearbyItems: (
    pos: { x: number, z: number },
    radius: number,
  ) => { id: string, kind: ItemKind, x: number, z: number }[]
  /** Removes a world-generated item's mesh (if its chunk is loaded) and records
   *  its id as collected so it won't reappear on chunk reload. Null if `id`
   *  isn't currently instantiated. */
  collectItem: (id: string) => { kind: ItemKind, x: number, z: number } | null
  /** Naturally-generated crops (`terrain/chunkCrops.ts`) within `radius` of
   *  `pos` among currently loaded chunks (plan 172) — same "loaded chunks
   *  only" contract as `getNearbyItems`, with lifecycle stage already
   *  resolved for the current world day. */
  getNearbyCrops: (
    pos: { x: number, z: number },
    radius: number,
  ) => { id: string, cropId: CropId, x: number, z: number, stage: CropGrowthStage }[]
  /** Resolves `id`'s current stage and, if harvestable, removes its mesh and
   *  records it as removed so it won't reappear on chunk reload. A `'no-yield'`
   *  outcome (e.g. `young`, or `spoiled` with no `spoiledItem`) leaves the
   *  crop in place — the player can come back once it matures. */
  harvestCrop: (id: string) => CropHarvestOutcome
  /** Plants a new tree at `(x, z)` (plan 126) — species chosen from local
   *  habitat suitability, starts at `sapling` anchored at the current world
   *  day. Registers into `treeLifecycle` and `config.plantedTrees`, and
   *  renders it immediately into the owning chunk (which must already be
   *  loaded — the player planting it is standing right there). Returns the
   *  new tree's id, or `null` if `(x, z)`'s chunk isn't currently loaded. */
  plantTree: (x: number, z: number, rotationY: number) => { id: string } | null
  /** Plants a new crop at `(x, z)` (plan 126) — starts at `young`, anchored
   *  at the current world day, using the same lazy `resolveCropStage`
   *  wild crops use (plan 172). Registers into `config.plantedCrops` and
   *  renders it immediately, same "chunk must already be loaded" contract as
   *  `plantTree`. Returns the new crop's id, or `null` if not loaded. */
  plantCrop: (x: number, z: number, cropId: CropId) => { id: string } | null
  /** Procedural landmarks (`monolith`/`stoneCircle`/`smallRuins`/`cemetery`)
   *  within `radius` of `pos` among currently loaded chunks — same "loaded
   *  chunks only" contract as `getNearbyItems` (plan 132), used for `[E]`
   *  interaction targeting. `rotationY`/`scale`/`cemeterySize` (plan world-007)
   *  are the same placement fields `EnvironmentPlacement` already carries —
   *  surfaced so `world/hiddenFinds.ts` can derive per-landmark Hidden Find
   *  dig-spot positions (e.g. the cemetery grave grid) without a second
   *  landmark query. */
  getNearbyLandmarks: (
    pos: { x: number, z: number },
    radius: number,
  ) => { id: string, kind: LandmarkKind, x: number, z: number, rotationY: number, scale: number, cemeterySize?: CemeterySize }[]
  /** Deterministically finds the nearest existing `kind` landmark to
   *  `(worldX, worldZ)`, searching chunks in expanding rings up to
   *  `maxChunkRadius` and stopping at the first hit (plan 132) — a bounded,
   *  one-off resolver for binding a landmark quest to a real placement, not a
   *  per-frame query. Prefers already-loaded chunks' cached tiles; falls back
   *  to synchronously recomputing a candidate chunk's tile + environment
   *  (same pure pipeline the worker pool uses) so it also works for chunks
   *  outside the streaming radius. `undefined` if nothing matches within the
   *  search bound. */
  findLandmarkNear: (
    kind: LandmarkKind,
    worldX: number,
    worldZ: number,
    maxChunkRadius: number,
  ) => { id: string, x: number, z: number } | undefined
  /** Runtime terrain-deformation layer (plan 052 — shovel digging), additive
   *  on top of the generated height field: a soft radial depression,
   *  `-depth` at the center falling off to 0 at `radius`. Not the seed-derived
   *  procedural terrain itself (`chunkHeightmap.ts`'s analytic samplers are
   *  untouched) — a loaded chunk's cached tile is mutated in place, so
   *  `sampleHeight`/the rendered mesh see it immediately and consistently;
   *  reapplied to any chunk that (re)generates later, so walking away and
   *  back doesn't lose a dig. Returns `false` if no loaded chunk was affected
   *  (in practice this shouldn't happen — the dig site is wherever the player
   *  is currently standing near, always loaded).
   *
   *  `source` (plan `world-terrain-save`) — `'player'` entries are persisted
   *  (`SaveData.terrainModifications`, via `ChunkManagerConfig.modifications`
   *  being the same caller-owned array `saveState.ts` reads back); `'system'`
   *  entries (deterministic world-gen effects like cave carving) never are,
   *  since they're already reproduced from scratch on every world build —
   *  persisting and replaying them too would double-apply their cumulative
   *  depth. Every call site must declare which it is; there is no default. */
  modifyTerrain: (x: number, z: number, radius: number, depth: number, source: 'player' | 'system') => boolean
  /** Burned-ground overlay (plan 137) — shallow dip + `roadTint` bump so grass
   *  thins, plus charcoal vertex tint on the next mesh rebuild. Same runtime
   *  modification list as `modifyTerrain` (reapplied on chunk reload, same
   *  `source` persistence contract). Also rebuilds grass on touched chunks so
   *  blades don't linger in the scorch. */
  scorchTerrain: (x: number, z: number, radius: number, depth: number, source: 'player' | 'system') => boolean
  /** Sets an explicit list of exact, grid-aligned sample heights (plan
   *  `world-terrain-002`) — used by `Wyrównaj`'s 3×3 leveling (a stable,
   *  location-derived `id`, replaced in place on repeat presses at the same
   *  spot rather than accumulating) and by active terrain-preparation work
   *  (the *same* `id` every progress tick, same replace-in-place). Reapplied
   *  to any chunk that (re)generates later, same "walking away and back
   *  doesn't lose it" contract as `modifyTerrain`. Always `source: 'player'`
   *  — every caller is player-driven, so this needs no explicit parameter.
   *  Returns false
   *  if no loaded chunk was affected. */
  applyExactHeights: (id: string, samples: readonly { x: number, z: number, height: number }[]) => boolean
  /** Seed-derived analytic height at `(x, z)` — ignores runtime dig/level mods. */
  sampleBaseHeight: HeightSampler
  /** Environment inputs for tree growth at a world point. */
  sampleTreeEnv: (x: number, z: number) => TreeEnvSample
  /** Rebuild a single streamed tree mesh after harvest / stage change. */
  refreshTreeVisual: (treeId: string) => boolean
  /** Loaded/registered trees near a point (settlement + streamed; plan 057). */
  getNearbyTrees: (
    pos: { x: number, z: number },
    radius: number,
  ) => readonly (TreePresence & { stage: TreeGrowthStage })[]
  /** World seed — shared with shore/dig helpers (`sandBandAt`). */
  seed: number
  /** Terrain-grid step inputs (plan `world-terrain-002`) — lets a caller
   *  resolve exact sample-grid points/footprints (`terrain/terrainPreparation.ts`)
   *  without reaching into `ChunkManagerConfig` internals. */
  chunkSize: number
  resolution: number
  waterLevel: number
  /** Ocean/coast continentalness thresholds — lets a caller distinguish an
   *  inland lake shoreline from the ocean shore via `oceanMixAt`
   *  (`terrain/waterBodies.ts`), e.g. `app/interactables.ts`'s lake drink/fill
   *  prompt (plan 106). */
  region: RegionParams
  loadedChunkCount: () => number
  /** Resolves once every listed chunk has finished generating (or failed/cancelled),
   *  including mesh and content (vegetation/env) finalization. */
  waitForChunks: (coords: ChunkCoord[]) => Promise<void>
  /** Road/path corridors near a world point — same merge as `paramsFor`
   *  (`segmentsNear` + village house↔core paths). Used by fauna spawners to
   *  avoid placing on roads without needing a loaded chunk's `roadTint`. */
  roadCorridorsNear: (worldX: number, worldZ: number, querySize: number) => RoadCorridorSegment[]
  /** Live toggle, no rebuild — flips `castShadow` on every currently-loaded
   *  chunk mesh and on every chunk built afterward (perf review A2/#13). */
  setTerrainCastsShadow: (value: boolean) => void
  /** Live quality-profile LOD scale (plan 103). Re-applies grass/vegetation
   *  `setLodFraction` on already-loaded chunks. */
  setLodScale: (scale: number) => void
  /** Live quality knob (plan world-terrain-005, 0..1) — how far the cheap
   *  grass filler bucket reaches across the grass ring. Re-applies
   *  `setLodFraction` on already-loaded chunks; no rebuild (filler instances
   *  already exist for every grass chunk, only their draw fraction changes). */
  setGrassFillerCoverage: (coverage: number) => void
  /** Dev-only toggle (default visible) — hides/shows the detailed species
   *  buckets (`tri`/`grain`/`herb`) independently of the filler bucket, so the
   *  two can be isolated in the debug GUI. Session-local, not persisted. */
  setDetailedGrassDebugVisible: (visible: boolean) => void
  /** Dev-only toggle (default visible) — hides/shows the filler bucket
   *  independently of the detailed species buckets. Session-local, not
   *  persisted. */
  setFillerGrassDebugVisible: (visible: boolean) => void
  /** Collision colliders (plan 097 §2.2) near (x, z) — terrain-chunk
   *  environment/vegetation plus anything registered via `registerColliders`
   *  (settlements, the well). Feed straight into `world/collision.ts`'s
   *  `resolvePosition`. */
  collidersNear: (x: number, z: number) => readonly Collider[]
  /** Registers colliders that aren't tied to a terrain chunk's own
   *  load/unload (settlement buildings, the well) under `ownerKey` — call
   *  again with the same key to replace, `clearColliders` to remove. */
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void
  clearColliders: (ownerKey: string) => void
  dispose: () => void
}

export type TerrainModification = {
  x: number
  z: number
  radius: number
  depth: number
  /** `'dig'` lowers (also used for "Zrób górkę" mounding, via a negative
   *  `depth`); `'scorch'` is a shallow dip plus a `roadTint` / charcoal-color
   *  burn patch (plan 137); `'prepare'` sets an explicit list of exact
   *  grid-sample heights (plan `world-terrain-002`) instead of a radial
   *  falloff — used by `Wyrównaj`'s 3×3 exact leveling and by active
   *  terrain-preparation work. `x`/`z`/`radius`/`depth` are unused for
   *  `'prepare'`. */
  mode: 'dig' | 'scorch' | 'prepare'
  /** `mode: 'prepare'` only — identifies this modification so a later call
   *  with the same `id` replaces it in place (terrain-preparation work writes
   *  progressively, every tick, and `Wyrównaj` reuses a location-derived id
   *  on repeat presses) instead of appending a growing list. */
  id?: string
  /** `mode: 'prepare'` only — exact world-space, grid-aligned sample heights
   *  to write. Each `{x,z}` must already sit on the terrain's own sample grid
   *  (`apronOriginWorld`'s step) — this mode does not interpolate/snap. */
  samples?: readonly { x: number, z: number, height: number }[]
  /** `'player'` entries are persisted (`SaveData.terrainModifications`);
   *  `'system'` entries (deterministic world-gen effects — cave carving,
   *  fauna spawn-point burn replay) never are, since they're already
   *  reproduced from scratch on every world build. Optional only so pure
   *  `applyModificationToTile` unit tests don't need to care — every real
   *  producer (`modifyTerrain`/`scorchTerrain`/`applyExactHeights`) always
   *  sets it. */
  source?: 'player' | 'system'
}

/** Writes one modification's radial falloff directly into `tile.heights`
 *  (the apron-inclusive grid `buildChunkGeometry`/`sampleHeight` both read) —
 *  in-place, texel by texel, only over the modification's bounding box, not
 *  the whole grid. Independently correct for every chunk whose apron
 *  overlaps the modification (including a neighbor across a chunk boundary):
 *  each chunk computes the very same world-space delta at the same world
 *  position, so shared edge texels end up with the same value on both sides
 *  — the seam this apron trick already exists to avoid stays intact. Returns
 *  whether it touched any texel (false = this chunk's grid doesn't overlap
 *  the modification at all). Exported for `chunkManager.test.ts` — pure grid
 *  math, no scene/worker dependency, unlike the rest of this module. */
export function applyModificationToTile(
  tile: ChunkTileResult,
  coord: ChunkCoord,
  chunkSize: number,
  resolution: number,
  mod: TerrainModification,
): boolean {
  const o = apronOriginWorld(coord.cx, coord.cz, chunkSize, resolution)

  if (mod.mode === 'prepare') {
    let touchedPrepare = false
    for (const sample of mod.samples ?? []) {
      const ix = Math.round((sample.x - o.x) / o.step)
      const iz = Math.round((sample.z - o.z) / o.step)
      if (ix < 0 || ix >= o.apronRes || iz < 0 || iz >= o.apronRes) continue
      // The sample must actually land on this chunk's grid, not just round
      // into bounds — a chunk's own step/origin are identical everywhere
      // (`apronOriginWorld`'s shared global phase), so a genuine grid-aligned
      // sample always matches within float tolerance.
      if (Math.abs(o.x + ix * o.step - sample.x) > o.step * 1e-3) continue
      if (Math.abs(o.z + iz * o.step - sample.z) > o.step * 1e-3) continue
      const idx = iz * o.apronRes + ix
      tile.heights[idx] = sample.height
      // Visual mesh Y reads `floorHeights`, a separate field from the
      // collision/query `heights` (issue 039) — write the same absolute
      // height there too, or the rendered terrain never visibly flattens
      // even though `sampleHeight`/progress tracking are already correct.
      if (tile.floorHeights) tile.floorHeights[idx] = sample.height
      // Worked/leveled ground doesn't keep its grass — same road-corridor
      // grass-reject `tile.roadTint` scorch already bumps, but to a flat
      // full exclusion (an exact sample, not a radial falloff).
      if (tile.roadTint) tile.roadTint[idx] = 1
      touchedPrepare = true
    }
    return touchedPrepare
  }

  const minIx = Math.max(0, Math.floor((mod.x - mod.radius - o.x) / o.step))
  const maxIx = Math.min(o.apronRes - 1, Math.ceil((mod.x + mod.radius - o.x) / o.step))
  const minIz = Math.max(0, Math.floor((mod.z - mod.radius - o.z) / o.step))
  const maxIz = Math.min(o.apronRes - 1, Math.ceil((mod.z + mod.radius - o.z) / o.step))
  if (minIx > maxIx || minIz > maxIz) return false

  let touched = false
  for (let iz = minIz; iz <= maxIz; iz++) {
    for (let ix = minIx; ix <= maxIx; ix++) {
      const wx = o.x + ix * o.step
      const wz = o.z + iz * o.step
      const dist = Math.hypot(wx - mod.x, wz - mod.z)
      if (dist >= mod.radius) continue
      const falloff = 1 - THREE.MathUtils.smoothstep(dist, 0, mod.radius)
      const idx = iz * o.apronRes + ix
      const prev = tile.heights[idx]!
      tile.heights[idx] = prev - mod.depth * falloff
      // Visual mesh Y reads `floorHeights`, a separate field from the
      // collision/query `heights` above (issue 039) — every radial mode
      // (`dig`, `scorch`) needs the same delta there, not just `scorch`,
      // or an ordinary dig/mound never visibly shows.
      if (tile.floorHeights) {
        tile.floorHeights[idx] = tile.floorHeights[idx]! - mod.depth * falloff
      }
      if (mod.mode === 'scorch' || mod.mode === 'dig') {
        // Reuse the road-corridor grass fade (`ROAD_TINT_FADE_*`) so
        // scorched/dug/mounded ground thins blades without a second
        // grass-reject path.
        if (tile.roadTint) {
          tile.roadTint[idx] = Math.max(tile.roadTint[idx]!, falloff)
        }
      }
      touched = true
    }
  }
  return touched
}

/** Nearest still-valid key in a finalize/load-style queue. `distanceOf`
 *  returning `null` skips that key (stale / already gone). Equal distances
 *  keep queue order so same-ring chunks don't starve. Exported for tests. */
export function pickNearestQueuedKey(
  keys: readonly string[],
  distanceOf: (key: string) => number | null,
): string | undefined {
  let best: string | undefined
  let bestDist = Infinity
  for (const key of keys) {
    const dist = distanceOf(key)
    if (dist === null || dist >= bestDist) continue
    bestDist = dist
    best = key
  }
  return best
}

/** One finalize slot: nearest `mesh` always beats `content`. Content whose
 *  templates are not ready is skipped (stays in the queue) so it cannot starve
 *  terrain. Exported for tests — pure pick, no Three/worker. */
export function pickNextFinalizeKey(
  jobs: readonly { key: string, stage: FinalizeStage }[],
  distanceOf: (key: string) => number | null,
  contentCanRun: (key: string) => boolean,
): string | undefined {
  const mesh = pickNearestQueuedKey(
    jobs.filter((job) => job.stage === 'mesh').map((job) => job.key),
    distanceOf,
  )
  if (mesh) return mesh
  return pickNearestQueuedKey(
    jobs.filter((job) => job.stage === 'content').map((job) => job.key),
    (key) => (contentCanRun(key) ? distanceOf(key) : null),
  )
}

/** Repeatedly calls `step()` until it returns `false` (nothing left to do) or
 *  the wall-clock budget elapses — always calls `step()` at least once, so a
 *  caller with pending work keeps making progress even when a single step's
 *  cost already exceeds the budget. `now` is injectable so the "many pending
 *  jobs get spread across ticks, not drained unboundedly" behavior can be
 *  unit tested with a fake clock, independent of `performance.now()`. */
export function drainByBudget(step: () => boolean, budgetMs: number, now: () => number = () => performance.now()): void {
  const start = now()
  do {
    if (!step()) return
  } while (now() - start < budgetMs)
}

/** Plan 172 — `harvestCrop`'s result. `'no-yield'` covers both an unripe
 *  (`young`) crop and a `spoiled` one with no `spoiledItem`; either way the
 *  crop is left in place rather than removed. */
export type CropHarvestOutcome =
  | { ok: true, yield: { kind: ItemKind, count: number } }
  | { ok: false, reason: 'unknown-crop' | 'no-yield' }

/**
 * @domain world-terrain
 * @system chunk-manager
 * @role Owns terrain chunk streaming, sampling and environment-facing world queries.
 * @simulation on-demand
 * @performance nearby-only
 */
export function createChunkManager(
  scene: THREE.Scene,
  config: ChunkManagerConfig,
): ChunkManager {
  const chunks = new Map<string, ChunkRecord>()
  // Caller-owned (see `ChunkManagerConfig.modifications`'s doc comment) —
  // this is an alias, not a fresh array, so it survives this `ChunkManager`
  // instance's own disposal.
  const modifications = config.modifications
  // Bumped whenever `modifications` gains a new/changed entry (`modifyTerrain`/
  // `scorchTerrain`/`applyExactHeights`) — folded into `meshCacheKeyFor` so a
  // mesh-data cache hit can never return geometry from before a mesh-affecting
  // modification (plan world-terrain-004). Deliberately global rather than
  // per-chunk: simpler, still correct (only ever over-invalidates, never
  // under-invalidates), and the common case this cache targets — revisiting/
  // reloading chunks with no recent world changes — keeps a high hit rate.
  let modificationsEpoch = 0
  // Base identity for every mesh-data cache key this manager ever builds —
  // everything that can affect mesh output except chunk coordinate and
  // modification state, which never changes for a live `ChunkManager`
  // (`onTerrainChange` rebuilds the whole manager instead), so it's computed
  // once instead of re-stringified per chunk.
  const meshCacheBaseKey = JSON.stringify({
    seed: config.seed,
    resolution: config.resolution,
    chunkSize: config.chunkSize,
    waterLevel: config.waterLevel,
    heightScale: config.heightScale,
    region: config.region,
  })
  function meshCacheKeyFor(coord: ChunkCoord): string {
    return `${meshCacheBaseKey}:${coord.cx}:${coord.cz}:mod${modificationsEpoch}`
  }
  /** Logs a fire-and-forget `buildAndAttachMesh` rejection, except the
   *  routine cancellation a rapid follow-up modification on the same chunk
   *  already causes (its own `requestChunkMesh` supersedes the earlier
   *  in-flight one) — same "cancellation isn't an error" convention as the
   *  tile-generation `.catch` in `ensureLoaded` below. */
  function logMeshRebuildFailure(context: string, err: unknown): void {
    if (err instanceof HeightmapGenerationCancelledError) return
    console.error(`[chunkManager] mesh rebuild after ${context} failed`, err)
  }
  // Runtime-only `ChunkMeshData` cache (plan world-terrain-004 Etap C) — never
  // `THREE.BufferGeometry`/`THREE.Mesh`. Cleared in `dispose()`.
  const meshDataCache = createChunkMeshDataCache()
  const grassSystem = createGrassSystem()
  // Single collision index for the whole world (plan 097 §2.2) — terrain
  // chunks register/clear their own colliders keyed by `chunkKey` below;
  // settlements (outside this manager entirely) register theirs keyed by
  // their own id through `registerColliders`/`clearColliders`.
  const colliderRegistry = createColliderRegistry(config.chunkSize)
  // Batches vegetation/environment InstancedMesh across chunk boundaries at
  // region granularity (plan 143) — purely a rendering-side grouping, no new
  // streaming/lifecycle unit; chunks stay the load/unload boundary.
  const vegetationRegionBatcher = createVegetationRegionBatcher(scene)
  // Bounded, reference-counted cache of computed river tiles (plan 181, Etap
  // 4-6) — a river tile is 256m/side, much coarser than a chunk, computed once
  // and shared by every chunk overlapping it; never a global heightfield.
  const riverTileCache = createRiverTileCache()
  // Kick GLB template loads off the chunk-finalize path (plan 119). Memoized
  // at module level, so a later world rebuild is already warm.
  preloadPropTemplates()
  // One material for every chunk this manager ever builds (perf review 005,
  // A5) — `flatShading`/`detailNormal` changes go through `onTerrainChange` →
  // full world rebuild, which recreates the whole `ChunkManager`, so this
  // never needs to be swapped in place. Disposed in `dispose()` below.
  const terrainMaterial = createTerrainMaterial(
    config.flatShading,
    config.detailNormal,
    config.waterLevel,
  )
  let lastCheckX = Number.POSITIVE_INFINITY
  let lastCheckZ = Number.POSITIVE_INFINITY
  const recheckDistance = config.chunkSize * 0.25
  // Chunks `recheck()` wants but hasn't started loading yet, nearest first —
  // drained a few at a time in `update()` (every frame, unlike the throttled
  // `recheck()` itself) instead of firing `ensureLoaded` for the whole
  // missing set in one synchronous burst. Replaced wholesale on every
  // `recheck()` — always reflects the latest player position, so a stale
  // entry from before a big jump never blocks fresher ones behind it.
  //
  // `CHUNKS_STARTED_PER_FRAME` only caps worker *starts*. Worker completions
  // used to run `buildAndAttachMesh()` immediately in the promise
  // continuation, so several results landing in one frame stacked 30–50 ms
  // mesh builds (review 012 / plan 112). Ready tiles now wait in
  // `finalizeQueue`. `update()` spends the one slot on either a mesh or a
  // content stage (plan 119) — never both in the same gameplay frame.
  let loadQueue: ChunkCoord[] = []
  const CHUNKS_STARTED_PER_FRAME = 2
  const CHUNKS_FINALIZED_PER_FRAME = 1
  let finalizeQueue: string[] = []
  // `waitForChunks` must not deadlock at init (no game loop yet). If
  // `update()` hasn't run recently, the waiter pumps finalization itself.
  let lastUpdateAt = 0
  const GAME_LOOP_IDLE_MS = 48
  // Wall-clock cap on the idle catch-up drain below — job cost varies too
  // much (mesh vs content stage, GLB clone cost) for a job-count cap to
  // bound actual main-thread time, so this bounds time spent per rAF tick
  // instead. Matches the hitch threshold (`HITCH_MS` in perf/monitor.ts) so
  // a catch-up burst reads as "at most one hitch," not a multi-second stall.
  const FINALIZE_DRAIN_BUDGET_MS = 8
  // Chunks only exist within loadRadius, so a grass radius beyond it is a dead
  // knob — clamp so the GUI slider (1-12) can't silently do nothing, and so
  // raising loadRadius later doesn't make grass range jump unexpectedly.
  const effectiveGrassRadius = Math.min(config.grass.radius, config.loadRadius)
  const grassUnloadRadius = effectiveGrassRadius + 1
  // Reflection visibility budget (plan 144 S): terrain/vegetation/environment
  // in the outermost streaming ring pays a second scene submit in the 128²
  // mirror pass for detail that RT can't resolve and the water shader weighs
  // ≤18% into the final colour. Only the outer ring is excluded — shorelines
  // and near terrain stay fully mirrored, keeping the visual risk low.
  const reflectionVisibleRadius = Math.max(1, config.loadRadius - 1)

  const fallbackParams: RawSampleParams = {
    seed: config.seed,
    heightScale: config.heightScale,
    waterLevel: config.waterLevel,
    noiseScale: config.noiseScale,
    detailAmplitude: config.detailAmplitude,
    hillsScale: config.hillsScale,
    hillsAmplitude: config.hillsAmplitude,
    hillsFbm: config.hillsFbm,
    fbm: config.fbm,
    biome: config.biome,
    region: config.region,
  }

  // Built once, referencing `readField` (defined further below — safe, `function`
  // declarations hoist) — used only to resolve nearby settlements'/routes' road
  // segments (`roadNetwork.ts`), never to sample terrain for rendering itself.
  const roadCtx: RoadNetworkContext = {
    seed: config.seed,
    sampleHeight: (x, z) => readField('heights', x, z),
    waterLevel: config.waterLevel,
    terrainSamplers: {
      sampleContinentalness: (x, z) => readField('continentalness', x, z),
      sampleMountainRidge: (x, z) => readField('mountainRidge', x, z),
      sampleMoistureRegion: (x, z) => readField('moistureRegion', x, z),
    },
    heightScale: config.heightScale,
    region: config.region,
    localSearchRadius: config.settlementSearchRadius,
  }

  function chunkRectOf(coord: ChunkCoord): { minX: number, maxX: number, minZ: number, maxZ: number } {
    const { x, z } = chunkCenter(coord, config.chunkSize)
    const half = config.chunkSize / 2
    return { minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half }
  }

  /** Retains this chunk's overlapping river tiles and resolves their chains —
   *  called once from `ensureLoaded`, before the tile is even requested, so
   *  `riverChannelSegmentsNear` can feed carving segments into terrain
   *  generation itself (plan 189) instead of only shaping the water ribbon
   *  after the fact. `record.riverTiles`/`riverChains` are then reused by
   *  `attachChunkMesh` — never retained a second time. */
  function retainRiverTilesFor(record: ChunkRecord): RiverChain[] {
    const rect = chunkRectOf(record.coord)
    record.riverTiles = overlappingRiverTiles(rect)
    record.riverChains = record.riverTiles.flatMap((tile) => riverTileCache.retain(tile, fallbackParams))
    return record.riverChains
  }

  function paramsFor(coord: ChunkCoord, riverSegments: RiverChannelSegment[]): ChunkTileParams {
    const { x, z } = chunkCenter(coord, config.chunkSize)
    const village = villageSegmentsNear(x, z, config.chunkSize, roadCtx)
    return {
      cx: coord.cx,
      cz: coord.cz,
      chunkSize: config.chunkSize,
      resolution: config.resolution,
      seed: config.seed,
      heightScale: config.heightScale,
      waterLevel: config.waterLevel,
      noiseScale: config.noiseScale,
      detailAmplitude: config.detailAmplitude,
      hillsScale: config.hillsScale,
      hillsAmplitude: config.hillsAmplitude,
      hillsFbm: { ...config.hillsFbm },
      fbm: { ...config.fbm },
      biome: { noiseScale: config.biome.noiseScale, fbm: { ...config.biome.fbm } },
      region: {
        ...config.region,
        continentFbm: { ...config.region.continentFbm },
        mountainFbm: { ...config.region.mountainFbm },
        moistureRegionFbm: { ...config.region.moistureRegionFbm },
      },
      isHomeChunk: isHomeChunk(coord),
      vegetationSpeciesCount: {
        tree: TREE_SPECS.length,
        bush: BUSH_SPECS.length,
        cactus: CACTUS_SPECS.length,
        reed: REED_SPECS.length,
        fern: FERN_SPECS.length,
        lily: LILY_SPECS.length,
      },
      roadSegments: [...segmentsNear(x, z, config.chunkSize, roadCtx), ...village.paths],
      clearings: village.clearings,
      regional: village.regional,
      riverSegments,
    }
  }

  function isHomeChunk(coord: ChunkCoord): boolean {
    return config.homeChunks.some((h) => h.cx === coord.cx && h.cz === coord.cz)
  }

  let lastPlayerChunk: ChunkCoord = { cx: 0, cz: 0 }
  let lodScale = Math.min(1, Math.max(0.25, config.lodScale ?? 1))
  /** Live quality knob (plan world-terrain-005, 0..1) — how far across
   *  `effectiveGrassRadius` the cheap filler bucket reaches. 0 reproduces the
   *  original near-only radius (1 chunk); 1 extends filler across the whole
   *  grass ring. See `grassFillerLodFraction`. */
  let grassFillerCoverage = Math.min(1, Math.max(0, config.grassFillerCoverage ?? 0))
  /** Dev-only overrides (default on), applied as a hard `mesh.visible` toggle
   *  (see `WorldGrassChunk.setDebugVisible`) rather than folded into
   *  `mainFrac`/`fillerFrac` — those feed `setLodFraction`, whose main-bucket
   *  branch floors at 1 instance so far chunks never fully vanish, which would
   *  keep a stray blade rendered per chunk even with "OFF" selected. Session-
   *  local, not persisted — see `ChunkManager.setDetailedGrassDebugVisible`/
   *  `setFillerGrassDebugVisible`. */
  let detailedGrassDebugVisible = true
  let fillerGrassDebugVisible = true

  /** Cheap distance LOD: render fewer blades in farther chunks. Near stays
   *  full density; far drops to ~8% (plan 113 P2) instead of the old ~25%
   *  floor. Short filler blades extend from the player's chunk out to
   *  `grassFillerCoverage` of the grass ring (plan world-terrain-005 — cheap
   *  coverage instead of more detailed-species density). `lodScale` (plan 103)
   *  multiplies the curve without changing generation density. */
  function grassLodForDistance(dist: number): { mainFrac: number, fillerFrac: number, geometryTier: ReturnType<typeof grassGeometryLodTier> } {
    const fillerRadius = 1 + grassFillerCoverage * Math.max(0, effectiveGrassRadius - 1)
    return {
      mainFrac: densityLodFraction(dist, effectiveGrassRadius, lodScale),
      fillerFrac: grassFillerLodFraction(dist, fillerRadius, lodScale),
      // Purely distance-based (not `lodScale`-scaled) — geometry LOD trims
      // triangles-per-instance, density LOD trims instance count; keeping the
      // two independent is what plan 148 S asked for ("nie walczyć" with the
      // existing density curve).
      geometryTier: grassGeometryLodTier(dist, effectiveGrassRadius),
    }
  }

  /** Applies the dev-only detailed/filler visibility overrides to one chunk's
   *  grass — called from every place that already re-syncs `setLodFraction`
   *  (`ensureGrass`'s worker callback, `syncGrassForRecord`, `setLodScale`,
   *  `setGrassFillerCoverage`) plus the two debug setters below. */
  function applyGrassDebugVisibility(grass: WorldGrassChunk): void {
    grass.setDebugVisible(detailedGrassDebugVisible, fillerGrassDebugVisible)
  }

  /** Same prefix-`count` curve as grass, scaled to `loadRadius` because
   *  instanced vegetation/rocks live on every loaded chunk (unlike grass,
   *  which has its own smaller radius). Recovers the triangle-count
   *  regression from losing per-object frustum culling (plan 087 faza 7 / R3). */
  function vegetationLodForDistance(dist: number): number {
    return densityLodFraction(dist, config.loadRadius, lodScale)
  }

  /** Toggles `record`'s terrain mesh / non-instanced vegetation extras /
   *  procedural environment props between the default layer and
   *  `REFLECTION_DISTANT_LAYER` (plan 144 S) — chunk-level, not per-frame:
   *  only called from content attach, tree-visual refresh and `recheck()`
   *  (movement-throttled), same cadence as the LOD sync it rides along with.
   *  Grass and dropped items already have their own permanent/independent
   *  reflection exclusion and are not touched here. */
  function syncReflectionForRecord(record: ChunkRecord, dist: number): void {
    const visible = dist <= reflectionVisibleRadius
    const layer = visible ? 0 : REFLECTION_DISTANT_LAYER
    if (record.mesh) assignRenderLayer(record.mesh, layer)
    if (record.vegetationExtras) assignRenderLayer(record.vegetationExtras, layer)
    if (record.environment) assignRenderLayer(record.environment, layer)
    vegetationRegionBatcher.syncReflectionVisibility(record.coord, visible)
  }

  function syncInstancedLodForRecord(record: ChunkRecord, playerChunk: ChunkCoord): void {
    const dist = chebyshevDistance(record.coord, playerChunk)
    const frac = vegetationLodForDistance(dist)
    vegetationRegionBatcher.syncLod(record.coord, frac)
    syncReflectionForRecord(record, dist)
  }

  /** Requests grass placement on the worker pool (plan 086) — `record.grass`
   *  stays `undefined` (and `grassPending` true) until the result comes back,
   *  at which point it's re-validated against the *current* player position
   *  (not the one at request time) before building meshes. Chunk tiles come
   *  back synchronously already resolved (`ensureLoaded`); grass is the only
   *  per-chunk placement still generated on demand after that. */
  function ensureGrass(record: ChunkRecord): void {
    if (record.grass !== undefined || record.grassPending || !record.tile) return
    const tile = record.tile
    const key = record.key
    const coord = record.coord
    const { x, z } = chunkCenter(coord, config.chunkSize)
    record.grassPending = true

    const params: GrassRequestParams = {
      cx: coord.cx,
      cz: coord.cz,
      chunkSize: config.chunkSize,
      resolution: config.resolution,
      waterLevel: config.waterLevel,
      heightScale: config.heightScale,
      seed: config.seed,
      candidatesPerChunk: config.grass.density,
      region: config.region,
      riverSegments: record.riverChains
        ? riverChannelSegmentsNear(record.riverChains, x, z, config.chunkSize)
        : [],
      grids: {
        heights: tile.heights,
        biomes: tile.biomes,
        roadTint: tile.roadTint,
        mountainRidge: tile.mountainRidge,
        moistureRegion: tile.moistureRegion,
      },
    }

    requestChunkGrass(key, params)
      .then((data) => {
        const rec = chunks.get(key)
        if (!rec) return // chunk unloaded while generating
        rec.grassPending = false
        const dist = chebyshevDistance(coord, lastPlayerChunk)
        if (dist > grassUnloadRadius) return // out of range by the time the result came back
        const t0 = performance.now()
        const grass = grassSystem.buildGrassChunkMeshes(data, x, z)
        getMonitor().recordHitch('GRASS', performance.now() - t0, 'grass generation')
        rec.grass = grass
        if (grass) {
          if (isSystemEnabled('grass')) scene.add(grass.mesh)
          const { mainFrac, fillerFrac, geometryTier } = grassLodForDistance(dist)
          grass.setLodFraction(mainFrac, fillerFrac)
          grass.setGeometryLod(geometryTier)
          applyGrassDebugVisibility(grass)
        }
      })
      .catch((err: unknown) => {
        const rec = chunks.get(key)
        if (rec) rec.grassPending = false
        if (!(err instanceof HeightmapGenerationCancelledError)) {
          console.error('[chunkManager] grass generation failed', err)
        }
      })
  }

  function removeGrass(record: ChunkRecord): void {
    record.grass?.dispose()
    record.grass = undefined
    if (record.grassPending) {
      cancelChunkGrass(record.key)
      record.grassPending = false
    }
  }

  /** Grass gets its own (smaller) show/hide radius than the terrain `loadRadius` —
   *  hysteresis between `config.grass.radius` (show) and `grassUnloadRadius` (hide)
   *  avoids build/dispose thrashing right at the boundary, same idea as
   *  `loadRadius`/`unloadRadius` for whole chunks. */
  function syncGrassForRecord(record: ChunkRecord, playerChunk: ChunkCoord): void {
    if (!config.grass.enabled || record.state !== 'ready') return
    const dist = chebyshevDistance(record.coord, playerChunk)
    if (dist <= effectiveGrassRadius) {
      ensureGrass(record)
      const { mainFrac, fillerFrac, geometryTier } = grassLodForDistance(dist)
      record.grass?.setLodFraction(mainFrac, fillerFrac)
      record.grass?.setGeometryLod(geometryTier)
      if (record.grass) applyGrassDebugVisibility(record.grass)
    } else if (dist > grassUnloadRadius && (record.grass !== undefined || record.grassPending)) {
      removeGrass(record)
    }
  }

  /** Builds one chunk-local placement group (vegetation/items/environment) —
   *  `makeProp` returning `null` skips that placement (e.g. an already
   *  `collectedItemIds` item) without leaving a gap in the group. Returns
   *  `undefined` for an empty placement list, same as the field never having
   *  been set, so callers can assign the result straight to `rec.X`. */
  function buildPlacementGroup<T>(
    name: string,
    placements: readonly T[],
    makeProp: (placement: T) => THREE.Object3D | null,
  ): THREE.Group | undefined {
    if (placements.length === 0) return undefined
    const group = new THREE.Group()
    group.name = name
    for (const placement of placements) {
      const prop = makeProp(placement)
      if (prop) group.add(prop)
    }
    scene.add(group)
    return group
  }

  /** Requests this chunk's `ChunkMeshData` — a cache hit (no worker
   *  round-trip) or a `'mesh'` chunk-worker job whose result is stored into
   *  the cache before returning (plan world-terrain-004, Etap A/C). Pure
   *  data fetch, no scene mutation — safe to await from both a freshly
   *  streamed-in chunk (`attachChunkMesh`) and a direct re-mesh of an
   *  already-`ready` chunk after a dig/scorch/prepare. */
  function requestChunkMeshData(rec: ChunkRecord, tile: ChunkTileResult): Promise<ChunkMeshData> {
    const cacheKey = meshCacheKeyFor(rec.coord)
    const cached = meshDataCache.get(cacheKey)
    if (cached) return Promise.resolve(cached)
    const { x, z } = chunkCenter(rec.coord, config.chunkSize)
    const scorches = modifications.filter((m) => m.mode === 'scorch')
    const tileGrids: ChunkMeshTileGrids = {
      floorHeights: tile.floorHeights,
      biomes: tile.biomes,
      continentalness: tile.continentalness,
      mountainRidge: tile.mountainRidge,
      moistureRegion: tile.moistureRegion,
      roadTint: tile.roadTint,
    }
    return requestChunkMesh(rec.key, {
      tile: tileGrids,
      resolution: config.resolution,
      chunkSize: config.chunkSize,
      chunkOriginX: x,
      chunkOriginZ: z,
      waterLevel: config.waterLevel,
      heightScale: config.heightScale,
      region: config.region,
      seed: config.seed,
      scorches,
    }).then((meshData) => {
      meshDataCache.set(cacheKey, meshData)
      return meshData
    })
  }

  /** (Re)builds a chunk record's mesh from its current (possibly
   *  dig-modified) tile — disposes the previous mesh first if there is one,
   *  so it doubles as the initial build (`ensureLoaded`) and a post-dig
   *  rebuild (`modifyTerrain`) without duplicating the `buildChunkGeometry`
   *  call. The expensive per-vertex terrain math now runs in the existing
   *  chunk worker (`computeChunkMeshData`, plan world-terrain-004) via
   *  `requestChunkMeshData`; this only awaits that (or a cache hit) and then
   *  does the now-cheap Three.js assembly, which is what the `STREAMING`
   *  `'chunk mesh'` hitch measures — unchanged in spirit from before the
   *  migration, just no longer timing the terrain math itself.
   *
   *  A second call for the same record while the first is still in flight
   *  (e.g. rapid consecutive digs) is resolved by `meshRequestSeq`: only the
   *  most recently *issued* call ever attaches, regardless of which
   *  resolves first — the chunk-worker pool's own cancel-by-key already
   *  drops a superseded in-flight worker job, but a cache hit resolves
   *  synchronously and bypasses that, so this is the belt-and-braces check
   *  that a stale result can never overwrite a fresher one. */
  async function buildAndAttachMesh(rec: ChunkRecord, tile: ChunkTileResult): Promise<void> {
    const seq = (rec.meshRequestSeq ?? 0) + 1
    rec.meshRequestSeq = seq
    const meshData = await requestChunkMeshData(rec, tile)
    // The chunk may have unloaded (or unloaded-and-reloaded into a fresh
    // record) while awaiting, or a newer request for this same record may
    // have already superseded this one — never touch stale scene state.
    if (chunks.get(rec.key) !== rec || rec.meshRequestSeq !== seq) return
    const streamT0 = performance.now()
    rec.mesh?.removeFromParent()
    rec.meshDispose?.()
    const { x, z } = chunkCenter(rec.coord, config.chunkSize)
    const { mesh, dispose } = buildChunkGeometry(
      meshData,
      config.resolution,
      config.chunkSize,
      x,
      z,
      terrainMaterial,
      config.terrainCastsShadow,
    )
    scene.add(mesh)
    rec.mesh = mesh
    rec.meshDispose = dispose
    getMonitor().recordHitch('STREAMING', performance.now() - streamT0, 'chunk mesh')
  }

  function waitForFinalizeSlot(rec: ChunkRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      rec.finalizeWaiter = { resolve, reject }
      rec.finalizeStage = 'mesh'
      finalizeQueue.push(rec.key)
    })
  }

  function chunkNeedsContent(tile: ChunkTileResult): boolean {
    return tile.vegetation.length > 0 || tile.environment.length > 0 || tile.items.length > 0
  }

  function contentTemplatesReady(tile: ChunkTileResult): boolean {
    if (tile.vegetation.length > 0) {
      if (
        !getTreeTemplates.peek()
        || !getBushTemplates.peek()
        || !getCactusTemplates.peek()
        || !getReedTemplates.peek()
        || !getFernTemplates.peek()
        || !getLilyTemplates.peek()
      ) {
        return false
      }
    }
    if (tile.environment.some((p) => GLB_ENV_KINDS.has(p.kind))) {
      if (
        !getRockTemplates.peek()
        || !getRockClusterTemplates.peek()
        || !getFallenLogTemplates.peek()
      ) {
        return false
      }
    }
    if (tile.environment.some((p) => p.kind === 'cemetery')) {
      if (!getCemeteryTemplates.peek() || !getGraveTemplates.peek()) return false
    }
    return true
  }

  function takeNearestFinalizeKey(): string | undefined {
    finalizeQueue = finalizeQueue.filter((k) => {
      const rec = chunks.get(k)
      if (!rec?.tile || !rec.finalizeWaiter || !rec.finalizeStage) return false
      if (rec.finalizeStage === 'mesh') return rec.state === 'generating'
      return rec.state === 'ready'
    })
    const jobs = finalizeQueue.flatMap((key) => {
      const rec = chunks.get(key)
      return rec?.finalizeStage ? [{ key, stage: rec.finalizeStage }] : []
    })
    const key = pickNextFinalizeKey(
      jobs,
      (k) => {
        const rec = chunks.get(k)
        return rec ? chebyshevDistance(rec.coord, lastPlayerChunk) : null
      },
      (k) => {
        const rec = chunks.get(k)
        return !!(rec?.tile && contentTemplatesReady(rec.tile))
      },
    )
    if (!key) return undefined
    const i = finalizeQueue.indexOf(key)
    if (i >= 0) finalizeQueue.splice(i, 1)
    return key
  }

  function finishFinalize(rec: ChunkRecord, err?: unknown): void {
    const waiter = rec.finalizeWaiter
    rec.finalizeWaiter = undefined
    rec.finalizeStage = undefined
    if (!waiter) return
    if (err !== undefined) waiter.reject(err)
    else waiter.resolve()
  }

  /** The content stage still runs without `await`, so its continuations
   *  cannot stampede when a shared GLB promise resolves (plan 119). The mesh
   *  stage now awaits `attachChunkMesh`'s worker/cache round-trip (plan
   *  world-terrain-004); `drainFinalizeQueue`/`drainFinalizeQueueByBudget`
   *  don't await `runFinalize` itself, so the existing "1 slot" budget caps
   *  how many finalizes *start* per frame/budget window, not how long they
   *  take to land — the main-thread work left in a finalize is brief either
   *  way now that the terrain math moved off-thread. Errors from the awaited
   *  stage are caught by the same `try`/`catch` as the sync stage always had. */
  async function runFinalize(rec: ChunkRecord): Promise<void> {
    const tile = rec.tile
    const stage = rec.finalizeStage
    if (!tile || !stage || !rec.finalizeWaiter) return
    if (!chunks.has(rec.key)) {
      finishFinalize(rec)
      return
    }
    try {
      if (stage === 'mesh') {
        if (rec.state !== 'generating') {
          finishFinalize(rec)
          return
        }
        await attachChunkMesh(rec, tile)
        // Unloaded while awaiting — `unload()` already resolved/cleared the
        // waiter, so `finishFinalize` below is a no-op; just don't touch the
        // (now-gone) chunk's collider/content state.
        if (!chunks.has(rec.key)) {
          finishFinalize(rec)
          return
        }
        if (chunkNeedsContent(tile)) {
          rec.finalizeStage = 'content'
          finalizeQueue.push(rec.key)
        } else {
          rebuildColliders(rec)
          finishFinalize(rec)
        }
        return
      }
      if (rec.state !== 'ready' || !chunks.has(rec.key)) {
        finishFinalize(rec)
        return
      }
      attachChunkContent(rec, tile)
      finishFinalize(rec)
    } catch (err) {
      finishFinalize(rec, err)
    }
  }

  /** Caps how many mesh *or* content stages run this visit. `update()` uses 1
   *  total (not 1+1). */
  function drainFinalizeQueue(limit: number): void {
    let n = 0
    while (n < limit) {
      const key = takeNearestFinalizeKey()
      if (!key) break
      const rec = chunks.get(key)
      if (!rec) continue
      n++
      runFinalize(rec)
    }
  }

  /** Same drain as above, capped by wall-clock time instead of job count
   *  (via `drainByBudget`) — used by `waitForChunks`' idle catch-up, which
   *  can face a queue with many jobs at once (whole settlement's chunk
   *  block) and must not turn into a multi-second synchronous burst just
   *  because `limit` was set high. */
  function drainFinalizeQueueByBudget(budgetMs: number): void {
    drainByBudget(() => {
      const key = takeNearestFinalizeKey()
      if (!key) return false
      const rec = chunks.get(key)
      if (rec) runFinalize(rec)
      return true
    }, budgetMs)
  }

  /** Terrain + water + grass request. Sets `state = 'ready'` so the player
   *  can stand on the chunk before trees/rocks exist. Digs are applied here
   *  (not at enqueue) so a modification while queued still reaches the mesh.
   *  `buildAndAttachMesh` now awaits a chunk-worker round-trip (or a mesh-data
   *  cache hit) for the expensive part — see its own doc comment — so this is
   *  async too; `runFinalize` awaits it before advancing the chunk's finalize
   *  stage. */
  async function attachChunkMesh(rec: ChunkRecord, tile: ChunkTileResult): Promise<void> {
    const coord = rec.coord
    for (const mod of modifications) {
      applyModificationToTile(tile, coord, config.chunkSize, config.resolution, mod)
    }
    await buildAndAttachMesh(rec, tile)
    // Unloaded (or unloaded-and-reloaded into a fresh record) while awaiting
    // — never attach water/river/state to a record that's no longer current.
    if (chunks.get(rec.key) !== rec) return

    const { x, z } = chunkCenter(coord, config.chunkSize)
    const apronRes = config.resolution + 2
    const coreHeights = extractCoreGrid(tile.heights, apronRes, config.resolution)
    const coreFloorHeights = extractCoreGrid(tile.floorHeights, apronRes, config.resolution)
    const coreBodyScale = extractCoreGrid(tile.bodyScale, apronRes, config.resolution)
    const waterT0 = performance.now()
    rec.water = createChunkWater(
      coreHeights,
      coreFloorHeights,
      coreBodyScale,
      config.resolution,
      x,
      z,
      config.chunkSize,
      config.waterLevel,
      config.waterMirror,
    )
    if (rec.water) scene.add(rec.water.mesh)
    getMonitor().recordHitch('WATER', performance.now() - waterT0, 'chunk water')

    const riverT0 = performance.now()
    const chunkRect = {
      minX: x - config.chunkSize / 2,
      maxX: x + config.chunkSize / 2,
      minZ: z - config.chunkSize / 2,
      maxZ: z + config.chunkSize / 2,
    }
    // Retained once already, in `ensureLoaded` (before this tile was even
    // requested — plan 189 needs the chains to build carving segments ahead
    // of terrain generation), and released once in `unload`. Reused here
    // rather than retained again to keep the ref count balanced 1:1.
    const riverChains = rec.riverChains ?? []
    // River Y now comes from each point's canonical `canonicalWaterHeight`
    // (world-terrain-010) — a pure function of the chain's own hydrology
    // data, not a sample of this chunk's rendered terrain — so it no longer
    // needs `tile.floorHeights` here at all.
    rec.river = createChunkRiver(riverChains, chunkRect, x, z)
    if (rec.river) scene.add(rec.river.mesh)
    getMonitor().recordHitch('WATER', performance.now() - riverT0, 'chunk river')

    rec.state = 'ready'
    syncGrassForRecord(rec, lastPlayerChunk)
    getProgramCensus().recordChunkAttach('chunk-mesh-attach', rec.key, [rec.mesh])
  }

  /** Player-planted trees (plan 126) whose position falls inside `coord` —
   *  merged into that chunk's tree loop in `attachChunkContent`, same "chunk
   *  owns whatever's inside its footprint" rule as procedural placements. */
  function plantedTreesForChunk(coord: ChunkCoord): PlantedTreeRecord[] {
    return config.plantedTrees.filter((r) => {
      const c = worldToChunk(r.x, r.z, config.chunkSize)
      return c.cx === coord.cx && c.cz === coord.cz
    })
  }

  /** Same idea as `plantedTreesForChunk`, for planted crops. */
  function plantedCropsForChunk(coord: ChunkCoord): CropPlacement[] {
    return config.plantedCrops.filter((r) => {
      const c = worldToChunk(r.x, r.z, config.chunkSize)
      return c.cx === coord.cx && c.cz === coord.cz
    })
  }

  /** Vegetation / items / environment / colliders. Caller guarantees the
   *  needed GLB templates are already in cache (`contentTemplatesReady`). */
  function attachChunkContent(rec: ChunkRecord, tile: ChunkTileResult): void {
    const coord = rec.coord
    const o = apronOriginWorld(coord.cx, coord.cz, config.chunkSize, config.resolution)
    const sampleTileHeight: HeightSampler = (sx, sz) =>
      sampleApronGrid(tile.heights, o.apronRes, o.x, o.z, o.step, sx, sz)

    const plantedTreesHere = plantedTreesForChunk(coord)
    if (tile.vegetation.length > 0 || plantedTreesHere.length > 0) {
      const treeTemplates = getTreeTemplates.peek() ?? []
      const bushTemplates = getBushTemplates.peek() ?? []
      const cactusTemplates = getCactusTemplates.peek() ?? []
      const reedTemplates = getReedTemplates.peek() ?? []
      const fernTemplates = getFernTemplates.peek() ?? []
      const lilyTemplates = getLilyTemplates.peek() ?? []

      const vegT0 = performance.now()
      const treeIds: string[] = []
      const treeYaw = new Map<string, number>()
      // Planted trees (plan 126) are a persistent world mutation, not part of
      // procedural generation — merged in here so a planted tree enters the
      // exact same living-tree instancing / extras / harvest path as any
      // procedural one (updated review §1/§2), tagged with its own stable id
      // (`plantedId`) instead of the derived procedural `makeId`.
      const treePlacements: (typeof tile.vegetation[number] & { plantedId?: string })[] = [
        ...tile.vegetation.filter((p) => p.kind === 'tree'),
        ...plantedTreesHere.map((r) => ({
          x: r.x,
          z: r.z,
          kind: 'tree' as const,
          speciesIndex: r.speciesIndex,
          scale: r.sizeJitter,
          rotationY: r.rotationY,
          growthStage: 'sapling' as const,
          sizeClass: r.sizeClass,
          sizeJitter: r.sizeJitter,
          plantedId: r.id,
        })),
      ]
      const livingTreePlacements: PropPlacement[] = []
      const extras = new THREE.Group()
      extras.name = 'chunk-vegetation-extras'
      let hasExtras = false

      for (const placement of treePlacements) {
        const initialStage = placement.growthStage ?? 'mature'
        const sizeClass = placement.sizeClass ?? 'medium'
        const sizeJitter = placement.sizeJitter ?? placement.scale
        const id = placement.plantedId ?? config.treeLifecycle.makeId(placement.x, placement.z, placement.speciesIndex)
        const presence = {
          id,
          x: placement.x,
          z: placement.z,
          speciesIndex: placement.speciesIndex,
          initialStage,
          sizeClass,
          sizeJitter,
        }
        config.treeLifecycle.registerPresence(presence)
        treeIds.push(id)
        treeYaw.set(id, placement.rotationY)
        const env = sampleTreeEnvAt(placement.x, placement.z, tile, coord)
        const resolved = config.treeLifecycle.resolve(presence, env, config.getWorldDays())

        if (resolved.visual === 'living') {
          livingTreePlacements.push({
            speciesIndex: placement.speciesIndex,
            x: placement.x,
            z: placement.z,
            groundY: sampleTileHeight(placement.x, placement.z),
            rotationY: placement.rotationY,
            scale: resolved.scale,
            key: id,
          })
          continue
        }

        const prop = createTreeStageMesh(resolved.visual, resolved.scale, id)
        prop.rotation.y = placement.rotationY
        placeOnGround(prop, placement.x, placement.z, sampleTileHeight)
        tagTreeMesh(prop, resolved, sizeClass, sizeJitter, placement.speciesIndex, initialStage)
        extras.add(prop)
        hasExtras = true
      }
      rec.treeIds = treeIds
      rec.treeYaw = treeYaw

      if (hasExtras) {
        if (isSystemEnabled('trees')) scene.add(extras)
        rec.vegetationExtras = extras
      }
      if (livingTreePlacements.length > 0) {
        vegetationRegionBatcher.setChunkPlacements(coord, 'tree-living', treeTemplates, livingTreePlacements)
      }

      const instancedTemplatesByKind = {
        bush: bushTemplates,
        cactus: cactusTemplates,
        reed: reedTemplates,
        fern: fernTemplates,
        lily: lilyTemplates,
      }
      for (const kind of ['bush', 'cactus', 'reed', 'fern', 'lily'] as const) {
        const placements = tile.vegetation.filter((p) => p.kind === kind)
        if (placements.length === 0) continue
        const propPlacements: PropPlacement[] = placements.map((p) => ({
          speciesIndex: p.speciesIndex,
          x: p.x,
          z: p.z,
          groundY: sampleTileHeight(p.x, p.z),
          rotationY: p.rotationY,
          scale: p.scale,
        }))
        vegetationRegionBatcher.setChunkPlacements(coord, kind, instancedTemplatesByKind[kind], propPlacements)
      }
      syncInstancedLodForRecord(rec, lastPlayerChunk)
      getMonitor().recordHitch('VEGETATION', performance.now() - vegT0, 'chunk vegetation')
    }

    const itemsT0 = performance.now()
    rec.items = buildPlacementGroup('chunk-items', tile.items, (placement) => {
      if (config.collectedItemIds.has(placement.id)) return null
      const itemMesh = createItemMesh(placement.kind)
      itemMesh.userData.itemId = placement.id
      itemMesh.userData.itemKind = placement.kind
      placeOnGround(itemMesh, placement.x, placement.z, sampleTileHeight)
      return itemMesh
    })
    // Loose ground pickups (sticks, stones, berries) are a per-item draw call
    // each for almost no geometry — and none of them survive a 128² reflection
    // that is itself weighted ≤18 % into the water colour. Skip the second
    // scene submit; the main camera still draws them normally.
    if (rec.items) assignRenderLayer(rec.items, REFLECTION_SKIPPED_LAYER)
    getMonitor().recordHitch('PROPS', performance.now() - itemsT0, 'chunk items')

    const cropsT0 = performance.now()
    const worldDaysForCrops = config.getWorldDays()
    // Planted crops (plan 126) merge into the same per-chunk group as wild
    // ones — a harvested planted crop is removed from `config.plantedCrops`
    // outright (never `removedCropIds`, which only makes sense for a
    // deterministic procedural generator that would otherwise recreate it).
    const cropPlacements: CropPlacement[] = [...tile.crops, ...plantedCropsForChunk(coord)]
    rec.crops = buildPlacementGroup('chunk-crops', cropPlacements, (placement) => {
      if (config.removedCropIds.has(placement.id)) return null
      const def = CROP_DEFS[placement.cropId]
      const stage = resolveCropStage(def, placement.stageStartedAt, worldDaysForCrops)
      const cropMesh = createCropStageMesh(def.harvestItem, stage)
      cropMesh.userData.cropId = placement.id
      cropMesh.userData.cropDefId = placement.cropId
      cropMesh.userData.cropStage = stage
      placeOnGround(cropMesh, placement.x, placement.z, sampleTileHeight)
      return cropMesh
    })
    if (rec.crops) assignRenderLayer(rec.crops, REFLECTION_SKIPPED_LAYER)
    getMonitor().recordHitch('PROPS', performance.now() - cropsT0, 'chunk crops')

    const rockTemplates = getRockTemplates.peek()
    const rockClusterTemplates = getRockClusterTemplates.peek()
    const fallenLogTemplates = getFallenLogTemplates.peek()
    const cemeteryPlot = getCemeteryTemplates.peek()?.[0]
    const graveTemplates = getGraveTemplates.peek() ?? undefined

    const envT0 = performance.now()
    const proceduralEnvPlacements = tile.environment.filter((p) => !GLB_ENV_KINDS.has(p.kind))
    rec.environment = buildPlacementGroup('chunk-environment', proceduralEnvPlacements, (placement) => {
      // stoneCircle/cemetery/monolith/smallRuins bake `rotationY` into each
      // element's offset themselves (plan 173, extended world-terrain-006) —
      // their individual stones/graves/rubble need their true world position
      // to sample terrain correctly, so the yaw can't be left as a
      // `prop.rotation.y` applied on the whole group afterward.
      if (placement.kind === 'cemetery') {
        const prop = createCemetery(
          placement.scale,
          placement.variant,
          { plot: cemeteryPlot, graves: graveTemplates },
          placement.cemeterySize ?? 'SM',
          { worldX: placement.x, worldZ: placement.z, rotationY: placement.rotationY, sampleHeight: sampleTileHeight },
        )
        placeOnGround(prop, placement.x, placement.z, sampleTileHeight)
        return prop
      }
      if (placement.kind === 'stoneCircle') {
        const prop = createStoneCircle(placement.scale, placement.variant, {
          worldX: placement.x,
          worldZ: placement.z,
          rotationY: placement.rotationY,
          sampleHeight: sampleTileHeight,
        })
        placeOnGround(prop, placement.x, placement.z, sampleTileHeight)
        return prop
      }
      if (placement.kind === 'monolith' || placement.kind === 'smallRuins') {
        const terrain = {
          worldX: placement.x,
          worldZ: placement.z,
          rotationY: placement.rotationY,
          sampleHeight: sampleTileHeight,
        }
        const prop =
          placement.kind === 'monolith'
            ? createMonolith(placement.scale, placement.variant, terrain)
            : createSmallRuins(placement.scale, placement.variant, terrain)
        placeOnGround(prop, placement.x, placement.z, sampleTileHeight)
        return prop
      }
      const prop = createProceduralEnvironmentProp(placement.kind, placement.scale, placement.variant)
      prop.rotation.y = placement.rotationY
      placeOnGround(prop, placement.x, placement.z, sampleTileHeight)
      return prop
    })

    const envInstancedSources: { kind: 'largeRock' | 'rockCluster' | 'fallenLog', templates: THREE.Object3D[] | null }[] = [
      { kind: 'largeRock', templates: rockTemplates },
      { kind: 'rockCluster', templates: rockClusterTemplates },
      { kind: 'fallenLog', templates: fallenLogTemplates },
    ]
    for (const { kind, templates } of envInstancedSources) {
      if (!templates) continue
      const placements = tile.environment.filter((p) => p.kind === kind)
      if (placements.length === 0) continue
      const propPlacements: PropPlacement[] = placements.map((p) => ({
        speciesIndex: 0,
        x: p.x,
        z: p.z,
        groundY: sampleTileHeight(p.x, p.z),
        rotationY: p.rotationY,
        scale: p.scale,
      }))
      vegetationRegionBatcher.setChunkPlacements(coord, kind, templates, propPlacements)
    }
    syncInstancedLodForRecord(rec, lastPlayerChunk)
    getMonitor().recordHitch('PROPS', performance.now() - envT0, 'chunk environment')
    getProgramCensus().recordChunkAttach('chunk-content-attach', rec.key, [
      rec.vegetationExtras,
      rec.items,
      rec.crops,
      rec.environment,
    ])
    rebuildColliders(rec)
  }

  function ensureLoaded(coord: ChunkCoord): Promise<void> {
    const key = chunkKey(coord)
    const existing = chunks.get(key)
    if (existing) return existing.pendingPromise ?? Promise.resolve()

    const record: ChunkRecord = {
      coord,
      key,
      state: 'generating',
      pinned: isHomeChunk(coord),
    }
    chunks.set(key, record)

    const riverChains = retainRiverTilesFor(record)
    const { x, z } = chunkCenter(coord, config.chunkSize)
    const riverSegments = riverChannelSegmentsNear(riverChains, x, z, config.chunkSize)

    const promise = requestChunkTile(key, paramsFor(coord, riverSegments))
      .then((tile) => {
        const rec = chunks.get(key)
        if (!rec) return // unloaded while generating
        rec.tile = tile
        return waitForFinalizeSlot(rec)
      })
      .catch((err: unknown) => {
        if (!(err instanceof HeightmapGenerationCancelledError)) {
          console.error('[chunkManager] chunk generation failed', err)
        }
        chunks.delete(key)
      })
      .finally(() => {
        const rec = chunks.get(key)
        if (rec) rec.pendingPromise = undefined
      })

    record.pendingPromise = promise
    return promise
  }

  /** Recomputes `record`'s full collider set from its current tile/tree
   *  state and re-registers it (plan 097 §2.2) — called once after a
   *  chunk finishes building, and again from `refreshTreeVisual` so a
   *  chopped/regrown tree's collider (present only while `resolved.visual
   *  === 'living'`) doesn't go stale (e.g. a felled trunk staying solid
   *  after the mesh becomes a walkable stump). Cheap: tree lifecycle
   *  resolution is data-only, and a chunk has at most a few dozen trees. */
  function rebuildColliders(record: ChunkRecord): void {
    if (!record.tile) return
    const colliders: Collider[] = []
    for (const p of record.tile.environment) {
      const radius = ENVIRONMENT_COLLISION_RADIUS[p.kind]
      if (radius > 0) colliders.push({ type: 'circle', x: p.x, z: p.z, radius: radius * p.scale })
    }
    for (const id of record.treeIds ?? []) {
      const presence = config.treeLifecycle.getPresence(id)
      if (!presence) continue
      const resolved = config.treeLifecycle.resolve(
        presence,
        sampleTreeEnvAt(presence.x, presence.z, record.tile, record.coord),
        config.getWorldDays(),
      )
      if (resolved.visual === 'living') {
        colliders.push({ type: 'circle', x: presence.x, z: presence.z, radius: TREE_COLLISION_RADIUS })
      }
    }
    colliderRegistry.setColliders(record.key, colliders)
  }

  function unload(record: ChunkRecord): void {
    const unloadT0 = performance.now()
    if (record.finalizeWaiter) {
      record.finalizeWaiter.resolve()
      record.finalizeWaiter = undefined
    }
    record.finalizeStage = undefined
    finalizeQueue = finalizeQueue.filter((k) => k !== record.key)
    if (record.state === 'generating') cancelChunkTile(record.key)
    // Always, regardless of state: a re-mesh (dig/scorch/prepare) can leave a
    // `'mesh'` job in flight for an already-`ready` chunk too (plan
    // world-terrain-004) — cheap no-op if nothing is pending.
    cancelChunkMesh(record.key)
    colliderRegistry.clearColliders(record.key)
    if (record.treeIds) {
      for (const id of record.treeIds) config.treeLifecycle.unregisterPresence(id)
      record.treeIds = undefined
    }
    record.treeYaw = undefined
    record.mesh?.removeFromParent()
    record.meshDispose?.()
    record.water?.dispose()
    record.river?.dispose()
    if (record.riverTiles) {
      for (const tile of record.riverTiles) riverTileCache.release(tile)
      record.riverTiles = undefined
    }
    removeGrass(record)
    if (record.vegetationExtras) {
      disposeObject3D(record.vegetationExtras)
      record.vegetationExtras.removeFromParent()
      record.vegetationExtras = undefined
    }
    vegetationRegionBatcher.clearChunkPlacements(record.coord)
    if (record.items) {
      disposeObject3D(record.items)
      record.items.removeFromParent()
    }
    if (record.crops) {
      disposeObject3D(record.crops)
      record.crops.removeFromParent()
    }
    if (record.environment) {
      disposeObject3D(record.environment)
      record.environment.removeFromParent()
    }
    chunks.delete(record.key)
    getMonitor().recordHitch('STREAMING', performance.now() - unloadT0, 'chunk unload')
  }

  function sampleTreeEnvAt(
    x: number,
    z: number,
    tile: ChunkTileResult,
    coord: ChunkCoord,
  ): TreeEnvSample {
    const o = apronOriginWorld(coord.cx, coord.cz, config.chunkSize, config.resolution)
    const sample = (grid: Float32Array) =>
      sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)
    const h = sample(tile.heights)
    const altitude01 = Math.max(0, (h - config.waterLevel) / Math.max(config.heightScale, 0.001))
    const moistureRegion = sample(tile.moistureRegion)
    return {
      biome: biomeWeightsAt(moistureRegion, altitude01, config.region),
      moisture: sample(tile.biomes),
      altitude01,
      mountainRidge: sample(tile.mountainRidge),
      coastal: coastalFactor(sample(tile.continentalness), config.region.coastThreshold),
    }
  }

  /** Same apron-grid sample `placeOnGround` needs, for callers (like
   *  `refreshTreeVisual`) that only have a `ChunkTileResult` on hand, not the
   *  `sampleTileHeight` closure built once per chunk inside `ensureLoaded`. */
  function sampleGroundHeightAt(x: number, z: number, tile: ChunkTileResult, coord: ChunkCoord): number {
    const o = apronOriginWorld(coord.cx, coord.cz, config.chunkSize, config.resolution)
    return sampleApronGrid(tile.heights, o.apronRes, o.x, o.z, o.step, x, z)
  }

  function sampleTreeEnv(x: number, z: number): TreeEnvSample {
    const h = readField('heights', x, z)
    const altitude01 = Math.max(0, (h - config.waterLevel) / Math.max(config.heightScale, 0.001))
    const moistureRegion = readField('moistureRegion', x, z)
    return {
      biome: biomeWeightsAt(moistureRegion, altitude01, config.region),
      moisture: readField('biomes', x, z),
      altitude01,
      mountainRidge: readField('mountainRidge', x, z),
      coastal: coastalFactor(readField('continentalness', x, z), config.region.coastThreshold),
    }
  }

  /** Rebuild one tree's visual after a lifecycle change (chop step, stump
   *  regrowth). Living trees load in as instances (region-batched
   *  `tree-living` group, `vegetationRegionBatcher.ts`, plan 143 — no
   *  per-instance `Object3D`/`userData` — see faza 4), so this can no longer
   *  find "the mesh" and read state off it the way it used to: identity data
   *  comes from `treeLifecycle.getPresence` + `rec.treeYaw` instead, and the
   *  replacement always lands in `rec.vegetationExtras` as a plain `Object3D`
   *  — once a tree needs a runtime refresh it stays there even if regrowth
   *  eventually makes it 'living' again (plan 087 §2.3 point 2: simpler than
   *  re-inserting into an already-built instance buffer, and this path is
   *  the rare case next to the bulk of a chunk's initially-instanced trees). */
  function refreshTreeVisual(treeId: string): boolean {
    for (const rec of chunks.values()) {
      if (!rec.treeIds?.includes(treeId) || !rec.tile) continue

      const wasInstance = vegetationRegionBatcher.removeByKey(rec.coord, treeId)
      if (!wasInstance) {
        const mesh = rec.vegetationExtras?.children.find((c) => c.userData.treeId === treeId)
        if (!mesh) continue
        mesh.removeFromParent()
        disposeObject3D(mesh)
      }

      const presence = config.treeLifecycle.getPresence(treeId)
      if (!presence) continue
      const resolved = config.treeLifecycle.resolve(
        presence,
        sampleTreeEnvAt(presence.x, presence.z, rec.tile, rec.coord),
        config.getWorldDays(),
      )

      const replacement = createTreeStageMesh(resolved.visual, resolved.scale, treeId)
      replacement.rotation.y = rec.treeYaw?.get(treeId) ?? 0
      placeOnGround(replacement, presence.x, presence.z, (sx, sz) =>
        sampleGroundHeightAt(sx, sz, rec.tile!, rec.coord))
      tagTreeMesh(
        replacement,
        resolved,
        presence.sizeClass,
        presence.sizeJitter,
        presence.speciesIndex,
        presence.initialStage,
      )

      if (!rec.vegetationExtras) {
        const extras = new THREE.Group()
        extras.name = 'chunk-vegetation-extras'
        scene.add(extras)
        rec.vegetationExtras = extras
      }
      rec.vegetationExtras.add(replacement)
      rebuildColliders(rec)
      return true
    }
    return false
  }

  function recheck(playerX: number, playerZ: number): void {
    lastCheckX = playerX
    lastCheckZ = playerZ
    const playerChunk = worldToChunk(playerX, playerZ, config.chunkSize)
    lastPlayerChunk = playerChunk

    const desired: ChunkCoord[] = []
    for (let dz = -config.loadRadius; dz <= config.loadRadius; dz++) {
      for (let dx = -config.loadRadius; dx <= config.loadRadius; dx++) {
        desired.push({ cx: playerChunk.cx + dx, cz: playerChunk.cz + dz })
      }
    }
    for (const home of config.homeChunks) {
      if (!desired.some((c) => c.cx === home.cx && c.cz === home.cz)) desired.push(home)
    }
    desired.sort(
      (a, b) => chebyshevDistance(a, playerChunk) - chebyshevDistance(b, playerChunk),
    )
    const desiredKeys = new Set(desired.map(chunkKey))

    loadQueue = desired.filter((coord) => !chunks.has(chunkKey(coord)))
    for (const record of [...chunks.values()]) {
      syncGrassForRecord(record, playerChunk)
      syncInstancedLodForRecord(record, playerChunk)
      if (record.pinned || desiredKeys.has(record.key)) continue
      if (chebyshevDistance(record.coord, playerChunk) > config.unloadRadius) unload(record)
    }
  }

  /** Starts up to `CHUNKS_STARTED_PER_FRAME` still-missing chunks from
   *  `loadQueue`, nearest first. Called every frame regardless of the
   *  `recheck()` movement throttle, so the queue keeps draining even while
   *  the player stands still after a big jump (e.g. fast travel, loading a
   *  save far from spawn). */
  function drainLoadQueue(): void {
    let started = 0
    while (started < CHUNKS_STARTED_PER_FRAME && loadQueue.length > 0) {
      const coord = loadQueue.shift()!
      if (chunks.has(chunkKey(coord))) continue
      void ensureLoaded(coord)
      started++
    }
  }

  function update(playerX: number, playerZ: number): void {
    lastUpdateAt = performance.now()
    if (Math.hypot(playerX - lastCheckX, playerZ - lastCheckZ) >= recheckDistance) {
      recheck(playerX, playerZ)
    }
    drainLoadQueue()
    drainFinalizeQueue(CHUNKS_FINALIZED_PER_FRAME)
  }

  /** Resolves once every listed chunk has finished generating (or failed /
   *  cancelled), including mesh *and* content finalization. During gameplay
   *  `update()` drains one stage per frame; at init / rebuild there is no
   *  game loop, so this pumps the queue itself after `GAME_LOOP_IDLE_MS`. */
  async function waitForChunks(coords: ChunkCoord[]): Promise<void> {
    const pending = Promise.all(coords.map((c) => ensureLoaded(c))).then(() => undefined)
    const waiting = {}
    for (;;) {
      const winner = await Promise.race([pending, Promise.resolve(waiting)])
      if (winner !== waiting) return
      if (performance.now() - lastUpdateAt > GAME_LOOP_IDLE_MS) {
        drainFinalizeQueueByBudget(FINALIZE_DRAIN_BUDGET_MS)
      }
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    }
  }

  function readField(
    field: 'heights' | 'floorHeights' | 'biomes' | 'continentalness' | 'mountainRidge' | 'moistureRegion',
    worldX: number,
    worldZ: number,
  ): number {
    const coord = worldToChunk(worldX, worldZ, config.chunkSize)
    const rec = chunks.get(chunkKey(coord))
    if (rec?.state === 'ready' && rec.tile) {
      const o = apronOriginWorld(coord.cx, coord.cz, config.chunkSize, config.resolution)
      return sampleApronGrid(rec.tile[field], o.apronRes, o.x, o.z, o.step, worldX, worldZ)
    }
    switch (field) {
      case 'continentalness':
        return sampleContinentalnessAt(worldX, worldZ, fallbackParams)
      case 'floorHeights':
        return sampleFloorAt(worldX, worldZ, fallbackParams)
      case 'heights':
        return sampleHeightAt(worldX, worldZ, fallbackParams)
      case 'moistureRegion':
        return sampleMoistureRegionAt(worldX, worldZ, fallbackParams)
      case 'mountainRidge':
        return sampleMountainRidgeAt(worldX, worldZ, fallbackParams)
      default:
        return sampleBiomeAt(worldX, worldZ, fallbackParams)
    }
  }

  return {
    update,
    tickWater(dt) {
      for (const rec of chunks.values()) rec.water?.update(dt)
    },
    setWaterDayNight(dayFactor, sunDirection) {
      for (const rec of chunks.values()) rec.water?.setDayNight(dayFactor, sunDirection)
    },
    setWaterReflections(enabled) {
      config.waterMirror.setEnabled(enabled)
    },
    tickGrass(dt) {
      grassSystem.update(dt)
    },
    setGrassDayNight(dayFactor, sunDirection) {
      grassSystem.setDayNight(dayFactor, sunDirection)
    },
    setWeatherSurface(wetness, snowAmount) {
      terrainMaterial.weatherUniforms.uWetness.value = wetness
      terrainMaterial.weatherUniforms.uSnowAmount.value = snowAmount
    },
    sampleHeight: (x, z) => readField('heights', x, z),
    sampleFloor: (x, z) => readField('floorHeights', x, z),
    sampleBiome: (x, z) => readField('biomes', x, z),
    sampleContinentalness: (x, z) => readField('continentalness', x, z),
    sampleMountainRidge: (x, z) => readField('mountainRidge', x, z),
    sampleMoistureRegion: (x, z) => readField('moistureRegion', x, z),
    riverShoreDistance(worldX, worldZ) {
      let best: number | null = null
      for (const rec of chunks.values()) {
        if (!rec.riverChains || rec.riverChains.length === 0) continue
        const segments = riverChannelSegmentsNear(rec.riverChains, worldX, worldZ, RIVER_SHORE_QUERY_SIZE)
        if (segments.length === 0) continue
        const dist = nearestRiverBankDistance(segments, worldX, worldZ)
        if (dist !== null && (best === null || dist < best)) best = dist
      }
      return best
    },
    riverShorePoint(worldX, worldZ) {
      let bestDist: number | null = null
      let bestPoint: { x: number, z: number } | null = null
      for (const rec of chunks.values()) {
        if (!rec.riverChains || rec.riverChains.length === 0) continue
        const segments = riverChannelSegmentsNear(rec.riverChains, worldX, worldZ, RIVER_SHORE_QUERY_SIZE)
        if (segments.length === 0) continue
        const dist = nearestRiverBankDistance(segments, worldX, worldZ)
        if (dist !== null && (bestDist === null || dist < bestDist)) {
          bestDist = dist
          bestPoint = nearestRiverBankPoint(segments, worldX, worldZ)
        }
      }
      return bestPoint
    },
    sampleLocalWater(worldX, worldZ) {
      const coord = worldToChunk(worldX, worldZ, config.chunkSize)
      const rec = chunks.get(chunkKey(coord))
      const riverSegments = rec?.riverChains && rec.riverChains.length > 0
        ? riverChannelSegmentsNear(rec.riverChains, worldX, worldZ, RIVER_SHORE_QUERY_SIZE)
        : []
      return sampleLocalWaterPure(
        readField('heights', worldX, worldZ),
        readField('floorHeights', worldX, worldZ),
        config.waterLevel,
        riverSegments,
        worldX,
        worldZ,
      )
    },
    sampleForestFactor: (x, z) => {
      const h = readField('heights', x, z)
      const altitude01 = Math.max(0, (h - config.waterLevel) / Math.max(config.heightScale, 0.001))
      return forestDensityAt(
        readField('moistureRegion', x, z),
        altitude01,
        readField('continentalness', x, z),
        readField('mountainRidge', x, z),
        config.region,
      )
    },
    sampleForestBiome: (x, z) => {
      const h = readField('heights', x, z)
      const altitude01 = Math.max(0, (h - config.waterLevel) / Math.max(config.heightScale, 0.001))
      return forestBiomeAt(
        forestDensityAt(
          readField('moistureRegion', x, z),
          altitude01,
          readField('continentalness', x, z),
          readField('mountainRidge', x, z),
          config.region,
        ),
      )
    },
    sampleTreeEnv,
    refreshTreeVisual,
    getNearbyTrees(pos, radius) {
      const worldDays = config.getWorldDays()
      return config.treeLifecycle.getNearbyPresence(pos.x, pos.z, radius).map((presence) => {
        const resolved = config.treeLifecycle.resolve(
          presence,
          sampleTreeEnv(presence.x, presence.z),
          worldDays,
        )
        return { ...presence, stage: resolved.stage }
      })
    },
    getNearbyItems(pos, radius) {
      const out: { id: string, kind: ItemKind, x: number, z: number }[] = []
      for (const rec of chunks.values()) {
        if (!rec.items) continue
        for (const child of rec.items.children) {
          const dx = child.position.x - pos.x
          const dz = child.position.z - pos.z
          if (Math.hypot(dx, dz) > radius) continue
          out.push({
            id: child.userData.itemId as string,
            kind: child.userData.itemKind as ItemKind,
            x: child.position.x,
            z: child.position.z,
          })
        }
      }
      return out
    },
    getNearbyCrops(pos, radius) {
      // Resolves stage fresh from the placement's `stageStartedAt` (same
      // "presence data is always fresh, only the mesh visual lags until
      // reload" contract as `getNearbyTrees`) rather than the mesh's cached
      // `userData.cropStage` — interaction/prompt logic must never trust a
      // stale attach-time snapshot.
      const out: { id: string, cropId: CropId, x: number, z: number, stage: CropGrowthStage }[] = []
      const worldDays = config.getWorldDays()
      for (const rec of chunks.values()) {
        if (!rec.tile) continue
        for (const p of [...rec.tile.crops, ...plantedCropsForChunk(rec.coord)]) {
          if (config.removedCropIds.has(p.id)) continue
          const dx = p.x - pos.x
          const dz = p.z - pos.z
          if (Math.hypot(dx, dz) > radius) continue
          const def = CROP_DEFS[p.cropId]
          out.push({
            id: p.id,
            cropId: p.cropId,
            x: p.x,
            z: p.z,
            stage: resolveCropStage(def, p.stageStartedAt, worldDays),
          })
        }
      }
      return out
    },
    getNearbyLandmarks(pos, radius) {
      const out: { id: string, kind: LandmarkKind, x: number, z: number, rotationY: number, scale: number, cemeterySize?: CemeterySize }[] = []
      for (const rec of chunks.values()) {
        if (!rec.tile) continue
        for (const p of rec.tile.environment) {
          if (!p.id) continue
          const dx = p.x - pos.x
          const dz = p.z - pos.z
          if (Math.hypot(dx, dz) > radius) continue
          out.push({
            id: p.id,
            kind: p.kind as LandmarkKind,
            x: p.x,
            z: p.z,
            rotationY: p.rotationY,
            scale: p.scale,
            cemeterySize: p.cemeterySize,
          })
        }
      }
      return out
    },
    findLandmarkNear(kind, worldX, worldZ, maxChunkRadius) {
      const center = worldToChunk(worldX, worldZ, config.chunkSize)
      for (const { dx, dz } of ringChunkOffsets(maxChunkRadius)) {
        const coord: ChunkCoord = { cx: center.cx + dx, cz: center.cz + dz }
        const rec = chunks.get(chunkKey(coord))
        const environment = rec?.tile
          ? rec.tile.environment
          : (() => {
              // Ad-hoc/unloaded-chunk fallback, outside the normal chunk
              // lifecycle — no river tile to retain/release here, so river
              // channel carving is skipped (landmark placement doesn't
              // depend on carved height accuracy).
              const params = paramsFor(coord, [])
              return computeChunkEnvironment(coord, computeChunkTile(params), params, [])
            })()
        const found = environment.find((p) => p.kind === kind && p.id)
        if (found?.id) return { id: found.id, x: found.x, z: found.z }
      }
      return undefined
    },
    collectItem(id) {
      for (const rec of chunks.values()) {
        if (!rec.items) continue
        const mesh = rec.items.children.find((c) => c.userData.itemId === id)
        if (!mesh) continue
        const result = {
          kind: mesh.userData.itemKind as ItemKind,
          x: mesh.position.x,
          z: mesh.position.z,
        }
        mesh.removeFromParent()
        disposeObject3D(mesh)
        config.collectedItemIds.add(id)
        return result
      }
      return null
    },
    harvestCrop(id) {
      const plantedIndex = config.plantedCrops.findIndex((p) => p.id === id)
      for (const rec of chunks.values()) {
        if (!rec.crops || !rec.tile) continue
        const mesh = rec.crops.children.find((c) => c.userData.cropId === id)
        if (!mesh) continue
        const placement = rec.tile.crops.find((p) => p.id === id) ?? (plantedIndex >= 0 ? config.plantedCrops[plantedIndex] : undefined)
        if (!placement) return { ok: false, reason: 'unknown-crop' }
        const def = CROP_DEFS[placement.cropId]
        const stage = resolveCropStage(def, placement.stageStartedAt, config.getWorldDays())
        const harvestYield = resolveCropHarvest(def, stage)
        if (!harvestYield) return { ok: false, reason: 'no-yield' }
        mesh.removeFromParent()
        disposeObject3D(mesh)
        // A planted crop's persistent record *is* its presence (implementation
        // notes §6/§14) — harvest removes it outright. `removedCropIds` only
        // makes sense for a wild crop, whose deterministic generator would
        // otherwise recreate it on the next chunk load.
        if (plantedIndex >= 0) config.plantedCrops.splice(plantedIndex, 1)
        else config.removedCropIds.add(id)
        return { ok: true, yield: harvestYield }
      }
      return { ok: false, reason: 'unknown-crop' }
    },
    plantTree(x, z, rotationY) {
      const coord = worldToChunk(x, z, config.chunkSize)
      const rec = chunks.get(chunkKey(coord))
      if (!rec || !rec.tile || rec.state !== 'ready') return null
      const env = sampleTreeEnv(x, z)
      const speciesIndex = pickPlantedTreeSpecies(env, Math.random())
      const sizeClass: TreeSizeClass = rollSizeClass(Math.random())
      const sizeJitter = Math.random()
      const id = makePlantedTreeId(config.seed, x, z)
      if (config.treeLifecycle.getPresence(id) || config.plantedTrees.some((r) => r.id === id)) return null
      const record: PlantedTreeRecord = { id, x, z, speciesIndex, sizeClass, sizeJitter, rotationY }
      config.plantedTrees.push(record)
      const presence: TreePresence = { id, x, z, speciesIndex, initialStage: 'sapling', sizeClass, sizeJitter }
      config.treeLifecycle.registerPresence(presence)
      // Anchors this tree's growth clock at the moment it was planted rather
      // than at world day 0 — the one thing `registerPresence` alone can't do
      // (implementation notes §1/§25).
      config.treeLifecycle.setOverride(id, { stage: 'sapling', stageStartedAt: config.getWorldDays() })
      rec.treeIds = [...(rec.treeIds ?? []), id]
      if (!rec.treeYaw) rec.treeYaw = new Map()
      rec.treeYaw.set(id, rotationY)

      // Renders immediately as a plain `vegetationExtras` Object3D — the same
      // fallback `refreshTreeVisual` already uses for any tree that needs a
      // runtime (not bulk-generation-time) visual, simpler than re-inserting
      // into an already-built region-batcher instance buffer. It migrates
      // into the normal batched `tree-living` path automatically the next
      // time this chunk reloads (merged into `treePlacements` above).
      const resolved = config.treeLifecycle.resolve(presence, env, config.getWorldDays())
      const prop = createTreeStageMesh(resolved.visual, resolved.scale, id)
      prop.rotation.y = rotationY
      placeOnGround(prop, x, z, (sx, sz) => readField('heights', sx, sz))
      tagTreeMesh(prop, resolved, sizeClass, sizeJitter, speciesIndex, 'sapling')
      if (!rec.vegetationExtras) {
        const extras = new THREE.Group()
        extras.name = 'chunk-vegetation-extras'
        scene.add(extras)
        rec.vegetationExtras = extras
      }
      rec.vegetationExtras.add(prop)
      rebuildColliders(rec)
      return { id }
    },
    plantCrop(x, z, cropId) {
      const coord = worldToChunk(x, z, config.chunkSize)
      const rec = chunks.get(chunkKey(coord))
      if (!rec || !rec.tile || rec.state !== 'ready') return null
      const worldDays = config.getWorldDays()
      const id = makePlantedCropId(config.seed, x, z)
      if (config.plantedCrops.some((p) => p.id === id)) return null
      const record: CropPlacement = { id, x, z, cropId, stageStartedAt: worldDays }
      config.plantedCrops.push(record)

      const def = CROP_DEFS[cropId]
      const stage = resolveCropStage(def, record.stageStartedAt, worldDays)
      const cropMesh = createCropStageMesh(def.harvestItem, stage)
      cropMesh.userData.cropId = id
      cropMesh.userData.cropDefId = cropId
      cropMesh.userData.cropStage = stage
      placeOnGround(cropMesh, x, z, (sx, sz) => readField('heights', sx, sz))
      assignRenderLayer(cropMesh, REFLECTION_SKIPPED_LAYER)
      if (!rec.crops) {
        rec.crops = new THREE.Group()
        rec.crops.name = 'chunk-crops'
        scene.add(rec.crops)
      }
      rec.crops.add(cropMesh)
      return { id }
    },
    modifyTerrain(x, z, radius, depth, source) {
      const mod: TerrainModification = { x, z, radius, depth, mode: 'dig', source }
      modifications.push(mod)
      modificationsEpoch++
      let touchedAny = false
      for (const rec of chunks.values()) {
        if (rec.state !== 'ready' || !rec.tile) continue
        const touched = applyModificationToTile(rec.tile, rec.coord, config.chunkSize, config.resolution, mod)
        if (!touched) continue
        touchedAny = true
        // Fire-and-forget — the mesh (a worker round-trip, plan
        // world-terrain-004) attaches asynchronously a moment later; this
        // call's own return value only reflects the synchronous grid write.
        buildAndAttachMesh(rec, rec.tile).catch((err: unknown) => logMeshRebuildFailure('dig', err))
        // Dug/mounded ground doesn't keep its grass — same roadTint-based
        // grass-reject `scorchTerrain` below uses; rebuild so a fresh
        // hole/mound doesn't still show blades growing over it.
        removeGrass(rec)
        if (config.grass.enabled) ensureGrass(rec)
      }
      return touchedAny
    },
    scorchTerrain(x, z, radius, depth, source) {
      const mod: TerrainModification = { x, z, radius, depth, mode: 'scorch', source }
      modifications.push(mod)
      modificationsEpoch++
      let touchedAny = false
      for (const rec of chunks.values()) {
        if (rec.state !== 'ready' || !rec.tile) continue
        const touched = applyModificationToTile(rec.tile, rec.coord, config.chunkSize, config.resolution, mod)
        if (!touched) continue
        touchedAny = true
        buildAndAttachMesh(rec, rec.tile).catch((err: unknown) => logMeshRebuildFailure('scorch', err))
        // Grass was placed against the pre-scorch `roadTint`; rebuild so the
        // burned patch actually thins blades instead of leaving green cover.
        removeGrass(rec)
        if (config.grass.enabled) ensureGrass(rec)
      }
      return touchedAny
    },
    applyExactHeights(id, samples) {
      const mod: TerrainModification = { x: 0, z: 0, radius: 0, depth: 0, mode: 'prepare', id, samples, source: 'player' }
      const existingIndex = modifications.findIndex((m) => m.mode === 'prepare' && m.id === id)
      if (existingIndex >= 0) modifications[existingIndex] = mod
      else modifications.push(mod)
      modificationsEpoch++
      let touchedAny = false
      for (const rec of chunks.values()) {
        if (rec.state !== 'ready' || !rec.tile) continue
        const touched = applyModificationToTile(rec.tile, rec.coord, config.chunkSize, config.resolution, mod)
        if (!touched) continue
        touchedAny = true
        buildAndAttachMesh(rec, rec.tile).catch((err: unknown) => logMeshRebuildFailure('terrain preparation', err))
        // Same "grass was placed against the pre-modification roadTint,
        // rebuild so worked ground actually thins blades" reasoning as
        // `scorchTerrain` above.
        removeGrass(rec)
        if (config.grass.enabled) ensureGrass(rec)
      }
      return touchedAny
    },
    sampleBaseHeight: (x, z) => sampleHeightAt(x, z, fallbackParams),
    seed: config.seed,
    chunkSize: config.chunkSize,
    resolution: config.resolution,
    waterLevel: config.waterLevel,
    region: config.region,
    loadedChunkCount: () => chunks.size,
    waitForChunks,
    roadCorridorsNear(worldX, worldZ, querySize) {
      const village = villageSegmentsNear(worldX, worldZ, querySize, roadCtx)
      return [...segmentsNear(worldX, worldZ, querySize, roadCtx), ...village.paths]
    },
    setTerrainCastsShadow(value) {
      config.terrainCastsShadow = value
      for (const record of chunks.values()) {
        if (record.mesh) record.mesh.castShadow = value
      }
    },
    setLodScale(scale) {
      lodScale = Math.min(1, Math.max(0.25, scale))
      for (const record of chunks.values()) {
        syncInstancedLodForRecord(record, lastPlayerChunk)
        if (record.grass) {
          const dist = chebyshevDistance(record.coord, lastPlayerChunk)
          const { mainFrac, fillerFrac } = grassLodForDistance(dist)
          record.grass.setLodFraction(mainFrac, fillerFrac)
        }
      }
    },
    setGrassFillerCoverage(coverage) {
      grassFillerCoverage = Math.min(1, Math.max(0, coverage))
      for (const record of chunks.values()) {
        if (!record.grass) continue
        const dist = chebyshevDistance(record.coord, lastPlayerChunk)
        const { mainFrac, fillerFrac } = grassLodForDistance(dist)
        record.grass.setLodFraction(mainFrac, fillerFrac)
      }
    },
    setDetailedGrassDebugVisible(visible) {
      detailedGrassDebugVisible = visible
      for (const record of chunks.values()) {
        if (record.grass) applyGrassDebugVisibility(record.grass)
      }
    },
    setFillerGrassDebugVisible(visible) {
      fillerGrassDebugVisible = visible
      for (const record of chunks.values()) {
        if (record.grass) applyGrassDebugVisibility(record.grass)
      }
    },
    collidersNear: (x, z) => colliderRegistry.query(x, z),
    registerColliders: (ownerKey, colliders) => colliderRegistry.setColliders(ownerKey, colliders),
    clearColliders: (ownerKey) => colliderRegistry.clearColliders(ownerKey),
    dispose() {
      for (const record of [...chunks.values()]) unload(record)
      vegetationRegionBatcher.dispose()
      riverTileCache.disposeAll()
      grassSystem.dispose()
      terrainMaterial.dispose()
      meshDataCache.clear()
    },
  }
}
