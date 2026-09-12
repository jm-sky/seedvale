import { Group, type Object3D, type Scene, type Vector3 } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { RoadCorridorSegment } from '../terrain/chunkHeightmap'
import type { LocalWaterSample } from '../terrain/waterSample'
import type { AnimalAttractionSource } from '../world/animalAttractionSource'
import type { GrassForageService } from '../world/createGrassForagePatches'
import type { PlayerStealthState } from './playerAwareness'
import {
  disposeObject3D,
  type GltfAsset,
  loadGltfAsset,
  prepareProp,
} from '../assets/loadGltf'
import { isSystemEnabled, isWildBoarGlbEnabled } from '../debug/debugMode'
import { distanceToSegment } from '../math/segment'
import { getAgentCpuDiag } from '../perf/agentCpuDiag'
import { createCaveMouth, createThicket, tintPropMaterials } from '../settlement/props'
import { useBootMark } from '../shared/bootMark'
import { isCoastalPlacement } from '../terrain/coastPlacement'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { skyParamsFromTime } from '../world/dayNight'
import { createSeededRandom } from '../world/parseSeed'
import { gameHoursToRealSeconds } from '../world/timeConversion'
import {
  ANIMAL_DEFS,
  AnimalAgent,
  type AnimalKind,
  type AnimalLifeStage,
  forageEdgeScore,
  type NearbyNpcCandidate,
  type VillageInfo,
} from './AnimalAgent'
import {
  type AnimalCaveContext,
  animalCaveEntityDimensions,
  type AnimalCaveWorldContract,
  type AnimalHabitatBinding,
  resolveAnimalCaveHabitat,
} from './animalCaveHabitat'
import { findSettlementOutskirtsDestination } from './animalRoaming'
import {
  defaultSpawnPointScenarioFields,
  type PreySpawner,
  restoreSpawnPointState,
  type SavedSpawnPointState,
  shouldDeplete,
  SPAWNER_RADIUS,
  tickSpawnPointRecovery,
  updateSpawners,
} from './AnimalSpawner'
import {
  type AnimalVariant,
  wolfDenInitialFillVariant,
} from './animalVariants'
import {
  HERD_CLUSTER_RADIUS,
  HERD_SPECIES,
  JUVENILE_SPAWN_CHANCE,
} from './herdCohesion'
import {
  createPersistentOccupantRegistry,
  ordinaryHabitatCapacity,
  persistentAnimalId,
  type PersistentOccupantDecl,
  type PersistentOccupantSnapshot,
} from './persistentOccupants'
import { createBoarModel, createDuckModel, createRabbitModel } from './proceduralAnimals'
import {
  activateWolfDenProblem,
  canOfferSettlementTrip,
  effectiveMaxPreyCount,
  isQuestSpawnPointPermanentlyDestroyed,
  recordSettlementTripOpportunity,
  SETTLEMENT_TRIP_STAY_SEC,
  shouldActivateWolfDenProblem,
} from './wolfDenScenario'

/** Extra clearance past each corridor's `halfWidth` — matches forest-belt
 *  road avoidance in `props.ts` (`ROAD_TREE_CLEARANCE`). */
const SPAWNER_ROAD_CLEARANCE = 1

/** Label height above ground for a cave mouth (prop ~1.1 m tall at scale 1). */
const CAVE_LABEL_HEIGHT = 1.8
/** Label above a thicket crown (~createTree at ~0.7 scale → crown ~2.5 m). */
const THICKET_LABEL_HEIGHT = 3.2
const DEFAULT_SPAWNER_LABEL_HEIGHT = 0.6

export type Fauna = {
  update: (
    dt: number,
    observerPos: Vector3,
    timeOfDay: number,
    /** `dayNight.elapsedDays` — drives the low-frequency spawn-point
     *  recovery check (plan 125 §8), at most once per in-game day. */
    worldDays: number,
    litFires: readonly { x: number, z: number }[],
    /** Loaded settlements' centers + real footprint radii
     *  (`SettlementsManager.getLoaded()`, plan 080) — wild animals react to
     *  proximity to any of these, see `AnimalAgent.ts`'s village-avoidance/
     *  flee-bias (plan 044 §2.3/§2.4). Owned livestock (horse/cow/sheep/
     *  chicken) isn't spawned here at all — see `settlement/livestock.ts`,
     *  spawned per-settlement instead. */
    villages: readonly VillageInfo[],
    /** Bounded/local live household/player livestock candidates for wild
     *  predator prey acquisition (plan fauna-026) — assembled once per fauna
     *  pass by the caller (`gameLoop.ts`'s `buildHuntableLivestock`, after
     *  `SettlementsManager.update()` so this frame's stream-in/out is
     *  reflected) from currently loaded settlements' livestock plus detached
     *  livestock, deduplicated by `animalId`. Forwarded unchanged to every
     *  wild `AnimalAgent.update()`'s `huntableLivestock` — never merged into
     *  `others`/the wild `agents` pool, never ticked here. Membership in
     *  this set, not `AnimalDef.role`, is what makes an agent
     *  huntable-as-livestock (see `AnimalUpdateContext.huntableLivestock`'s
     *  own doc for why `role` alone can't tell livestock apart). Required
     *  (not optional) so TypeScript forces every caller to make this
     *  composition decision explicitly instead of silently omitting real
     *  livestock huntability. */
    huntableLivestock: readonly AnimalAgent[],
    /** Player + nearby NPCs for predator crowd fear (plan 056). Default 1. */
    nearbyHumanCount?: number,
    /** Fauna→player damage callback when a predator bites in contact range. */
    onHumanHit?: (damage: number, attackerX: number, attackerZ: number) => void,
    /** Sneak/movement stealth inputs (plan 124 §4). Defaults to "no effect"
     *  (see `AnimalAgent.update`'s own default) when omitted. */
    playerStealth?: PlayerStealthState,
    /** Bounded/local NPC candidates for frenzied-predator targeting (plan
     *  179 §5/§7) — forwarded straight to `AnimalAgent.update`, see its own
     *  doc. Loaded settlements' NPCs, not a world scan. */
    nearbyNpcs?: readonly NearbyNpcCandidate[],
    /** Fauna→NPC damage callback (plan 179 §9/§11), mirrors `onHumanHit`.
     *  `attackerAnimalId` is diagnostic-only, see `AnimalAgent`'s own doc. */
    onNpcHit?: (targetId: string, damage: number, attackerX: number, attackerZ: number, attackerAnimalId: string) => void,
    /** Aggression/alert audio hook (plan 188 §11) — forwarded to each
     *  `AnimalAgent.update()`, fired once per predator on the rising edge of
     *  committing to a human chase (see `AnimalAgent`'s own doc). */
    onAnimalAggro?: (kind: AnimalKind, x: number, z: number) => void,
    /** Spontaneous ambient vocalization hook (plan fauna-009 §1) — forwarded
     *  to each `AnimalAgent.update()`'s spontaneous cooldown roll, same as
     *  livestock's own `onAnimalVocalize` (`createSettlement.ts`). Wild
     *  fauna's only currently-configured spontaneous vocalizer is `wolf`
     *  (howl); every other wild kind has no `SPONTANEOUS_VOCALIZE_CONFIG`
     *  entry and this stays a no-op for it. */
    onAnimalVocalize?: (kind: AnimalKind, x: number, z: number) => void,
    /** Currently active attraction sources (plan fauna-023 §11) — assembled
     *  once by the caller (`gameLoop.ts`) and forwarded unchanged into every
     *  `AnimalAgent.update()` call below, never a per-animal query. Defaults
     *  to none so existing callers/tests keep prior behaviour. */
    attractionSources?: readonly AnimalAttractionSource[],
    /** Atomic dropped-food consume/peek for attraction completion. */
    consumeAttractedFood?: (droppedItemId: string) => { kind: import('../items/items').ItemKind, foodBatch?: import('../items/foodFreshness').FoodBatch } | null,
    peekAttractedFood?: (droppedItemId: string) => { kind: import('../items/items').ItemKind, foodBatch?: import('../items/foodFreshness').FoodBatch } | null,
    onAttractedFoodConsumed?: (event: {
      animalId: string
      animalKind: import('./AnimalAgent').AnimalKind
      spawnPointId?: string
      itemKind: import('../items/items').ItemKind
    }) => void,
    /** Player-as-observer presentation inputs (npc-023) — forwarded to each
     *  wild `AnimalAgent.update()`. */
    playerObservation?: import('../simulation/observation').PlayerObservationInput,
  ) => void
  dispose: () => void
  /** Deterministic time-skip catch-up (plan 196) — called once by
   *  `gameLoop.ts` on `skip.justFinished`, mirroring `SettlementsManager.
   *  resolveTimeSkip`. `update()` itself is gated off entirely while a skip
   *  is active, so this is the sole place fauna state advances for that
   *  period — see `AnimalAgent.resolveTimeSkip`'s own doc for why a single
   *  one-shot call (not a stepped replay like NPC's) is sufficient here. */
  resolveTimeSkip: (hours: number, dayLengthSec: number) => void
  getAgents: () => AnimalAgent[]
  getSpawners: () => readonly PreySpawner[]
  /** True once every wolf originally spawned by the wolf den (`WOLF_DEN_ID`,
   *  plan 093 Etap E) is dead — `false` if the den has none tracked yet
   *  (including a failed placement) or any tracked wolf is still alive. */
  isWolfDenCleared: () => boolean
  /** Label suffix (e.g. quest `!`/`?`) for one spawner's CSS2D label — set
   *  externally (e.g. by a QuestManager), mirrors `NpcAgent.setQuestMarker`. */
  setSpawnerMarker: (spawnerId: string, marker: string | null) => void
  /** Player "Zniszcz" on a `depleted` spawn point (plan 125 §6 / plan 137) —
   *  moves it to `disabled`, burns its prop dark and carves a charcoal scorch
   *  patch. Applies to cave/thicket **and** `wolfDen` (a cleared den is
   *  burnable; it still never respawns). Caller (`createApp.ts`) is
   *  responsible for the busy channel, the 4 branches and lighting the fire;
   *  returns `false` (no state change, no branches should be spent) if
   *  `spawnerId` isn't found or isn't currently `depleted`. */
  destroySpawner: (spawnerId: string, nowDays: number) => boolean
  /** Permanent habitat destruction for quest `destroy_spawn_point` (plan
   *  quests-progression-007) — accepts stable `WOLF_DEN_ID` or a real
   *  `PreySpawner.id`. */
  isQuestSpawnPointPermanentlyDestroyed: (questSpawnerId: string) => boolean
  /** Sparse persistent habitat-occupant snapshot (plan fauna-018) — live
   *  capture plus tombstones, for save/load and in-session rebuild carry. */
  snapshotPersistentOccupants: () => PersistentOccupantSnapshot
}

