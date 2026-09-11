import { type Scene, Vector3 } from 'three'
import type { ThreateningAnimalCandidate } from '../ai/npcAnimalThreat'
import type { PlayerSocialLookup } from '../ai/reactionChance'
import type { PlayAt } from '../audio/createWorldAudio'
import type { HomeVillageSize } from '../config/worldConfig'
import type { SettlementEconomy, SettlementEconomySnapshot } from '../economy/settlementEconomy'
import type { AnimalAgent, AnimalKind, VillageInfo } from '../fauna/AnimalAgent'
import type { AnimalOwner } from '../fauna/animalOwnership'
import type { SettlementHuntingHooks } from '../fauna/huntingHooks'
import type { DropLivestockProductHook } from '../fauna/livestockProduction'
import type { OwnedAnimalControlMode } from '../fauna/ownedAnimalControl'
import type { DroppedItems } from '../items/createDroppedItems'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { SettlementMiningHooks } from '../terrain/resourceDeposits'
import type { LocalWaterSample } from '../terrain/waterSample'
import type { Collider } from '../world/collision'
import type { GrassForageService } from '../world/createGrassForagePatches'
import type { Palisades } from '../world/createPalisades'
import type { PlayerWells } from '../world/createPlayerWells'
import type { ResidentialBuildings } from '../world/createResidentialBuildings'
import type { StandingTorches } from '../world/createStandingTorches'
import type { TerrainPreparations } from '../world/createTerrainPreparations'
import type { TransportOrders } from '../world/createTransportOrders'
import type { WorkContracts } from '../world/createWorkContracts'
import type { SettlementFoodSourceHooks } from '../world/foodSources'
import type { HelperDeliveryHooks } from '../world/helperDeliveryHooks'
import type { NearbyPlayerWellLookup } from '../world/playerWell'
import type { SettlementForestHooks } from '../world/settlementForestHooks'
import type { TransportEndpointRef } from '../world/transportOrder'
import type { WeatherState } from '../world/weather'
import { createNaturalWaterKindAt } from '../fauna/animalNaturalWater'
import type { TerrainSamplers } from './settlementTerrain'
import { createEconomyRegistry } from '../economy'
import { type ChunkCoord, chunksNear } from '../terrain/chunkGrid'
import { createNullPointLightBudget, type PointLightBudget } from '../world/pointLightBudget'
import {
  estimateOffscreenTravelDays,
  type OffscreenTransportLookup,
  resolveOffscreenTransportArrivals,
} from '../world/transportOffscreen'
import { createSettlement, type CreateSettlementDeps, type Settlement } from './createSettlement'
import { createHouseholdRegistry, type Household, type HouseholdId, type HouseholdSnapshot } from './household'
import {
  createLivestockRegistry,
  type LivestockSaveRecord,
  type PersistentLivestockContext,
  resolveLivePersistentAnimal,
  restoreDetachedPlayerOwnedLivestock,
  setOwnedAnimalControl,
  type SpawnAnimalFromRecordDeps,
  tickSettlementLivestock,
  transferAnimalOwnership,
} from './livestock'
import { createNpcRelationships, type NpcRelationshipEntry } from './npcRelationships'
import { createNpcStateRegistry, type NpcAuthoritativeState, type NpcId, type NpcStateSnapshot } from './npcState'
import { createSignpost } from './props'
import { createRatInfestationRegistry, type RatInfestationState } from './ratInfestation'
import { createRatRegistry, type RatSaveRecord } from './ratPersistence'
import {
  type MidpointSignpost,
  midpointSignpostsFor,
  neighborsFor,
  type RoadNetworkContext,
} from './roadNetwork'
import {
  cellsWithinRadius,
  SETTLEMENT_GRID_STEP,
  type SettlementCell,
  type SettlementDef,
  worldToCell,
} from './settlementGenerator'
import { settlementDefFor } from './settlementPlanCache'
import { createLabeledProp, disposeLabeledProp, type LabeledProp, updateLabelOpacity } from './settlementSignposts'
import { settlementStorageDestination } from './storageDestinations'

type Entry = {
  def: SettlementDef
  settlement: Settlement | null
  pendingPromise: Promise<void> | null
}

/** How many of the home settlement's nearest neighbor settlements get
 *  streamed in immediately at world start, instead of waiting for the player
 *  to wander within `loadRadius` — guarantees there's a village (and a road
 *  to it, see `roadNetwork.ts`) findable right away. Deliberately independent
 *  of `RegionParams.roadNetwork.maxNeighborRoads` (the wider regional road
 *  network's fan-out), which can be tuned higher without also inflating
 *  startup load cost. */
const EAGER_NEIGHBOR_COUNT = 2

