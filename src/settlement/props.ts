import * as THREE from 'three'
import type { RoadCorridorSegment } from '../terrain/chunkHeightmap'
import type { SettlementSite } from './findSettlementSite'
import type { FoodSourceType } from './settlementGenerator'
import type { ClearingLayout } from './villageClearing'
import type { VillageLandmarkPlan, VillagePlan } from './villagePlan'
import { buildConstructionCatalog } from '../assets/constructionCatalog'
import { type HouseVec3, pickHouseDefinition } from '../assets/houseDefinitionExample'
import { disposeObject3D, loadGltf, prepareProp, preparePropFitMax } from '../assets/loadGltf'
import { isDebugMode } from '../debug/debugMode'
import { distanceToSegment } from '../math/segment'
import { buildInstancedProps, type PropPlacement } from '../render/instancedProps'
import { type CoastalSamplers, isCoastalPlacement } from '../terrain/coastPlacement'
import { createPlacedContainerProp } from '../world/containerProp'
import { createSeededRandom } from '../world/parseSeed'
import { makeTreeId, rollLivingAge, rollSizeClass, type TreeLivingAge, type TreeSizeClass, visualScaleForTree } from '../world/treeLifecycle'
import { type CampfireFlame, createLitCampfireVisual, preloadCampfireTemplates } from './campfireProps'
import { createBush, createCobblePlate, createTree } from './decorProps'
import { cobbleCountForSize, type VillageSize, villageSizeConfig } from './families'
import { createPropYieldGate } from './frameYield'
import {
  gardenBedCount,
  gardenPlotRadius,
  type GardenScale,
} from './gardenScale'
import { hiddenTreasureMarkerPositions } from './hiddenTreasure'
import {
  buildHouse,
  createHouseStaticBatch,
  type HouseAssembly,
  type HouseBuildContext,
  houseDefinitionAssetIds,
  houseFootprintRadius,
  loadHousePartTemplates,
} from './houseBuilder'
import { type HouseLampMount, type HouseLampStyle, pickHomeHouse, resolveHouseHeight } from './houseCatalog'
import { HOUSEHOLD_YARD_PROP_OFFSETS } from './householdYard'
import {
  createHouseLight,
  createProceduralTorchPost,
  createVillageTorchLight,
  type HouseLight,
  type ResolvedHouseLampMount,
  resolveHouseLampMount,
  type VillageTorch,
} from './houseLighting'
import { pickMerchantWagonPose } from './merchantWagon'
import {
  BUSH_SPECS,
  COBBLE_FIT_MAX,
  COBBLE_URL,
  CROPS_FIT_MAX,
  CROPS_URL,
  FARM_HEIGHT,
  FARM_URL,
  LANTERN_FLOOR_MAX,
  LANTERN_URL,
  LANTERN_WALL_MAX,
  TABLE_LAMP_FIT_MAX,
  TABLE_LAMP_URL,
  TREE_SPECS,
  VILLAGE_TORCH_HEIGHT,
  VILLAGE_TORCH_URL,
  WELL_HEIGHT,
  WELL_URL,
  WOOD_PILE_HEIGHT,
  WOOD_PILE_URL,
} from './propSpecs'
import { cloneProp, clonePropWithYaw, loadPropOrFallback, loadPropTemplates, placeOnGround } from './propUtils'
import {
  PALISADE_GATE_HALF_ANGLE,
  plantEntrancePalisade,
  pointHitsCorridor,
  WALL_HALF_LENGTH,
} from './settlementPalisade'
import {
  createAnvil,
  createBarrel,
  createCrate,
  createGarden,
  createGrindWorkbench,
  createHayBale,
  createHut,
  createStockpile,
  createTrough,
  createWell,
  createWheatField,
  layoutCropsGarden,
} from './settlementStructures'
import {
  createFoodStorageVisual,
  createWoodPileVisual,
  type FoodStorageVisual,
  WOOD_PILE_EXTRA_OFFSETS,
  type WoodPileVisual,
} from './storageVisuals'
import { pathPlansToCorridorData } from './villagePlanner'

export type SettlementHouseLandmark = {
  position: THREE.Vector3
  /**
   * Visual variant id. For MegaKit houses this is `HouseDefinition.id`
   * (`definitionId`). For the legacy catalog-GLB fallback it is the catalog
   * entry id. Same string as `definitionId` — kept as `houseId` for existing
   * examine / debug callers.
   */
  houseId: string
  /** HouseDefinition id for assembled houses; catalog id for the GLB fallback. */
  definitionId: string
  modelUrl: string | null
  label: string
  examine: string
  /** Collision disk used by `createSettlement` / door-sound tracker. */
  footprintRadius: number
  /** Local lamp mount used at build time (for debug gaze / catalog paste). */
  lampMount: HouseLampMount | null
  lampMountSource: string | null
  /** World-space bed lodging source (plan 168/169) — set only for houses built
   *  through the `HouseBuilder` assembly path with a `'sleep'` interaction
   *  point (currently `COTTAGE_4X4_A` only). `null` for every other house,
   *  including the legacy catalog-GLB fallback. */
  bed: SettlementHouseBed | null
}

/** World-space physical basis for plan 168's `bed` `LodgingOption` — derived
 *  from `HouseAssembly.interactionPoints`' `'sleep'` point, not stored/authored
 *  in world space anywhere. */
export type SettlementHouseBed = {
  position: { x: number, z: number }
  approach: { x: number, z: number }
  /** World-space yaw the sleeper should face, or `null` to keep facing as-is. */
  facing: number | null
}

export type SettlementLandmarks = {
  well: THREE.Vector3
  /** Well mesh (GLB or procedural fallback) — drink-queue anchors (Phase 6). */
  wellProp?: THREE.Object3D
  stockpile: THREE.Vector3
  /** Second wood pile when `infrastructure.stockpiles > 1` (LG/XL). */
  stockpileSecondary?: THREE.Vector3
  /** Kupiec wagon (home forest villages only) — set only if the GLB loaded. */
  merchantWagon?: THREE.Vector3
  /** Spawn point (position + facing) for the merchant's horse at the wagon
   *  hitch (plan fauna-003 follow-up) — this is *not* a static prop; the
   *  live `AnimalAgent` it seeds is spawned by `spawnLivestock()` in
   *  `createSettlement.ts`, same as any other livestock, so it's a normal
   *  mountable/wandering animal rather than a decorative mesh. */
  merchantHorseSpawn?: { x: number, z: number, yaw: number }
  garden: THREE.Vector3
  /** All garden pads (plan 077); `garden` mirrors the primary (index 0). */
  gardens: THREE.Vector3[]
  /** World-space position(s) of the actual hay-bale prop(s) placed near a
   *  garden pad (plan 168 follow-up hay bugfix) — offset from `garden`/
   *  `gardens` by `gardenPlotRadius + ~1.4-2.6`, so `garden` itself is not a
   *  safe stand-in for "where the hay bale visually is". The lodging
   *  resolver's `hay` fallback and the `[E]`-on-hay interactable both anchor
   *  on this instead. Always at least one entry once props finish building
   *  (`hayGardens` always has ≥1 source); optional only so landmark fixtures
   *  that predate this field (tests) don't need to supply it. */
  haySpots?: THREE.Vector3[]
  /** Trader's `workplace` (`places.ts`'s `workplaceFor`) — crate + barrel
   *  market stall, the one role in the workplace hybrid that gets a
   *  dedicated new prop instead of reusing an existing landmark (2026-08-09
   *  decision). Built unconditionally, like well/garden/stockpile, whether
   *  or not this settlement's families happen to roll a trader. */
  market: THREE.Vector3
  /** Blacksmith's `workplace` (`places.ts`'s `workplaceFor`) — anvil + grind
   *  workbench (plan settlements-npcs-002), same "built unconditionally like
   *  well/garden/stockpile/market" treatment regardless of whether this
   *  settlement's families happen to roll a blacksmith. */
  blacksmith: THREE.Vector3
  /** Foot positions for homes — same order as `houses` (compat for places/livestock). */
  homes: THREE.Vector3[]
  /** Per-house catalog identity for examine / debug (issue 018). */
  houses: SettlementHouseLandmark[]
  /** Settlement forest trees — each carries a stable `TreeId` for lifecycle
   *  / NPC harvest (plan 058). `mesh` is the live prop for stump swaps. */
  trees: SettlementTreeLandmark[]
  /** Settlement's dock/pier, if it has one (near-coast settlements only) —
   *  see `settlement/minorLocations.ts`. */
  dock?: THREE.Vector3
  /** Waypoints from the settlement center to `dock` (inclusive), already
   *  height-sampled — empty when there's no dock. NPCs walk these in order
   *  instead of a straight line (`NpcAgent.ts`'s `followPath` phase). */
  dockRoute: THREE.Vector3[]
  /** The settlement's own lightable campfire (MD/LG only, see
   *  `buildSettlementProps`) — `flame` is the toggleable fire visual
   *  (`createCampfireFlame`), added as a child of the campfire prop but
   *  hidden until `settlement/VillageFire.ts` lights it. Distinct from the
   *  purely decorative world campfires in `terrain/chunkEnvironment.ts`. */
  campfire?: { position: THREE.Vector3, flame: CampfireFlame }
  /** Settlement sale plots (plan 129) — static price/position straight from
   *  `VillagePlan.plots` (`role === 'sale'`). Ownership is separate
   *  persistent world state, never stored here — see `landOwnership.ts`. */
  landPlots: SettlementLandPlot[]
  /** Household storage container positions (plan 156), same order as
   *  `homes`/`houses` — `createSettlement.ts` zips this with `households` to
   *  build each `Interactable`. Presentation only; the prop never owns the
   *  quantity, `Household.stock`/`.water` does. */
  householdStorages: THREE.Vector3[]
  /** One settlement-wide storage container position (plan 156), next to the
   *  wood stockpile. Presentation only — `SettlementEconomy` owns the stock. */
  settlementStorage: THREE.Vector3
  /** Hidden-treasure dig markers (quick task, home settlement only, see
   *  `plantForest` below) — world position of each of the 3 flower clumps a
   *  shovel dig must land within `HIDDEN_TREASURE_DIG_TOLERANCE` of
   *  (`hiddenTreasure.ts`). The flowers themselves are decorative-only, added
   *  to `group` alongside the forest belt; undefined for every non-home
   *  settlement. */
  hiddenTreasureMarkers?: THREE.Vector3[]
}