/** Where a species prefers to spawn relative to the home settlement (plan
 *  044 §2.1/§2.2's habitat preferences): `open` is the original ring used by
 *  wolf/fox (no habitat check beyond dry land), `meadow`/`forest`/`water` add
 *  a `sampleForestFactor`/shoreline check for the new wild species. `edge`
 *  (plan fauna-016 §1) is deer/stag's own transitional forest-edge band —
 *  not a plain binary forest/meadow split, see `habitatFilterFor`'s `edge`
 *  case. Domestic livestock used to have a `farmstead` profile here — moved
 *  to `settlement/livestock.ts` (house-anchored, per-settlement, see the
 *  village livestock ownership plan) since a settlement-center ring can't
 *  express "belongs to this specific house". */
type SpawnProfile = 'open' | 'meadow' | 'forest' | 'water' | 'edge'
type SpawnSpec = { kind: AnimalKind, count: number, profile: SpawnProfile }

const SPAWNS: SpawnSpec[] = [
  { kind: 'wolf', count: 2, profile: 'open' },
  { kind: 'fox', count: 2, profile: 'open' },
  { kind: 'deer', count: 4, profile: 'edge' },
  { kind: 'stag', count: 2, profile: 'edge' },
  { kind: 'rabbit', count: 3, profile: 'meadow' },
  { kind: 'duck', count: 2, profile: 'water' },
  { kind: 'boar', count: 2, profile: 'forest' },
]

/** [minOffset, maxOffset] *past* the settlement's real footprint radius
 *  (`footprintRadius` — `VILLAGE_SIZE_CONFIG.footprintRadius`, see
 *  `settlement/families.ts`) for each `SpawnProfile` (plan 080) — starts a
 *  bit past `AnimalAgent.ts`'s `VILLAGE_AVOID_MARGIN` so a freshly-spawned
 *  wild animal's own home point isn't already inside the zone its wander
 *  logic then refuses to path back into. Offset widths match the original
 *  flat-radius bands (18/18/21/20); only the anchor changed from a fixed
 *  guess (~20) to the settlement's real boundary, which ranges 22 (`OUTPOST`)
 *  to 72 (`XL`). `edge` (plan fauna-016 §1) reuses the old `open` band that
 *  deer/stag were placed with before this plan. */
const SPAWN_RING_OFFSET: Record<SpawnProfile, [number, number]> = {
  open: [6, 24],
  meadow: [6, 24],
  forest: [6, 27],
  water: [4, 24],
  edge: [6, 24],
}

/** [minOffset, maxOffset] past the settlement's real footprint radius for
 *  cave/thicket/wolfDen habitat spawners (plan 080) — same reasoning as
 *  `SPAWN_RING_OFFSET`, widths matching the original flat 45–65 band.
 *  Exported so `worldBundle.ts`'s `buildFauna` can size its
 *  `roadCorridorsNear` query to actually cover the (now size-dependent)
 *  spawner ring instead of a fixed guess. */
export const SPAWNER_RING_OFFSET: [number, number] = [25, 45]

/** Minimum distance (world units) between any two wild-fauna spawn points
 *  placed while building one settlement's fauna — ring spawns and cave/
 *  thicket spawners share one running list so e.g. a cave spawner can't land
 *  next to a thicket spawner, or one species' initial spawn next to
 *  another's (plan 080). Not applied to `updateSpawners`'s runtime
 *  respawn-near-spawner call — that's intentionally close to its own
 *  spawner, not a new independent spawn point. */
const MIN_SPAWN_SEPARATION = 10

/** Clearance (world units) from a river's water edge for any wild spawn
 *  position. `sampleHeight <= waterLevel` cannot see a river channel at all
 *  when the channel's bed sits above the global water level (any stream above
 *  sea level), so a spawn point could land in flowing water and read as dry
 *  ground. Applies to every wild spawn, prey and predator alike. */
const SPAWN_RIVER_CLEARANCE = 1.5
/** Wider berth for a habitat spawn *point* — a cave mouth / thicket / den is a
 *  physical prop with a footprint plus the pack that lives around it, so
 *  "not in the water" is not enough; it must sit on real bank. Generic across
 *  every `SPAWNER_SPECS` entry, never a per-species exception. */
const SPAWNER_RIVER_CLEARANCE = 6

/** Whether a candidate spawn position keeps `clearance` between itself and a
 *  river's water edge, given `ChunkManager.riverShoreDistance`'s signed
 *  distance there (negative inside the water, `null` with no river nearby,
 *  `undefined` when the caller supplied no river lookup at all). Pure so the
 *  "no river data means no restriction" contract is pinned by a test rather
 *  than re-read off the call sites. */
export function clearsRiverChannel(
  distanceToWaterEdge: number | null | undefined,
  clearance: number,
): boolean {
  return distanceToWaterEdge == null || distanceToWaterEdge >= clearance
}

/** True when `(x, z)` sits within `clearance` of any road corridor's own
 *  `halfWidth` (plan fauna-016 §2) — the same corridor-geometry check
 *  `spawnerSiteOk()` already applies to cave/thicket/wolfDen placement,
 *  pulled out as a pure/exported function so ordinary wild ring-spawn
 *  candidates can share it instead of a second road representation. */
export function isNearRoadCorridor(
  x: number,
  z: number,
  roadSegments: readonly RoadCorridorSegment[],
  clearance: number,
): boolean {
  for (const seg of roadSegments) {
    if (distanceToSegment(x, z, seg.ax, seg.az, seg.bx, seg.bz) < seg.halfWidth + clearance) return true
  }
  return false
}

/** Deer/stag forest-edge spawn-habitat acceptance (plan fauna-016 §1) —
 *  reuses `AnimalAgent.ts`'s `forageEdgeScore` (same edge-density peak
 *  already used for forage-target suitability) rather than a second
 *  edge-scoring function, so "spawn habitat" and "forage suitability" can
 *  never drift apart for the same forest reading. A transitional band
 *  (neither open meadow nor deep forest), not a binary `forest > x`
 *  threshold — see the plan's §1 "unikać prostego binarnego forest=true". */
export function isDeerEdgeHabitat(forestFactor: number): boolean {
  return forageEdgeScore(forestFactor) > 0.5
}

/** "Zniszcz" burn-site (plan 125 §7, enlarged in plan 137) — a wide, shallow
 *  charcoal patch around the habitat prop, not a second walk-in pit. The
 *  lit fire + darkened prop + vertex-color scorch are the burnt-site read. */
