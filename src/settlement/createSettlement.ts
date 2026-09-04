import {
  type Scene,
  Vector3,
} from 'three'
import type { ThreateningAnimalCandidate } from '../ai/npcAnimalThreat'
import type { PlayerSocialLookup } from '../ai/reactionChance'
import type { PlayAt } from '../audio/createWorldAudio'
import type { AnimalAgent, AnimalKind, NearbyNpcCandidate, VillageInfo } from '../fauna/AnimalAgent'
import type { SettlementHuntingHooks } from '../fauna/huntingHooks'
import type { DropLivestockProductHook } from '../fauna/livestockProduction'
import type { DroppedItems } from '../items/createDroppedItems'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { SettlementTerrain } from '../shared/SettlementName'
import type { NaturalResource } from '../terrain/naturalResources'
import type { SettlementMiningHooks } from '../terrain/resourceDeposits'
import type { Collider } from '../world/collision'
import type { GrassForageService } from '../world/createGrassForagePatches'
import type { PlayerWells } from '../world/createPlayerWells'
import type { WorkContracts } from '../world/createWorkContracts'
import type { SettlementFoodSourceHooks } from '../world/foodSources'
import type { HelperDeliveryHooks } from '../world/helperDeliveryHooks'
import type { NearbyPlayerWellLookup } from '../world/playerWell'
import type { SettlementForestHooks } from '../world/settlementForestHooks'
import type { WeatherState } from '../world/weather'
import type { VillageSize } from './families'
import type { NpcStateRegistry } from './npcState'
import type { FoodSourceType, SettlementDef } from './settlementGenerator'
import { NpcAgent } from '../ai/NpcAgent'
import { createNpcCrowdPass } from '../ai/npcCrowd'
import { advanceSocialPairing } from '../ai/socialBehaviour'
import { playActionFireExtinguish, playActionFireIgnite } from '../audio/fireSounds'
import { isSystemEnabled } from '../debug/debugMode'
import { type SettlementEconomy, WOODSHED_DEVELOPMENT } from '../economy'
import { useBootMark } from '../shared/bootMark'
import {
  copyVec3,
  createInteractionQueue,
  type InteractionQueue,
  wellQueueId,
} from '../simulation'
import { createNullPointLightBudget, type PointLightBudget } from '../world/pointLightBudget'
import { applyTreeStageVisual } from '../world/treeVisuals'
import { buildAssemblyCollidersWorld, type HouseAssembly } from './houseBuilder'
import { createHouseDoorController } from './houseDoors'
import { type Household, householdIdFor, type HouseholdRegistry } from './household'
import { createHouseholdExchangeHooks, type HouseholdSurplusCandidate } from './householdExchange'
import { disposeLivestock, type LivestockPersistence, spawnLivestock, tickSettlementLivestock } from './livestock'
import { generatePhysicalProfile } from './npcPhysicalProfile'
import { createNpcRelationships, type NpcRelationships } from './npcRelationships'
import { homePlaceId, type Place, socialPlaceFor, workplaceFor } from './places'
import {
  buildSettlementProps,
  createStockpile,
  disposeSettlementGroup,
  placeOnGround,
  type SettlementLandmarks,
} from './props'
import { type RoadNetworkContext, segmentsNear } from './roadNetwork'
import { cellSeed } from './settlementGenerator'
import { createSettlementNightCycle } from './settlementNightCycle'
import { settlementPropColliders } from './settlementPropColliders'
import { createSettlementSignposts } from './settlementSignposts'
import { physicalWoodStockpileQuantity } from './storageVisuals'
import { createVillageFire, FUEL_PER_BRANCH, type VillageFire } from './VillageFire'
import {
  buildWellInteractionQueueConfig,
  WELL_QUEUE_SERVING_OFFSET_FALLBACK,
} from './wellInteractionQueue'

export type { SettlementForestHooks }

/**
 * Well collision radius (plan 097 §2.2 — was `NpcAgent.ts`'s
 * `WELL_COLLISION_RADIUS` before the well became a registry collider like
 * any other). Base well mesh radius ~0.85 (`createWell`) plus a small
 * buffer; the serving stand sits farther out (`servingOffset` below) so
 * queued drinks never need the blocked disk.
 */
const WELL_COLLISION_RADIUS = 0.9