/** Physical storage visual controllers (plan settlements-npcs-010), returned
 *  alongside `landmarks` so `createSettlement.ts` can drive them from live
 *  `Household`/`SettlementEconomy` state each tick. `householdFood` is
 *  same-order as `landmarks.householdStorages`. */
export type SettlementStorageVisuals = {
  wood: WoodPileVisual
  settlementFood: FoodStorageVisual
  householdFood: FoodStorageVisual[]
}

/** One settlement sale plot's materialized (non-persistent) data — plan 129. */
export type SettlementLandPlot = {
  plotId: string
  position: THREE.Vector3
  rotation: number
  price: number
}

export type SettlementTreeLandmark = {
  id: string
  position: THREE.Vector3
  mesh: THREE.Object3D
  speciesIndex: number
  sizeClass: TreeSizeClass
  sizeJitter: number
  initialStage: TreeLivingAge
}

export {
  type CampfireBodyKind,
  type CampfireFlame,
  createCampfire,
  createCampfireBody,
  createCampfireFlame,
  createGrateVisual,
  createLitCampfireVisual,
  createSimpleFireBase,
  peekCampfireFlameTemplate,
  preloadCampfireTemplates,
} from './campfireProps'

export {
  type CemeterySize,
  type CemeteryTemplates,
  createBush,
  createCactus,
  createCaveMouth,
  createCemetery,
  createCemeteryPlot,
  createCobblePlate,
  createFallenLog,
  createFelledTree,
  createFern,
  createGraveStone,
  createLargeRock,
  createLimbedTree,
  createMonolith,
  createReed,
  createRockCluster,
  createSmallRuins,
  createStoneCircle,
  createThicket,
  createTree,
  createTreeStump,
  type TerrainPlacementContext,
} from './decorProps'
export {
  createHouseLight,
  createVillageTorchLight,
  type HouseLight,
  type ResolvedHouseLampMount,
  resolveHouseLampMount,
  type VillageTorch,
} from './houseLighting'
export {
  BUSH_SPECS,
  CACTUS_SPECS,
  CEMETERY_SPECS,
  COBBLE_FIT_MAX,
  COBBLE_URL,
  CROPS_FIT_MAX,
  CROPS_URL,
  DOCK_SPECS,
  FALLEN_LOG_SPECS,
  FARM_HEIGHT,
  FARM_URL,
  FERN_SPECS,
  FIRE_FX_URL,
  GRAVE_SPECS,
  LANTERN_FLOOR_MAX,
  LANTERN_URL,
  LANTERN_WALL_MAX,
  REED_SPECS,
  RESOURCE_GOLD_SPECS,
  RESOURCE_ROCK_SPECS,
  ROCK_CLUSTER_SPECS,
  ROCK_SPECS,
  TREE_SPECS,
  TREE_STUMP_HEIGHT,
  TREE_STUMP_URL,
  VILLAGE_TORCH_HEIGHT,
  VILLAGE_TORCH_URL,
  WALL_URL,
  WELL_HEIGHT,
  WELL_URL,
  WOOD_PILE_HEIGHT,
  WOOD_PILE_URL,
} from './propSpecs'
// Re-exports for the file-structure split (props.ts stays the stable public
// import path for all existing consumers) — see settlementStructures.ts /
// decorProps.ts / houseLighting.ts / campfireProps.ts / propUtils.ts.
export {
  cloneProp,
  clonePropWithYaw,
  loadPropTemplates,
  placeOnGround,
  tintPropMaterials,
} from './propUtils'
export {
  createBarrel,
  createCrate,
  createDock,
  createGarden,
  createHayBale,
  createHut,
  createSignpost,
  createStockpile,
  createTrough,
  createVillageNamepost,
  createWell,
  createWheatField,
  VILLAGE_NAMEPOST_BOARD_CENTER_Y,
} from './settlementStructures'

/** Clearance (world units) a tree/bush must keep from a house↔core path —
 *  a bit past the path's own half-width (`worldConfig.ts`'s `pathHalfWidth`,
 *  ~1.5) so canopies don't visually hang over it either. */
const PATH_TREE_CLEARANCE = 2.5

/** Same idea as `PATH_TREE_CLEARANCE`, added on top of each road/path
 *  segment's own `halfWidth` (roads and dock/minor-location paths use
 *  different widths, `roadNetwork.ts`'s `roadHalfWidth`/`pathHalfWidth`) —
 *  one constant works for both since it's relative to the segment's actual
 *  width, not a fixed absolute clearance. */
const ROAD_TREE_CLEARANCE = 1.25

/** Local VillagePlan path polylines as corridor segments for prop rejection. */
function localPathCorridors(
  plan: VillagePlan | undefined,
  sampleHeight: (x: number, z: number) => number,
): RoadCorridorSegment[] {
  if (!plan) return []
  return pathPlansToCorridorData(plan.paths, sampleHeight).map((seg) => ({
    ax: seg.ax,
    az: seg.az,
    ah: seg.ah,
    bx: seg.bx,
    bz: seg.bz,
    bh: seg.bh,
    halfWidth: seg.halfWidth,
    heightStrength: 0,
    tintStrength: 0,
  }))
}

/** Rejects candidates sitting on a clearing (well/stockpile/garden/hut pad),
 *  on house↔core links, within road/path corridors (inter-settlement + local
 *  VillagePlan paths), or inside the residential courtyard (plan 076). */
function blocksPathOrClearing(
  tx: number,
  tz: number,
  clearings: ClearingLayout,
  roadSegments: readonly RoadCorridorSegment[],
  courtyardRadius = 0,
): boolean {
  if (courtyardRadius > 0) {
    const dCore = Math.hypot(tx - clearings.core.x, tz - clearings.core.z)
    if (dCore < courtyardRadius) return true
  }
  for (const area of [clearings.core, ...clearings.houses, ...(clearings.gardens ?? [])]) {
    if (Math.hypot(tx - area.x, tz - area.z) < area.radius + 1) return true
  }
  for (const house of clearings.houses) {
    if (distanceToSegment(tx, tz, clearings.core.x, clearings.core.z, house.x, house.z) < PATH_TREE_CLEARANCE) {
      return true
    }
  }
  for (const seg of roadSegments) {
    if (distanceToSegment(tx, tz, seg.ax, seg.az, seg.bx, seg.bz) < seg.halfWidth + ROAD_TREE_CLEARANCE) {
      return true
    }
  }
  return false
}

type ClusterSize = 'medium' | 'small'