const BURN_PATCH_RADIUS = 7
const BURN_PATCH_DEPTH = 0.15
/** Tint applied to a destroyed spawn point's prop (`tintPropMaterials`, same
 *  technique as `AnimalAgent.markDangerous()`) — near-black char, not the
 *  "dangerous" red-black. */
const BURNED_SPAWNER_TINT_HEX = 0x0a0806

/** Cave depression carve (plan 083) — a real terrain pit under the rock
 *  ring, replacing the old flat dark prop disc. Sized for a walk-in opening,
 *  not shovel-dig scale (`terrain/dig.ts`'s `DIG_RADIUS`/`DIG_DEPTH_SOIL` are
 *  far too small to read as a cave mouth). */
const CAVE_DEPRESSION_RADIUS = 2.6
const CAVE_DEPRESSION_DEPTH = 1.8
/** Skip carving into terrain that already reads as bare mountain rock — same
 *  threshold `terrain/dig.ts`'s `getDigProfileAt` rejects digging into,
 *  duplicated locally since it's fauna-placement-specific and `dig.ts`
 *  doesn't export it. */
const CAVE_ROCK_MOUNTAIN_RIDGE_THRESHOLD = 0.3
/** Radius (world units) `measureSlope` samples around a cave candidate. */
const CAVE_SLOPE_SAMPLE_RADIUS = 3
/** Minimum height drop across `CAVE_SLOPE_SAMPLE_RADIUS` for a site to count
 *  as "sloped" — below this, the cave falls back to flat-ground placement/
 *  orientation (facing away from the settlement, the pre-083 behavior). */
const CAVE_MIN_SLOPE_DROP = 0.6

/** Steepest-descent direction + height drop across `radius` around (cx, cz)
 *  — 8-direction sample, same shape as `settlement/villagePlanner.ts`'s
 *  `downhillAngle`. `yaw` is Three.js Y-rotation convention (`atan2(dx, dz)`,
 *  matching how `createCaveMouth`'s `mouth.rotation.y` is already set
 *  elsewhere in this file) so an object can be oriented to open toward the
 *  downhill side; `drop` is ~0 on flat ground. Pure — no Three.js dependency
 *  — exported for unit testing. */
export function measureSlope(
  cx: number,
  cz: number,
  radius: number,
  sampleHeight: HeightSampler,
): { yaw: number, drop: number } {
  const centerH = sampleHeight(cx, cz)
  let bestDrop = 0
  let bestYaw = 0
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const dx = Math.cos(angle) * radius
    const dz = Math.sin(angle) * radius
    const drop = centerH - sampleHeight(cx + dx, cz + dz)
    if (drop > bestDrop) {
      bestDrop = drop
      bestYaw = Math.atan2(dx, dz)
    }
  }
  return { yaw: bestYaw, drop: bestDrop }
}

/** Habitat spawners — see docs/plans/archive/2026-08-07--predator-prey-system.md.
 *  `rockDen` (renamed from `cave` — plan fauna-019 §8, a purely decorative
 *  `createCaveMouth()` prop, never a real walk-in cave) are predator dens
 *  (wolf, and now bear — plan 188: each is its own physical `PreySpawner`
 *  instance/world location, a rock den is not a singleton "the bear den"
 *  resource, see `spawnerId` below); thickets are deer cover. `wolfDen`
 *  (plan 093 Etap E) piggybacks on the same list/shape for a labeled quest
 *  den — `respawnIntervalDays: Infinity` keeps `updateSpawners` from ever
 *  repopulating it; its initial pack is spawned once, tagged with
 *  `spawnPointId` so a cleared den can deplete and be burned. RockDen/thicket
 *  intervals are game-days (plan 139). Multiple entries of the same `type`
 *  are supported (see `spawnerId` below) — a bear den doesn't turn the
 *  existing wolf den into a multi-species spawner, it's simply a second
 *  `rockDen`-type habitat placed independently by the same generic loop. */
export const SPAWNER_SPECS: {
  type: PreySpawner['type']
  kind: AnimalKind
  respawnIntervalDays: number
  maxPreyCount: number
}[] = [
  { type: 'rockDen', kind: 'wolf', respawnIntervalDays: 2, maxPreyCount: 2 },
  { type: 'thicket', kind: 'deer', respawnIntervalDays: 1, maxPreyCount: 3 },
  { type: 'wolfDen', kind: 'wolf', respawnIntervalDays: Infinity, maxPreyCount: 2 },
  // Bear den — solitary occupant, slower respawn than the wolf den.
  { type: 'rockDen', kind: 'bear', respawnIntervalDays: 3, maxPreyCount: 1 },
]

/** Stable on-disk id segment per `type` (plan fauna-019 §8) — decoupled from
 *  the type label itself so the `cave` -> `rockDen` rename never changes an
 *  existing save's spawner id / `SavedSpawnPointState` key. `rockDen` keeps
 *  deriving the pre-rename `cave` segment; every other type still derives
 *  its own name, unchanged. */
const SPAWNER_ID_SEGMENT: Record<PreySpawner['type'], string> = {
  rockDen: 'cave',
  thicket: 'thicket',
  grove: 'grove',
  wolfDen: 'wolfDen',
}

/** Stable id for a `SPAWNER_SPECS` entry (plan 188) — `${settlementId}:${segment}`
 *  for the first spawner of a given `type` (unchanged from pre-188 saves, which
 *  only ever had one spawner per `type`), `${settlementId}:${segment}:${kind}` for
 *  any later spawner sharing that `type` (e.g. the bear den alongside the
 *  wolf den) so two physical dens never collide on one save-restorable id. */
export function spawnerId(settlementId: string, type: PreySpawner['type'], kind: AnimalKind, seenOfType: number): string {
  const segment = SPAWNER_ID_SEGMENT[type]
  return seenOfType === 0 ? `${settlementId}:${segment}` : `${settlementId}:${segment}:${kind}`
}

/** First home-settlement rock den (`${settlementId}:cave`) — the original
 *  type-unique cave id from plan 188, unchanged by the `rockDen` rename. */
export function findHomeCaveSpawner(
  spawners: readonly PreySpawner[],
  settlementId: string,
): PreySpawner | undefined {
  const firstId = `${settlementId}:cave`
  return spawners.find((spawner) => spawner.id === firstId)
    ?? spawners.find((spawner) => spawner.type === 'rockDen' && spawner.id.startsWith(`${settlementId}:`))
}

export const SPAWNER_LABELS: Record<PreySpawner['type'], string> = {
  rockDen: 'jaskinia',
  thicket: 'zagajnik',
  grove: 'gaj',
  wolfDen: 'wilcza jama',
}

/** Accusative object of `[E] Zniszcz …` on a `depleted` spawn point. */
export const SPAWNER_DESTROY_ACCUSATIVE: Record<PreySpawner['type'], string> = {
  rockDen: 'jaskinię',
  thicket: 'zagajnik',
  grove: 'gaj',
  wolfDen: 'wilczą jamę',
}

/** Genitive object of the busy-channel title `Niszczenie …`. */
export const SPAWNER_DESTROYING_GENITIVE: Record<PreySpawner['type'], string> = {
  rockDen: 'jaskini',
  thicket: 'zagajnika',
  grove: 'gaju',
  wolfDen: 'wilczej jamy',
}

export function spawnerDestroyPromptLabel(type: PreySpawner['type']): string {
  return `[E] Zniszcz ${SPAWNER_DESTROY_ACCUSATIVE[type]}`
}

export function spawnerDestroyBusyLabel(type: PreySpawner['type']): string {
  return `Niszczenie ${SPAWNER_DESTROYING_GENITIVE[type]}…`
}

/** Wild fauna GLBs (Quaternius pack + wild_boar). Livestock GLBs live in `livestock.ts`. */
export const FAUNA_URLS: Partial<Record<AnimalKind, string>> = {
  wolf: '/models/fauna/wolf.glb',
  fox: '/models/fauna/fox.glb',
  deer: '/models/fauna/deer.glb',
  stag: '/models/fauna/stag.glb',
  bear: '/models/fauna/bear.glb',
  boar: '/models/fauna/wild_boar.glb',
}

/**
 * GLB URLs actually loaded at boot. `FAUNA_URLS` stays the full catalog
 * (asset browser); `boar` is gated by `isWildBoarGlbEnabled()` so
 * `?boarGlb=0` keeps `createBoarModel` without deleting that path.
 */
export function faunaGltfUrls(): Partial<Record<AnimalKind, string>> {
  if (isWildBoarGlbEnabled()) return FAUNA_URLS
  const { boar: _boar, ...rest } = FAUNA_URLS
  return rest
}

