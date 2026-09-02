import {
  type Group,
  type Scene,
  Vector3,
} from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { ThreateningAnimalCandidate } from '../ai/npcAnimalThreat'
import type { PlayerSocialLookup } from '../ai/reactionChance'
import type { PlayAt } from '../audio/createWorldAudio'
import type { AnimalAgent, AnimalKind, VillageInfo } from '../fauna/AnimalAgent'
import type { SettlementHuntingHooks } from '../fauna/huntingHooks'
import type { DropLivestockProductHook } from '../fauna/livestockProduction'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { SettlementTerrain } from '../shared/SettlementName'
import type { NaturalResource } from '../terrain/naturalResources'
import type { SettlementMiningHooks } from '../terrain/resourceDeposits'
import type { Collider } from '../world/collision'
import type { SettlementFoodSourceHooks } from '../world/foodSources'
import type { HelperDeliveryHooks } from '../world/helperDeliveryHooks'
import type { NearbyPlayerWellLookup } from '../world/playerWell'
import type { SettlementForestHooks } from '../world/settlementForestHooks'
import type { VillageSize } from './families'
import type { NpcStateRegistry } from './npcState'
import type { FoodSourceType, SettlementDef } from './settlementGenerator'
import { NpcAgent } from '../ai/NpcAgent'
import { advanceSocialPairing } from '../ai/socialBehaviour'
import { disposeObject3D } from '../assets/loadGltf'
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
import { labelOpacityForDistance } from '../ui/labelDistance'
import { createSeededRandom } from '../world/parseSeed'
import { createNullPointLightBudget, type PointLightBudget } from '../world/pointLightBudget'
import { applyTreeStageVisual } from '../world/treeVisuals'
import { buildAssemblyCollidersWorld, type HouseAssembly } from './houseBuilder'
import { type Household, householdIdFor, type HouseholdRegistry } from './household'
import { createHouseholdExchangeHooks, type HouseholdSurplusCandidate } from './householdExchange'
import { disposeLivestock, spawnLivestock } from './livestock'
import { minorLocationsFor } from './minorLocations'
import { generatePhysicalProfile } from './npcPhysicalProfile'
import { createNpcRelationships, type NpcRelationships } from './npcRelationships'
import { homePlaceId, type Place, socialPlaceFor, workplaceFor } from './places'
import {
  buildSettlementProps,
  cloneProp,
  createDock,
  createSignpost,
  createStockpile,
  createVillageNamepost,
  disposeSettlementGroup,
  DOCK_SPECS,
  loadPropTemplates,
  placeOnGround,
  type SettlementLandmarks,
  VILLAGE_NAMEPOST_BOARD_CENTER_Y,
} from './props'
import {
  type RoadNetworkContext,
  routeToMinorLocation,
  segmentsNear,
  signpostsForSettlement,
} from './roadNetwork'
import { cellSeed } from './settlementGenerator'
import { settlementPropColliders } from './settlementPropColliders'
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

/** `setDayNight`'s `t` (0 day .. 1 full night) above this triggers the
 *  settlement fire's dusk-ignition roll (see `nightIndex`/`setDayNight`
 *  below). NPC sleep timing moved to `NpcAgent`'s own `schedule` (v2 stage
 *  2, `docs/plans/archive/2026-08-07--020...`) — this threshold is now fire-only. */
const NIGHT_FIRE_THRESHOLD = 0.6
/** Per-size chance the settlement fire is already lit at dusk (villagers keep
 *  it going — no player branch). OUTPOST/SM have no campfire prop. */
const NIGHT_FIRE_IGNITE_CHANCE: Record<VillageSize, number> = {
  OUTPOST: 0,
  SM: 0,
  MD: 0.75,
  LG: 0.85,
  XL: 1,
}

/** How close (world units) another NPC must be to count toward
 *  `nearbyNpcCount` for `NpcAgent`'s group reaction-chance dampening (issue
 *  010). */
const GROUP_REACTION_RADIUS = 6
/** Below this center-to-center distance, two NPCs push apart (plan 153) —
 *  roughly two adult body widths, small enough to never fight a real
 *  destination (well serving stand, queue slot) but large enough that a
 *  crowd converging on one point visibly spreads out instead of stacking. */
