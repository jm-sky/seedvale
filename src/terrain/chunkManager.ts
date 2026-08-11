import * as THREE from 'three'
import type { DetailNormalConfig } from '../config/worldConfig'
import type { HeightSampler } from '../player/PlayerController'
import type { TreeEnvSample, TreeGrowthStage, TreeLifecycle, TreePresence } from '../world/treeLifecycle'
import type { EnvironmentKind } from './chunkEnvironment'
import type { ChunkTileResult } from './chunkHeightmapProtocol'
import type { FbmParams } from './fbm'
import { disposeObject3D } from '../assets/loadGltf'
import { createItemMesh, type ItemKind } from '../items/items'
import {
  BUSH_SPECS,
  CACTUS_SPECS,
  cloneProp,
  clonePropWithYaw,
  createBush,
  createCactus,
  createCampfire,
  createFallenLog,
  createLargeRock,
  createMonolith,
  createReed,
  createRockCluster,
  createSmallRuins,
  createStoneCircle,
  createTree,
  FALLEN_LOG_SPECS,
  loadPropTemplates,
  placeOnGround,
  REED_SPECS,
  ROCK_CLUSTER_SPECS,
  ROCK_SPECS,
  TREE_SPECS,
} from '../settlement/props'
import { type RoadNetworkContext, segmentsNear, villageSegmentsNear } from '../settlement/roadNetwork'
import { createChunkWater, type WorldWater } from '../world/createWater'
import { createTreeStageMesh, tagTreeMesh } from '../world/treeVisuals'
import { biomeWeightsAt, forestDensityAt } from './biomeRegions'
import { buildChunkGeometry } from './buildChunkGeometry'
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
  cancelChunkTile,
  HeightmapGenerationCancelledError,
  requestChunkTile,
} from './chunkWorkerPool'
import { createGrassSystem, type WorldGrassChunk } from './grass'

// Loaded once and reused across every chunk (GLTF loader also caches by URL, but
// this avoids rebuilding the template array + re-running `prepareProp` per chunk).
function memoTemplates(
  specs: Parameters<typeof loadPropTemplates>[0],
  fallback: () => THREE.Object3D,
): () => Promise<THREE.Object3D[]> {
  let promise: Promise<THREE.Object3D[]> | null = null
  return () => (promise ??= loadPropTemplates(specs, fallback))
}
const getTreeTemplates = memoTemplates(TREE_SPECS, () => createTree(1))
const getBushTemplates = memoTemplates(BUSH_SPECS, () => createBush(1))
const getCactusTemplates = memoTemplates(CACTUS_SPECS, () => createCactus(1))
const getReedTemplates = memoTemplates(REED_SPECS, () => createReed(1))
const getRockTemplates = memoTemplates(ROCK_SPECS, () => createLargeRock(1))
const getRockClusterTemplates = memoTemplates(ROCK_CLUSTER_SPECS, () => createRockCluster(1))
const getFallenLogTemplates = memoTemplates(FALLEN_LOG_SPECS, () => createFallenLog(1))

const GLB_ENV_KINDS = new Set<EnvironmentKind>(['fallenLog', 'largeRock', 'rockCluster'])

/** Procedural decorative prop for landmark kinds that stay non-GLB
 *  (campfire / monolith / ruins / stone circle). Rocks and fallen logs use
 *  memoized GLB templates with these as `loadPropTemplates` fallbacks. */