/** Primitive-built visuals (`proceduralAnimals.ts`) for species with no GLB,
 *  a disabled GLB flag, or a load failure — same role as `AnimalAgent`'s
 *  capsule fallback, just species-shaped. Origin at each animal's feet
 *  already, so no `wrapModel`/`prepareProp` needed. */
const PROCEDURAL_FALLBACKS: Partial<Record<AnimalKind, () => Object3D>> = {
  rabbit: createRabbitModel,
  duck: createDuckModel,
  boar: createBoarModel,
}

type FaunaTemplate = GltfAsset

async function loadFaunaTemplates(): Promise<
  Partial<Record<AnimalKind, FaunaTemplate>>
> {
  const { bootMark, bootMarkEnd } = useBootMark('loadFaunaTemplates')
  const entries = await Promise.all(
    (Object.entries(faunaGltfUrls()) as [AnimalKind, string][]).map(async ([kind, url]) => {
      try {
        bootMark(`loadGltfAsset:${url}`)
        const asset = await loadGltfAsset(url)
        bootMarkEnd(`loadGltfAsset:${url}`)
        bootMark(`prepareProp:${url}`)
        prepareProp(asset.root, ANIMAL_DEFS[kind].modelHeight)
        bootMarkEnd(`prepareProp:${url}`)
        return [kind, asset] as const
      } catch (err) {
        console.warn(`[fauna] failed to load ${url}, capsule fallback`, err)
        return [kind, null] as const
      }
    }),
  )
  const out: Partial<Record<AnimalKind, FaunaTemplate>> = {}
  for (const [kind, asset] of entries) {
    if (asset) out[kind] = asset
  }
  return out
}

/** Keep prepareProp foot/center offsets on the child; world pos lives on the wrap. */
function wrapModel(model: Object3D): Group {
  const wrap = new Group()
  wrap.add(model)
  return wrap
}

function disposeAgent(agent: AnimalAgent): void {
  agent.dispose()
  agent.mesh.removeFromParent()
  // `disposeObject3D` checks `sharedGpu` per mesh/material, so it already
  // no-ops safely on anything still cache-shared with the GLB loader — this
  // is unconditional so materials un-shared by e.g. `markDangerous()`'s
  // `tintPropMaterials` clone (plan 110) actually get freed on despawn
  // (matches the existing pattern in `terrain/resourceDeposits.ts`).
  disposeObject3D(agent.mesh)
}

/**
 * Place animals in a ring around the settlement (forest belt).
 * Prefers GLB from `public/models/fauna/` keyed by `userData.animalKind`.
 * `roadSegments` — corridors near home used to keep prey spawners off roads.
 * `footprintRadius` — this settlement's real boundary radius
 * (`VILLAGE_SIZE_CONFIG.footprintRadius`, plan 080) — spawn rings anchor past
 * it instead of a fixed guess, see `SPAWN_RING_OFFSET`/`SPAWNER_RING_OFFSET`.
 * `terrainCarving` — lets the cave spawner cut a real depression into the
 * terrain (plan 083) instead of relying on a flat prop; optional so callers
 * without terrain-modification access (e.g. future tests) still work, just
 * without the carved pit.
 */