const NPC_SEPARATION_RADIUS = 0.5
/** Push speed (m/s per meter of overlap) applied by `applySeparation`. */
const NPC_SEPARATION_SPEED = 1.5
/** How close the observer must be to a house entrance before the door swings open. */
const HOUSE_DOOR_OPEN_DISTANCE = 2.6
const HOUSE_DOOR_CLOSE_DISTANCE = 3.4
const _entranceWorld = new Vector3()

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

export async function createSettlement(
  scene: Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  localRadius: number,
  seed: number,
  def: SettlementDef,
  economy: SettlementEconomy,
  householdRegistry: HouseholdRegistry,
  /** Authoritative NPC state (health/needs/stamina/vigor), keyed by stable
   *  npc id (plan 197) — lives on `SettlementsManager`, not this settlement,
   *  for the same reuse-across-stream-out/in reason as `householdRegistry`. */
  npcStateRegistry: NpcStateRegistry,
  collidersNear: ColliderSource,
  /** Registers this settlement's static colliders (well + houses +
   *  stockpile/wagon/horse/village fire) under `def.id` so they participate
   *  in the shared `ColliderRegistry` (plan 097 §2.2, issue 036). Cleared
   *  again in `dispose()` below. */
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void,
  clearColliders: (ownerKey: string) => void,
  playAt: PlayAt = () => {},
  roadCtx?: RoadNetworkContext,
  forest?: SettlementForestHooks,
  /** Reports any of this settlement's livestock deaths (any cause) by
   *  `animalId` — forwarded into `spawnLivestock` (plan 110). */
  onAnimalDeath?: (animalId: string) => void,
  /** Resolves an NPC's relation level + general player standing by name —
   *  forwarded into every `NpcAgent.create` call below (plan 117). */
  getPlayerSocial?: PlayerSocialLookup,
  /** NPC ore-mining hooks over `ResourceDeposits` (plan 131) — forwarded into
   *  every `NpcAgent.create` call below the same way as `forest` above. */
  mining?: SettlementMiningHooks,
  /** Persistent land-plot ownership query (plan 129) — a "for sale" sign is
   *  only materialized for a plot this returns `false` for at build time; a
   *  purchase made later while the settlement stays loaded is picked up live
   *  by `update()` below instead, same pattern as `placeWoodshedIfComplete`. */
  isLandPlotOwned?: (settlementId: string, plotId: string) => boolean,
  /** Plan 157 — registers this settlement's house lamps/village torches/
   *  campfire (`group`, once built) so production `NUM_POINT_LIGHTS`
   *  stabilization (`src/world/pointLightBudget.ts`) sees them for as long
   *  as the settlement stays loaded. Defaults to a no-op. */
  pointLightBudget: PointLightBudget = createNullPointLightBudget(),
  /** Bounded lookup for a nearby completed player-built well (plan 127 §10)
   *  — forwarded into every `NpcAgent.create` call below the same way
   *  `getPlayerSocial` is above. */
  getNearbyPlayerWell?: NearbyPlayerWellLookup,
  /** NPC hunger-source discovery hooks over natural world items + crops
   *  (plan 174) — forwarded into every `NpcAgent.create` call below the same
   *  way `mining` is above. */
  foodSources?: SettlementFoodSourceHooks,
  /** Hunter target discovery + harvest hooks over the live `Fauna` (plan 178)
   *  — forwarded into every `NpcAgent.create` call below the same way
   *  `mining`/`foodSources` are above. */
  hunting?: SettlementHuntingHooks,
  /** Helper resource-delivery target hooks over the player's placed
   *  `Container`s (plan 167) — forwarded into every `NpcAgent.create` call
   *  below the same way `foodSources`/`hunting` are above. */
  helperDelivery?: HelperDeliveryHooks,
  /** Symmetric NPC↔NPC relation store (plan 151) — same "one registry owned
   *  by `SettlementsManager`, threaded through" pattern as `households`/
   *  `npcStateRegistry` above, not a per-`NpcAgent.create` hook (only this
   *  settlement's own `update()` needs it, for the social-pairing pass
   *  below). Defaults to a fresh, isolated store for callers/tests that
   *  don't pass one in. */
  relations: NpcRelationships = createNpcRelationships(),
): Promise<Settlement> {
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
  let doorColliderSignature = houseAssemblies
    .map((a) => a.doors.map((d) => (d.isOpen() ? '1' : '0')).join(''))
    .join('|')

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
    )
  } finally {
    bootMarkEnd('spawnLivestock')
  }

  type SignpostInstance = { labelEl: HTMLDivElement, label: CSS2DObject, position: Vector3 }
  const signposts: SignpostInstance[] = []
  // Sale-plot "NA SPRZEDAŻ" signs (plan 129) — one per unowned `landmarks
  // .landPlots` entry, same signpost prop + CSS2D label idiom as the
  // namepost/directional signs below. Skipped entirely for an already-owned
  // plot so it never comes back after a stream-out/stream-in (plan 129 §14.1).
  type LandPlotSignInstance = SignpostInstance & { plotId: string, prop: Group }
  const landPlotSigns: LandPlotSignInstance[] = []

  bootMark('signposts')
  try {
  // Name plaque by the well — reuses signpost label fade/dispose path.
  {
    const nameX = landmarks.well.x + 1.35
    const nameZ = landmarks.well.z + 1.05
    const prop = createVillageNamepost()
    placeOnGround(prop, nameX, nameZ, sampleHeight)
    group.add(prop)

    const labelEl = document.createElement('div')
    labelEl.className = 'npc-label'
    labelEl.textContent = def.name
    const label = new CSS2DObject(labelEl)
    label.position.set(0, VILLAGE_NAMEPOST_BOARD_CENTER_Y, 0)
    prop.add(label)

    signposts.push({
      labelEl,
      label,
      position: new Vector3(nameX, sampleHeight(nameX, nameZ), nameZ),
    })
  }

  if (roadCtx) {
    const [dock] = minorLocationsFor(
      def,
      roadCtx.sampleHeight,
      roadCtx.terrainSamplers.sampleContinentalness,
      roadCtx.region,
      roadCtx.region.roadNetwork.dockSearchRadius,
    )
    if (dock) {
      const dockTemplates = await loadPropTemplates(DOCK_SPECS, () => createDock())
      const dockProp = cloneProp(dockTemplates, 0, 1)
      dockProp.rotation.y = dock.angle
      placeOnGround(dockProp, dock.x, dock.z, sampleHeight)
      group.add(dockProp)
      landmarks.dock = new Vector3(dock.x, dock.y, dock.z)

      const route = routeToMinorLocation(def, 'dock', roadCtx)
      landmarks.dockRoute = route.map((p) => new Vector3(p.x, sampleHeight(p.x, p.z), p.z))
    }

    for (const sp of signpostsForSettlement(def, roadCtx)) {
      const prop = createSignpost()
      prop.rotation.y = sp.angle
      placeOnGround(prop, sp.position.x, sp.position.z, sampleHeight)
      group.add(prop)

      const labelEl = document.createElement('div')
      labelEl.className = 'npc-label'
      labelEl.textContent = sp.targetName
      const label = new CSS2DObject(labelEl)
      label.position.set(0, 2.5, 0)
      prop.add(label)

      signposts.push({
        labelEl,
        label,
        position: new Vector3(sp.position.x, sampleHeight(sp.position.x, sp.position.z), sp.position.z),
      })
    }
  }

  for (const plot of landmarks.landPlots) {
    if (isLandPlotOwned?.(def.id, plot.plotId)) continue
    const prop = createSignpost()
    prop.rotation.y = plot.rotation
    placeOnGround(prop, plot.position.x, plot.position.z, sampleHeight)
    group.add(prop)

    const labelEl = document.createElement('div')
    labelEl.className = 'npc-label'
    labelEl.innerHTML = `NA SPRZEDAŻ<br>${plot.price} monet`
    const label = new CSS2DObject(labelEl)
    label.position.set(0, 2.5, 0)
    prop.add(label)

    landPlotSigns.push({
      plotId: plot.plotId,
      prop,
      labelEl,
      label,
      position: plot.position.clone(),
    })
  }
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
      const agent = await NpcAgent.create(
        sampleHeight,
        waterLevel,
        collidersNear,
        landmarks,
        home,
        workplace,
        socialPlace,
        i,
        needOffset,
        member,
        familyMembers,
        playAt,
        undefined,
        forest,
        npcId,
        queues,
        wellQid,
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
      )
      if (isSystemEnabled('npcs')) scene.add(agent.mesh)
      return agent
    }),
  )
  } finally {
    bootMarkEnd('npcCreation')
  }

  const spawn = settlementSpawnPoint(def, sampleHeight)

  /** Most recent `update()` call's `nowDays` — read by a chicken's
   *  `onCollected` closure (plan fauna-002), which can fire an arbitrary
   *  number of frames/days after the egg was laid (whenever the player
   *  actually picks it up), so it can't capture a frozen `nowDays` value
   *  from lay time. Mutable-outer-variable-in-closure, same idiom as
   *  `nightFactor` below. */
  let currentNowDays = 0
  let nightFactor = 0
  /** Bumped each time `nightFactor` crosses `NIGHT_FIRE_THRESHOLD` upward —
   *  feeds the ignition roll's seed so the same night (even across a
   *  stream-out/stream-in of this settlement) always resolves the same way,
   *  while a later night gets an independent roll. See `settlementGenerator
   *  .ts`'s `cellSeed` for why this settlement's own seed is `def.gx/def.gz`
   *  combined with the world seed rather than a hash of `def.id`. */
  let nightIndex = 0
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
    update(dt, observerPos, observerYaw, timeOfDay, dayFactor, litFires, villages, dayLengthSec, nearbyAnimalThreats = [], dropLivestockProduct, nowDays = 0, onAnimalVocalize) {
      currentNowDays = nowDays
      const nearbyNpcCounts = new Array<number>(agents.length).fill(0)
      const pushX = new Array<number>(agents.length).fill(0)
      const pushZ = new Array<number>(agents.length).fill(0)
      for (let i = 0; i < agents.length; i++) {
        const ai = agents[i]!
        for (let j = i + 1; j < agents.length; j++) {
          const aj = agents[j]!
          const dx = ai.mesh.position.x - aj.mesh.position.x
          const dz = ai.mesh.position.z - aj.mesh.position.z
          const dist = Math.hypot(dx, dz)
          if (dist <= GROUP_REACTION_RADIUS) {
            nearbyNpcCounts[i]!++
            nearbyNpcCounts[j]!++
          }
          // A dead NPC now stays in `agents` for the settlement's whole
          // lifetime (plan 197 — death is authoritative, not erased by the
          // next stream-out/reload) rather than vanishing within a few
          // frames as it effectively used to; exclude it from the physical
          // push so a corpse doesn't shove living NPCs around or get shoved.
          if (dist < NPC_SEPARATION_RADIUS && !ai.health.dead && !aj.health.dead) {
            const overlap = NPC_SEPARATION_RADIUS - dist
            const nx = dist > 1e-4 ? dx / dist : 1
            const nz = dist > 1e-4 ? dz / dist : 0
            const push = overlap * NPC_SEPARATION_SPEED * dt
            pushX[i]! += nx * push
            pushZ[i]! += nz * push
            pushX[j]! -= nx * push
            pushZ[j]! -= nz * push
          }
        }
      }
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i]!
        agent.update(dt, observerPos, observerYaw, timeOfDay, nearbyNpcCounts[i]!, dayLengthSec, nearbyAnimalThreats)
        if (pushX[i] !== 0 || pushZ[i] !== 0) agent.applySeparation(pushX[i]!, pushZ[i]!)
      }
      // Social Place conversation pairing (plan 151) — reuses this
      // settlement's own already-updated `agents` list (no global registry);
      // a no-op pass when nobody is currently settled at the campfire.
      advanceSocialPairing(agents, relations, dayLengthSec)
      // `forestFactor` is hardcoded to 0 — every owned-livestock `AnimalDef`
      // has `playerNoticeRange`/`playerPanicRange` 0, so the forestFactor-
      // modified branch of `isPlayerNoticed()` is structurally unreachable
      // for these kinds regardless of the value passed.
      for (const animal of livestock) {
        animal.update(
          dt, livestock, observerPos, dayFactor, 0, litFires, villages,
          undefined, undefined, undefined, undefined, undefined, undefined, onAnimalVocalize, nowDays,
        )
        // Plan fauna-002 §2 — a `chicken`'s egg becomes a normal world item
        // the instant its cycle completes, at wherever it's currently
        // standing; the animal only learns it was collected via the
        // `onCollected` hook, never by polling.
        if (animal.readyToLayEgg(nowDays) && dropLivestockProduct) {
          dropLivestockProduct('egg', animal.mesh.position.x, animal.mesh.position.z, () => animal.notifyEggCollected(currentNowDays))
          animal.markEggLaid()
          // Contextual vocalization (plan settlements-npcs-004 §2) — reuses
          // the same throttled hook as the spontaneous roll above rather
          // than a second UI/simulation trigger for the same clip.
          onAnimalVocalize?.(animal.def.kind, animal.mesh.position.x, animal.mesh.position.z)
        }
      }
      if (livestock.some((a) => a.readyToRemove())) {
        const kept: AnimalAgent[] = []
        for (const animal of livestock) {
          if (animal.readyToRemove()) {
            animal.dispose()
            animal.mesh.removeFromParent()
            disposeObject3D(animal.mesh)
          } else {
            kept.push(animal)
          }
        }
        livestock.length = 0
        livestock.push(...kept)
      }
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
      for (const assembly of houseAssemblies) {
        let wantOpen = false
        for (const point of assembly.interactionPoints) {
          if (point.kind !== 'entrance' && point.kind !== 'door') continue
          _entranceWorld.set(point.position.x, point.position.y, point.position.z)
          assembly.root.localToWorld(_entranceWorld)
          const dist = Math.hypot(
            observerPos.x - _entranceWorld.x,
            observerPos.z - _entranceWorld.z,
          )
          const threshold = assembly.doors.some((d) => d.isOpen())
            ? HOUSE_DOOR_CLOSE_DISTANCE
            : HOUSE_DOOR_OPEN_DISTANCE
          if (dist <= threshold) wantOpen = true
        }
        for (const door of assembly.doors) door.setOpen(wantOpen)
        assembly.update(dt)
      }
      const doorSignature = houseAssemblies
        .map((a) => a.doors.map((d) => (d.isOpen() ? '1' : '0')).join(''))
        .join('|')
      if (doorSignature !== doorColliderSignature) {
        doorColliderSignature = doorSignature
        registerSettlementColliders()
      }
      for (const sp of signposts) {
        sp.labelEl.style.opacity = String(labelOpacityForDistance(sp.position.distanceTo(observerPos)))
      }
      // Drop a sale sign the moment its plot is bought (same session — a
      // purchase doesn't tear the settlement down), mirroring
      // `placeWoodshedIfComplete`'s live world-state → prop sync above.
      for (let i = landPlotSigns.length - 1; i >= 0; i--) {
        const sign = landPlotSigns[i]!
        if (!isLandPlotOwned?.(def.id, sign.plotId)) {
          sign.labelEl.style.opacity = String(labelOpacityForDistance(sign.position.distanceTo(observerPos)))
          continue
        }
        sign.label.removeFromParent()
        sign.labelEl.remove()
        disposeObject3D(sign.prop)
        sign.prop.removeFromParent()
        landPlotSigns.splice(i, 1)
      }
    },
    setDayNight(t) {
      if (fire && !fire.isLit() && nightFactor <= NIGHT_FIRE_THRESHOLD && t > NIGHT_FIRE_THRESHOLD) {
        nightIndex++
        const random = createSeededRandom(
          settlementSeed ^ Math.imul(nightIndex, 0x9e3779b1) ^ 0x4e494748,
        )
        if (random() < (NIGHT_FIRE_IGNITE_CHANCE[def.size] ?? 0.75)) fire.light('night')
      }
      // Village torches: always light at dusk, extinguish at dawn (plan 085).
      if (nightFactor <= NIGHT_FIRE_THRESHOLD && t > NIGHT_FIRE_THRESHOLD) {
        for (const torch of villageTorches) torch.setLit(true)
      } else if (nightFactor > NIGHT_FIRE_THRESHOLD && t <= NIGHT_FIRE_THRESHOLD) {
        for (const torch of villageTorches) torch.setLit(false)
      }
      nightFactor = t
      for (const light of houseLights) light.setNightIntensity(t)
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
      for (const sp of signposts) {
        sp.label.removeFromParent()
        sp.labelEl.remove()
      }
      for (const sign of landPlotSigns) {
        sign.label.removeFromParent()
        sign.labelEl.remove()
      }
      disposeSettlementGroup(group)
      group.removeFromParent()
    },
  }
}