function plantTreeCluster(
  group: THREE.Group,
  landmarks: SettlementLandmarks,
  treeTemplates: THREE.Object3D[],
  bushTemplates: THREE.Object3D[],
  cx: number,
  cz: number,
  size: ClusterSize,
  sampleHeight: (x: number, z: number) => number,
  waterLevel: number,
  halfExtent: number,
  clearings: ClearingLayout,
  roadSegments: readonly RoadCorridorSegment[],
  random: () => number,
  treeCounter: { n: number },
  bushCounter: { n: number },
  worldSeed: number,
  courtyardRadius = 0,
  bushPlacements: PropPlacement[],
): void {
  const count =
    size === 'small' ? 4 + Math.floor(random() * 4) : 7 + Math.floor(random() * 6)
  const radius = size === 'small' ? 3.2 : 6.5
  const limit = halfExtent - 2

  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2
    const d = Math.sqrt(random()) * radius
    const tx = cx + Math.cos(a) * d
    const tz = cz + Math.sin(a) * d
    if (Math.abs(tx) > limit || Math.abs(tz) > limit) continue
    if (blocksPathOrClearing(tx, tz, clearings, roadSegments, courtyardRadius)) continue

    const y = sampleHeight(tx, tz)
    if (y <= waterLevel + 0.55) continue

    // Bushes cluster toward the cluster's outer rim; big trees dominate the core.
    const edgeFactor = d / radius
    const isBush = random() < 0.12 + edgeFactor * 0.45

    if (isBush) {
      const scale = 0.6 + random() * 0.5
      const speciesIndex = bushCounter.n++ % Math.max(1, bushTemplates.length)
      bushPlacements.push({
        speciesIndex,
        x: tx,
        z: tz,
        groundY: y,
        rotationY: random() * Math.PI * 2,
        scale,
      })
    } else {
      const sizeClass = rollSizeClass(random())
      const sizeJitter = random()
      const initialStage = rollLivingAge({
        sizeClass,
        ageRoll: random(),
        oldRoll: random(),
        saplingChance: 0.12,
        youngChance: 0.13,
      })
      const speciesIndex = treeCounter.n % Math.max(1, treeTemplates.length)
      const tree = cloneProp(
        treeTemplates,
        treeCounter.n++,
        visualScaleForTree(speciesIndex, initialStage, sizeClass, sizeJitter),
      )
      placeOnGround(tree, tx, tz, sampleHeight)
      const id = makeTreeId(worldSeed, tx, tz, speciesIndex)
      tree.userData.treeId = id
      tree.userData.treeSizeClass = sizeClass
      tree.userData.treeSizeJitter = sizeJitter
      tree.userData.treeSpeciesIndex = speciesIndex
      tree.userData.treeInitialStage = initialStage
      group.add(tree)
      landmarks.trees.push({
        id,
        position: new THREE.Vector3(tx, y, tz),
        mesh: tree,
        speciesIndex,
        sizeClass,
        sizeJitter,
        initialStage,
      })
    }
  }
}

const CORE_PROP_SITE_ATTEMPTS = 5
const CORE_PROP_JITTER = 3.5
const CORE_PROP_WATER_MARGIN = 0.8

/** Same 4-direction flatness cross-probe as `findSettlementSite.ts`, applied to
 *  a prop's preferred offset from the village core — tries the exact offset
 *  first (attempt 0, jitter 0), then a few jittered candidates, picks the
 *  flattest dry one. Keeps props close to their intended relative layout via
 *  a drift penalty rather than wandering toward the single flattest spot in
 *  the whole clearing. */
function findFlatSpot(
  site: { x: number, z: number },
  dx: number,
  dz: number,
  sampleHeight: (x: number, z: number) => number,
  waterLevel: number,
  random: () => number,
): { x: number, z: number } {
  let best = { x: site.x + dx, z: site.z + dz }
  let bestScore = -Infinity
  for (let attempt = 0; attempt < CORE_PROP_SITE_ATTEMPTS; attempt++) {
    const jx = attempt === 0 ? dx : dx + (random() * 2 - 1) * CORE_PROP_JITTER
    const jz = attempt === 0 ? dz : dz + (random() * 2 - 1) * CORE_PROP_JITTER
    const x = site.x + jx
    const z = site.z + jz
    const y = sampleHeight(x, z)
    if (y <= waterLevel + CORE_PROP_WATER_MARGIN) continue

    const step = 2.5
    const maxDelta = Math.max(
      Math.abs(sampleHeight(x + step, z) - y),
      Math.abs(sampleHeight(x - step, z) - y),
      Math.abs(sampleHeight(x, z + step) - y),
      Math.abs(sampleHeight(x, z - step) - y),
    )
    const driftPenalty = Math.hypot(jx - dx, jz - dz) * 0.3
    const score = 8 - maxDelta * 3 - driftPenalty
    if (score > bestScore) {
      bestScore = score
      best = { x, z }
    }
  }
  return best
}


/** Prefer a planned landmark position; `findFlatSpot` only micro-corrects
 *  around that candidate (plan 047 §9.11) — it must not invent a new layout.
 *  Optional `avoid` keeps props (campfire) out of another landmark's disk. */
function placeFromLandmark(
  site: { x: number, z: number },
  landmark: VillageLandmarkPlan | undefined,
  fallbackDx: number,
  fallbackDz: number,
  sampleHeight: (x: number, z: number) => number,
  waterLevel: number,
  random: () => number,
  avoid?: { x: number, z: number, minDist: number },
): { x: number, z: number } {
  const raw = landmark
    ? findFlatSpot(
        site,
        landmark.x - site.x,
        landmark.z - site.z,
        sampleHeight,
        waterLevel,
        random,
      )
    : findFlatSpot(site, fallbackDx, fallbackDz, sampleHeight, waterLevel, random)
  if (!avoid) return raw
  return pushAwayFrom(raw.x, raw.z, avoid.x, avoid.z, avoid.minDist)
}

function pushAwayFrom(
  x: number,
  z: number,
  ox: number,
  oz: number,
  minDist: number,
): { x: number, z: number } {
  const dx = x - ox
  const dz = z - oz
  const d = Math.hypot(dx, dz)
  if (d >= minDist) return { x, z }
  if (d < 1e-4) {
    return { x: ox + minDist, z: oz }
  }
  const s = minDist / d
  return { x: ox + dx * s, z: oz + dz * s }
}

/** Pull a point onto/inside a disk (campfire stays on plaza dirt after jitter). */
function pullIntoDisk(
  x: number,
  z: number,
  cx: number,
  cz: number,
  maxRadius: number,
): { x: number, z: number } {
  const dx = x - cx
  const dz = z - cz
  const d = Math.hypot(dx, dz)
  if (d <= maxRadius || d < 1e-4) return { x, z }
  const s = maxRadius / d
  return { x: cx + dx * s, z: cz + dz * s }
}

function landmarkOf(plan: VillagePlan | undefined, kind: VillageLandmarkPlan['kind'], index = 0) {
  return plan?.landmarks.find((l) => l.kind === kind && l.index === index)
}