export async function createFauna(
  scene: Scene,
  sampleHeight: HeightSampler,
  sampleForestFactor: (x: number, z: number) => number,
  waterLevel: number,
  sampleLocalWater: (x: number, z: number) => LocalWaterSample,
  collidersNear: ColliderSource,
  homeRadius: number,
  settlementCenter: Vector3,
  /** Stable settlement id (`Settlement.id`) — seeds each managed spawn
   *  point's deterministic `PreySpawner.id` (plan 125 §5), independent of
   *  runtime spawn order/rebuilds. */
  settlementId: string,
  seed: number,
  footprintRadius: number,
  roadSegments: readonly RoadCorridorSegment[] = [],
  coast?: {
    sampleContinentalness: (x: number, z: number) => number
    coastThreshold: number
  },
  terrainCarving?: {
    modifyTerrain: (x: number, z: number, radius: number, depth: number, source: 'player' | 'system') => boolean
    scorchTerrain?: (x: number, z: number, radius: number, depth: number, source: 'player' | 'system') => boolean
    sampleMountainRidge: (x: number, z: number) => number
  },
  /** Reports any wild-fauna death (any cause) by `animalId` — forwarded into
   *  every `AnimalAgent` this factory spawns (plan 110). */
  onAnimalDeath?: (animalId: string) => void,
  /** Saved spawn-point lifecycle (plan 125 persistence follow-up), keyed by
   *  the same deterministic `PreySpawner.id` this factory derives below —
   *  applied right after each managed spawn point is (re)created, both on a
   *  real save/load and on an in-session `rebuildWorldBundle()` (config
   *  change, not a new seed). Absent/missing entries mean "fresh spawn
   *  point" (defaults already set by the constructor below). */
  initialSpawnerState?: ReadonlyMap<string, SavedSpawnPointState>,
  /** Shared world-owned grass forage service (plan fauna-010 §3/§4) —
   *  forwarded unchanged into every `AnimalAgent.update()` call below and
   *  ticked once per frame for patch-visual streaming near the observer.
   *  Optional so existing tests that don't model it keep prior behaviour
   *  (herbivores simply fall back to the old abstract forage spot). */
  grassForage?: GrassForageService,
  /** Shared world-owned player-trough water provider (plan items-player-020
   *  §4) — forwarded unchanged into every `AnimalAgent.update()` call below. */
  waterSourceProvider?: import('./animalForaging').AnimalWaterSourceProvider,
  naturalWaterKindAt?: (x: number, z: number) => import('../world/WaterSource').WaterBodyKind | null,
  /** Signed distance from a point to the nearest loaded river's water edge
   *  (`ChunkManager.riverShoreDistance`) — negative inside the water, `null`
   *  when no river channel is near. Optional so callers/tests without
   *  hydrology keep prior behaviour; when present, every wild spawn and
   *  habitat spawn point keeps clear of the active channel. */
  riverShoreDistance?: (x: number, z: number) => number | null,
  /** Fixed-position habitat spawners (plan quests-progression-009) — world
   *  sites outside the settlement ring, same lifecycle as settlement dens. */
  extraHabitatSpawners?: readonly {
    id: string
    x: number
    z: number
    type: PreySpawner['type']
    kind: AnimalKind
    respawnIntervalDays: number
    maxPreyCount: number
  }[],
  /** Explicit persistent habitat occupants (plan fauna-018) — applied
   *  before generic initial fill. Absent means no persistent slots. */
  persistentOccupantDecls?: readonly PersistentOccupantDecl[],
  /** Restored persistent occupant records/tombstones (save/load or
   *  in-session rebuild). Absent means first construction of each declaration. */
  initialPersistentOccupants?: PersistentOccupantSnapshot,
  /** Narrow, read-only world-cave contract (plan fauna-019) — the
   *  composition root's adapter over the real `Caves` instance. Required
   *  only to resolve a `caveHabitats` binding; absent/no matching binding
   *  means every occupant declaration falls back to its existing
   *  `PreySpawner`-backed path unchanged. */
  caveWorld?: AnimalCaveWorldContract,
  /** Fauna-owned cave habitat bindings (plan fauna-019) — a
   *  `PersistentOccupantDecl.habitatId` that matches one of these resolves
   *  its home/route from the named real cave instead of a `PreySpawner`.
   *  Absent means no cave-backed habitat this build. */
  caveHabitats?: readonly AnimalHabitatBinding[],
): Promise<Fauna> {
  const { bootMark, bootMarkEnd } = useBootMark('createFauna')

  const random = createSeededRandom(seed ^ 0xfa11)
  let agents: AnimalAgent[] = []
  /** `animalId`s of the wolf den's initial pack (plan 093 Etap E) — set once
   *  at placement, checked by `isWolfDenCleared()`. Empty if the den failed
   *  to find a valid site (`isWolfDenCleared()` then always reports `false`,
   *  never a false "cleared"). */
  const denWolfAnimalIds = new Set<string>()
  bootMark('loadFaunaTemplates')
  let templates: Partial<Record<AnimalKind, FaunaTemplate>>
  try {
    templates = await loadFaunaTemplates()
  } finally {
    bootMarkEnd('loadFaunaTemplates')
  }
  const spawnerMeshes: Object3D[] = []
  /** Managed spawn-point lifecycle state (plan 125), keyed by the stable
   *  `PreySpawner.id` — same objects also live in the `spawners` array below;
   *  this map exists purely for O(1) lookup from `destroySpawner()`/death
   *  accounting instead of a linear scan. */
  const spawnerById = new Map<string, PreySpawner>()
  /** A managed spawn point's prop mesh, keyed by `PreySpawner.id` — lets
   *  `destroySpawner()` tint the right prop without relying on array-index
   *  correlation with `spawnerMeshes`. */
  const spawnerMeshById = new Map<string, Object3D>()
  /** `animalId -> PreySpawner.id` for animals currently alive and generated
   *  by a managed spawn point (plan 125 §4/§5) — populated by `spawnAgent`
   *  when given a `spawnPointId`, consumed (and removed) exactly once by
   *  `handleAnimalDeath` so one animal can never be counted twice. */
  const animalToSpawner = new Map<string, string>()
  /** At most one settlement-directed trip per wolf den at a time (runtime). */
  const settlementTripAnimalBySpawner = new Map<string, string>()

  /** Wraps the injected `onAnimalDeath` (quest hook, plan 110) with local
   *  spawn-point death accounting (plan 125 §4) — every animal this factory
   *  spawns uses this as its `onDeath`, whether or not it carries a
   *  `spawnPointId`. Cause-independent (player, predator, life-need
   *  starvation): `AnimalAgent.collapse()` is the single call site regardless
   *  of what triggered it. */
  const handleAnimalDeath = (animalId: string): void => {
    for (const [denId, travellerId] of settlementTripAnimalBySpawner) {
      if (travellerId === animalId) settlementTripAnimalBySpawner.delete(denId)
    }
    const spawnerId = animalToSpawner.get(animalId)
    if (spawnerId) {
      animalToSpawner.delete(animalId)
      const spawner = spawnerById.get(spawnerId)
      if (spawner && spawner.state === 'active') {
        spawner.deathsThisCycle++
        if (shouldDeplete(spawner.deathsThisCycle, effectiveMaxPreyCount(spawner))) spawner.state = 'depleted'
      }
    }
    onAnimalDeath?.(animalId)
  }

  /** True when `(x, z)` keeps at least `clearance` between itself and the
   *  nearest river's water edge. Always true without a `riverShoreDistance`
   *  or where no river is near. */
  const clearOfRiver = (x: number, z: number, clearance: number): boolean =>
    clearsRiverChannel(riverShoreDistance?.(x, z), clearance)

  const onRoad = (x: number, z: number): boolean =>
    isNearRoadCorridor(x, z, roadSegments, SPAWNER_ROAD_CLEARANCE)

  /** Random point within [minDist, maxDist] of (cx, cz), clear of water and
   *  a safety bound around (cx, cz) — `filter` adds a habitat preference
   *  (meadow/forest/shoreline) on top, see `SPAWN_RING_OFFSET`/`SPAWNS`. The
   *  safety bound is `homeRadius` by default but never tighter than the
   *  caller's own `maxDist` (plan 080 — `footprintRadius`-anchored rings for
   *  `LG`/`XL` villages can legitimately exceed the historical `homeRadius`
   *  guess, and a bound narrower than the requested ring would make
   *  placement impossible by construction). */
  const findWalkableNear = (
    cx: number,
    cz: number,
    minDist: number,
    maxDist: number,
    filter?: (x: number, z: number) => boolean,
    maxAttempts = 24,
  ): { x: number, z: number } | null => {
    const clampRadius = Math.max(homeRadius - 4, maxDist)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = random() * Math.PI * 2
      const dist = minDist + random() * (maxDist - minDist)
      const x = cx + Math.cos(angle) * dist
      const z = cz + Math.sin(angle) * dist
      if (Math.abs(x - cx) > clampRadius || Math.abs(z - cz) > clampRadius) continue
      if (sampleHeight(x, z) <= waterLevel + 0.6) continue
      if (!clearOfRiver(x, z, SPAWN_RIVER_CLEARANCE)) continue
      if (filter && !filter(x, z)) continue
      return { x, z }
    }
    return null
  }

  /** Wild-fauna spawn points placed so far this build (ring spawns + cave/
   *  thicket/wolfDen spawners) — `MIN_SPAWN_SEPARATION` rejection reads this, both
   *  loops below push into it (plan 080). */
  const placedSpawnPoints: { x: number, z: number }[] = []
  const farFromOtherSpawns = (x: number, z: number): boolean =>
    placedSpawnPoints.every((p) => Math.hypot(p.x - x, p.z - z) >= MIN_SPAWN_SEPARATION)

  /** True if any point a few meters out from (x, z) dips into water — used to
   *  bias duck spawns toward the shoreline without requiring the duck's own
   *  spot to be wet. */
  const nearWater = (x: number, z: number): boolean => {
    const offsets: Array<[number, number]> = [
      [5, 0], [-5, 0], [0, 5], [0, -5], [3.5, 3.5], [-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5],
    ]
    return offsets.some(([dx, dz]) => sampleHeight(x + dx, z + dz) <= waterLevel + 0.2)
  }

  const habitatFilterFor = (profile: SpawnProfile): ((x: number, z: number) => boolean) | undefined => {
    switch (profile) {
      case 'edge':
        return (x, z) => isDeerEdgeHabitat(sampleForestFactor(x, z))
      case 'forest':
        return (x, z) => sampleForestFactor(x, z) > 0.45
      case 'meadow':
        return (x, z) => sampleForestFactor(x, z) < 0.35
      case 'water':
        return nearWater
      default:
        return undefined
    }
  }

  /** Per-build counter for `animalId` — unique within this settlement's live
   *  `Fauna` (one instance per game session, see `worldBundle.ts`'s
   *  `buildFauna`), covering both the initial ring spawn and later
   *  spawner-driven respawns below. */
  let nextAnimalId = 0
  /** Per-build counter for `herdId` (plan 118) — mirrors `nextAnimalId`,
   *  only consumed by the ring-spawn loop below (spawner respawns stay
   *  solitary, see its own comment). */
  let nextHerdId = 0
  const occupantDecls = persistentOccupantDecls ?? []
  const occupantRegistry = createPersistentOccupantRegistry(initialPersistentOccupants)
  occupantRegistry.registerDeclarations(occupantDecls)
  const reservedPersistentSlots = occupantRegistry.slotCountsByHabitatId()
  /** Fauna-owned cave habitat bindings (plan fauna-019), keyed by
   *  `habitatId` for O(1) lookup from the occupant-declaration loop below —
   *  never a `PreySpawner` stand-in for the physical cave. */
  const caveHabitatBindings = new Map<string, AnimalHabitatBinding>()
  for (const binding of caveHabitats ?? []) caveHabitatBindings.set(binding.habitatId, binding)
  const spawnAgent = (
    kind: AnimalKind,
    x: number,
    z: number,
    herdId?: string,
    lifeStage?: AnimalLifeStage,
    motherId?: string,
    /** Managed spawn point this animal belongs to (plan 125 §5) — only
     *  passed by spawner-driven creation (initial placement + respawn) below,
     *  never by ring spawns/livestock. */
    spawnPointId?: string,
    /** Stable id for a persistent habitat occupant (plan fauna-018). Ordinary
     *  callers omit this and keep the per-build `${kind}-${n}` path. */
    explicitAnimalId?: string,
    /** Resolved cave habitat (plan fauna-019) — only a cave-backed
     *  persistent occupant passes this. */
    cave?: AnimalCaveContext,
    /** Per-individual variant (plan fauna-022). Omitted → `normal`. */
    variant?: AnimalVariant,
  ): AnimalAgent => {
    const tpl = templates[kind]
    let visual: Object3D | undefined
    let animations = tpl?.animations ?? []
    if (tpl) {
      visual = wrapModel(tpl.clone())
      animations = tpl.animations
    } else {
      visual = PROCEDURAL_FALLBACKS[kind]?.()
    }
    const animalId = explicitAnimalId ?? `${kind}-${nextAnimalId++}`
    if (spawnPointId) animalToSpawner.set(animalId, spawnPointId)
    const boundSpawner = spawnPointId ? spawnerById.get(spawnPointId) : undefined
    return new AnimalAgent({
      def: ANIMAL_DEFS[kind],
      animalId,
      sampleHeight,
      waterLevel,
      sampleLocalWater,
      naturalWaterKindAt,
      collidersNear,
      x,
      z,
      visual,
      animations,
      sampleForestFactor,
      onDeath: handleAnimalDeath,
      herdId,
      lifeStage,
      motherId,
      spawnPointId,
      humanTaste: boundSpawner?.humanTaste ?? false,
      cave,
      variant,
    })
  }

  bootMark('ringSpawns')
  try {
  for (const spec of isSystemEnabled('animals') ? SPAWNS : []) {
    const [minOffset, maxOffset] = SPAWN_RING_OFFSET[spec.profile]
    const habitatFilter = habitatFilterFor(spec.profile)
    // Plan fauna-016 §2: wild fauna no longer spawns on/right next to a road
    // — reuses the same corridor geometry `spawnerSiteOk()` already applies
    // to cave/thicket/wolfDen placement below (`onRoad`), not a second road
    // representation. Avoiding it only at spawn time; nothing stops a live
    // animal from crossing a road later.
    const filter = (x: number, z: number) =>
      (!habitatFilter || habitatFilter(x, z)) && farFromOtherSpawns(x, z) && !onRoad(x, z)
    const herdTier = HERD_SPECIES[spec.kind]
    if (herdTier) {
      // Herd spawn (plan 118): one anchor point placed exactly like a
      // solitary spawn below (habitat-filtered, separation-checked against
      // other species' spawns), then the rest of the herd clusters around
      // it — mirrors the one-time `wolfDen` pack pattern further down
      // (`findWalkableNear(pos.x, pos.z, 0, 4)`, no `farFromOtherSpawns` on
      // individual pack members).
      const anchor = findWalkableNear(
        settlementCenter.x,
        settlementCenter.z,
        footprintRadius + minOffset,
        footprintRadius + maxOffset,
        filter,
      )
      if (!anchor) continue
      placedSpawnPoints.push(anchor)
      const herdId = `${spec.kind}-herd-${nextHerdId++}`
      const [clusterMin, clusterMax] = HERD_CLUSTER_RADIUS[herdTier]
      const adults: AnimalAgent[] = []
      const anchorAgent = spawnAgent(spec.kind, anchor.x, anchor.z, herdId, 'adult')
      scene.add(anchorAgent.mesh)
      agents.push(anchorAgent)
      adults.push(anchorAgent)
      for (let i = 1; i < spec.count; i++) {
        const pos = findWalkableNear(anchor.x, anchor.z, clusterMin, clusterMax) ?? anchor
        const agent = spawnAgent(spec.kind, pos.x, pos.z, herdId, 'adult')
        scene.add(agent.mesh)
        agents.push(agent)
        adults.push(agent)
      }
      // 0-2 juveniles per herd, each bound to a random already-placed adult
      // as `motherId` — deliberately rarer than adults (plan 118 §2).
      const juvenileChance = JUVENILE_SPAWN_CHANCE[spec.kind]
      if (juvenileChance) {
        for (const chance of [juvenileChance.first, juvenileChance.second]) {
          if (random() >= chance) continue
          const mother = adults[Math.floor(random() * adults.length)]
          const pos = findWalkableNear(mother.mesh.position.x, mother.mesh.position.z, clusterMin, clusterMax)
            ?? { x: mother.mesh.position.x, z: mother.mesh.position.z }
          const juvenile = spawnAgent(spec.kind, pos.x, pos.z, herdId, 'juvenile', mother.animalId)
          scene.add(juvenile.mesh)
          agents.push(juvenile)
        }
      }
      continue
    }
    for (let i = 0; i < spec.count; i++) {
      const pos = findWalkableNear(
        settlementCenter.x,
        settlementCenter.z,
        footprintRadius + minOffset,
        footprintRadius + maxOffset,
        filter,
      )
      if (!pos) continue
      placedSpawnPoints.push(pos)
      const agent = spawnAgent(spec.kind, pos.x, pos.z)
      scene.add(agent.mesh)
      agents.push(agent)
    }
  }
  } finally {
    bootMarkEnd('ringSpawns')
  }

  const spawners: PreySpawner[] = []
  const spawnerLabels: {
    id: string
    type: PreySpawner['type']
    object: CSS2DObject
    el: HTMLDivElement
    marker: string | null
    lastOpacity: number
  }[] = []
  const offRoad = (x: number, z: number) => !onRoad(x, z)
  /** Habitat spawners (esp. thicket) stay inland — not on beach / coastal
   *  band, and not on top of a river channel (`SPAWNER_RIVER_CLEARANCE`). */
  const spawnerSiteOk = (x: number, z: number): boolean => {
    if (!offRoad(x, z)) return false
    if (!clearOfRiver(x, z, SPAWNER_RIVER_CLEARANCE)) return false
    return !isCoastalPlacement(x, z, {
      sampleHeight,
      waterLevel,
      sampleContinentalness: coast?.sampleContinentalness,
      coastThreshold: coast?.coastThreshold,
    })
  }
  const [spawnerMinOffset, spawnerMaxOffset] = SPAWNER_RING_OFFSET
  /** Per-`type` counter feeding `spawnerId()` — lets a second `rockDen`-type
   *  entry (e.g. the bear den) get its own stable id instead of colliding
   *  with the first (plan 188). */
  const spawnerTypeSeen = new Map<PreySpawner['type'], number>()
  // `animals` also gates habitat spawners (cave/thicket/wolfDen) — when off, no
  // respawn/replenishment can occur either.
  bootMark('habitatSpawners')
  try {
  for (const spec of isSystemEnabled('animals') ? SPAWNER_SPECS : []) {
    const seenOfType = spawnerTypeSeen.get(spec.type) ?? 0
    spawnerTypeSeen.set(spec.type, seenOfType + 1)
    // Thicket also prefers some forest cover so it doesn't land on open sand/meadow shore.
    const baseFilter = spec.type === 'thicket'
      ? (x: number, z: number) => spawnerSiteOk(x, z) && sampleForestFactor(x, z) > 0.28
      : spawnerSiteOk
    const filter = (x: number, z: number) => baseFilter(x, z) && farFromOtherSpawns(x, z)
    // Rock den prefers a sloped site (plan 083 — carved depression reads as
    // cut into a hillside); falls back to any valid flat site if none found.
    const slopedFilter = (x: number, z: number) =>
      filter(x, z) && measureSlope(x, z, CAVE_SLOPE_SAMPLE_RADIUS, sampleHeight).drop >= CAVE_MIN_SLOPE_DROP
    const pos = spec.type === 'rockDen'
      ? findWalkableNear(
          settlementCenter.x,
          settlementCenter.z,
          footprintRadius + spawnerMinOffset,
          footprintRadius + spawnerMaxOffset,
          slopedFilter,
          72,
        ) ?? findWalkableNear(
          settlementCenter.x,
          settlementCenter.z,
          footprintRadius + spawnerMinOffset,
          footprintRadius + spawnerMaxOffset,
          filter,
          72,
        )
      : findWalkableNear(
          settlementCenter.x,
          settlementCenter.z,
          footprintRadius + spawnerMinOffset,
          footprintRadius + spawnerMaxOffset,
          filter,
          72,
        )
    if (!pos) continue
    placedSpawnPoints.push(pos)
    const spawner: PreySpawner = {
      ...pos,
      ...spec,
      id: spawnerId(settlementId, spec.type, spec.kind, seenOfType),
      daysSinceLastRespawn: 0,
      state: 'active',
      deathsThisCycle: 0,
      disabledAtDay: null,
      ...defaultSpawnPointScenarioFields(spec.type),
    }
    restoreSpawnPointState(spawner, initialSpawnerState?.get(spawner.id))
    spawners.push(spawner)
    spawnerById.set(spawner.id, spawner)

    const groundY = sampleHeight(pos.x, pos.z)
    if (spec.type === 'rockDen') {
      const slope = measureSlope(pos.x, pos.z, CAVE_SLOPE_SAMPLE_RADIUS, sampleHeight)
      const facingVillage = Math.atan2(pos.x - settlementCenter.x, pos.z - settlementCenter.z)
      if (
        terrainCarving
        && terrainCarving.sampleMountainRidge(pos.x, pos.z) <= CAVE_ROCK_MOUNTAIN_RIDGE_THRESHOLD
      ) {
        // Deterministic from seed/settlement placement, redone from scratch
        // on every world build — never persisted (plan `world-terrain-save`).
        terrainCarving.modifyTerrain(pos.x, pos.z, CAVE_DEPRESSION_RADIUS, CAVE_DEPRESSION_DEPTH, 'system')
      }
      const mouth = createCaveMouth(1, random())
      mouth.position.set(pos.x, groundY, pos.z)
      // Open side (+Z) faces downhill when a slope was found, otherwise away
      // from the settlement into the wild (pre-083 fallback behavior).
      mouth.rotation.y = slope.drop >= CAVE_MIN_SLOPE_DROP ? slope.yaw : facingVillage
      scene.add(mouth)
      spawnerMeshes.push(mouth)
      spawnerMeshById.set(spawner.id, mouth)
    } else if (spec.type === 'thicket') {
      const thicket = createThicket(1, random())
      thicket.position.set(pos.x, groundY, pos.z)
      thicket.rotation.y = random() * Math.PI * 2
      scene.add(thicket)
      spawnerMeshes.push(thicket)
      spawnerMeshById.set(spawner.id, thicket)
    } else if (spec.type === 'wolfDen') {
      // Reuses the cave-mouth prop (no dedicated den asset yet — plan 093
      // Etap E keeps this deliberately simple; a real `CaveVolume` (plan 104)
      // could replace this visual later without touching the den's identity/
      // quest contract). No terrain carving — that's cave-specific (083).
      const facingVillage = Math.atan2(pos.x - settlementCenter.x, pos.z - settlementCenter.z)
      const mouth = createCaveMouth(1, random())
      mouth.position.set(pos.x, groundY, pos.z)
      mouth.rotation.y = facingVillage
      scene.add(mouth)
      spawnerMeshes.push(mouth)
      spawnerMeshById.set(spawner.id, mouth)
    }

    // A restored `disabled`/`recovering` point looks freshly-burned again on
    // reload/rebuild instead of a mismatched pristine prop — same visual as
    // `destroySpawner()` below, reapplied rather than duplicated. This replay
    // is driven entirely by the already-separately-persisted
    // `SavedSpawnPointState`, so it's `'system'` (never itself persisted) —
    // `destroySpawner()`'s own scorch below is the genuine player-caused one.
    // Generic population fill happens after all spawners exist and after
    // persistent occupants are restored (plan fauna-018).
    if (spawner.state === 'disabled' || spawner.state === 'recovering') {
      const mesh = spawnerMeshById.get(spawner.id)
      if (mesh) tintPropMaterials(mesh, BURNED_SPAWNER_TINT_HEX)
      if (terrainCarving?.scorchTerrain) {
        terrainCarving.scorchTerrain(spawner.x, spawner.z, BURN_PATCH_RADIUS, BURN_PATCH_DEPTH, 'system')
      } else {
        terrainCarving?.modifyTerrain(spawner.x, spawner.z, BURN_PATCH_RADIUS, BURN_PATCH_DEPTH, 'system')
      }
    }

    const el = document.createElement('div')
    el.className = 'npc-label'
    el.textContent = SPAWNER_LABELS[spec.type]
    const label = new CSS2DObject(el)
    const labelH = spec.type === 'rockDen' || spec.type === 'wolfDen'
      ? CAVE_LABEL_HEIGHT
      : spec.type === 'thicket'
        ? THICKET_LABEL_HEIGHT
        : DEFAULT_SPAWNER_LABEL_HEIGHT
    label.position.set(pos.x, groundY + labelH, pos.z)
    scene.add(label)
    spawnerLabels.push({ id: spawner.id, type: spec.type, object: label, el, marker: null, lastOpacity: -1 })
  }

  for (const extra of extraHabitatSpawners ?? []) {
    if (!spawnerSiteOk(extra.x, extra.z)) continue
    const spawner: PreySpawner = {
      x: extra.x,
      z: extra.z,
      type: extra.type,
      kind: extra.kind,
      respawnIntervalDays: extra.respawnIntervalDays,
      maxPreyCount: extra.maxPreyCount,
      id: extra.id,
      daysSinceLastRespawn: 0,
      state: 'active',
      deathsThisCycle: 0,
      disabledAtDay: null,
      ...defaultSpawnPointScenarioFields(extra.type),
    }
    restoreSpawnPointState(spawner, initialSpawnerState?.get(spawner.id))
    spawners.push(spawner)
    spawnerById.set(spawner.id, spawner)
    const groundY = sampleHeight(extra.x, extra.z)
    const facing = Math.atan2(extra.x - settlementCenter.x, extra.z - settlementCenter.z)
    const mouth = createCaveMouth(1, random())
    mouth.position.set(extra.x, groundY, extra.z)
    mouth.rotation.y = facing
    scene.add(mouth)
    spawnerMeshes.push(mouth)
    spawnerMeshById.set(spawner.id, mouth)
    const el = document.createElement('div')
    el.className = 'npc-label'
    el.textContent = SPAWNER_LABELS[extra.type]
    const label = new CSS2DObject(el)
    label.position.set(extra.x, groundY + CAVE_LABEL_HEIGHT, extra.z)
    scene.add(label)
    spawnerLabels.push({ id: extra.id, type: extra.type, object: label, el, marker: null, lastOpacity: -1 })
  }

  // Persistent occupants first (plan fauna-018) — tombstone skips, hydrate
  // before the first update, fresh spawn only on an active habitat. Generic
  // fill below uses the remaining ordinary capacity so the reserved slot
  // cannot become `maxPreyCount + 1`.
  for (const decl of occupantDecls) {
    const caveBinding = caveHabitatBindings.get(decl.habitatId)
    if (caveBinding) {
      // Cave-backed habitat (plan fauna-019 §9) — no `PreySpawner` stands in
      // for the physical cave, so a missing/unresolvable descriptor fails
      // safely (no resident this build) rather than falling back to a
      // spawner lookup or a stale/(0,0) position.
      if (!caveWorld) continue
      const resolved = resolveAnimalCaveHabitat(caveBinding, caveWorld, animalCaveEntityDimensions(ANIMAL_DEFS[decl.kind]))
      if (!resolved) continue
      const action = occupantRegistry.restoreAction(decl)
      if (action.type === 'skip' || action.type === 'mismatch') continue
      const animalId = persistentAnimalId(decl.habitatId, decl.occupantKey)
      const agent = spawnAgent(
        decl.kind,
        resolved.context.home.x,
        resolved.context.home.z,
        undefined,
        undefined,
        undefined,
        undefined,
        animalId,
        resolved.context,
      )
      if (action.type === 'hydrate') agent.hydrate(action.record.state)
      scene.add(agent.mesh)
      agents.push(agent)
      continue
    }
    const habitat = spawnerById.get(decl.habitatId)
    if (!habitat) continue
    const action = occupantRegistry.restoreAction(decl)
    if (action.type === 'skip' || action.type === 'mismatch') continue
    if (action.type === 'fresh' && habitat.state !== 'active') continue
    const animalId = persistentAnimalId(decl.habitatId, decl.occupantKey)
    const spot = findWalkableNear(habitat.x, habitat.z, 0, 4) ?? habitat
    const agent = spawnAgent(
      decl.kind,
      spot.x,
      spot.z,
      undefined,
      undefined,
      undefined,
      habitat.id,
      animalId,
    )
    if (action.type === 'hydrate') agent.hydrate(action.record.state)
    scene.add(agent.mesh)
    agents.push(agent)
  }

  // Ordinary habitat population (plan 139) — tagged with `spawnPointId` so
  // deaths count toward depletion. A restored depleted/disabled/recovering
  // point stays empty until `tickSpawnPointRecovery`.
  for (const habitat of spawners) {
    if (habitat.state !== 'active') continue
    const ordinary = ordinaryHabitatCapacity(
      habitat.maxPreyCount,
      occupantRegistry.slotCountFor(habitat.id),
    )
    for (let i = 0; i < ordinary; i++) {
      const spot = findWalkableNear(habitat.x, habitat.z, 0, 4) ?? habitat
      const variant = habitat.type === 'wolfDen' ? wolfDenInitialFillVariant(i) : undefined
      const agent = spawnAgent(
        habitat.kind,
        spot.x,
        spot.z,
        undefined,
        undefined,
        undefined,
        habitat.id,
        undefined,
        undefined,
        variant,
      )
      scene.add(agent.mesh)
      agents.push(agent)
      if (habitat.type === 'wolfDen') denWolfAnimalIds.add(agent.animalId)
    }
  }
  } finally {
    bootMarkEnd('habitatSpawners')
  }

  /** Last in-game day (floored) recovery was checked — guards the
   *  `disabled`/`recovering` scan below to at most once per in-game day
   *  (plan 125 §9), not per frame. `-1` so the first `update()` call always
   *  runs it once regardless of the starting `worldDays`. */
  let lastRecoveryCheckDay = -1
  /** Previous `worldDays` seen by `update()` — first frame after create/load
   *  contributes `dayDelta = 0` so a restored `elapsedDays` does not dump a
   *  backlog of animals (plan 139). */
  let lastWorldDays: number | null = null

  return {
    update(
      dt,
      observerPos,
      timeOfDay,
      worldDays,
      litFires,
      villages,
      huntableLivestock,
      nearbyHumanCount = 1,
      onHumanHit,
      playerStealth,
      nearbyNpcs,
      onNpcHit,
      onAnimalAggro,
      onAnimalVocalize,
      attractionSources = [],
      consumeAttractedFood,
      peekAttractedFood,
      onAttractedFoodConsumed,
      playerObservation,
    ) {
      const dayFactor = skyParamsFromTime(timeOfDay).dayFactor
      const agentCpu = getAgentCpuDiag()
      agentCpu.beginFaunaAgentUpdates()
      for (const a of agents) {
        const forestFactor = sampleForestFactor(a.mesh.position.x, a.mesh.position.z)
        a.update({
          dt,
          others: agents,
          observerPos,
          dayFactor,
          forestFactor,
          litFires,
          villages,
          huntableLivestock,
          nearbyHumanCount,
          onHumanHit,
          playerStealth,
          nearbyNpcs,
          onNpcHit,
          onAggro: onAnimalAggro,
          // Wild fauna's only spontaneous-vocalization kind is `wolf` (howl,
          // plan fauna-009) — cow/sheep/chicken/rooster never spawn here,
          // only via `settlement/livestock.ts` (`createSettlement.ts`).
          onVocalize: onAnimalVocalize,
          nowDays: worldDays,
          timeOfDay,
          grassForage,
          waterSourceProvider,
          attractionSources,
          consumeAttractedFood,
          peekAttractedFood,
          onAttractedFoodConsumed,
          playerObservation,
        })
      }
      agentCpu.endFaunaAgentUpdates()
      grassForage?.tickVisuals(dt, observerPos.x, observerPos.z, worldDays)

      if (agents.some((a) => a.readyToRemove())) {
        const alive: AnimalAgent[] = []
        for (const a of agents) {
          if (a.readyToRemove()) {
            const slot = occupantRegistry.slotKeyForAnimalId(a.animalId)
            if (slot) occupantRegistry.markRemoved(slot)
            disposeAgent(a)
          }
          else alive.push(a)
        }
        agents = alive
      }

      if (lastWorldDays === null) lastWorldDays = worldDays
      const dayDelta = Math.max(0, worldDays - lastWorldDays)
      lastWorldDays = worldDays
      updateSpawners(
        spawners,
        dayDelta,
        agents
          .filter((a) => !a.isDead() && !occupantRegistry.hasPersistentAnimalId(a.animalId))
          .map((a) => ({ kind: a.def.kind, x: a.mesh.position.x, z: a.mesh.position.z })),
        (spawner) => {
          const pos = findWalkableNear(spawner.x, spawner.z, 0, 4) ?? spawner
          const agent = spawnAgent(spawner.kind, pos.x, pos.z, undefined, undefined, undefined, spawner.id)
          scene.add(agent.mesh)
          agents.push(agent)
        },
        reservedPersistentSlots,
      )

      // Recovery check (plan 125 §8) — at most once per in-game day, and
      // only for spawners actually waiting on it (`disabled`/`recovering`);
      // `tickSpawnPointRecovery` itself no-ops for every other state. Nearby
      // same-kind count reuses `agents` (already iterated above), scoped to
      // `SPAWNER_RADIUS` — no independent per-frame scan.
      const dayIndex = Math.floor(worldDays)
      if (dayIndex !== lastRecoveryCheckDay) {
        lastRecoveryCheckDay = dayIndex
        for (const spawner of spawners) {
          if (spawner.type === 'wolfDen') {
            if (shouldActivateWolfDenProblem(spawner, dayIndex)) {
              activateWolfDenProblem(spawner)
              const targetCap = effectiveMaxPreyCount(spawner)
              let nearby = 0
              for (const a of agents) {
                if (a.isDead() || a.spawnPointId !== spawner.id) continue
                nearby++
              }
              while (nearby < targetCap && spawner.state === 'active') {
                const spot = findWalkableNear(spawner.x, spawner.z, 0, 4) ?? spawner
                const agent = spawnAgent(spawner.kind, spot.x, spot.z, undefined, undefined, undefined, spawner.id)
                scene.add(agent.mesh)
                agents.push(agent)
                nearby++
              }
            }
            const activeTripAnimalId = settlementTripAnimalBySpawner.get(spawner.id)
            const tripAnimal = activeTripAnimalId
              ? agents.find((a) => a.animalId === activeTripAnimalId && !a.isDead())
              : undefined
            if (!tripAnimal || !tripAnimal.hasActiveTrip()) {
              if (activeTripAnimalId) settlementTripAnimalBySpawner.delete(spawner.id)
              if (canOfferSettlementTrip(spawner, worldDays)) {
                const traveller = agents.find(
                  (a) => !a.isDead()
                    && a.spawnPointId === spawner.id
                    && a.def.kind === 'wolf'
                    && !a.hasActiveTrip(),
                )
                const destination = findSettlementOutskirtsDestination(
                  { x: settlementCenter.x, z: settlementCenter.z },
                  footprintRadius + 6,
                  sampleHeight,
                  waterLevel,
                  (x, z) => sampleHeight(x, z) > waterLevel + 0.6,
                  random,
                )
                if (traveller && destination && traveller.startSettlementDirectedTrip(destination, SETTLEMENT_TRIP_STAY_SEC)) {
                  recordSettlementTripOpportunity(spawner, worldDays)
                  settlementTripAnimalBySpawner.set(spawner.id, traveller.animalId)
                }
              }
            }
          }
          if (spawner.state !== 'disabled' && spawner.state !== 'recovering') continue
          let nearby = 0
          for (const a of agents) {
            if (a.isDead() || a.def.kind !== spawner.kind) continue
            if (Math.hypot(a.mesh.position.x - spawner.x, a.mesh.position.z - spawner.z) < SPAWNER_RADIUS) nearby++
          }
          tickSpawnPointRecovery(spawner, worldDays, nearby)
        }
      }

      for (const entry of spawnerLabels) {
        const opacity = labelOpacityForDistance(entry.object.position.distanceTo(observerPos))
        if (opacity === entry.lastOpacity) continue
        entry.lastOpacity = opacity
        entry.el.style.opacity = String(opacity)
      }
    },
    resolveTimeSkip(hours, dayLengthSec) {
      const elapsedSeconds = gameHoursToRealSeconds(hours, dayLengthSec)
      for (const a of agents) a.resolveTimeSkip(elapsedSeconds)
    },
    dispose() {
      for (const a of agents) disposeAgent(a)
      agents = []
      for (const mesh of spawnerMeshes) {
        mesh.removeFromParent()
        disposeObject3D(mesh)
      }
      spawnerMeshes.length = 0
      for (const { object, el } of spawnerLabels) {
        object.removeFromParent()
        el.remove()
      }
      spawnerLabels.length = 0
    },
    getAgents: () => agents,
    getSpawners: () => spawners,
    isWolfDenCleared() {
      if (denWolfAnimalIds.size === 0) return false
      for (const a of agents) {
        if (denWolfAnimalIds.has(a.animalId) && !a.isDead()) return false
      }
      return true
    },
    setSpawnerMarker(spawnerId, marker) {
      for (const entry of spawnerLabels) {
        if (entry.id !== spawnerId || entry.marker === marker) continue
        entry.marker = marker
        entry.el.textContent = marker
          ? `${SPAWNER_LABELS[entry.type]} · ${marker}`
          : SPAWNER_LABELS[entry.type]
      }
    },
    destroySpawner(spawnerId, nowDays) {
      const spawner = spawnerById.get(spawnerId)
      if (!spawner || spawner.state !== 'depleted') return false
      spawner.state = 'disabled'
      spawner.disabledAtDay = nowDays
      const mesh = spawnerMeshById.get(spawnerId)
      if (mesh) tintPropMaterials(mesh, BURNED_SPAWNER_TINT_HEX)
      // The genuine player action ("[E] Zniszcz") — persisted, unlike the
      // restore-replay above.
      if (terrainCarving?.scorchTerrain) {
        terrainCarving.scorchTerrain(spawner.x, spawner.z, BURN_PATCH_RADIUS, BURN_PATCH_DEPTH, 'player')
      } else {
        terrainCarving?.modifyTerrain(spawner.x, spawner.z, BURN_PATCH_RADIUS, BURN_PATCH_DEPTH, 'player')
      }
      return true
    },
    isQuestSpawnPointPermanentlyDestroyed(questSpawnerId: string) {
      return isQuestSpawnPointPermanentlyDestroyed(spawners, questSpawnerId)
    },
    snapshotPersistentOccupants() {
      occupantRegistry.capture(agents.filter((a) => occupantRegistry.hasPersistentAnimalId(a.animalId)))
      return occupantRegistry.serialize()
    },
  }
}
