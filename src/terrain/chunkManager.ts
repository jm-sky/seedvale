import * as THREE from 'three'
import type { DetailNormalConfig } from '../config/worldConfig'
import type { HeightSampler } from '../player/PlayerController'
import type { TreeEnvSample, TreeGrowthStage, TreeLifecycle, TreePresence } from '../world/treeLifecycle'
import type { WaterMirror } from '../world/waterMirror'
import type { ChunkTileResult, GrassRequestParams } from './chunkHeightmapProtocol'
import type { FbmParams } from './fbm'
import { disposeObject3D } from '../assets/loadGltf'
import { isSystemEnabled } from '../debug/debugMode'
import { createItemMesh, type ItemKind } from '../items/items'
import { getMonitor } from '../perf/active'
import { buildInstancedProps, type InstancedPropGroup, type PropPlacement } from '../render/instancedProps'
import {
  BUSH_SPECS,
  CACTUS_SPECS,
  CEMETERY_SPECS,
  createBush,
  createCactus,
  createCampfire,
  createCemetery,
  createCemeteryPlot,
  createFallenLog,
  createGraveStone,
  createLargeRock,
  createMonolith,
  createReed,
  createRockCluster,
  createSmallRuins,
  createStoneCircle,
  createTree,
  FALLEN_LOG_SPECS,
  GRAVE_SPECS,
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
import { createChunkWater, type WorldWater } from '../world/createWater'
import { createTreeStageMesh, tagTreeMesh } from '../world/treeVisuals'
import { biomeWeightsAt, forestDensityAt } from './biomeRegions'
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
  type RoadCorridorSegment,
  sampleApronGrid,
  sampleBiomeAt,
  sampleContinentalnessAt,
  sampleFloorAt,
  sampleHeightAt,
  sampleMoistureRegionAt,
  sampleMountainRidgeAt,
} from './chunkHeightmap'
import {
  cancelChunkGrass,
  cancelChunkTile,
  HeightmapGenerationCancelledError,
  requestChunkGrass,
  requestChunkTile,
} from './chunkWorkerPool'
import { densityLodFraction, grassFillerLodFraction } from './distanceLod'
import { createGrassSystem, type WorldGrassChunk } from './grass'

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
): TemplateCache {
  let promise: Promise<THREE.Object3D[]> | null = null
  let value: THREE.Object3D[] | null = null
  return {
    start() {
      promise ??= loadPropTemplates(specs, fallback).then(
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
  void getRockTemplates.start()
  void getRockClusterTemplates.start()
  void getFallenLogTemplates.start()
  void getCemeteryTemplates.start()
  void getGraveTemplates.start()
  void preloadCampfireTemplates()
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
  water?: WorldWater | null
  /** Bush/cactus/reed (faza 3/087) — no per-instance runtime state, so these
   *  are instanced (one `InstancedPropGroup` per kind present in this
   *  chunk). */
  vegetationInstances?: InstancedPropGroup[]
  /** Living trees (faza 4/087) — instanced, keyed by `treeId` so a single
   *  tree can be swap-removed on chop/refresh without rebuilding the whole
   *  bucket (`InstancedPropGroup.removeByKey`). */
  treeInstances?: InstancedPropGroup
  /** Non-living tree stage meshes (limbed/felled/stump) — few and mutated
   *  individually, so never instanced (plan 087 §2.3/§2.5). Also receives
   *  whatever `refreshTreeVisual` swaps a tree into afterward, including a
   *  regrown sapling: once a tree needs a runtime refresh it stays a plain
   *  `Object3D` here rather than re-joining `treeInstances`. */
  vegetationExtras?: THREE.Group
  /** `treeId` -> placement yaw — the one piece of tree identity `TreePresence`
   *  doesn't carry (see `TreeLifecycle.getPresence`), needed by
   *  `refreshTreeVisual` to re-place a tree it no longer has a mesh for. */
  treeYaw?: Map<string, number>
  items?: THREE.Group
  /** Procedural-only landmark kinds (campfire/monolith/stoneCircle/smallRuins/
   *  cemetery) — geometry is built per placement, not from a shared template, so these
   *  stay unbatched (plan 087 §2.5). Cemetery clones GLB graves into one Group. */
  environment?: THREE.Group
  /** GLB environment kinds (largeRock/rockCluster/fallenLog, faza 5/087) —
   *  no runtime state, same "simplest case" instancing as `vegetationInstances`. */
  environmentInstances?: InstancedPropGroup[]
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
  /** 0 (open / poor forest habitat) – 1 (dense forest) continuous suitability
   *  at (x, z) via `forestDensityAt` (`biomeRegions.ts`) — same signal
   *  `chunkVegetation.ts` uses for tree-density modulation. Runtime bridge
   *  for fauna (`createFauna.ts`) and other habitat consumers (plan 063). */
  sampleForestFactor: (x: number, z: number) => number
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
  /** Procedural landmarks (`monolith`/`stoneCircle`/`smallRuins`/`cemetery`)
   *  within `radius` of `pos` among currently loaded chunks — same "loaded
   *  chunks only" contract as `getNearbyItems` (plan 132), used for `[E]`
   *  interaction targeting. */
  getNearbyLandmarks: (
    pos: { x: number, z: number },
    radius: number,
  ) => { id: string, kind: LandmarkKind, x: number, z: number }[]
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
   *  is currently standing near, always loaded). Not persisted across saves
   *  (plan 052 explicitly scopes persistence out). */
  modifyTerrain: (x: number, z: number, radius: number, depth: number) => boolean
  /** Burned-ground overlay (plan 137) — shallow dip + `roadTint` bump so grass
   *  thins, plus charcoal vertex tint on the next mesh rebuild. Same runtime
   *  modification list as `modifyTerrain` (reapplied on chunk reload). Also
   *  rebuilds grass on touched chunks so blades don't linger in the scorch. */
  scorchTerrain: (x: number, z: number, radius: number, depth: number) => boolean
  /** Raises terrain toward the procedural base (never above it) — "Wyrównaj".
   *  Same runtime overlay as `modifyTerrain`; returns false if nothing changed. */
  levelTerrain: (x: number, z: number, radius: number, maxRaise: number) => boolean
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
  /** `'dig'` lowers; `'level'` raises toward `sampleBase` and never above it;
   *  `'scorch'` is a shallow dip plus a `roadTint` / charcoal-color burn patch
   *  (plan 137). */
  mode: 'dig' | 'level' | 'scorch'
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
 *  math, no scene/worker dependency, unlike the rest of this module.
 *  `sampleBase` is required for `mode: 'level'` (procedural height clamp). */
export function applyModificationToTile(
  tile: ChunkTileResult,
  coord: ChunkCoord,
  chunkSize: number,
  resolution: number,
  mod: TerrainModification,
  sampleBase?: HeightSampler,
): boolean {
  const o = apronOriginWorld(coord.cx, coord.cz, chunkSize, resolution)
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
      if (mod.mode === 'level') {
        if (!sampleBase) continue
        const base = sampleBase(wx, wz)
        const next = Math.min(prev + mod.depth * falloff, base)
        if (next <= prev + 1e-6) continue
        tile.heights[idx] = next
      } else {
        tile.heights[idx] = prev - mod.depth * falloff
        if (mod.mode === 'scorch') {
          // Visual mesh Y reads `floorHeights`; bump it too so the dip shows.
          if (tile.floorHeights) {
            tile.floorHeights[idx] = tile.floorHeights[idx]! - mod.depth * falloff
          }
          // Reuse the road-corridor grass fade (`ROAD_TINT_FADE_*`) so scorched
          // ground thins blades without a second grass-reject path.
          if (tile.roadTint) {
            tile.roadTint[idx] = Math.max(tile.roadTint[idx]!, falloff)
          }
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

export function createChunkManager(
  scene: THREE.Scene,
  config: ChunkManagerConfig,
): ChunkManager {
  const chunks = new Map<string, ChunkRecord>()
  const modifications: TerrainModification[] = []
  const grassSystem = createGrassSystem()
  // Single collision index for the whole world (plan 097 §2.2) — terrain
  // chunks register/clear their own colliders keyed by `chunkKey` below;
  // settlements (outside this manager entirely) register theirs keyed by
  // their own id through `registerColliders`/`clearColliders`.
  const colliderRegistry = createColliderRegistry(config.chunkSize)
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

  function paramsFor(coord: ChunkCoord): ChunkTileParams {
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
      },
      roadSegments: [...segmentsNear(x, z, config.chunkSize, roadCtx), ...village.paths],
      clearings: village.clearings,
      regional: village.regional,
    }
  }

  function isHomeChunk(coord: ChunkCoord): boolean {
    return config.homeChunks.some((h) => h.cx === coord.cx && h.cz === coord.cz)
  }

  let lastPlayerChunk: ChunkCoord = { cx: 0, cz: 0 }
  let lodScale = Math.min(1, Math.max(0.25, config.lodScale ?? 1))

  /** Cheap distance LOD: render fewer blades in farther chunks. Near stays
   *  full density; far drops to ~8% (plan 113 P2) instead of the old ~25%
   *  floor. Short filler blades only in the player's chunk + immediate ring
   *  (issue 023). `lodScale` (plan 103) multiplies the curve without changing
   *  generation density. */
  function grassLodForDistance(dist: number): { mainFrac: number, fillerFrac: number } {
    return {
      mainFrac: densityLodFraction(dist, effectiveGrassRadius, lodScale),
      fillerFrac: grassFillerLodFraction(dist, lodScale),
    }
  }

  /** Same prefix-`count` curve as grass, scaled to `loadRadius` because
   *  instanced vegetation/rocks live on every loaded chunk (unlike grass,
   *  which has its own smaller radius). Recovers the triangle-count
   *  regression from losing per-object frustum culling (plan 087 faza 7 / R3). */
  function vegetationLodForDistance(dist: number): number {
    return densityLodFraction(dist, config.loadRadius, lodScale)
  }

  function syncInstancedLodForRecord(record: ChunkRecord, playerChunk: ChunkCoord): void {
    const frac = vegetationLodForDistance(chebyshevDistance(record.coord, playerChunk))
    record.treeInstances?.setLodFraction(frac)
    if (record.vegetationInstances) {
      for (const group of record.vegetationInstances) group.setLodFraction(frac)
    }
    if (record.environmentInstances) {
      for (const group of record.environmentInstances) group.setLodFraction(frac)
    }
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
          const { mainFrac, fillerFrac } = grassLodForDistance(dist)
          grass.setLodFraction(mainFrac, fillerFrac)
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
      const { mainFrac, fillerFrac } = grassLodForDistance(dist)
      record.grass?.setLodFraction(mainFrac, fillerFrac)
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

  /** (Re)builds a chunk record's mesh from its current (possibly
   *  dig-modified) tile — disposes the previous mesh first if there is one,
   *  so it doubles as the initial build (`ensureLoaded`) and a post-dig
   *  rebuild (`modifyTerrain`) without duplicating the `buildChunkGeometry`
   *  call. */
  function buildAndAttachMesh(rec: ChunkRecord, tile: ChunkTileResult): void {
    rec.mesh?.removeFromParent()
    rec.meshDispose?.()
    const { x, z } = chunkCenter(rec.coord, config.chunkSize)
    const scorches = modifications.filter((m) => m.mode === 'scorch')
    const { mesh, dispose } = buildChunkGeometry(
      tile,
      config.resolution,
      config.chunkSize,
      x,
      z,
      config.waterLevel,
      config.heightScale,
      terrainMaterial,
      config.region,
      config.seed,
      config.terrainCastsShadow,
      scorches,
    )
    scene.add(mesh)
    rec.mesh = mesh
    rec.meshDispose = dispose
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

  /** Sync — both stages run without `await`, so continuations cannot stampede
   *  when a shared GLB promise resolves (plan 119). */
  function runFinalize(rec: ChunkRecord): void {
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
        attachChunkMesh(rec, tile)
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
   *  (not at enqueue) so a modification while queued still reaches the mesh. */
  function attachChunkMesh(rec: ChunkRecord, tile: ChunkTileResult): void {
    const coord = rec.coord
    for (const mod of modifications) {
      applyModificationToTile(
        tile,
        coord,
        config.chunkSize,
        config.resolution,
        mod,
        (wx, wz) => sampleHeightAt(wx, wz, fallbackParams),
      )
    }
    const streamT0 = performance.now()
    buildAndAttachMesh(rec, tile)
    getMonitor().recordHitch('STREAMING', performance.now() - streamT0, 'chunk mesh')

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

    rec.state = 'ready'
    syncGrassForRecord(rec, lastPlayerChunk)
  }

  /** Vegetation / items / environment / colliders. Caller guarantees the
   *  needed GLB templates are already in cache (`contentTemplatesReady`). */
  function attachChunkContent(rec: ChunkRecord, tile: ChunkTileResult): void {
    const coord = rec.coord
    const o = apronOriginWorld(coord.cx, coord.cz, config.chunkSize, config.resolution)
    const sampleTileHeight: HeightSampler = (sx, sz) =>
      sampleApronGrid(tile.heights, o.apronRes, o.x, o.z, o.step, sx, sz)

    if (tile.vegetation.length > 0) {
      const treeTemplates = getTreeTemplates.peek() ?? []
      const bushTemplates = getBushTemplates.peek() ?? []
      const cactusTemplates = getCactusTemplates.peek() ?? []
      const reedTemplates = getReedTemplates.peek() ?? []

      const vegT0 = performance.now()
      const treeIds: string[] = []
      const treeYaw = new Map<string, number>()
      const treePlacements = tile.vegetation.filter((p) => p.kind === 'tree')
      const livingTreePlacements: PropPlacement[] = []
      const extras = new THREE.Group()
      extras.name = 'chunk-vegetation-extras'
      let hasExtras = false

      for (const placement of treePlacements) {
        const initialStage = placement.growthStage ?? 'mature'
        const sizeClass = placement.sizeClass ?? 'medium'
        const sizeJitter = placement.sizeJitter ?? placement.scale
        const id = config.treeLifecycle.makeId(placement.x, placement.z, placement.speciesIndex)
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
      const treeInstances = buildInstancedProps(
        treeTemplates,
        livingTreePlacements,
        'chunk-vegetation-tree-living',
      )
      if (treeInstances) {
        if (isSystemEnabled('trees')) scene.add(treeInstances.group)
        rec.treeInstances = treeInstances
      }

      const instancedTemplatesByKind = {
        bush: bushTemplates,
        cactus: cactusTemplates,
        reed: reedTemplates,
      }
      const vegetationInstances: InstancedPropGroup[] = []
      for (const kind of ['bush', 'cactus', 'reed'] as const) {
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
        const instanced = buildInstancedProps(
          instancedTemplatesByKind[kind],
          propPlacements,
          `chunk-vegetation-${kind}`,
        )
        if (instanced) {
          scene.add(instanced.group)
          vegetationInstances.push(instanced)
        }
      }
      if (vegetationInstances.length > 0) rec.vegetationInstances = vegetationInstances
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
    getMonitor().recordHitch('PROPS', performance.now() - itemsT0, 'chunk items')

    const rockTemplates = getRockTemplates.peek()
    const rockClusterTemplates = getRockClusterTemplates.peek()
    const fallenLogTemplates = getFallenLogTemplates.peek()
    const cemeteryPlot = getCemeteryTemplates.peek()?.[0]
    const graveTemplates = getGraveTemplates.peek() ?? undefined

    const envT0 = performance.now()
    const proceduralEnvPlacements = tile.environment.filter((p) => !GLB_ENV_KINDS.has(p.kind))
    rec.environment = buildPlacementGroup('chunk-environment', proceduralEnvPlacements, (placement) => {
      const prop =
        placement.kind === 'cemetery'
          ? createCemetery(placement.scale, placement.variant, {
              plot: cemeteryPlot,
              graves: graveTemplates,
            })
          : createProceduralEnvironmentProp(placement.kind, placement.scale, placement.variant)
      prop.rotation.y = placement.rotationY
      placeOnGround(prop, placement.x, placement.z, sampleTileHeight)
      return prop
    })

    const envInstancedSources: { kind: EnvironmentKind, templates: THREE.Object3D[] | null }[] = [
      { kind: 'largeRock', templates: rockTemplates },
      { kind: 'rockCluster', templates: rockClusterTemplates },
      { kind: 'fallenLog', templates: fallenLogTemplates },
    ]
    const environmentInstances: InstancedPropGroup[] = []
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
      const instanced = buildInstancedProps(templates, propPlacements, `chunk-environment-${kind}`)
      if (instanced) {
        scene.add(instanced.group)
        environmentInstances.push(instanced)
      }
    }
    if (environmentInstances.length > 0) rec.environmentInstances = environmentInstances
    syncInstancedLodForRecord(rec, lastPlayerChunk)
    getMonitor().recordHitch('PROPS', performance.now() - envT0, 'chunk environment')
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

    const promise = requestChunkTile(key, paramsFor(coord))
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
      if (radius > 0) colliders.push({ x: p.x, z: p.z, radius: radius * p.scale })
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
        colliders.push({ x: presence.x, z: presence.z, radius: TREE_COLLISION_RADIUS })
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
    colliderRegistry.clearColliders(record.key)
    if (record.treeIds) {
      for (const id of record.treeIds) config.treeLifecycle.unregisterPresence(id)
      record.treeIds = undefined
    }
    record.treeYaw = undefined
    record.mesh?.removeFromParent()
    record.meshDispose?.()
    record.water?.dispose()
    removeGrass(record)
    if (record.vegetationExtras) {
      disposeObject3D(record.vegetationExtras)
      record.vegetationExtras.removeFromParent()
      record.vegetationExtras = undefined
    }
    if (record.treeInstances) {
      record.treeInstances.dispose()
      record.treeInstances = undefined
    }
    if (record.vegetationInstances) {
      for (const instanced of record.vegetationInstances) instanced.dispose()
      record.vegetationInstances = undefined
    }
    if (record.items) {
      disposeObject3D(record.items)
      record.items.removeFromParent()
    }
    if (record.environment) {
      disposeObject3D(record.environment)
      record.environment.removeFromParent()
    }
    if (record.environmentInstances) {
      for (const instanced of record.environmentInstances) instanced.dispose()
      record.environmentInstances = undefined
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
    }
  }

  /** Rebuild one tree's visual after a lifecycle change (chop step, stump
   *  regrowth). Living trees load in as instances (`rec.treeInstances`, no
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

      const wasInstance = rec.treeInstances?.removeByKey(treeId) ?? false
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
    getNearbyLandmarks(pos, radius) {
      const out: { id: string, kind: LandmarkKind, x: number, z: number }[] = []
      for (const rec of chunks.values()) {
        if (!rec.tile) continue
        for (const p of rec.tile.environment) {
          if (!p.id) continue
          const dx = p.x - pos.x
          const dz = p.z - pos.z
          if (Math.hypot(dx, dz) > radius) continue
          out.push({ id: p.id, kind: p.kind as LandmarkKind, x: p.x, z: p.z })
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
              const params = paramsFor(coord)
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
    modifyTerrain(x, z, radius, depth) {
      const mod: TerrainModification = { x, z, radius, depth, mode: 'dig' }
      modifications.push(mod)
      let touchedAny = false
      for (const rec of chunks.values()) {
        if (rec.state !== 'ready' || !rec.tile) continue
        const touched = applyModificationToTile(rec.tile, rec.coord, config.chunkSize, config.resolution, mod)
        if (!touched) continue
        touchedAny = true
        buildAndAttachMesh(rec, rec.tile)
      }
      return touchedAny
    },
    scorchTerrain(x, z, radius, depth) {
      const mod: TerrainModification = { x, z, radius, depth, mode: 'scorch' }
      modifications.push(mod)
      let touchedAny = false
      for (const rec of chunks.values()) {
        if (rec.state !== 'ready' || !rec.tile) continue
        const touched = applyModificationToTile(rec.tile, rec.coord, config.chunkSize, config.resolution, mod)
        if (!touched) continue
        touchedAny = true
        buildAndAttachMesh(rec, rec.tile)
        // Grass was placed against the pre-scorch `roadTint`; rebuild so the
        // burned patch actually thins blades instead of leaving green cover.
        removeGrass(rec)
        if (config.grass.enabled) ensureGrass(rec)
      }
      return touchedAny
    },
    levelTerrain(x, z, radius, maxRaise) {
      const mod: TerrainModification = { x, z, radius, depth: maxRaise, mode: 'level' }
      modifications.push(mod)
      const sampleBase: HeightSampler = (wx, wz) => sampleHeightAt(wx, wz, fallbackParams)
      let touchedAny = false
      for (const rec of chunks.values()) {
        if (rec.state !== 'ready' || !rec.tile) continue
        const touched = applyModificationToTile(
          rec.tile,
          rec.coord,
          config.chunkSize,
          config.resolution,
          mod,
          sampleBase,
        )
        if (!touched) continue
        touchedAny = true
        buildAndAttachMesh(rec, rec.tile)
      }
      return touchedAny
    },
    sampleBaseHeight: (x, z) => sampleHeightAt(x, z, fallbackParams),
    seed: config.seed,
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
    collidersNear: (x, z) => colliderRegistry.query(x, z),
    registerColliders: (ownerKey, colliders) => colliderRegistry.setColliders(ownerKey, colliders),
    clearColliders: (ownerKey) => colliderRegistry.clearColliders(ownerKey),
    dispose() {
      for (const record of [...chunks.values()]) unload(record)
      grassSystem.dispose()
      terrainMaterial.dispose()
    },
  }
}