function createProceduralEnvironmentProp(
  kind: EnvironmentKind,
  scale: number,
  variant: number,
): THREE.Object3D {
  switch (kind) {
    case 'campfire':
      return createCampfire(scale)
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
  /** Living-forest lifecycle (plan 058) — sparse overrides + canopy queries. */
  treeLifecycle: TreeLifecycle
  /** Absolute game-days (`DayNightState.elapsedDays`) for lazy growth resolve. */
  getWorldDays: () => number
}

type ChunkState = 'generating' | 'ready'
type ChunkRecord = {
  coord: ChunkCoord
  key: string
  state: ChunkState
  pinned: boolean
  tile?: ChunkTileResult
  mesh?: THREE.Mesh
  meshDispose?: () => void
  water?: WorldWater | null
  vegetation?: THREE.Group
  items?: THREE.Group
  environment?: THREE.Group
  /** TreeIds registered into `treeLifecycle` for this chunk — cleared on unload. */
  treeIds?: string[]
  /** `undefined` = not yet decided (chunk not ready or outside grass radius);
   *  `null` = decided ineligible (no blades survived rejection, e.g. all rock/sand). */
  grass?: WorldGrassChunk | null
  pendingPromise?: Promise<void>
}

export type ChunkManager = {
  /** Cheap to call every frame — internally throttled to a recheck distance. */
  update: (playerX: number, playerZ: number) => void
  tickWater: (dt: number) => void
  setWaterDayNight: (dayFactor: number) => void
  tickGrass: (dt: number) => void
  setGrassDayNight: (dayFactor: number, sunDirection: THREE.Vector3) => void
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
  loadedChunkCount: () => number
  /** Resolves once every listed chunk has finished generating (or failed/cancelled). */
  waitForChunks: (coords: ChunkCoord[]) => Promise<void>
  /** Road/path corridors near a world point — same merge as `paramsFor`
   *  (`segmentsNear` + village house↔core paths). Used by fauna spawners to
   *  avoid placing on roads without needing a loaded chunk's `roadTint`. */
  roadCorridorsNear: (worldX: number, worldZ: number, querySize: number) => RoadCorridorSegment[]
  dispose: () => void
}

export type TerrainModification = {
  x: number
  z: number
  radius: number
  depth: number
  /** `'dig'` lowers; `'level'` raises toward `sampleBase` and never above it. */
  mode: 'dig' | 'level'
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
      }
      touched = true
    }
  }
  return touched
}