function settlementHouseColliders(
  houses: SettlementLandmarks['houses'],
  houseAssemblies: readonly HouseAssembly[],
): Collider[] {
  const colliders: Collider[] = []
  for (let i = 0; i < houses.length; i++) {
    const house = houses[i]!
    const assembly = houseAssemblies[i]
    if (assembly) {
      colliders.push(...buildAssemblyCollidersWorld(assembly))
    } else {
      colliders.push({
        type: 'circle',
        x: house.position.x,
        z: house.position.z,
        radius: house.footprintRadius,
      })
    }
  }
  return colliders
}

export type Settlement = {
  id: string
  name: string
  isHome: boolean
  /** Plan 032 §8 — surfaced today only in the Villagers screen's settlement
   *  badge (`ui/createVillagersScreen.ts`). */
  foodSourceType: FoodSourceType
  /** `SM/MD/LG/XL/OUTPOST`, straight from `SettlementDef` — see
   *  `docs/plans/archive/2026-08-09--048...`'s "aboutVillage" dialogue topic. */
  size: VillageSize
  /** Terrain feature the naming generator picked up around the site — see
   *  `SettlementDef.terrain`'s doc comment. */
  terrain: SettlementTerrain
  /** The most significant natural resource near the site, or `null` — see
   *  `SettlementDef.dominantResource`'s doc comment. */
  dominantResource: NaturalResource | null
  spawn: Vector3
  center: Vector3
  npcs: readonly NpcAgent[]
  /** Owned farm animals (horse/cow/sheep/chicken), one seeded roll per house
   *  — see `settlement/livestock.ts`. Wild fauna (wolf/deer/etc.) stays in
   *  the separate, home-settlement-only `Fauna` system (`fauna/createFauna.ts`). */
  livestock: readonly AnimalAgent[]
  landmarks: SettlementLandmarks
  /** Settlement-owned bulk stock / demand / development (plan 071). */
  economy: SettlementEconomy
  /** One household per family, index-aligned with `def.families` (plan 069). */
  households: readonly Household[]
  /** Physical household storage containers (plan 156) — one per household,
   *  paired with its own world position. Presentation only; `household`
   *  remains the sole owner of the quantity (`Household.stock`/`.water`). */
  householdStorages: readonly { household: Household, position: Vector3 }[]
  /** Only present for MD/LG villages, see `props.ts`'s `buildSettlementProps`. */
  fire?: VillageFire
  update: (
    dt: number,
    observerPos: Vector3,
    observerYaw: number,
    /** `dayNight.ts`'s clock (0-1, 0=midnight) — forwarded to each
     *  `NpcAgent.update` for `schedule` lookups (sleep gate, `work`
     *  routing). */
    timeOfDay: number,
    dayFactor: number,
    litFires: readonly { x: number, z: number }[],
    villages: readonly VillageInfo[],
    dayLengthSec: number,
    /** Bounded/local currently-threatening animals (plan 179 §7/§10) —
     *  forwarded straight to each `NpcAgent.update`. */
    nearbyAnimalThreats?: readonly ThreateningAnimalCandidate[],
    /** Drops a livestock-produced world item (plan fauna-002) — called for a
     *  `chicken` in this settlement's own `livestock` once its production
     *  cycle completes (`AnimalAgent.readyToLayEgg`). */
    dropLivestockProduct?: DropLivestockProductHook,
    /** `dayNight.elapsedDays` (plan fauna-002) — forwarded to each livestock
     *  `AnimalAgent.update()`'s day-anchor production readiness check.
     *  Defaults to 0 so existing callers/tests that never touch livestock
     *  production are unaffected. */
    nowDays?: number,
    /** Animal-vocalization audio hook (plan settlements-npcs-004 §1) —
     *  forwarded to each livestock `AnimalAgent.update()`'s spontaneous
     *  cooldown roll, and also fired directly on an egg-laid event, so both
     *  world-triggered vocalizations share one throttled call site instead
     *  of duplicating triggers between simulation events and audio. */
    onAnimalVocalize?: (kind: AnimalKind, x: number, z: number) => void,
    /** This frame's world weather (plan npc-012) — forwarded straight to
     *  each `NpcAgent.update()` (`gameLoop.ts`'s own `climate.weather`,
     *  never recomputed here). `undefined` for any caller/test that doesn't
     *  pass one; weather then contributes no shelter pressure. */
    weather?: WeatherState,
    /** Bounded/local live wild predators (plan fauna-011 §9/§10/§11) —
     *  forwarded straight to `tickSettlementLivestock`; only meaningful for
     *  an owned `dog`. Caller (`SettlementsManager.update`) keeps this small
     *  (a per-frame filter over `Fauna.getAgents()`, not a scan per dog). */
    nearbyPredators?: readonly AnimalAgent[],
  ) => void
  /** Fades every house's window glow in/out — `t`: 0 (day, off) .. 1 (full
   *  night glow). Called from `SettlementsManager.setDayNight`, itself only
   *  invoked on the same throttled day/night tick as `applyDayNight`
   *  (`app/createApp.ts`), not every frame. */
  setDayNight: (t: number) => void
  /** Ticks this settlement's own campfire only — split out of `update()`
   *  (plan playtest fixes §2) so `gameLoop.ts` can burn fuel against the
   *  same `worldDt` player needs use (scaled during a rest/sleep time-skip),
   *  while `update()` itself stays gated off entirely during a skip (NPCs/
   *  livestock keep the freeze-and-catch-up behaviour, plan 196). */
  tickFire: (dt: number) => void
  dispose: () => void
}