export async function buildSettlementProps(
  site: SettlementSite,
  sampleHeight: (x: number, z: number) => number,
  waterLevel: number,
  halfExtent: number,
  seed: number,
  /** Where houses/well/stockpile/garden actually sit — one clearing per
   *  family (its house) plus a shared core, see `villageClearing.ts`. Houses
   *  are no longer a fixed 3-offset layout: their count and position follow
   *  `clearings.houses` 1:1. */
  clearings: ClearingLayout,
  /** Bigger villages get a bit more shared infrastructure (draft: "większe
   *  wioski mogą otrzymać dodatkowe obiekty") — a second stockpile/campfire,
   *  not a structural change to the core clearing itself. */
  size: VillageSize,
  /** Non-home settlements skip the forest belt: it's expensive (dozens of
   *  clusters) and would double up with the per-chunk terrain vegetation that,
   *  unlike home chunks, isn't suppressed around them. They still get their
   *  well/stockpile/garden/huts. */
  plantForest = true,
  /** `'field'` (plan 032 §8 / 099 — significant nearby `fertile_soil`)
   *  gets `farm.glb` next to the garden (procedural `createWheatField`
   *  fallback). Decorative only — no `Interactable`. */
  foodSourceType: FoodSourceType = 'garden',
  /** Inter-settlement road segments + settlement↔minor-location paths near
   *  this settlement (`roadNetwork.ts`'s `segmentsNear`, resolved by
   *  `createSettlement.ts` only when `plantForest` is set) — kept out of the
   *  forest belt via `blocksPathOrClearing`, same as the house↔core paths. */
  roadSegments: readonly RoadCorridorSegment[] = [],
  /** Authoritative layout (plan 047). When present, prop positions come from
   *  planned landmarks; `findFlatSpot` only corrects locally. */
  plan?: VillagePlan,
  /** Optional coast samplers — skips palisade on beach / seaward entrances. */
  coast?: CoastalSamplers,
): Promise<{
  group: THREE.Group
  landmarks: SettlementLandmarks
  houseLights: HouseLight[]
  villageTorches: VillageTorch[]
  houseAssemblies: HouseAssembly[]
  storageVisual: SettlementStorageVisuals
}> {
  const group = new THREE.Group()
  group.name = 'settlement'

  // Breaks up the (potentially 20-60+ prop) build below into chunks the
  // browser can actually paint between — see `frameYield.ts`'s doc comment
  // and issue 027 (a GLTF-cache-hit `await` chain otherwise blocks rendering
  // for the whole synchronous build).
  const yieldProp = createPropYieldGate()

  const landmarks: SettlementLandmarks = {
    well: new THREE.Vector3(),
    stockpile: new THREE.Vector3(),
    garden: new THREE.Vector3(),
    gardens: [],
    haySpots: [],
    market: new THREE.Vector3(),
    blacksmith: new THREE.Vector3(),
    homes: [],
    houses: [],
    trees: [],
    dockRoute: [],
    landPlots: (plan?.plots.filter((p) => p.role === 'sale') ?? []).map((p) => ({
      plotId: p.id,
      position: new THREE.Vector3(p.x, sampleHeight(p.x, p.z), p.z),
      rotation: p.rotation,
      price: p.price ?? 0,
    })),
    householdStorages: [],
    settlementStorage: new THREE.Vector3(),
  }

  const coreRandom = createSeededRandom(seed ^ 0x5a17e)
  const pathCorridors: RoadCorridorSegment[] = [
    ...roadSegments,
    ...localPathCorridors(plan, sampleHeight),
  ]

  const wellLm = landmarkOf(plan, 'well')
  const wellX = wellLm?.x ?? site.x
  const wellZ = wellLm?.z ?? site.z
  const well = await loadPropOrFallback(WELL_URL, WELL_HEIGHT, createWell)
  placeOnGround(well, wellX, wellZ, sampleHeight)
  group.add(well)
  landmarks.well.set(wellX, sampleHeight(wellX, wellZ), wellZ)
  landmarks.wellProp = well

  const { x: stockX, z: stockZ } = placeFromLandmark(
    site, landmarkOf(plan, 'stockpile', 0), 4, 1.5, sampleHeight, waterLevel, coreRandom,
  )
  const stockpile = await loadPropOrFallback(
    WOOD_PILE_URL,
    WOOD_PILE_HEIGHT,
    createStockpile,
  )
  placeOnGround(stockpile, stockX, stockZ, sampleHeight)
  group.add(stockpile)
  landmarks.stockpile.set(stockX, sampleHeight(stockX, stockZ), stockZ)

  // Wood pile visual (plan settlements-npcs-010) — the same `stockpile` prop
  // above, now driven by the settlement's actual stored wood instead of
  // always showing full. A handful of extra piles, pre-placed but hidden,
  // cover the "21+" overflow band without rebuilding geometry at runtime.
  const woodPileExtras = await loadPropTemplates(
    WOOD_PILE_EXTRA_OFFSETS.map(() => ({ url: WOOD_PILE_URL, height: WOOD_PILE_HEIGHT })),
    createStockpile,
  )
  for (let i = 0; i < woodPileExtras.length; i++) {
    const extra = woodPileExtras[i]!
    const offset = WOOD_PILE_EXTRA_OFFSETS[i]!
    placeOnGround(extra, stockX + offset.dx, stockZ + offset.dz, sampleHeight)
    group.add(extra)
  }
  const woodStorageVisual = createWoodPileVisual(stockpile, woodPileExtras)

  // Settlement storage container (plan 156) — physical representation of
  // `SettlementEconomy`, one per settlement, next to the wood stockpile
  // (opposite side from `createSettlement.ts`'s woodshed-complete pile so
  // the two never overlap). Presentation only, larger than the household
  // crates below so it reads as the shared depot.
  const settlementStorageX = stockX + 1.8
  const settlementStorageZ = stockZ + 1.1
  const settlementStorageProp = await loadPropOrFallback(
    '/models/settlement/crate.glb', 1.0, () => createCrate(1.8),
  )
  placeOnGround(settlementStorageProp, settlementStorageX, settlementStorageZ, sampleHeight)
  group.add(settlementStorageProp)
  landmarks.settlementStorage.set(
    settlementStorageX,
    sampleHeight(settlementStorageX, settlementStorageZ),
    settlementStorageZ,
  )
  // Concrete-food visual for the settlement's storage crate above (plan
  // settlements-npcs-010) — same mechanism `householdFoodVisuals` below use.
  const settlementFoodVisual = createFoodStorageVisual(
    group,
    { x: settlementStorageX, z: settlementStorageZ },
    sampleHeight,
  )

  const gardenLms = (plan?.landmarks.filter((l) => l.kind === 'garden') ?? [])
    .slice()
    .sort((a, b) => a.index - b.index)
  const gardenCount = Math.max(1, gardenLms.length)
  let cropsTemplate: THREE.Object3D | null = null
  try {
    const crops = await loadGltf(CROPS_URL)
    preparePropFitMax(crops, CROPS_FIT_MAX)
    cropsTemplate = crops
  } catch (err) {
    console.warn('[settlement] crops.glb unavailable — garden GLB / procedural fallback', err)
  }
  for (let gi = 0; gi < gardenCount; gi++) {
    const lm = gardenLms[gi]
    const scale: GardenScale = lm?.gardenScale ?? 'S'
    // Sit on the terrain pad (same x/z as flatten + dirt tint). Jitter would
    // leave the mesh on grass beside the clearing (plan 100).
    const pad = clearings.gardens[gi]
    let gardenX: number
    let gardenZ: number
    if (pad) {
      gardenX = pad.x
      gardenZ = pad.z
    } else {
      ;({ x: gardenX, z: gardenZ } = placeFromLandmark(
        site,
        lm,
        -2.5 - gi * 2.2,
        5 + gi * 2.5,
        sampleHeight,
        waterLevel,
        coreRandom,
      ))
    }
    // Gardens are vegetable beds (`crops.glb`), never wheat `garden.glb`
    // (same mesh as the field). M/L tile extra beds; fallback is procedural.
    const beds = gardenBedCount(scale)
    const garden = cropsTemplate
      ? layoutCropsGarden(cropsTemplate, beds)
      : createGarden(scale)
    placeOnGround(garden, gardenX, gardenZ, sampleHeight)
    garden.name = `garden:${scale}`
    group.add(garden)
    const foot = new THREE.Vector3(gardenX, sampleHeight(gardenX, gardenZ), gardenZ)
    landmarks.gardens.push(foot)
  }
  if (landmarks.gardens[0]) {
    landmarks.garden.copy(landmarks.gardens[0])
  }

  if (foodSourceType === 'field') {
    const { x: wheatX, z: wheatZ } = placeFromLandmark(
      site, landmarkOf(plan, 'field', 0), -2.5, 8.2, sampleHeight, waterLevel, coreRandom,
    )
    const wheat = await loadPropOrFallback(
      FARM_URL,
      FARM_HEIGHT,
      () => createWheatField(0.9 + coreRandom() * 0.3, coreRandom()),
    )
    wheat.rotation.y = coreRandom() * Math.PI * 2
    placeOnGround(wheat, wheatX, wheatZ, sampleHeight)
    group.add(wheat)
  }

  // Trader's market stall (`landmarks.market`, see `places.ts`'s `workplaceFor`)
  // — built unconditionally like well/garden/stockpile, whether or not this
  // settlement's families happen to roll a trader.
  const { x: marketX, z: marketZ } = placeFromLandmark(
    site, landmarkOf(plan, 'market', 0), 2, -5, sampleHeight, waterLevel, coreRandom,
  )
  const marketCrate = await loadPropOrFallback('/models/settlement/crate.glb', 0.6, () => createCrate(1))
  placeOnGround(marketCrate, marketX, marketZ, sampleHeight)
  group.add(marketCrate)
  const marketBarrel = await loadPropOrFallback('/models/settlement/barrel.glb', 0.65, () => createBarrel(1))
  placeOnGround(marketBarrel, marketX + 0.7, marketZ + 0.3, sampleHeight)
  group.add(marketBarrel)
  landmarks.market.set(marketX, sampleHeight(marketX, marketZ), marketZ)

  // Blacksmith's forge (`landmarks.blacksmith`, see `places.ts`'s
  // `workplaceFor`) — anvil + grind workbench (plan settlements-npcs-002),
  // built unconditionally like well/garden/stockpile/market, whether or not
  // this settlement's families happen to roll a blacksmith. Parked assets
  // (`docs/assets/MODELS.md`) promoted to active use here.
  const { x: forgeX, z: forgeZ } = placeFromLandmark(
    site, undefined, -2, -5, sampleHeight, waterLevel, coreRandom,
  )
  const anvil = await loadPropOrFallback('/models/parked/anvil.glb', 0.75, () => createAnvil())
  anvil.rotation.y = coreRandom() * Math.PI * 2
  placeOnGround(anvil, forgeX, forgeZ, sampleHeight)
  group.add(anvil)
  const grindWorkbench = await loadPropOrFallback('/models/parked/workbench-grind.glb', 0.95, () => createGrindWorkbench())
  grindWorkbench.rotation.y = coreRandom() * Math.PI * 2
  placeOnGround(grindWorkbench, forgeX + 1, forgeZ + 0.4, sampleHeight)
  group.add(grindWorkbench)
  landmarks.blacksmith.set(forgeX, sampleHeight(forgeX, forgeZ), forgeZ)

  const houseLights: HouseLight[] = []
  const villageTorches: VillageTorch[] = []

  let lanternFloor: THREE.Object3D | null = null
  let lanternWall: THREE.Object3D | null = null
  try {
    const lantern = await loadGltf(LANTERN_URL)
    lanternFloor = preparePropFitMax(lantern.clone(true), LANTERN_FLOOR_MAX)
    lanternWall = preparePropFitMax(lantern.clone(true), LANTERN_WALL_MAX)
  } catch (err) {
    console.warn('[settlement] lantern.glb unavailable — procedural house lamps', err)
  }

  // Plan 169 interior table lamp — same load/prepare/fallback pattern as the
  // exterior lantern above, own GLB (Quaternius Furniture Pack `lamp.glb`).
  // `null` on failure just means furnished houses skip the lamp visual+light
  // this session (only `COTTAGE_4X4_A` uses it) — not fatal.
  let lanternTable: THREE.Object3D | null = null
  try {
    const tableLamp = await loadGltf(TABLE_LAMP_URL)
    lanternTable = preparePropFitMax(tableLamp, TABLE_LAMP_FIT_MAX)
  } catch (err) {
    console.warn('[settlement] furniture/lamp.glb unavailable — house interiors skip table lamp', err)
  }

  let torchPostTemplate: THREE.Object3D = createProceduralTorchPost()
  try {
    torchPostTemplate = await loadPropOrFallback(
      VILLAGE_TORCH_URL,
      VILLAGE_TORCH_HEIGHT,
      createProceduralTorchPost,
    )
  } catch {
    /* keep procedural */
  }
  const housePlots = (plan?.plots.filter((p) => p.role === 'house') ?? [])
    .slice()
    .sort((a, b) => (a.familyIndex ?? 0) - (b.familyIndex ?? 0))
  const houseRing = villageSizeConfig(size).houseRingMax * 0.85
  const houseYawRandom = createSeededRandom(seed ^ 0xa11ce)
  const houseAssemblies: HouseAssembly[] = []
  const plannedDefs = clearings.houses.map((_, i) => pickHouseDefinition(size, i, seed))
  let builderReady: HouseBuildContext | null = null
  try {
    const catalog = buildConstructionCatalog()
    const templates = await loadHousePartTemplates(
      catalog,
      plannedDefs.flatMap(houseDefinitionAssetIds),
    )
    builderReady = { catalog, templates }
  } catch (err) {
    console.warn('[settlement] HouseBuilder assets unavailable — catalog GLB houses', err)
  }
  const staticBatch = createHouseStaticBatch()

  for (let i = 0; i < clearings.houses.length; i++) {
    const area = clearings.houses[i]!
    const plot = housePlots[i]
    const outward =
      plot?.rotation ??
      Math.atan2(area.z - clearings.core.z, area.x - clearings.core.x)
    // Face the plaza (inward); outskirts get a seeded yaw jitter (plan 076).
    let yaw = outward + Math.PI
    const dist = Math.hypot(area.x - clearings.core.x, area.z - clearings.core.z)
    if (dist > houseRing * 0.75) {
      yaw += (houseYawRandom() - 0.5) * Math.PI * 0.9
    }

    const def = plannedDefs[i]!
    let hut: THREE.Object3D
    let houseId = def.id
    let definitionId = def.id
    let modelUrl: string | null = null
    let label = def.label ?? 'Chata'
    let examine = def.examine ?? 'Tynkowana chata złożona z modularnych części MegaKit.'
    let hasWalls = def.hasWalls ?? true
    let groundYOffset = def.groundYOffset ?? 0
    let footprintRadius = houseFootprintRadius(def)
    let lampStyle: HouseLampStyle = def.lamp?.style ?? 'wall'
    let lampMount: ResolvedHouseLampMount = def.lamp?.mount
      ? { ...def.lamp.mount, source: 'definition' }
      : {
          x: def.footprint.width * 0.25,
          y: 1.85,
          z: -def.footprint.depth / 2 - 0.12,
          source: 'definitionDefault',
        }

    let builtAssembly: HouseAssembly | null = null
    if (builderReady) {
      const assembly = buildHouse(def, builderReady)
      hut = assembly.root
      builtAssembly = assembly
      houseAssemblies.push(assembly)
    } else {
      const entry = pickHomeHouse(size, i, seed)
      const targetHeight = resolveHouseHeight(entry)
      hut = entry.url
        ? await loadPropOrFallback(entry.url, targetHeight, createHut)
        : (() => {
            const fallback = createHut()
            prepareProp(fallback, targetHeight)
            return fallback
          })()
      const hutBounds = new THREE.Box3().setFromObject(hut)
      const hutHeight = hutBounds.max.y - hutBounds.min.y
      lampMount = resolveHouseLampMount(entry, hut, hutHeight)
      lampStyle = entry.lampStyle
      houseId = entry.id
      definitionId = entry.id
      modelUrl = entry.url
      label = entry.label
      examine = entry.examine
      hasWalls = entry.hasWalls
      groundYOffset = entry.groundYOffset
      footprintRadius = entry.footprintRadius
    }

    hut.rotation.y = yaw
    placeOnGround(hut, area.x, area.z, sampleHeight, groundYOffset)
    hut.name = `house:${houseId}`
    hut.userData.houseId = houseId
    hut.userData.definitionId = definitionId
    hut.userData.houseModelUrl = modelUrl
    hut.userData.hasWalls = hasWalls
    hut.userData.lampMount = { x: lampMount.x, y: lampMount.y, z: lampMount.z }
    hut.userData.lampMountSource = lampMount.source
    group.add(hut)

    const foot = new THREE.Vector3(
      area.x,
      sampleHeight(area.x, area.z) + groundYOffset,
      area.z,
    )
    landmarks.homes.push(foot)

    // Plan 169 — interior furniture, only for houses built through the
    // HouseBuilder assembly path with authored `def.furniture`
    // (`COTTAGE_4X4_A` this session). `hut` is already placed in world
    // space (`hut.rotation.y`/`placeOnGround` above), so furniture-local
    // points only need the same rotate-then-scale-then-translate `hut`
    // itself already carries — same cos/sin convention
    // `houseBuilder.ts`'s `transformHouseCollidersToWorld` uses, kept local
    // here since it also needs the Y axis (unrotated, just scaled+offset).
    const toWorld = (local: HouseVec3): HouseVec3 => {
      const cos = Math.cos(hut.rotation.y)
      const sin = Math.sin(hut.rotation.y)
      const sx = local.x * hut.scale.x
      const sz = local.z * hut.scale.z
      return {
        x: hut.position.x + sx * cos - sz * sin,
        y: hut.position.y + local.y * hut.scale.y,
        z: hut.position.z + sx * sin + sz * cos,
      }
    }
    let bed: SettlementHouseBed | null = null
    if (builtAssembly) {
      const sleepPoint = builtAssembly.interactionPoints.find((p) => p.kind === 'sleep')
      const bedFurniture = def.furniture?.find((f) => f.role === 'bed')
      if (sleepPoint && bedFurniture) {
        const approach = toWorld(sleepPoint.position)
        const bedWorld = toWorld(bedFurniture.position)
        bed = {
          position: { x: bedWorld.x, z: bedWorld.z },
          approach: { x: approach.x, z: approach.z },
          facing: sleepPoint.facing != null ? hut.rotation.y + sleepPoint.facing : null,
        }
      }

      // Chest — procedural visual (no GLB, `world/containerProp.ts`), and the
      // interior table lamp (light + GLB) — both placed as house-local
      // children of `hut` directly (not through `buildHouse()`'s
      // `ConstructionCatalog`-backed static path), so they need the same
      // world-size compensation the exterior lamp already applies below
      // (`invHouseScale`) to cancel out `HOUSE_ASSEMBLY_SCALE`.
      const invHouseScaleFurniture = 1 / Math.max(Math.abs(hut.scale.x), 1e-6)
      const chestFurniture = def.furniture?.find((f) => f.role === 'chest')
      if (chestFurniture) {
        const chest = createPlacedContainerProp()
        chest.position.set(chestFurniture.position.x, chestFurniture.position.y, chestFurniture.position.z)
        chest.rotation.y = chestFurniture.rotationY
        chest.scale.multiplyScalar(invHouseScaleFurniture)
        hut.add(chest)
      }
      // Static mesh only — no independent PointLight. The house's existing
      // exterior-lamp `createHouseLight()` call (below) already adds one
      // unshadowed interior fill light per house; a second `createHouseLight`
      // call here would silently double that (it always bundles its own
      // fill light, see `attachHouseInnerLight` in `houseLighting.ts`) for no
      // visible benefit — not the smallest integration plan 169 asks for.
      const lampFurniture = def.furniture?.find((f) => f.role === 'lamp')
      if (lampFurniture && lanternTable) {
        const lampMesh = lanternTable.clone(true)
        lampMesh.position.set(lampFurniture.position.x, lampFurniture.position.y, lampFurniture.position.z)
        lampMesh.rotation.y = lampFurniture.rotationY
        lampMesh.scale.multiplyScalar(invHouseScaleFurniture)
        hut.add(lampMesh)
      }
    }

    landmarks.houses.push({
      position: foot.clone(),
      houseId,
      definitionId,
      modelUrl,
      label,
      examine,
      footprintRadius,
      lampMount: { x: lampMount.x, y: lampMount.y, z: lampMount.z },
      lampMountSource: lampMount.source,
      bed,
    })

    const lanternTpl = lampStyle === 'wall' ? lanternWall : lanternFloor
    const houseLight = createHouseLight(
      lampMount.y,
      lampMount.x,
      lampMount.z,
      lampStyle,
      lanternTpl,
      lampMount.yaw,
    )
    // World-size compensation; see `createHouseLight` WIP notes (unfinished —
    // wall lantern still too small). Scale children, not the group.
    const invHouseScale = 1 / Math.max(Math.abs(hut.scale.x), 1e-6)
    for (const child of houseLight.object.children) {
      child.scale.multiplyScalar(invHouseScale)
    }
    hut.add(houseLight.object)
    houseLights.push(houseLight)

    if (isDebugMode()) {
      console.info('[house:lamp]', {
        id: houseId,
        style: lampStyle,
        source: lampMount.source,
        anchor: lampMount.source === 'anchor',
        mount: { x: +lampMount.x.toFixed(3), y: +lampMount.y.toFixed(3), z: +lampMount.z.toFixed(3) },
        paste: `lampMount: { x: ${lampMount.x.toFixed(3)}, y: ${lampMount.y.toFixed(3)}, z: ${lampMount.z.toFixed(3)} }`,
      })
    }
    await yieldProp()
  }

  if (houseAssemblies.length > 0) {
    group.add(staticBatch.group)
    for (const assembly of houseAssemblies) {
      assembly.root.updateMatrixWorld(true)
      staticBatch.ingest(assembly)
    }
    staticBatch.commit()
  }

  // A couple of barrels by the stockpile — everyday clutter, purely
  // decorative (plan 044 §1.2).
  const barrelTemplates = await loadPropTemplates(
    [{ url: '/models/settlement/barrel.glb', height: 0.65 }],
    () => createBarrel(1),
  )
  const barrelSpots: Array<[number, number]> = [[1.1, -0.6], [1.6, 0.4]]
  const barrelPlacements: PropPlacement[] = barrelSpots.map(([dx, dz]) => ({
    speciesIndex: 0,
    x: stockX + dx,
    z: stockZ + dz,
    groundY: sampleHeight(stockX + dx, stockZ + dz),
    rotationY: coreRandom() * Math.PI * 2,
    scale: 0.85 + coreRandom() * 0.3,
  }))
  const barrelInstances = buildInstancedProps(barrelTemplates, barrelPlacements, 'settlement-barrels')
  if (barrelInstances) group.add(barrelInstances.group)

  // Household `WaterBarrel` + `AnimalTrough` (plan 122) — one of each in
  // every house's yard, presentation only: the authoritative water quantity
  // lives on `Household` (`settlement/household.ts`), not on these props.
  // Placed at every house regardless of the livestock roll (`spawnLivestock`
  // has its own separate seeded roll) — same simplification as garden/hay
  // decorative placement not tracking who actually eats/drinks there.
  const houseYardPlacements = (offsetDist: number, jitter: number): PropPlacement[] =>
    landmarks.houses.map((house) => {
      const angle = Math.atan2(house.position.z - clearings.core.z, house.position.x - clearings.core.x)
      const spread = (coreRandom() - 0.5) * jitter
      const dist = house.footprintRadius + offsetDist
      const x = house.position.x + Math.cos(angle + spread) * dist
      const z = house.position.z + Math.sin(angle + spread) * dist
      return {
        speciesIndex: 0,
        x,
        z,
        groundY: sampleHeight(x, z),
        rotationY: coreRandom() * Math.PI * 2,
        scale: 0.85 + coreRandom() * 0.25,
      }
    })
  const householdBarrelInstances = buildInstancedProps(
    barrelTemplates,
    houseYardPlacements(HOUSEHOLD_YARD_PROP_OFFSETS.barrel, 0.9),
    'settlement-household-barrels',
  )
  if (householdBarrelInstances) group.add(householdBarrelInstances.group)

  const troughTemplates = [createTrough()]
  const troughInstances = buildInstancedProps(
    troughTemplates,
    houseYardPlacements(HOUSEHOLD_YARD_PROP_OFFSETS.trough, 0.9),
    'settlement-household-troughs',
  )
  if (troughInstances) group.add(troughInstances.group)

  // Household storage container (plan 156) — physical representation of
  // `Household.stock`/`.water`, one per house yard. Presentation only; the
  // authoritative quantity stays on `Household` (`settlement/household.ts`).
  // `landmarks.householdStorages` is same-order as `homes`/`houses` so
  // `createSettlement.ts` can zip it with `households` by index.
  const householdStorageTemplates = await loadPropTemplates(
    [{ url: '/models/settlement/crate.glb', height: 0.6 }],
    () => createCrate(1),
  )
  const householdStoragePlacements = houseYardPlacements(HOUSEHOLD_YARD_PROP_OFFSETS.storage, 0.9)
  landmarks.householdStorages = householdStoragePlacements.map(
    (p) => new THREE.Vector3(p.x, p.groundY, p.z),
  )
  const householdStorageInstances = buildInstancedProps(
    householdStorageTemplates,
    householdStoragePlacements,
    'settlement-household-storage',
  )
  if (householdStorageInstances) group.add(householdStorageInstances.group)

  // Concrete-food visual per household crate above (plan settlements-npcs-010)
  // — same order as `householdStoragePlacements`/`landmarks.householdStorages`,
  // so `createSettlement.ts` can zip it against its own household list the
  // same way it already zips `landmarks.householdStorages`.
  const householdFoodVisuals: FoodStorageVisual[] = householdStoragePlacements.map((p) =>
    createFoodStorageVisual(group, { x: p.x, z: p.z }, sampleHeight),
  )

  // Hay stacks near garden pads (plan 082 B / 095). Pickaxe is a one-time
  // stockpile pickup via item spawners (plan 090), not a decorative prop.
  const hayTemplates = await loadPropTemplates(
    [{ url: '/models/settlement/hay.glb', height: 1.4 }],
    () => createHayBale(2.5),
  )
  const hayGardens = landmarks.gardens.length > 0 ? landmarks.gardens : [landmarks.garden]
  const hayCount = Math.min(2, Math.max(1, hayGardens.length))
  const hayPlacements: PropPlacement[] = []
  for (let i = 0; i < hayCount; i++) {
    const g = hayGardens[i % hayGardens.length]!
    const hayScale: GardenScale =
      (gardenLms.length > 0
        ? gardenLms[i % gardenLms.length]?.gardenScale
        : undefined) ?? 'S'
    const ang = coreRandom() * Math.PI * 2
    const dist = gardenPlotRadius(hayScale) + 1.4 + coreRandom() * 1.2
    const hx = g.x + Math.cos(ang) * dist
    const hz = g.z + Math.sin(ang) * dist
    hayPlacements.push({
      speciesIndex: 0,
      x: hx,
      z: hz,
      groundY: sampleHeight(hx, hz),
      rotationY: coreRandom() * Math.PI * 2,
      scale: 0.9 + coreRandom() * 0.25,
    })
    landmarks.haySpots!.push(new THREE.Vector3(hx, sampleHeight(hx, hz), hz))
  }
  const hayInstances = buildInstancedProps(hayTemplates, hayPlacements, 'settlement-hay')
  if (hayInstances) group.add(hayInstances.group)

  // Infrastructure counts come from centralized `VILLAGE_SIZE_CONFIG` (plan
  // 047) — OUTPOST/SM stay without a village campfire; MD+ get one; LG/XL
  // get a second stockpile. Do not re-encode size thresholds here.
  const infra = villageSizeConfig(size).infrastructure
  if (infra.campfires > 0) {
    const plazaPad = Math.max(2.5, clearings.core.radius - 1.2)
    let { x: fireX, z: fireZ } = placeFromLandmark(
      site,
      landmarkOf(plan, 'campfire', 0),
      -4.5,
      -2,
      sampleHeight,
      waterLevel,
      coreRandom,
      { x: wellX, z: wellZ, minDist: 5.5 },
    )
    // findFlatSpot jitter (±3.5) and well push can eject the fire onto grass
    // beside the square — snap back onto packed-dirt plaza.
    ;({ x: fireX, z: fireZ } = pullIntoDisk(
      fireX,
      fireZ,
      clearings.core.x,
      clearings.core.z,
      plazaPad,
    ))
    ;({ x: fireX, z: fireZ } = pushAwayFrom(fireX, fireZ, wellX, wellZ, 5.5))
    ;({ x: fireX, z: fireZ } = pullIntoDisk(
      fireX,
      fireZ,
      clearings.core.x,
      clearings.core.z,
      plazaPad,
    ))
    await preloadCampfireTemplates()
    const { group: campfire, flame } = createLitCampfireVisual('pit')
    placeOnGround(campfire, fireX, fireZ, sampleHeight)
    group.add(campfire)
    landmarks.campfire = {
      position: new THREE.Vector3(fireX, sampleHeight(fireX, fireZ), fireZ),
      flame,
    }
  }
  let stock2X: number | null = null
  let stock2Z: number | null = null
  if (infra.stockpiles > 1) {
    ;({ x: stock2X, z: stock2Z } = placeFromLandmark(
      site, landmarkOf(plan, 'stockpile', 1), 5.5, -2.5, sampleHeight, waterLevel, coreRandom,
    ))
    const stockpile2 = await loadPropOrFallback(
      WOOD_PILE_URL,
      WOOD_PILE_HEIGHT,
      createStockpile,
    )
    placeOnGround(stockpile2, stock2X, stock2Z, sampleHeight)
    group.add(stockpile2)
    landmarks.stockpileSecondary = new THREE.Vector3(
      stock2X,
      sampleHeight(stock2X, stock2Z),
      stock2Z,
    )
  }

  if (plantForest) {
    const wagonObstacles: Array<{ x: number, z: number, r: number }> = [
      { x: stockX, z: stockZ, r: 2.5 },
      { x: wellX, z: wellZ, r: 2 },
    ]
    if (stock2X != null && stock2Z != null) {
      wagonObstacles.push({ x: stock2X, z: stock2Z, r: 2.5 })
    }
    for (let gi = 0; gi < landmarks.gardens.length; gi++) {
      const g = landmarks.gardens[gi]!
      const scale: GardenScale = gardenLms[gi]?.gardenScale ?? 'S'
      wagonObstacles.push({ x: g.x, z: g.z, r: gardenPlotRadius(scale) })
    }
    for (const home of landmarks.homes) {
      wagonObstacles.push({ x: home.x, z: home.z, r: 2.8 })
    }
    if (landmarks.campfire) {
      wagonObstacles.push({
        x: landmarks.campfire.position.x,
        z: landmarks.campfire.position.z,
        r: 1.5,
      })
    }
    const pose = pickMerchantWagonPose(marketX, marketZ, wagonObstacles)
    try {
      const wagon = await loadGltf('/models/settlement/megakit/wagon.glb')
      preparePropFitMax(wagon, 3.8)
      placeOnGround(wagon, pose.wagonX, pose.wagonZ, sampleHeight)
      wagon.rotation.y = pose.yaw
      group.add(wagon)
      landmarks.merchantWagon = new THREE.Vector3(
        pose.wagonX,
        sampleHeight(pose.wagonX, pose.wagonZ),
        pose.wagonZ,
      )
    } catch (err) {
      console.warn('[settlement] wagon.glb unavailable', err)
    }
    // The merchant's horse is a live `AnimalAgent` (plan fauna-003 follow-up),
    // spawned by `spawnLivestock()` in `createSettlement.ts` — not a
    // decorative mesh built here. Only the spawn point/facing is recorded.
    landmarks.merchantHorseSpawn = { x: pose.horseX, z: pose.horseZ, yaw: pose.yaw }
  }

  await plantEntrancePalisade(group, site, size, sampleHeight, waterLevel, plan, coast, pathCorridors)

  // Village torch posts — plaza ring (MD+) + gate flanks (plan 085).
  // Never sit in the road: gate posts belong on the palisade wing, not in the
  // open gate gap; plaza posts reject path/road corridors.
  {
    const postTpl = torchPostTemplate
    const placeTorchAt = (x: number, z: number, yaw = 0): boolean => {
      if (pointHitsCorridor(x, z, pathCorridors, 0.85)) return false
      if (sampleHeight(x, z) <= waterLevel + 0.55) return false
      const post = postTpl.clone(true)
      post.rotation.y = yaw
      const torch = createVillageTorchLight(post)
      placeOnGround(torch.object, x, z, sampleHeight)
      group.add(torch.object)
      villageTorches.push(torch)
      return true
    }

    // Well-side torch — always present (independent of the plaza ring's
    // size/infra gate below) so the well stays visibly lit at night in
    // every settlement size, not just MD+. Placed directly, not through
    // `placeTorchAt`: the well sits right on/next to the plaza path by
    // design, so `pointHitsCorridor`'s road-avoidance (meant for the
    // freely-roaming plaza-ring/gate posts below) rejected every candidate
    // around it and silently placed nothing.
    {
      // well.glb's fitted footprint (WELL_HEIGHT) is ~0.53 half-extent on X,
      // ~0.80 on Z; the torch post's is ~0.2–0.3. 0.75 tucks it right up
      // against the well.
      const ang = Math.atan2(wellZ - clearings.core.z, wellX - clearings.core.x)
      const tx = wellX + Math.cos(ang) * 0.75
      const tz = wellZ + Math.sin(ang) * 0.75
      if (sampleHeight(tx, tz) > waterLevel + 0.55) {
        const post = postTpl.clone(true)
        // torch.glb's holder brackets face the model's local +Z, not the
        // "away from well" direction `placeTorchAt`'s `ang + Math.PI`
        // convention assumes elsewhere — −π/2 turns them to face the well.
        post.rotation.y = ang + Math.PI - Math.PI / 2
        const torch = createVillageTorchLight(post)
        placeOnGround(torch.object, tx, tz, sampleHeight)
        group.add(torch.object)
        villageTorches.push(torch)
      }
      await yieldProp()
    }

    const infra = villageSizeConfig(size).infrastructure
    if (infra.campfires > 0) {
      // Outside packed plaza dirt a bit, toward house ring — less likely on
      // radial paths that cross the square.
      const plazaR = Math.max(3.5, clearings.core.radius * 1.05)
      const count = size === 'XL' ? 4 : size === 'LG' ? 3 : 2
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + 0.55
        let tx = clearings.core.x + Math.cos(ang) * plazaR
        let tz = clearings.core.z + Math.sin(ang) * plazaR
        if (Math.hypot(tx - wellX, tz - wellZ) < 3.2) continue
        if (landmarks.campfire) {
          const c = landmarks.campfire.position
          if (Math.hypot(tx - c.x, tz - c.z) < 2.8) continue
        }
        // Nudge outward once if the first try lands on a corridor.
        if (pointHitsCorridor(tx, tz, pathCorridors, 0.85)) {
          tx = clearings.core.x + Math.cos(ang) * (plazaR + 1.4)
          tz = clearings.core.z + Math.sin(ang) * (plazaR + 1.4)
        }
        placeTorchAt(tx, tz, ang + Math.PI)
        await yieldProp()
      }
    }

    // Gate flanks — same entrance math as palisade, but place on the *first
    // wall segment* angle (outside the road gap), not inside it.
    {
      const coastEnv: CoastalSamplers = coast ?? { sampleHeight, waterLevel }
      const radius = plan?.boundary.radius ?? villageSizeConfig(size).footprintRadius * 0.72
      const entrances = plan?.entrances ?? []
      const inlandEntrances = entrances.filter((e) => !isCoastalPlacement(e.x, e.z, coastEnv))
      const entrance = inlandEntrances.find((e) => e.kind === 'road') ?? inlandEntrances[0]
      if (entrance || entrances.length === 0) {
        const outward = entrance
          ? Math.atan2(entrance.z - site.z, entrance.x - site.x)
          : 0
        const gateX = site.x + Math.cos(outward) * radius
        const gateZ = site.z + Math.sin(outward) * radius
        if (!isCoastalPlacement(gateX, gateZ, coastEnv)) {
          let maxCorridorHalf = 5
          for (const seg of pathCorridors) {
            if (seg.halfWidth > maxCorridorHalf) maxCorridorHalf = seg.halfWidth
          }
          const gateHalf = Math.max(
            PALISADE_GATE_HALF_ANGLE,
            Math.atan2(maxCorridorHalf + WALL_HALF_LENGTH, Math.max(radius, 1)),
          )
          const wallStep = (WALL_HALF_LENGTH * 2) / Math.max(radius, 1)
          // First palisade stake sits at gateHalf + 0.5*step — put torch there
          // (slightly further out along the ring so it clears the dirt strip).
          const flank = gateHalf + wallStep * 0.55
          for (const side of [-1, 1] as const) {
            const ang = outward + side * flank
            const tx = site.x + Math.cos(ang) * radius
            const tz = site.z + Math.sin(ang) * radius
            if (isCoastalPlacement(tx, tz, coastEnv)) continue
            placeTorchAt(tx, tz, ang + Math.PI)
            await yieldProp()
          }
        }
      }
    }
  }

  // Sparse plaza cobble near the well (plan 140) — same MD+ gate as the
  // campfire/torch ring above; OUTPOST/SM stay bare dirt. Decorative clutter
  // only, not a second road system: never touches `pathCorridors`.
  {
    const infra = villageSizeConfig(size).infrastructure
    if (infra.campfires > 0) {
      let cobbleTemplate: THREE.Object3D | null = null
      try {
        const cobble = await loadGltf(COBBLE_URL)
        preparePropFitMax(cobble, COBBLE_FIT_MAX)
        cobbleTemplate = cobble
      } catch (err) {
        console.warn('[settlement] rock_path_round_wide.glb unavailable — procedural cobble', err)
      }
      const cobbleCount = cobbleCountForSize(size, seed)
      const cobbleR = Math.max(2.2, clearings.core.radius * 0.55)
      for (let i = 0; i < cobbleCount; i++) {
        const ang = coreRandom() * Math.PI * 2
        const dist = cobbleR * (0.5 + coreRandom() * 0.6)
        const cx = wellX + Math.cos(ang) * dist
        const cz = wellZ + Math.sin(ang) * dist
        if (Math.hypot(cx - wellX, cz - wellZ) < 1.6) continue
        if (landmarks.campfire) {
          const c = landmarks.campfire.position
          if (Math.hypot(cx - c.x, cz - c.z) < 1.6) continue
        }
        if (pointHitsCorridor(cx, cz, pathCorridors, 0.6)) continue
        if (sampleHeight(cx, cz) <= waterLevel + 0.4) continue
        const plate = cobbleTemplate ? cobbleTemplate.clone(true) : createCobblePlate(1)
        plate.scale.multiplyScalar(0.85 + coreRandom() * 0.3)
        plate.rotation.y = coreRandom() * Math.PI * 2
        placeOnGround(plate, cx, cz, sampleHeight)
        group.add(plate)
        await yieldProp()
      }
    }
  }

  if (plantForest) {
    const random = createSeededRandom(seed ^ 0x7e3d)
    const treeTemplates = await loadPropTemplates(TREE_SPECS, () => createTree(1))
    const bushTemplates = await loadPropTemplates(BUSH_SPECS, () => createBush(1))

    // Hidden-treasure marker flowers (quick task) — 3 fixed flower_clump_1
    // clumps (`BUSH_SPECS` index 2, same GLB the world's own flower meadows
    // use), just past the plaza edge near the well/campfire (not in the
    // middle of the packed-dirt square), doubling as invisible shovel-dig
    // markers (`groundActions.ts` checks `landmarks.hiddenTreasureMarkers`).
    // Purely decorative: no collider, no `Interactable`, home settlement only
    // (`plantForest` is only ever true for `def.isHome`, see this function's
    // doc comment).
    {
      const markerSpots = hiddenTreasureMarkerPositions({ core: clearings.core, campfire: landmarks.campfire })
      const markers: THREE.Vector3[] = []
      for (let i = 0; i < markerSpots.length; i++) {
        const spot = markerSpots[i]!
        markers.push(new THREE.Vector3(spot.x, sampleHeight(spot.x, spot.z), spot.z))
        const flower = clonePropWithYaw(bushTemplates, 2, 0.8, (i * Math.PI) / 3)
        placeOnGround(flower, spot.x, spot.z, sampleHeight)
        group.add(flower)
      }
      landmarks.hiddenTreasureMarkers = markers
    }

    const treeCounter = { n: 0 }
    const bushCounter = { n: 0 }
    const bushPlacements: PropPlacement[] = []
    // Inter-settlement roads + local VillagePlan paths — trees on the dirt strip
    // came from only checking house↔core chords + segmentsNear (no local paths).
    const treeCorridors = pathCorridors

    const sizeCfg = villageSizeConfig(size)
    const minHouseDist = clearings.houses.reduce(
      (min, h) => Math.min(min, Math.hypot(h.x - clearings.core.x, h.z - clearings.core.z)),
      Infinity,
    )
    const courtyardRadius = Math.max(
      clearings.core.radius * 1.6,
      Number.isFinite(minHouseDist) ? minHouseDist * 0.55 : clearings.core.radius * 1.6,
    )

    // Scale forests to map size (halfExtent), not fixed village yards.
    const midMin = halfExtent * 0.32
    const midMax = halfExtent * 0.55
    const farMin = halfExtent * 0.55
    const farMax = halfExtent * 0.88

    // Sparse plaza trees (0–3) between core and house ring — not a woodlot (plan 076).
    const plazaTreeCount = Math.floor(random() * 4)
    const plazaBandMin = clearings.core.radius + 2.5
    const plazaBandMax = Math.max(plazaBandMin + 2, courtyardRadius * 0.92)
    for (let i = 0; i < plazaTreeCount; i++) {
      const angle = random() * Math.PI * 2
      const dist = plazaBandMin + random() * Math.max(0.5, plazaBandMax - plazaBandMin)
      const tx = clearings.core.x + Math.cos(angle) * dist
      const tz = clearings.core.z + Math.sin(angle) * dist
      if (blocksPathOrClearing(tx, tz, clearings, treeCorridors, 0)) continue
      const y = sampleHeight(tx, tz)
      if (y <= waterLevel + 0.55) continue
      const sizeClass = rollSizeClass(random())
      const sizeJitter = random()
      const initialStage = rollLivingAge({
        sizeClass,
        ageRoll: random(),
        oldRoll: random(),
        saplingChance: 0.05,
        youngChance: 0.2,
      })
      const speciesIndex = treeCounter.n % Math.max(1, treeTemplates.length)
      const tree = cloneProp(
        treeTemplates,
        treeCounter.n++,
        visualScaleForTree(speciesIndex, initialStage, sizeClass, sizeJitter),
      )
      placeOnGround(tree, tx, tz, sampleHeight)
      const id = makeTreeId(seed, tx, tz, speciesIndex)
      tree.userData.treeId = id
      tree.userData.treeSizeClass = sizeClass
      tree.userData.treeSizeJitter = sizeJitter
      tree.userData.treeSpeciesIndex = speciesIndex
      tree.userData.treeInitialStage = initialStage
      group.add(tree)
      landmarks.trees.push({
        id,
        position: new THREE.Vector3(tx, y, tz),
        mesh: tree,
        speciesIndex,
        sizeClass,
        sizeJitter,
        initialStage,
      })
      await yieldProp()
    }

    // NPC woodlots just outside the house ring — never inside the courtyard.
    const woodlotR = Math.max(sizeCfg.houseRingMax * 0.95, courtyardRadius + 6)
    const nearCenters: Array<[number, number]> = [
      [woodlotR * 0.85, woodlotR * 0.25],
      [-woodlotR * 0.8, woodlotR * 0.35],
    ]
    for (const [dx, dz] of nearCenters) {
      plantTreeCluster(
        group,
        landmarks,
        treeTemplates,
        bushTemplates,
        site.x + dx,
        site.z + dz,
        'small',
        sampleHeight,
        waterLevel,
        halfExtent,
        clearings,
        treeCorridors,
        random,
        treeCounter,
        bushCounter,
        seed,
        courtyardRadius,
        bushPlacements,
      )
      await yieldProp()
    }

    // Mid forest belt — away from houses, still walkable from village.
    const midCount = 12 + Math.floor(random() * 5)
    for (let i = 0; i < midCount; i++) {
      const angle = (i / midCount) * Math.PI * 2 + (random() - 0.5) * 0.55
      const dist = midMin + random() * (midMax - midMin)
      plantTreeCluster(
        group,
        landmarks,
        treeTemplates,
        bushTemplates,
        site.x + Math.cos(angle) * dist,
        site.z + Math.sin(angle) * dist,
        random() < 0.35 ? 'small' : 'medium',
        sampleHeight,
        waterLevel,
        halfExtent,
        clearings,
        treeCorridors,
        random,
        treeCounter,
        bushCounter,
        seed,
        courtyardRadius,
        bushPlacements,
      )
      await yieldProp()
    }

    // Far belt toward map edges.
    const farCount = 14 + Math.floor(random() * 6)
    for (let i = 0; i < farCount; i++) {
      const angle = random() * Math.PI * 2
      const dist = farMin + random() * (farMax - farMin)
      plantTreeCluster(
        group,
        landmarks,
        treeTemplates,
        bushTemplates,
        site.x + Math.cos(angle) * dist,
        site.z + Math.sin(angle) * dist,
        random() < 0.3 ? 'small' : 'medium',
        sampleHeight,
        waterLevel,
        halfExtent,
        clearings,
        treeCorridors,
        random,
        treeCounter,
        bushCounter,
        seed,
        courtyardRadius,
        bushPlacements,
      )
      await yieldProp()
    }

    // Fill the rest of the map with scattered clumps (not centered on village).
    const fillCount = 10 + Math.floor(random() * 6)
    for (let i = 0; i < fillCount; i++) {
      const tx = (random() * 2 - 1) * (halfExtent * 0.9)
      const tz = (random() * 2 - 1) * (halfExtent * 0.9)
      // Keep a clear meadow around the settlement.
      if (Math.hypot(tx - site.x, tz - site.z) < midMin * 0.85) continue
      plantTreeCluster(
        group,
        landmarks,
        treeTemplates,
        bushTemplates,
        tx,
        tz,
        random() < 0.4 ? 'small' : 'medium',
        sampleHeight,
        waterLevel,
        halfExtent,
        clearings,
        treeCorridors,
        random,
        treeCounter,
        bushCounter,
        seed,
        courtyardRadius,
        bushPlacements,
      )
      await yieldProp()
    }

    const bushInstances = buildInstancedProps(bushTemplates, bushPlacements, 'settlement-bushes')
    if (bushInstances) group.add(bushInstances.group)
  }

  return {
    group,
    landmarks,
    houseLights,
    villageTorches,
    houseAssemblies,
    storageVisual: { wood: woodStorageVisual, settlementFood: settlementFoodVisual, householdFood: householdFoodVisuals },
  }
}

export function disposeSettlementGroup(group: THREE.Group): void {
  disposeObject3D(group)
}