export type SettlementsManager = {
  /** Settlement at grid cell (0,0) — always loaded, where the player spawns.
   *  Fauna/item spawners anchor to this one only (v1 scope: no per-settlement
   *  resource distribution, see multi-settlements plan). `null` until
   *  `homeReady` resolves (world-003 "faster application startup") — home is
   *  built the same way a streamed-in neighbor is (`ensureLoaded`), just
   *  kicked off immediately instead of waiting for the player to wander into
   *  range. A live read (not a value snapshotted at manager-creation time),
   *  same "read through the reference" convention as `WorldBundle`. Callers
   *  that only need the site position/id/size before the full settlement is
   *  built should use `getHomeDef()` instead of waiting on this. */
  home: Settlement | null
  /** Resolves once `home` above is non-null — the single explicit readiness
   *  signal for consumers (`app/worldBundle.ts`'s deferred item spawners/
   *  drying racks/hives) that actually need the built settlement (landmarks/
   *  NPCs/livestock), not just its site/id/size. */
  homeReady: Promise<Settlement>
  /** Streams settlements in/out by distance and ticks every loaded one's NPCs
   *  (and owned livestock, see `createSettlement.ts`). `timeOfDay`/`dayFactor`/
   *  `litFires`/`villages` are forwarded straight through to each loaded
   *  `Settlement.update` — same values `app/createApp.ts` already computes
   *  for the global `Fauna.update` call. */
  update: (
    dt: number,
    playerPos: Vector3,
    playerYaw: number,
    timeOfDay: number,
    dayFactor: number,
    litFires: readonly { x: number, z: number }[],
    villages: readonly VillageInfo[],
    dayLengthSec: number,
    /** Bounded/local currently-threatening animals (plan 179 §7/§10/§20) —
     *  forwarded straight to each loaded `Settlement.update`/`NpcAgent.update`.
     *  Defaults to none so existing callers/tests are unaffected. */
    nearbyAnimalThreats?: readonly ThreateningAnimalCandidate[],
    /** Forwarded straight to each loaded `Settlement.update` (plan fauna-002). */
    dropLivestockProduct?: DropLivestockProductHook,
    /** `dayNight.elapsedDays`, forwarded straight to each loaded
     *  `Settlement.update` (plan fauna-002). */
    nowDays?: number,
    /** Forwarded straight to each loaded `Settlement.update` (plan
     *  settlements-npcs-004 §1/§2). */
    onAnimalVocalize?: (kind: AnimalKind, x: number, z: number) => void,
    /** This frame's world weather (plan npc-012) — forwarded straight to
     *  each loaded `Settlement.update`/`NpcAgent.update`. `undefined` for
     *  any caller/test that doesn't pass one. */
    weather?: WeatherState,
    /** Bounded/local live wild predators (plan fauna-011 §9/§10/§11) —
     *  forwarded straight to each loaded `Settlement.update`. Only
     *  meaningful for a settlement with an owned `dog`. */
    nearbyPredators?: readonly AnimalAgent[],
    /** Player-as-observer presentation inputs (npc-023). */
    playerObservation?: import('../simulation/observation').PlayerObservationInput,
    /** Dead wild fauna from the loaded `Fauna` (plan settlements-npcs-029). */
    nearbyWildCorpses?: readonly AnimalAgent[],
  ) => void
  /** Forwarded to every loaded settlement's `setDayNight` (house window
   *  glow) — also remembered so a settlement streamed in later starts at the
   *  current time of day instead of flashing on/off at its own default. */
  setDayNight: (t: number) => void
  /** Called once when a `world/timeSkip.ts` skip finishes — replays the
   *  skipped period for every loaded settlement's NPCs (needs/stamina/
   *  position catch-up) instead of leaving them to walk it off in real time.
   *  Only loaded settlements' NPCs exist to update; unloaded ones re-seed
   *  from scratch on load regardless. See `NpcAgent.resolveTimeSkip`
   *  (`docs/plans/archive/2026-08-12--075--time-skip-npc-catchup.md`). */
  resolveTimeSkip: (startTimeOfDay: number, hours: number, dayLengthSec: number) => void
  getLoaded: () => Settlement[]
  /** Home settlement definition (includes authoritative `VillagePlan`). */
  getHomeDef: () => SettlementDef
  /** Resolve a settlement def from the shared plan cache without loading meshes. */
  peekDef: (cell: SettlementCell) => SettlementDef | null
  /** Fresh-resolving household lookup (plan settlements-npcs-013) — the
   *  registry-owned `Household` survives settlement unload/reload, so this
   *  works whether or not the owning settlement is currently streamed in.
   *  `undefined` when this household has never been created (settlement
   *  never built). Narrow wrapper over `HouseholdRegistry.get`, not a second
   *  registry — see `debug/npcInspector.ts`'s hierarchical history. */
  getHousehold: (id: HouseholdId) => Household | undefined
  /** Fresh-resolving settlement-economy lookup — same "long-lived registry
   *  owner, resolve fresh every call" contract as `getHousehold` above.
   *  Narrow wrapper over `EconomyRegistry.get`. */
  getEconomy: (settlementId: string) => SettlementEconomy | undefined
  /** Stock-only snapshot of every settlement economy created so far (loaded
   *  or previously streamed out) — see `EconomyRegistry.serialize`. */
  snapshotEconomies: () => Record<string, SettlementEconomySnapshot>
  /** Stock-only snapshot of every household created so far — see
   *  `HouseholdRegistry.serialize` (plan 197 §8). */
  snapshotHouseholds: () => Record<HouseholdId, HouseholdSnapshot>
  /** Snapshot of every NPC's authoritative state created so far — see
   *  `NpcStateRegistry.serialize` (plan 197 §7). */
  snapshotNpcStates: () => Record<NpcId, NpcStateSnapshot>
  /** Fresh-resolving live NPC-state lookup (plan npc-016) — the registry-
   *  owned `NpcAuthoritativeState` survives settlement unload/reload, so
   *  wage payment can mutate `personalInventory` whether or not the worker
   *  is currently streamed in. Narrow wrapper over `NpcStateRegistry.get`,
   *  not a snapshot. */
  getNpcState: (id: NpcId) => NpcAuthoritativeState | undefined
  /** Plain-data snapshot of every non-zero NPC↔NPC relation pair so far —
   *  see `NpcRelationships.snapshot` (plan persistence-001). */
  snapshotRelationships: () => NpcRelationshipEntry[]
  /** Flat livestock persistence snapshot — refreshes every currently-loaded
   *  settlement's saved state first, then serializes the whole registry (plan
   *  persistence-001) — see `LivestockRegistry.serialize`. */
  snapshotLivestock: () => { entries: LivestockSaveRecord[], removedIds: string[] }
  /** Flat rat persistence snapshot (plan quests-progression-006). */
  snapshotRats: () => { entries: RatSaveRecord[], removedIds: string[] }
  /** Rat infestation state per settlement (plan quests-progression-013). */
  snapshotStorageInfestation: () => Record<string, RatInfestationState>
  isStorageDamaged: (settlementId: string) => boolean
  isNestDestroyed: (settlementId: string) => boolean
  hasActiveNest: (settlementId: string) => boolean
  repairStorageInfestation: (settlementId: string) => void
  destroyRatNest: (settlementId: string) => void
  countAliveRats: (settlementId: string) => number
  /** Public persistent-animal lookup (plan fauna-020). */
  resolvePersistentAnimal: (animalId: string) => AnimalAgent | null
  transferAnimalOwnership: (animalId: string, owner: AnimalOwner) => boolean
  setOwnedAnimalControl: (animalId: string, mode: OwnedAnimalControlMode) => boolean
  getDetachedLivestock: () => AnimalAgent[]
  dispose: () => void
}