/** Pure function of `def` + terrain height — deliberately independent of
 *  `buildSettlementProps`/NPCs/livestock, so a caller that only needs the
 *  player's spawn point (`app/createApp.ts`, world-003 "faster application
 *  startup") can compute it without waiting for the rest of `createSettlement`
 *  to finish. Kept here (not duplicated) so the two call sites can never
 *  drift apart. */
export function settlementSpawnPoint(def: SettlementDef, sampleHeight: HeightSampler): Vector3 {
  return new Vector3(
    def.x + 3.5,
    sampleHeight(def.x + 3.5, def.z - 3),
    def.z - 3,
  )
}

/** Everything `createSettlement` needs besides `def`/`economy` (createSettlement
 *  refactor review, P1) — was a 26-parameter positional signature duplicated
 *  verbatim across `SettlementsManager.ts`'s two call sites. Build one of
 *  these per manager (after its registries exist) and pass it at both. */
export type CreateSettlementDeps = {
  // world
  scene: Scene
  sampleHeight: HeightSampler
  waterLevel: number
  localRadius: number
  seed: number
  // registries (owned by SettlementsManager, shared across stream-out/in)
  /** Household stock registry — same instance across a settlement's
   *  unload/reload so stream-out/stream-in reuses it. */
  householdRegistry: HouseholdRegistry
  /** Authoritative NPC state (health/needs/stamina/vigor), keyed by stable
   *  npc id (plan 197) — lives on `SettlementsManager`, not this settlement,
   *  for the same reuse-across-stream-out/in reason as `householdRegistry`. */
  npcStateRegistry: NpcStateRegistry
  /** Symmetric NPC↔NPC relation store (plan 151) — same "one registry owned
   *  by `SettlementsManager`, threaded through" pattern as `householdRegistry`/
   *  `npcStateRegistry` above, not a per-`NpcAgent.create` hook (only this
   *  settlement's own `update()` needs it, for the social-pairing pass
   *  below). Defaults to a fresh, isolated store for callers/tests that
   *  don't pass one in. */
  relations?: NpcRelationships
  /** Saved livestock state + tombstones (plan persistence-001) — same "one
   *  registry owned by `SettlementsManager`, threaded through" pattern as
   *  `householdRegistry`/`npcStateRegistry` above. Forwarded into
   *  `spawnLivestock`, and consulted again in `update()`'s corpse-removal
   *  loop so a newly-completed removal is tombstoned immediately. */
  livestockPersistence?: LivestockPersistence
  // collision
  collidersNear: ColliderSource
  /** Registers this settlement's static colliders (well + houses +
   *  stockpile/wagon/horse/village fire) under `def.id` so they participate
   *  in the shared `ColliderRegistry` (plan 097 §2.2, issue 036). Cleared
   *  again in `dispose()`. */
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void
  clearColliders: (ownerKey: string) => void
  // presentation
  playAt?: PlayAt
  /** Plan 157 — registers this settlement's house lamps/village torches/
   *  campfire (`group`, once built) so production `NUM_POINT_LIGHTS`
   *  stabilization (`src/world/pointLightBudget.ts`) sees them for as long
   *  as the settlement stays loaded. Defaults to a no-op. */
  pointLightBudget?: PointLightBudget
  roadCtx?: RoadNetworkContext
  // world-system hooks forwarded into NpcAgent / livestock
  forest?: SettlementForestHooks
  /** NPC ore-mining hooks over `ResourceDeposits` (plan 131) — forwarded into
   *  every `NpcAgent.create` call the same way as `forest` above. */
  mining?: SettlementMiningHooks
  /** NPC hunger-source discovery hooks over natural world items + crops
   *  (plan 174) — forwarded into every `NpcAgent.create` call the same way
   *  `mining` is above. */
  foodSources?: SettlementFoodSourceHooks
  /** Hunter target discovery + harvest hooks over the live `Fauna` (plan 178)
   *  — forwarded into every `NpcAgent.create` call the same way
   *  `mining`/`foodSources` are above. */
  hunting?: SettlementHuntingHooks
  /** Helper resource-delivery target hooks over the player's placed
   *  `Container`s (plan 167) — forwarded into every `NpcAgent.create` call
   *  the same way `foodSources`/`hunting` are above. */
  helperDelivery?: HelperDeliveryHooks
  /** Resolves an NPC's relation level + general player standing by name —
   *  forwarded into every `NpcAgent.create` call below (plan 117). */
  getPlayerSocial?: PlayerSocialLookup
  /** Bounded lookup for a nearby completed player-built well (plan 127 §10)
   *  — forwarded into every `NpcAgent.create` call the same way
   *  `getPlayerSocial` is above. */
  getNearbyPlayerWell?: NearbyPlayerWellLookup
  /** Persistent land-plot ownership query (plan 129) — a "for sale" sign is
   *  only materialized for a plot this returns `false` for at build time; a
   *  purchase made later while the settlement stays loaded is picked up live
   *  by `update()` instead, same pattern as `placeWoodshedIfComplete`. */
  isLandPlotOwned?: (settlementId: string, plotId: string) => boolean
  /** Reports any of this settlement's livestock deaths (any cause) by
   *  `animalId` — forwarded into `spawnLivestock` (plan 110). */
  onAnimalDeath?: (animalId: string) => void
  /** Authoritative Work Contract lifecycle (plan npc-015) — forwarded into
   *  every `NpcAgent.create` call the same way `mining`/`foodSources` are
   *  above. World-global (not settlement-scoped): an NPC resolves its own
   *  settlement's notice board from its own `household.settlementId`. */
  workContracts?: WorkContracts
  /** Player-built wells (plan 127/npc-015) — the construction target NPC
   *  Work Contract execution advances, forwarded the same way. */
  playerWells?: PlayerWells
  /** World-dropped items — lets NPC construction work draw nearby materials
   *  the same bounded way the player's own construction already does
   *  (plan npc-015 §9's material-provisioning analogue), forwarded the same
   *  way as `workContracts`/`playerWells`. */
  droppedItems?: DroppedItems
  /** Shared world-owned grass forage service (plan fauna-010 §3/§4) —
   *  forwarded into `tickSettlementLivestock` the same way as `hunting`/
   *  `foodSources` above. */
  grassForage?: GrassForageService
}