export function createChunkManager(
  scene: THREE.Scene,
  config: ChunkManagerConfig,
): ChunkManager {
  const chunks = new Map<string, ChunkRecord>()
  const modifications: TerrainModification[] = []
  const grassSystem = createGrassSystem()
  let lastCheckX = Number.POSITIVE_INFINITY
  let lastCheckZ = Number.POSITIVE_INFINITY
  const recheckDistance = config.chunkSize * 0.25
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

  function ensureGrass(record: ChunkRecord): void {
    if (record.grass !== undefined || !record.tile) return
    const { x, z } = chunkCenter(record.coord, config.chunkSize)
    const grass = grassSystem.createChunkGrass(
      record.coord,
      record.tile,
      config.resolution,
      config.chunkSize,
      x,
      z,
      config.waterLevel,
      config.heightScale,
      config.seed,
      config.grass.density,
      config.region,
    )
    record.grass = grass
    if (grass) scene.add(grass.mesh)
  }

  function removeGrass(record: ChunkRecord): void {
    record.grass?.dispose()
    record.grass = undefined
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
      // Cheap distance LOD: render fewer blades in farther chunks (down to ~25%
      // at the visible edge) — imperceptible at that distance/fog, no
      // reallocation, just narrows the instanced draw range. Keeps near-field
      // density (the intentional visual choice) while cutting fill-rate cost.
      const t = dist / Math.max(1, effectiveGrassRadius)
      record.grass?.setLodFraction(Math.max(0.25, 1 - t * 0.75))
    } else if (dist > grassUnloadRadius && record.grass !== undefined) {
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
    const { mesh, dispose } = buildChunkGeometry(
      tile,
      config.resolution,
      config.chunkSize,
      x,
      z,
      config.waterLevel,
      config.heightScale,
      config.flatShading,
      config.region,
      config.detailNormal,
      config.seed,
    )
    scene.add(mesh)
    rec.mesh = mesh
    rec.meshDispose = dispose
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
      .then(async (tile) => {
        const rec = chunks.get(key)
        if (!rec) return // unloaded while generating
        rec.tile = tile
        // Re-apply any digs made before this chunk was (re)generated — see
        // `ChunkManager.modifyTerrain`'s doc comment.
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
        buildAndAttachMesh(rec, tile)

        const { x, z } = chunkCenter(coord, config.chunkSize)
        const apronRes = config.resolution + 2
        const coreHeights = extractCoreGrid(tile.heights, apronRes, config.resolution)
        const coreBodyScale = extractCoreGrid(tile.bodyScale, apronRes, config.resolution)
        rec.water = createChunkWater(
          coreHeights,
          coreBodyScale,
          config.resolution,
          x,
          z,
          config.chunkSize,
          config.waterLevel,
        )
        if (rec.water) scene.add(rec.water.mesh)

        rec.state = 'ready'
        syncGrassForRecord(rec, lastPlayerChunk)

        // Identical for vegetation/items/environment — the apron/origin doesn't
        // depend on what's being placed on it — so computed once up front
        // rather than redundantly inside each of the three blocks below.
        const o = apronOriginWorld(coord.cx, coord.cz, config.chunkSize, config.resolution)
        const sampleTileHeight: HeightSampler = (sx, sz) =>
          sampleApronGrid(tile.heights, o.apronRes, o.x, o.z, o.step, sx, sz)

        if (tile.vegetation.length > 0) {
          const [treeTemplates, bushTemplates, cactusTemplates, reedTemplates] = await Promise.all([
            getTreeTemplates(),
            getBushTemplates(),
            getCactusTemplates(),
            getReedTemplates(),
          ])
          // Re-check after the await — chunk may have unloaded while templates loaded.
          if (!chunks.has(key)) return

          const templatesByKind = {
            tree: treeTemplates,
            bush: bushTemplates,
            cactus: cactusTemplates,
            reed: reedTemplates,
          }

          const treeIds: string[] = []
          rec.vegetation = buildPlacementGroup('chunk-vegetation', tile.vegetation, (placement) => {
            if (placement.kind === 'tree') {
              const initialStage = placement.growthStage ?? 'mature'
              const id = config.treeLifecycle.makeId(placement.x, placement.z, placement.speciesIndex)
              const presence = {
                id,
                x: placement.x,
                z: placement.z,
                speciesIndex: placement.speciesIndex,
                initialStage,
                baseScale: placement.scale,
              }
              config.treeLifecycle.registerPresence(presence)
              treeIds.push(id)
              const env = sampleTreeEnvAt(placement.x, placement.z, tile, coord)
              const resolved = config.treeLifecycle.resolve(presence, env, config.getWorldDays())
              const prop = resolved.visual === 'living'
                ? cloneProp(templatesByKind.tree, placement.speciesIndex, resolved.scale)
                : createTreeStageMesh(resolved.visual, resolved.scale, id)
              prop.rotation.y = placement.rotationY
              placeOnGround(prop, placement.x, placement.z, sampleTileHeight)
              tagTreeMesh(prop, resolved, placement.scale, placement.speciesIndex, initialStage)
              return prop
            }
            const templates = templatesByKind[placement.kind]
            const prop = cloneProp(templates, placement.speciesIndex, placement.scale)
            prop.rotation.y = placement.rotationY // deterministic — overrides cloneProp's own Math.random()
            placeOnGround(prop, placement.x, placement.z, sampleTileHeight)
            return prop
          })
          rec.treeIds = treeIds
        }

        rec.items = buildPlacementGroup('chunk-items', tile.items, (placement) => {
          if (config.collectedItemIds.has(placement.id)) return null
          const itemMesh = createItemMesh(placement.kind)
          itemMesh.userData.itemId = placement.id
          itemMesh.userData.itemKind = placement.kind
          placeOnGround(itemMesh, placement.x, placement.z, sampleTileHeight)
          return itemMesh
        })

        const needsEnvGlb = tile.environment.some((p) => GLB_ENV_KINDS.has(p.kind))
        let rockTemplates: THREE.Object3D[] | null = null
        let rockClusterTemplates: THREE.Object3D[] | null = null
        let fallenLogTemplates: THREE.Object3D[] | null = null
        if (needsEnvGlb) {
          ;[rockTemplates, rockClusterTemplates, fallenLogTemplates] = await Promise.all([
            getRockTemplates(),
            getRockClusterTemplates(),
            getFallenLogTemplates(),
          ])
          if (!chunks.has(key)) return
        }

        rec.environment = buildPlacementGroup('chunk-environment', tile.environment, (placement) => {
          let prop: THREE.Object3D
          if (placement.kind === 'largeRock' && rockTemplates) {
            prop = clonePropWithYaw(rockTemplates, 0, placement.scale, placement.rotationY)
          } else if (placement.kind === 'rockCluster' && rockClusterTemplates) {
            prop = clonePropWithYaw(rockClusterTemplates, 0, placement.scale, placement.rotationY)
          } else if (placement.kind === 'fallenLog' && fallenLogTemplates) {
            prop = clonePropWithYaw(fallenLogTemplates, 0, placement.scale, placement.rotationY)
          } else {
            prop = createProceduralEnvironmentProp(placement.kind, placement.scale, placement.variant)
            prop.rotation.y = placement.rotationY
          }
          placeOnGround(prop, placement.x, placement.z, sampleTileHeight)
          return prop
        })
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

  function unload(record: ChunkRecord): void {
    if (record.state === 'generating') cancelChunkTile(record.key)
    if (record.treeIds) {
      for (const id of record.treeIds) config.treeLifecycle.unregisterPresence(id)
      record.treeIds = undefined
    }
    record.mesh?.removeFromParent()
    record.meshDispose?.()
    record.water?.dispose()
    removeGrass(record)
    if (record.vegetation) {
      disposeObject3D(record.vegetation)
      record.vegetation.removeFromParent()
    }
    if (record.items) {
      disposeObject3D(record.items)
      record.items.removeFromParent()
    }
    if (record.environment) {
      disposeObject3D(record.environment)
      record.environment.removeFromParent()
    }
    chunks.delete(record.key)
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

  function refreshTreeVisual(treeId: string): boolean {
    for (const rec of chunks.values()) {
      if (!rec.vegetation || !rec.treeIds?.includes(treeId)) continue
      const mesh = rec.vegetation.children.find((c) => c.userData.treeId === treeId)
      if (!mesh || !rec.tile) continue
      const baseScale =
        typeof mesh.userData.treeBaseScale === 'number' ? mesh.userData.treeBaseScale : 1
      const speciesIndex =
        typeof mesh.userData.treeSpeciesIndex === 'number' ? mesh.userData.treeSpeciesIndex : 0
      const initialStage =
        mesh.userData.treeInitialStage === 'sapling' || mesh.userData.treeInitialStage === 'young'
          ? mesh.userData.treeInitialStage
          : 'mature'
      const presence = {
        id: treeId,
        x: mesh.position.x,
        z: mesh.position.z,
        speciesIndex,
        initialStage,
        baseScale,
      }
      const resolved = config.treeLifecycle.resolve(
        presence,
        sampleTreeEnvAt(mesh.position.x, mesh.position.z, rec.tile, rec.coord),
        config.getWorldDays(),
      )
      const parent = mesh.parent
      const rotY = mesh.rotation.y
      const pos = mesh.position.clone()
      mesh.removeFromParent()
      disposeObject3D(mesh)
      // Living trees reload with GLB templates; chop mid/final stages use
      // procedural meshes (same as mid-session refresh).
      const replacement = resolved.visual === 'living'
        ? createTree(resolved.scale)
        : createTreeStageMesh(resolved.visual, resolved.scale, treeId)
      replacement.position.copy(pos)
      replacement.rotation.y = rotY
      tagTreeMesh(replacement, resolved, baseScale, speciesIndex, initialStage)
      parent?.add(replacement)
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

    for (const coord of desired) {
      if (!chunks.has(chunkKey(coord))) void ensureLoaded(coord)
    }
    for (const record of [...chunks.values()]) {
      syncGrassForRecord(record, playerChunk)
      if (record.pinned || desiredKeys.has(record.key)) continue
      if (chebyshevDistance(record.coord, playerChunk) > config.unloadRadius) unload(record)
    }
  }

  function update(playerX: number, playerZ: number): void {
    if (Math.hypot(playerX - lastCheckX, playerZ - lastCheckZ) < recheckDistance) return
    recheck(playerX, playerZ)
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
    setWaterDayNight(dayFactor) {
      for (const rec of chunks.values()) rec.water?.setDayNight(dayFactor)
    },
    tickGrass(dt) {
      grassSystem.update(dt)
    },
    setGrassDayNight(dayFactor, sunDirection) {
      grassSystem.setDayNight(dayFactor, sunDirection)
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
    loadedChunkCount: () => chunks.size,
    waitForChunks: (coords) => Promise.all(coords.map((c) => ensureLoaded(c))).then(() => undefined),
    roadCorridorsNear(worldX, worldZ, querySize) {
      const village = villageSegmentsNear(worldX, worldZ, querySize, roadCtx)
      return [...segmentsNear(worldX, worldZ, querySize, roadCtx), ...village.paths]
    },
    dispose() {
      for (const record of [...chunks.values()]) unload(record)
      grassSystem.dispose()
    },
  }
}