/**
 * @domain settlements
 * @system settlements-manager
 * @role Owns settlement generation, streaming and per-settlement economy/household/NPC-state registries.
 * @owns SettlementEconomy Household
 * @lifecycle streaming
 */
export async function createSettlementsManager(
  scene: Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  /** Local physical water sample (plan fauna-015) — forwarded unchanged into
   *  every `createSettlement` call's `CreateSettlementDeps.sampleLocalWater`,
   *  the same water/floor/river seam wild fauna's `createFauna.ts` uses. */
  sampleLocalWater: (x: number, z: number) => LocalWaterSample,
  localRadius: number,
  seed: number,
  playAt: PlayAt,
  loadRadius: number,
  unloadRadius: number,
  terrainSamplers: TerrainSamplers,
  heightScale: number,
  region: RegionParams,
  /** Forces + awaits generation of the terrain chunks around a settlement
   *  site before that settlement is built — see `chunksNear`'s comment. */
  waitForChunks: (coords: ChunkCoord[]) => Promise<void>,
  chunkSize: number,
  collidersNear: ColliderSource,
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void,
  clearColliders: (ownerKey: string) => void,
  forest?: SettlementForestHooks,
  homeSize: HomeVillageSize = 'auto',
  initialEconomies?: Record<string, SettlementEconomySnapshot>,
  /** Reports any settlement's livestock deaths (any cause) by `animalId` —
   *  forwarded into every `createSettlement` call, home and streamed-in
   *  alike (plan 110). */
  onAnimalDeath?: (animalId: string) => void,
  /** Resolves an NPC's relation level + general player standing by name —
   *  forwarded into every `createSettlement` call the same way as
   *  `onAnimalDeath` above (plan 117). */
  getPlayerSocial?: PlayerSocialLookup,
  /** NPC ore-mining hooks over `ResourceDeposits` (plan 131) — forwarded into
   *  every `createSettlement` call the same way as `forest` above. */
  mining?: SettlementMiningHooks,
  /** Persistent land-plot ownership query (plan 129) — forwarded into every
   *  `createSettlement` call the same way as `mining` above. */
  isLandPlotOwned?: (settlementId: string, plotId: string) => boolean,
  /** Plan 157 — forwarded into every `createSettlement` call, home and
   *  streamed-in alike, the same way `mining`/`isLandPlotOwned` are above. */
  pointLightBudget: PointLightBudget = createNullPointLightBudget(),
  /** Bounded lookup for a nearby completed player-built well (plan 127 §10)
   *  — forwarded into every `createSettlement` call → every `NpcAgent`, the
   *  same way `getPlayerSocial` is above. */
  getNearbyPlayerWell?: NearbyPlayerWellLookup,
  /** NPC hunger-source discovery hooks over natural world items + crops
   *  (plan 174) — forwarded into every `createSettlement` call the same way
   *  `mining` is above. */
  foodSources?: SettlementFoodSourceHooks,
  /** Hunter target discovery + harvest hooks over the live `Fauna` (plan 178)
   *  — forwarded into every `createSettlement` call the same way `mining`/
   *  `foodSources` are above. */
  hunting?: SettlementHuntingHooks,
  /** Carried across a `WorldBundle` rebuild (plan 197 §8) — same
   *  "same-manager-lifetime registry, stock-only carry snapshot on rebuild"
   *  contract as `initialEconomies` above, applied to `Household` (the
   *  confirmed gap: unlike `SettlementEconomy`, household stock used to
   *  reset on every in-session rebuild). */
  initialHouseholds?: Record<HouseholdId, HouseholdSnapshot>,
  /** Carried across a `WorldBundle` rebuild the same way as
   *  `initialHouseholds` above (plan 197 §7) — NOT part of `SaveData`
   *  (plan 197 explicitly excludes full NPC save/load; this registry's
   *  lifetime is the running session, from first construction through any
   *  number of settlement unload/reload cycles and in-session rebuilds). */
  initialNpcStates?: Record<NpcId, NpcStateSnapshot>,
  /** Helper resource-delivery target hooks over the player's placed
   *  `Container`s (plan 167) — forwarded into every `createSettlement` call
   *  the same way `foodSources`/`hunting` are above. */
  helperDelivery?: HelperDeliveryHooks,
  /** Carried across an in-session `WorldBundle` rebuild and, since plan
   *  persistence-001, part of `SaveData` too — same "same-manager-lifetime
   *  registry, `initial*`/`snapshot*` idiom" contract as `initialHouseholds`/
   *  `initialNpcStates` above, applied to `NpcRelationships`. */
  initialNpcRelationships?: readonly NpcRelationshipEntry[],
  /** Saved livestock individuals + removed-id tombstones (plan
   *  persistence-001) — seeds the manager-lifetime `LivestockRegistry` below,
   *  consulted by every `createSettlement`/`spawnLivestock` call, home and
   *  streamed-in alike. */
  initialLivestock?: readonly LivestockSaveRecord[],
  initialRemovedLivestockIds?: readonly string[],
  /** Saved settlement rats + tombstones (plan quests-progression-006). */
  initialRats?: readonly RatSaveRecord[],
  initialRemovedRatIds?: readonly string[],
  /** Persisted rat infestation per settlement (plan quests-progression-013). */
  initialStorageInfestation?: Record<string, RatInfestationState>,
  /** When true, the home settlement starts with damaged storage and an intact
   *  nest if no persisted entry exists yet (authored V1 trigger). */
  seedHomeStorageInfestation?: boolean,
  /** Authoritative Work Contract lifecycle (plan npc-015) — forwarded into
   *  every `createSettlement` call the same way `mining`/`foodSources` are
   *  above. */
  workContracts?: WorkContracts,
  /** World-owned physical transport commitments (plan settlements-npcs-018)
   *  — forwarded into every `createSettlement` call the same way
   *  `workContracts` is above. */
  transportOrders?: TransportOrders,
  /** Player-built wells (plan 127/npc-015) — forwarded the same way. */
  playerWells?: PlayerWells,
  /** World-dropped items — forwarded the same way, for NPC construction
   *  material discovery (plan npc-015 §9's analogue). */
  droppedItems?: DroppedItems,
  /** Shared world-owned grass forage service (plan fauna-010 §3/§4) —
   *  forwarded into every `createSettlement` call the same way `mining`/
   *  `foodSources` are above. Built ahead of `SettlementsManager` (world-
   *  global, not derived from any settlement), so passed directly rather
   *  than late-bound like `hunting`. */
  grassForage?: GrassForageService,
  /** Shared world-owned player-trough water provider (plan items-player-020
   *  §4) — forwarded into every `createSettlement` call the same way as
   *  `grassForage` above. */
  waterSourceProvider?: import('../fauna/animalForaging').AnimalWaterSourceProvider,
  /** Active terrain-preparation work sites (plan npc-018) — forwarded into
   *  every `createSettlement` call the same way `workContracts`/`playerWells`
   *  are above, so NPC Work Contract execution can travel to/contribute work
   *  at an existing `TerrainPreparationRecord`. */
  terrainPreparations?: TerrainPreparations,
  /** Player-built palisade segments (plan items-player-017) — forwarded into
   *  every `createSettlement` call the same way `terrainPreparations` is
   *  above. */
  palisades?: Palisades,
  /** Player-built standing torches (plan items-player-017) — forwarded the
   *  same way as `palisades`. */
  standingTorches?: StandingTorches,
  /** Player-built residential houses (plan settlements-005) — forwarded the
   *  same way as `palisades`. */
  residentialBuildings?: ResidentialBuildings,
  /** NPC burial graves (plan npc-011) — forwarded into every `createSettlement`
   *  call the same way as `droppedItems`. */
  npcGraves?: import('../world/npcGraves').NpcGraves,
  /** River bank distance (plan fauna drink targeting) — when set, livestock
   *  agents get the same lake/river/ocean classifier as player drink. */
  riverShoreDistance?: (worldX: number, worldZ: number) => number | null,
): Promise<SettlementsManager> {
  const naturalWaterKindAt = riverShoreDistance
    ? createNaturalWaterKindAt({
      sampleHeight,
      waterLevel,
      sampleContinentalness: terrainSamplers.sampleContinentalness,
      region,
      riverShoreDistance,
    })
    : undefined
  const roadCtx: RoadNetworkContext = {
    seed,
    sampleHeight,
    waterLevel,
    terrainSamplers,
    heightScale,
    region,
    localSearchRadius: localRadius,
    homeSize,
  }

  // Defs resolve through the shared settlement plan cache (plan 047 §9.15).
  function defFor(cell: SettlementCell): SettlementDef | null {
    return settlementDefFor(cell, {
      seed,
      sampleHeight,
      waterLevel,
      localSearchRadius: localRadius,
      terrainSamplers,
      heightScale,
      region,
      homeSize,
    })
  }

  const economies = createEconomyRegistry(initialEconomies)
  function economyFor(def: SettlementDef) {
    return economies.getOrCreate({
      id: def.id,
      size: def.size,
      foodSourceType: def.foodSourceType,
      familyCount: def.families.length,
      dominantResource: def.dominantResource,
    })
  }

  // Households (plan 069) live here, not per-`Settlement` — same reason as
  // `economies`: streaming a settlement out/in must reuse the same stock.
  const households = createHouseholdRegistry(initialHouseholds)

  // NPC authoritative state (plan 197) — same reason/lifetime as `households`/
  // `economies` above: an `NpcAgent` disposed and recreated (settlement
  // unload/reload) must hydrate from the same HP/needs/stamina/vigor object,
  // not a fresh default one.
  const npcStates = createNpcStateRegistry(initialNpcStates)

  // Off-screen transport endpoint/carrier lookup (plan settlements-npcs-019)
  // — built once over the same manager-lifetime `households`/`economies`/
  // `npcStates` registries above, so it resolves whether or not the owning
  // settlement is currently streamed in. Never a second storage/carrier
  // index.
  const offscreenTransportLookup: OffscreenTransportLookup = {
    getHousehold: (id) => households.get(id),
    getEconomy: (id) => economies.get(id),
    getNpcState: (id) => npcStates.get(id),
  }

  // Symmetric NPC↔NPC relation store (plan 151) — one instance for the
  // world's lifetime, same reasoning as `households`/`npcStates` above
  // (a settlement that streams out and back in must keep its NPCs'
  // relations, not reset them). Part of `SaveData` since plan persistence-001
  // — see `npcRelationships.ts`.
  const npcRelationships = createNpcRelationships(initialNpcRelationships)

  // Livestock persistence store (plan persistence-001) — see
  // `livestock.ts`'s `LivestockRegistry` doc for why this exists (unlike
  // households/NPC state, an `AnimalAgent` has no live object surviving a
  // settlement unload today, so state must be captured explicitly).
  const livestock = createLivestockRegistry({
    entries: initialLivestock ?? [],
    removedIds: initialRemovedLivestockIds ?? [],
  })

  const detachedLivestock: AnimalAgent[] = []
  const detachedById = new Map<string, AnimalAgent>()
  const detachedOriginById = new Map<string, string>()

  const persistentLivestockCtx: PersistentLivestockContext = {
    getLoadedSettlements: () => {
      const out: { id: string, livestock: readonly AnimalAgent[] }[] = []
      for (const entry of entries.values()) {
        if (entry.settlement) out.push({ id: entry.def.id, livestock: entry.settlement.livestock })
      }
      return out
    },
    detached: detachedLivestock,
    detachedById,
    detachedOriginById,
    registry: livestock,
  }

  const spawnAnimalDeps: SpawnAnimalFromRecordDeps = {
    scene,
    sampleHeight,
    waterLevel,
    sampleLocalWater,
    naturalWaterKindAt,
    collidersNear,
    onAnimalDeath,
  }
  await restoreDetachedPlayerOwnedLivestock(
    spawnAnimalDeps,
    livestock,
    detachedLivestock,
    detachedById,
    detachedOriginById,
  )

  const rats = createRatRegistry({
    entries: initialRats ?? [],
    removedIds: initialRemovedRatIds ?? [],
  })

  const ratInfestation = createRatInfestationRegistry(initialStorageInfestation)

  // One shared deps object for every `createSettlement` call (createSettlement
  // refactor review, P1) — was a 26-argument positional call duplicated
  // verbatim at both call sites below; `def`/`economy` stay per-call since
  // they differ between the home settlement and every streamed-in neighbor.
  const settlementDeps: CreateSettlementDeps = {
    scene,
    sampleHeight,
    waterLevel,
    sampleLocalWater,
    localRadius,
    seed,
    householdRegistry: households,
    npcStateRegistry: npcStates,
    relations: npcRelationships,
    livestockPersistence: livestock,
    ratPersistence: rats,
    infestationState: (settlementId) => ratInfestation.get(settlementId),
    collidersNear,
    registerColliders,
    clearColliders,
    playAt,
    pointLightBudget,
    roadCtx,
    forest,
    mining,
    foodSources,
    hunting,
    helperDelivery,
    getPlayerSocial,
    getNearbyPlayerWell,
    isLandPlotOwned,
    onAnimalDeath,
    workContracts,
    transportOrders,
    playerWells,
    droppedItems,
    grassForage,
    waterSourceProvider,
    terrainPreparations,
    palisades,
    standingTorches,
    residentialBuildings,
    npcGraves,
    naturalWaterKindAt,
  }

  const entries = new Map<string, Entry>()

  // Remembered so a settlement that streams in later (or finishes its async
  // build after `setDayNight` already ran for this tick) starts its house
  // lights at the current time of day instead of the door default.
  let lastDayNight = 0

  // Set by `dispose()` — guards the home-settlement continuation below the
  // same way `ensureLoaded`'s "player wandered back out of range" check does
  // for a streamed-in neighbor (see its `.then()` further down): without
  // this, a manager torn down while home is still building would have its
  // continuation add a freshly-built `Settlement` (meshes, NPCs) to a scene
  // that's already gone.
  let disposed = false

  const homeDef = defFor({ gx: 0, gz: 0 })
  if (!homeDef) {
    throw new Error('[SettlementsManager] home settlement (0,0) failed to generate')
  }
  if (seedHomeStorageInfestation && initialStorageInfestation?.[homeDef.id] === undefined) {
    ratInfestation.seed(homeDef.id)
  }
  // Built the same way a streamed-in neighbor is below (`ensureLoaded`) —
  // kicked off immediately rather than waiting for the player to wander into
  // range, but NOT awaited before this function returns (world-003 "faster
  // application startup" §3): the home settlement's full build (houses/
  // NPCs/livestock, `buildSettlementProps`) is the single largest piece of
  // `createWorldBundle`'s critical path, but nothing about the player's own
  // spawn/movement needs it — only `homeDef`'s site/id/size (already
  // synchronous, see `getHomeDef()`) do. A caller that genuinely needs the
  // built settlement (landmarks/NPCs/livestock — `app/worldBundle.ts`'s
  // deferred item spawners/drying racks/hives) awaits `homeReady` instead of
  // reading `home` directly.
  let homeSettlement: Settlement | null = null
  const homeReadyPromise: Promise<Settlement> = createSettlement(
    homeDef,
    economyFor(homeDef),
    settlementDeps,
  ).then((settlement) => {
    if (disposed) {
      settlement.dispose()
      throw new Error('[SettlementsManager] disposed before home settlement finished building')
    }
    homeSettlement = settlement
    const entry = entries.get(homeDef.id)
    if (entry) entry.settlement = settlement
    else entries.set(homeDef.id, { def: homeDef, settlement, pendingPromise: null })
    settlement.setDayNight(lastDayNight)
    syncMidpoints()
    return settlement
  })
  entries.set(homeDef.id, {
    def: homeDef,
    settlement: null,
    pendingPromise: homeReadyPromise.then(
      () => undefined,
      () => undefined,
    ),
  })

  // Midpoint road signposts (roads-and-paths plan, part 2) don't belong to
  // either settlement's own group/lifecycle — a pair only needs *some* known
  // entry on each end (not even fully built) to place, and should persist
  // until *neither* end is a known entry anymore, so they're tracked here
  // rather than inside `createSettlement`. `midpointSignpostsFor` only reads
  // each side's `SettlementDef` (cheap/deterministic), so this doesn't have
  // to wait for either settlement's async build to finish.
  const midpoints = new Map<string, LabeledProp[]>()

  function midpointPairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`
  }

  function buildMidpointInstance(sp: MidpointSignpost): LabeledProp {
    const prop = createSignpost()
    const inst = createLabeledProp(prop, {
      x: sp.position.x,
      z: sp.position.z,
      rotationY: sp.angle,
      labelHeight: 2.5,
      text: sp.targetName,
      sampleHeight,
    })
    scene.add(prop)
    return inst
  }

  // A midpoint prop belongs to neither settlement's own `group` (it can
  // outlive either side's build/lifecycle), so it's a scene-level object and
  // must free its own GPU resources here — unlike `settlementSignposts.ts`'s
  // own signs, which are freed by `disposeSettlementGroup`.
  function disposeMidpointInstance(inst: LabeledProp): void {
    disposeLabeledProp(inst, { disposeProp: true })
  }

  function syncMidpoints(): void {
    const wanted = new Set<string>()
    for (const entry of entries.values()) {
      for (const neighborDef of neighborsFor({ gx: entry.def.gx, gz: entry.def.gz }, roadCtx)) {
        if (!entries.has(neighborDef.id)) continue
        const key = midpointPairKey(entry.def.id, neighborDef.id)
        wanted.add(key)
        if (midpoints.has(key)) continue
        const result = midpointSignpostsFor(entry.def, neighborDef, roadCtx)
        if (!result) continue
        midpoints.set(key, result.map((sp) => buildMidpointInstance(sp)))
      }
    }
    for (const [key, instances] of [...midpoints]) {
      if (wanted.has(key)) continue
      for (const inst of instances) disposeMidpointInstance(inst)
      midpoints.delete(key)
    }
  }
  syncMidpoints()

  const cellRadius = Math.max(1, Math.ceil(loadRadius / SETTLEMENT_GRID_STEP) + 1)
  let lastCheckX = Number.POSITIVE_INFINITY
  let lastCheckZ = Number.POSITIVE_INFINITY
  const recheckDistance = loadRadius * 0.25

  function ensureLoaded(def: SettlementDef): void {
    if (entries.has(def.id)) return
    const entry: Entry = { def, settlement: null, pendingPromise: null }
    entries.set(def.id, entry)
    syncMidpoints()
    entry.pendingPromise = waitForChunks(chunksNear(def.x, def.z, chunkSize))
      .then(() => createSettlement(def, economyFor(def), settlementDeps))
      .then((settlement) => {
        const cur = entries.get(def.id)
        if (!cur) {
          // Player wandered back out of range while this was building.
          settlement.dispose()
          return
        }
        cur.settlement = settlement
        settlement.setDayNight(lastDayNight)
        // Off-screen → detailed handoff (plan settlements-npcs-019) — a live
        // `NpcAgent` now exists for any carrier this settlement just
        // reconstructed; stop off-screen execution ownership before it
        // resumes its own physical pickup/delivery flow. A no-op for a
        // carrier with no order, or whose order has no execution metadata
        // (never went off-screen, or already resolved off-screen to a
        // terminal state — `findByCarrier` excludes those already).
        if (transportOrders) {
          for (const npc of settlement.npcs) {
            const order = transportOrders.findByCarrier(npc.id)
            if (order?.execution) transportOrders.clearExecution(order.id)
          }
        }
      })
      .catch((err: unknown) => {
        console.error('[SettlementsManager] failed to build settlement', def.id, err)
        entries.delete(def.id)
      })
      .finally(() => {
        const cur = entries.get(def.id)
        if (cur) cur.pendingPromise = null
      })
  }

  // Same async streaming path `recheck` uses once the player wanders into
  // range — just triggered immediately so the nearest village(s) are already
  // built (or well underway) long before the player could reach them on foot.
  for (const neighborDef of neighborsFor({ gx: 0, gz: 0 }, roadCtx).slice(0, EAGER_NEIGHBOR_COUNT)) {
    ensureLoaded(neighborDef)
  }

  /** Resolves the live position of an `in-transit` order's destination
   *  endpoint while `settlement` is still loaded (plan settlements-npcs-019)
   *  — only ever needed at handoff time, immediately before stream-out, so
   *  this never has to reconstruct anything from an unloaded settlement.
   *  `null` only for a `household` endpoint this settlement doesn't
   *  actually own (should not happen for the current same-settlement Trader
   *  flow, guarded anyway). */
  function resolveOffscreenHandoffTargetPosition(
    ref: TransportEndpointRef,
    settlement: Settlement,
  ): { x: number, z: number } | null {
    if (ref.type === 'household') {
      const match = settlement.householdStorages.find((s) => s.household.id === ref.householdId)
      return match ? { x: match.position.x, z: match.position.z } : null
    }
    const dest = settlementStorageDestination('food', settlement.landmarks.stockpile, settlement.landmarks.settlementStorage)
    return { x: dest.x, z: dest.z }
  }

  /** Detailed → off-screen handoff (plan settlements-npcs-019) — called from
   *  `unload()` while `settlement`'s `NpcAgent`s and their live positions
   *  still exist. Only ever an `in-transit` order (cargo already claimed);
   *  an `assigned` order abstracted before pickup stays `assigned` with no
   *  execution metadata (see `transportOrder.ts`'s `TransportExecution`
   *  doc) — it simply resumes ordinary pickup once a live carrier exists
   *  again, no timing capture needed. Idempotent via
   *  `TransportOrders.beginOffscreenExecution`'s own guard. */
  function beginOffscreenTransportHandoff(settlement: Settlement, nowDays: number, dayLengthSec: number): void {
    if (!transportOrders) return
    for (const npc of settlement.npcs) {
      const order = transportOrders.findByCarrier(npc.id)
      if (!order || order.state !== 'in-transit' || order.execution) continue
      const target = resolveOffscreenHandoffTargetPosition(order.destination, settlement)
      const from = { x: npc.mesh.position.x, z: npc.mesh.position.z }
      const travelDays = target ? estimateOffscreenTravelDays(from, target, dayLengthSec) : 0
      transportOrders.beginOffscreenExecution(order.id, nowDays + travelDays)
    }
  }

  function unload(id: string, entry: Entry, nowDays: number, dayLengthSec: number): void {
    if (entry.settlement) {
      livestock.capture(id, entry.settlement.livestock)
      rats.capture(id, entry.settlement.rats)
      beginOffscreenTransportHandoff(entry.settlement, nowDays, dayLengthSec)
    }
    entry.settlement?.dispose()
    entries.delete(id)
    syncMidpoints()
  }

  function recheck(playerX: number, playerZ: number, nowDays: number, dayLengthSec: number): void {
    lastCheckX = playerX
    lastCheckZ = playerZ
    const playerCell = worldToCell(playerX, playerZ)

    for (const cell of cellsWithinRadius(playerCell, cellRadius)) {
      const def = defFor(cell)
      if (!def) continue
      const dist = Math.hypot(def.x - playerX, def.z - playerZ)
      if (dist <= loadRadius) ensureLoaded(def)
    }
    for (const [id, entry] of [...entries]) {
      if (entry.def.isHome || entry.pendingPromise) continue
      const dist = Math.hypot(entry.def.x - playerX, entry.def.z - playerZ)
      if (dist > unloadRadius) unload(id, entry, nowDays, dayLengthSec)
    }
    // World-owned off-screen transport progression (plan
    // settlements-npcs-019) — bounded to active orders, checked at this
    // stream-transition checkpoint rather than per frame. Also covers
    // catch-up right after boot/restore, since `recheck` always fires once
    // immediately (`lastCheckX`/`lastCheckZ` start at `Infinity`).
    if (transportOrders) resolveOffscreenTransportArrivals(transportOrders, offscreenTransportLookup, nowDays)
  }

  return {
    get home() {
      return homeSettlement
    },
    homeReady: homeReadyPromise,
    setDayNight(t) {
      lastDayNight = t
      for (const entry of entries.values()) entry.settlement?.setDayNight(t)
    },
    resolveTimeSkip(startTimeOfDay, hours, dayLengthSec) {
      for (const entry of entries.values()) {
        if (!entry.settlement) continue
        for (const npc of entry.settlement.npcs) npc.resolveTimeSkip(startTimeOfDay, hours, dayLengthSec)
      }
    },
    update(dt, playerPos, playerYaw, timeOfDay, dayFactor, litFires, villages, dayLengthSec, nearbyAnimalThreats, dropLivestockProduct, nowDays, onAnimalVocalize, weather, nearbyPredators, playerObservation, nearbyWildCorpses) {
      if (Math.hypot(playerPos.x - lastCheckX, playerPos.z - lastCheckZ) >= recheckDistance) {
        recheck(playerPos.x, playerPos.z, nowDays ?? 0, dayLengthSec)
      }
      for (const entry of entries.values()) {
        entry.settlement?.update(
          dt,
          playerPos,
          playerYaw,
          timeOfDay,
          dayFactor,
          litFires,
          villages,
          dayLengthSec,
          nearbyAnimalThreats,
          dropLivestockProduct,
          nowDays,
          onAnimalVocalize,
          weather,
          nearbyPredators,
          playerObservation,
          nearbyWildCorpses,
        )
      }
      if (detachedLivestock.length > 0) {
        tickSettlementLivestock(detachedLivestock, {
          dt,
          settlementId: 'detached',
          observerPos: playerPos,
          dayFactor,
          timeOfDay,
          nowDays: nowDays ?? 0,
          litFires,
          villages,
          getNowDays: () => nowDays ?? 0,
          dropLivestockProduct,
          onAnimalVocalize,
          persistence: livestock,
          grassForage,
          waterSourceProvider,
          playerObservation,
          playerControlPos: { x: playerPos.x, z: playerPos.z },
          resolvePersistenceSettlementId: (animal) => detachedOriginById.get(animal.animalId) ?? 'detached',
        })
        for (const [animalId, animal] of detachedById) {
          if (!detachedLivestock.includes(animal)) {
            detachedById.delete(animalId)
            detachedOriginById.delete(animalId)
          }
        }
        for (const animal of detachedLivestock) {
          const origin = detachedOriginById.get(animal.animalId)
          if (origin) livestock.upsert(origin, animal)
        }
      }
      for (const instances of midpoints.values()) {
        for (const inst of instances) updateLabelOpacity(inst, playerPos)
      }
    },
    getLoaded() {
      const out: Settlement[] = []
      for (const entry of entries.values()) {
        if (entry.settlement) out.push(entry.settlement)
      }
      return out
    },
    getHomeDef: () => homeDef,
    peekDef: (cell) => defFor(cell),
    getHousehold: (id) => households.get(id),
    getEconomy: (settlementId) => economies.get(settlementId),
    snapshotEconomies: () => economies.serialize(),
    snapshotHouseholds: () => households.serialize(),
    snapshotNpcStates: () => npcStates.serialize(),
    getNpcState: (id) => npcStates.get(id),
    snapshotRelationships: () => npcRelationships.snapshot(),
    snapshotLivestock: () => {
      for (const entry of entries.values()) {
        if (entry.settlement) livestock.capture(entry.def.id, entry.settlement.livestock)
      }
      for (const animal of detachedLivestock) {
        const origin = detachedOriginById.get(animal.animalId)
        if (origin) livestock.upsert(origin, animal)
      }
      return livestock.serialize()
    },
    snapshotRats: () => {
      for (const entry of entries.values()) {
        if (entry.settlement) rats.capture(entry.def.id, entry.settlement.rats)
      }
      return rats.serialize()
    },
    snapshotStorageInfestation: () => ratInfestation.serialize(),
    isStorageDamaged: (settlementId) => ratInfestation.isStorageDamaged(settlementId),
    isNestDestroyed: (settlementId) => ratInfestation.isNestDestroyed(settlementId),
    hasActiveNest: (settlementId) => ratInfestation.hasActiveNest(settlementId),
    repairStorageInfestation: (settlementId) => ratInfestation.repairStorage(settlementId),
    destroyRatNest: (settlementId) => {
      ratInfestation.destroyNest(settlementId)
      entries.get(settlementId)?.settlement?.hideRatNest()
    },
    countAliveRats: (settlementId) => {
      const entry = entries.get(settlementId)
      if (!entry?.settlement) return 0
      return entry.settlement.rats.reduce((n, rat) => n + (rat.isDead() ? 0 : 1), 0)
    },
    resolvePersistentAnimal: (animalId) => resolveLivePersistentAnimal(persistentLivestockCtx, animalId)?.animal ?? null,
    transferAnimalOwnership: (animalId, owner) => transferAnimalOwnership(persistentLivestockCtx, animalId, owner),
    setOwnedAnimalControl: (animalId, mode) => setOwnedAnimalControl(persistentLivestockCtx, animalId, mode),
    getDetachedLivestock: () => detachedLivestock,
    dispose() {
      disposed = true
      for (const animal of detachedLivestock) {
        animal.dispose()
        animal.mesh.removeFromParent()
      }
      detachedLivestock.length = 0
      detachedById.clear()
      detachedOriginById.clear()
      for (const entry of entries.values()) entry.settlement?.dispose()
      for (const instances of midpoints.values()) {
        for (const inst of instances) disposeMidpointInstance(inst)
      }
      midpoints.clear()
      entries.clear()
      economies.clear()
      households.clear()
      npcStates.clear()
      livestock.clear()
      rats.clear()
      ratInfestation.clear()
    },
  }
}