export async function createSettlement(
  def: SettlementDef,
  economy: SettlementEconomy,
  deps: CreateSettlementDeps,
): Promise<Settlement> {
  const {
    scene,
    sampleHeight,
    waterLevel,
    localRadius,
    seed,
    householdRegistry,
    npcStateRegistry,
    collidersNear,
    registerColliders,
    clearColliders,
    playAt = () => {},
    roadCtx,
    forest,
    onAnimalDeath,
    getPlayerSocial,
    mining,
    isLandPlotOwned,
    pointLightBudget = createNullPointLightBudget(),
    getNearbyPlayerWell,
    foodSources,
    hunting,
    helperDelivery,
    relations = createNpcRelationships(),
    livestockPersistence,
    workContracts,
    playerWells,
    droppedItems,
    grassForage,
  } = deps

  const { bootMark, bootMarkEnd } = useBootMark('createSettlement')

  const site = { x: def.x, z: def.z, y: def.y }
  // Pure function of (seed, gx, gz) — computed up front since both the
  // livestock spawn below and the night-fire ignition roll further down need
  // this settlement's own seed. See `settlementGenerator.ts`'s `cellSeed`
  // for why it's `def.gx/def.gz` combined with the world seed rather than a
  // hash of `def.id`.
  const settlementSeed = cellSeed(seed, { gx: def.gx, gz: def.gz })
  // Only needed when the forest belt actually runs (`def.isHome`, see
  // `buildSettlementProps`'s `plantForest`) — keeps roads out of the
  // settlement's own bespoke trees/bushes (`props.ts`'s `blocksPathOrClearing`).
  const roadSegments = def.isHome && roadCtx
    ? segmentsNear(site.x, site.z, localRadius * 2, roadCtx)
    : []
  bootMark('buildSettlementProps')
  let propsResult: Awaited<ReturnType<typeof buildSettlementProps>>
  try {
    propsResult = await buildSettlementProps(
      site,
      sampleHeight,
      waterLevel,
      localRadius,
      seed,
      def.clearings,
      def.size,
      def.isHome,
      def.foodSourceType,
      roadSegments,
      def.plan,
      roadCtx
        ? {
            sampleHeight,
            waterLevel,
            sampleContinentalness: roadCtx.terrainSamplers.sampleContinentalness,
            coastThreshold: roadCtx.region.coastThreshold,
          }
        : { sampleHeight, waterLevel },
    )
  } finally {
    bootMarkEnd('buildSettlementProps')
  }
  const { group, landmarks, houseLights, villageTorches, houseAssemblies, storageVisual } = propsResult
  scene.add(group)
  // Plan 157 — one bounded walk of this settlement's own root, not the whole
  // scene: captures every house lamp, village torch, and the settlement's
  // own campfire (all attached under `group` by `buildSettlementProps`) in a
  // single call, mirrored by `unregisterSubtree(group)` in `dispose()` below.
  pointLightBudget.registerSubtree(group)

  const registerSettlementColliders = (): void => {
    registerColliders(def.id, [
      { type: 'circle', x: landmarks.well.x, z: landmarks.well.z, radius: WELL_COLLISION_RADIUS },
      ...settlementHouseColliders(landmarks.houses, houseAssemblies),
      ...settlementPropColliders(landmarks),
    ])
  }
  registerSettlementColliders()
  const houseDoors = createHouseDoorController(houseAssemblies)

  if (forest) {
    const worldDays = forest.getWorldDays()
    for (const tree of landmarks.trees) {
      const presence = {
        id: tree.id,
        x: tree.position.x,
        z: tree.position.z,
        speciesIndex: tree.speciesIndex,
        initialStage: tree.initialStage,
        sizeClass: tree.sizeClass,
        sizeJitter: tree.sizeJitter,
      }
      forest.lifecycle.registerPresence(presence)
      const resolved = forest.lifecycle.resolve(
        presence,
        forest.sampleEnv(tree.position.x, tree.position.z),
        worldDays,
      )
      if (resolved.visual !== 'living') {
        tree.mesh = applyTreeStageVisual(tree.mesh, resolved.stage)
      }
    }
  }

  // Place v1: formalizes the home assignment that already existed
  // (`landmarks.homes[i % length]`) as a `Place` instead of a bare
  // `Vector3` — see `places.ts`. Same fallback as before when a settlement
  // somehow has no huts (shouldn't happen, but `findSettlementSite` doesn't
  // guarantee it). Built before `spawnLivestock` (moved up from its
  // original spot further down, plan 122) so livestock can look up their
  // owning household's `AnimalTrough` water at spawn time.
  const homePlaces: Place[] =
    landmarks.homes.length > 0
      ? landmarks.homes.map((position, i) => ({ id: homePlaceId(def.id, i), type: 'home', position }))
      : [{ id: `${def.id}:home:fallback`, type: 'home', position: landmarks.well.clone() }]

  // Runtime fire state (moved ahead of its previous spot further down, plan
  // npc-013) — the Social Place below needs `isLit()` at construction time so
  // an idle NPC's night campfire opportunity (`NpcAgent.resolveIdleActivity`)
  // never targets an unlit or non-existent fire. Nothing between here and the
  // fire's original spot depended on this ordering.
  const fire = landmarks.campfire
    ? createVillageFire(landmarks.campfire.position, landmarks.campfire.flame, FUEL_PER_BRANCH, {
      // Deterministic night autolight (`setDayNight` below) passes
      // `'night'` — no flint SFX, nobody physically struck one (plan 130 §8).
      onLight: (pos, source) => { if (source === 'player') playActionFireIgnite(playAt, pos) },
      onExtinguish: (pos) => playActionFireExtinguish(playAt, pos),
    })
    : undefined

  // Social Place v1 (plan 151) — the settlement's own campfire, or `null`
  // for a settlement without one (SM/OUTPOST). No new campfire generator:
  // `socialPlaceFor` only wraps the existing `landmarks.campfire`. The
  // `isAvailable` predicate (plan npc-013) reflects `fire.isLit()` live —
  // `socialPlaceFor` itself only proves the campfire prop exists.
  const socialPlace: Place | null = socialPlaceFor(def.id, landmarks, fire ? () => fire.isLit() : undefined)

  // 1 family = 1 household = 1 house (plan 069 §5): every member of a family
  // shares that family's home place and household stock. `households` stays
  // index-aligned with `def.families` — the registry itself lives on
  // `SettlementsManager` so stream-out/stream-in reuses the same stock.
  const households: Household[] = def.families.map((family, familyIndex) => {
    const home = homePlaces[familyIndex % homePlaces.length]!
    const hasHunter = family.members.some((m) => m.character.role === 'hunter')
    return householdRegistry.getOrCreate(householdIdFor(def.id, familyIndex), def.id, home.id, hasHunter)
  })
  // Local resource exchange (plan settlements-npcs-005) — one bounded,
  // same-settlement candidate list built once from `households`/`homePlaces`
  // above (no world-wide household scan, no second registry query). Home
  // positions are static once a settlement is built, so this snapshot stays
  // valid for the settlement's whole lifetime; `Household` objects
  // themselves are live references, so `surplus()` always reflects current
  // stock at claim time regardless of when this list was built.
  const householdExchangeCandidates: readonly HouseholdSurplusCandidate[] = households.map((household, familyIndex) => {
    const position = homePlaces[familyIndex % homePlaces.length]!.position
    return { household, position: { x: position.x, z: position.z } }
  })
  const householdExchange = createHouseholdExchangeHooks(householdExchangeCandidates)
  // Household storage container binding (plan 156) — same
  // `familyIndex % homePlaces.length` indexing as `households` above so a
  // household's container sits at its own home's yard, not a mismatched one.
  const householdStorages: readonly { household: Household, position: Vector3 }[] =
    landmarks.householdStorages.length > 0
      ? households.map((household, familyIndex) => ({
          household,
          position: landmarks.householdStorages[familyIndex % landmarks.householdStorages.length]!,
        }))
      : households.map((household, familyIndex) => ({
          household,
          position: homePlaces[familyIndex % homePlaces.length]!.position,
        }))
  // `homeId -> Household` (plan 122) so `spawnLivestock` can hand each
  // house-anchored animal its owning household's water reserve — keyed the
  // same way `ownerHouseId` already is (`homePlaceId(def.id, i)`).
  const householdByHomeId = new Map(households.map((h) => [h.homeId, h]))

  bootMark('spawnLivestock')
  let livestock: Awaited<ReturnType<typeof spawnLivestock>>
  try {
    livestock = await spawnLivestock(
      scene,
      sampleHeight,
      waterLevel,
      collidersNear,
      landmarks.homes,
      def.size,
      settlementSeed,
      def.id,
      onAnimalDeath,
      householdByHomeId,
      landmarks.merchantHorseSpawn,
      livestockPersistence,
    )
  } finally {
    bootMarkEnd('spawnLivestock')
  }

  bootMark('signposts')
  let signposts: Awaited<ReturnType<typeof createSettlementSignposts>>
  try {
    signposts = await createSettlementSignposts({
      def,
      group,
      landmarks,
      sampleHeight,
      roadCtx,
      isLandPlotOwned,
    })
  } finally {
    bootMarkEnd('signposts')
  }

  // Interaction queues (plan 079): well drink first; garden/stall later reuse
  // the same map. Line runs +Z from the well so waiters stand south of the rim.
  // servingOffset: rim + 0.3 m (`settlement:well` anchor). GLB well uses
  // the same asset-local rim as procedural `createWell` (~0.85 m south).
  const wellQid = wellQueueId(def.id)
  const wellQueueRest = {
    spacing: 1.2,
    maxVisibleSlots: 8,
    servingCapacity: 1,
  }
  const queues = new Map<string, InteractionQueue>([
    [
      wellQid,
      createInteractionQueue(
        wellQid,
        landmarks.wellProp
          ? buildWellInteractionQueueConfig(
              landmarks.wellProp,
              copyVec3(landmarks.well),
              wellQueueRest,
            )
          : {
              anchor: copyVec3(landmarks.well),
              lineDir: { x: 0, z: 1 },
              servingOffset: WELL_QUEUE_SERVING_OFFSET_FALLBACK,
              ...wellQueueRest,
            },
      ),
    ],
  ])

  // 1 family = 1 house: every member of a family shares that family's home
  // place (`homePlaces[familyIndex]`), not a bare `i % homePlaces.length`
  // cycle — flattened here so the NPC-creation `Promise.all` below stays a
  // single parallel batch, same concurrency as before family grouping existed.
  const flatMembers = def.families.flatMap((family, familyIndex) => {
    const home = homePlaces[familyIndex % homePlaces.length]!
    const household = households[familyIndex]!
    return family.members.map((member) => ({
      home,
      household,
      member,
      // Rest of this member's own family, by name — see `NpcAgent.familyMembers`'s
      // doc comment (dialogue-facing, not a live reference to their `NpcAgent`).
      familyMembers: family.members
        .filter((m) => m !== member)
        .map((m) => ({ name: m.name, lastName: m.lastName, relation: m.relation })),
    }))
  })

  bootMark('npcCreation')
  let agents: NpcAgent[]
  try {
  agents = await Promise.all(
    flatMembers.map(async ({ home, household, member, familyMembers }, i) => {
      const workplace = workplaceFor(def.id, member.character.role, landmarks, i)
      const npcId = `${def.id}:npc:${i}`
      const needOffset = i / Math.max(1, flatMembers.length - 1)
      // Deterministic max HP/stamina/vigor from sex + age (plan npc-001) —
      // own seed stream (settlement seed + flat member index), independent
      // of `needOffset`/name/role rolls. Only used the first time `npcId` is
      // ever seen by `npcStateRegistry` below; hydration of an existing id
      // ignores it (a settlement doesn't re-roll an NPC's body on reload).
      const physicalSeed = settlementSeed ^ Math.imul(i + 1, 0x51ed270b) ^ 0x50485953
      const physicalProfile = generatePhysicalProfile(physicalSeed, member.character.gender, member.age)
      // Hydrates from the same HP/needs/stamina/vigor object every time this
      // id has been seen before (agent dispose/recreate on settlement
      // unload/reload) — a genuinely new id gets the usual fresh state
      // (plan 197), seeded with this NPC's generated maxima.
      const npcState = npcStateRegistry.getOrCreate(npcId, needOffset, physicalProfile)
      const agent = await NpcAgent.create({
        sampleHeight,
        waterLevel,
        collidersNear,
        landmarks,
        home,
        workplace,
        socialPlace,
        treeIndex: i,
        needOffset,
        member,
        familyMembers,
        playAt,
        forest,
        npcId,
        queues,
        wellQueueId: wellQid,
        economy,
        household,
        npcState,
        getPlayerSocial,
        mining,
        getNearbyPlayerWell,
        foodSources,
        hunting,
        helperDelivery,
        householdExchange,
        workContracts,
        playerWells,
        droppedItems,
      })
      if (isSystemEnabled('npcs')) scene.add(agent.mesh)
      return agent
    }),
  )
  } finally {
    bootMarkEnd('npcCreation')
  }

  const spawn = settlementSpawnPoint(def, sampleHeight)
  const npcCrowd = createNpcCrowdPass()
  const nightCycle = createSettlementNightCycle({
    settlementSeed,
    size: def.size,
    fire,
    villageTorches,
    houseLights,
  })

  /** Most recent `update()` call's `nowDays` — read by a chicken's
   *  `onCollected` closure (plan fauna-002), which can fire an arbitrary
   *  number of frames/days after the egg was laid (whenever the player
   *  actually picks it up), so it can't capture a frozen `nowDays` value
   *  from lay time. Mutable-outer-variable-in-closure. */
  let currentNowDays = 0
  let woodshedPlaced = false

  function placeWoodshedIfComplete(): void {
    if (woodshedPlaced) return
    if (economy.developmentStatus(WOODSHED_DEVELOPMENT.id) !== 'complete') return
    woodshedPlaced = true
    const pile = createStockpile()
    pile.scale.multiplyScalar(0.75)
    const x = landmarks.stockpile.x - 1.8
    const z = landmarks.stockpile.z - 1.1
    placeOnGround(pile, x, z, sampleHeight)
    group.add(pile)
  }
  placeWoodshedIfComplete()

  return {
    id: def.id,
    name: def.name,
    isHome: def.isHome,
    foodSourceType: def.foodSourceType,
    size: def.size,
    terrain: def.terrain,
    dominantResource: def.dominantResource,
    spawn,
    center: new Vector3(site.x, site.y, site.z),
    npcs: agents,
    livestock,
    landmarks,
    economy,
    households,
    householdStorages,
    fire,
    update(dt, observerPos, observerYaw, timeOfDay, dayFactor, litFires, villages, dayLengthSec, nearbyAnimalThreats = [], dropLivestockProduct, nowDays = 0, onAnimalVocalize, weather, nearbyPredators) {
      currentNowDays = nowDays
      const crowd = npcCrowd.run(agents, dt)
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i]!
        agent.update(dt, observerPos, observerYaw, timeOfDay, crowd.nearbyCounts[i]!, dayLengthSec, nearbyAnimalThreats, weather)
        if (crowd.pushX[i] !== 0 || crowd.pushZ[i] !== 0) agent.applySeparation(crowd.pushX[i]!, crowd.pushZ[i]!)
      }
      // Social Place conversation pairing (plan 151) — reuses this
      // settlement's own already-updated `agents` list (no global registry);
      // a no-op pass when nobody is currently settled at the campfire.
      advanceSocialPairing(agents, relations, dayLengthSec)
      // Plan fauna-011 §7: an owned dog's stranger-bark check reuses this
      // settlement's own already-updated `agents` list — cheap and already
      // in scope, no separate global candidate collection needed.
      const nearbySettlementNpcs: NearbyNpcCandidate[] = agents
        .filter((a) => !a.health.dead)
        .map((a) => ({ id: a.id, x: a.mesh.position.x, z: a.mesh.position.z, homeId: a.household?.homeId }))
      tickSettlementLivestock(livestock, {
        dt,
        settlementId: def.id,
        observerPos,
        dayFactor,
        timeOfDay,
        nowDays,
        litFires,
        villages,
        getNowDays: () => currentNowDays,
        dropLivestockProduct,
        onAnimalVocalize,
        persistence: livestockPersistence,
        grassForage,
        nearbyPredators,
        nearbySettlementNpcs,
      })
      placeWoodshedIfComplete()
      // Physical storage visuals (plan settlements-npcs-010) — cheap derived
      // sync every tick; each controller no-ops unless its own visual state
      // actually changed. The one shared wood pile reflects every household's
      // own pantry wood plus the settlement's bulk wood, since both are
      // physically deposited at the same `landmarks.stockpile` destination
      // (plan settlements-npcs-009). Food is per-storage-location, so each
      // household's crate reflects only that household's own `items`.
      storageVisual.wood.sync(physicalWoodStockpileQuantity(households, economy))
      storageVisual.settlementFood.sync(economy.items)
      if (storageVisual.householdFood.length > 0) {
        for (let i = 0; i < householdStorages.length; i++) {
          const visual = storageVisual.householdFood[i % storageVisual.householdFood.length]!
          visual.sync(householdStorages[i]!.household.items)
        }
      }
      for (const torch of villageTorches) torch.update(dt)
      if (houseDoors.update(dt, observerPos)) registerSettlementColliders()
      signposts.update(observerPos)
    },
    setDayNight(t) {
      nightCycle.apply(t)
    },
    tickFire(dt) {
      fire?.update(dt)
    },
    dispose() {
      pointLightBudget.unregisterSubtree(group)
      clearColliders(def.id)
      if (forest) {
        for (const tree of landmarks.trees) forest.lifecycle.unregisterPresence(tree.id)
      }
      for (const agent of agents) {
        agent.dispose()
        agent.mesh.removeFromParent()
      }
      disposeLivestock(livestock)
      signposts.dispose()
      disposeSettlementGroup(group)
      group.removeFromParent()
    },
  }
}
