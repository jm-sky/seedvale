import {
  type Scene,
  Vector3,
} from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { PlayAt } from '../audio/createWorldAudio'
import type { AnimalAgent, VillageInfo } from '../fauna/AnimalAgent'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { SettlementTerrain } from '../shared/SettlementName'
import type { NaturalResource } from '../terrain/naturalResources'
import type { Collider } from '../world/collision'
import type { SettlementForestHooks } from '../world/settlementForestHooks'
import type { VillageSize } from './families'
import type { FoodSourceType, SettlementDef } from './settlementGenerator'
import { NpcAgent } from '../ai/NpcAgent'
import { disposeObject3D } from '../assets/loadGltf'
import { playActionFireExtinguish, playActionFireIgnite } from '../audio/fireSounds'
import { type SettlementEconomy, WOODSHED_DEVELOPMENT } from '../economy'
import {
  copyVec3,
  createInteractionQueue,
  type InteractionQueue,
  wellQueueId,
} from '../simulation'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { createSeededRandom } from '../world/parseSeed'
import { applyTreeStageVisual } from '../world/treeVisuals'
import { buildAssemblyCollidersWorld, type HouseAssembly } from './houseBuilder'
import { type Household, householdIdFor, type HouseholdRegistry } from './household'
import { disposeLivestock, spawnLivestock } from './livestock'
import { minorLocationsFor } from './minorLocations'
import { homePlaceId, type Place, workplaceFor } from './places'
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
const WELL_COLLISION_RADIUS = 1.0

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
  ) => void
  /** Fades every house's window glow in/out — `t`: 0 (day, off) .. 1 (full
   *  night glow). Called from `SettlementsManager.setDayNight`, itself only
   *  invoked on the same throttled day/night tick as `applyDayNight`
   *  (`app/createApp.ts`), not every frame. */
  setDayNight: (t: number) => void
  dispose: () => void
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
  collidersNear: ColliderSource,
  /** Registers this settlement's static colliders (well + houses) under
   *  `def.id` — plan 097 §2.2. Cleared again in `dispose()` below. */
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void,
  clearColliders: (ownerKey: string) => void,
  playAt: PlayAt = () => {},
  roadCtx?: RoadNetworkContext,
  forest?: SettlementForestHooks,
  /** Reports any of this settlement's livestock deaths (any cause) by
   *  `animalId` — forwarded into `spawnLivestock` (plan 110). */
  onAnimalDeath?: (animalId: string) => void,
): Promise<Settlement> {
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
  const { group, landmarks, houseLights, villageTorches, houseAssemblies } = await buildSettlementProps(
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
  scene.add(group)

  const registerSettlementColliders = (): void => {
    registerColliders(def.id, [
      { x: landmarks.well.x, z: landmarks.well.z, radius: WELL_COLLISION_RADIUS },
      ...settlementHouseColliders(landmarks.houses, houseAssemblies),
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

  const livestock = await spawnLivestock(
    scene,
    sampleHeight,
    waterLevel,
    collidersNear,
    landmarks.homes,
    def.size,
    settlementSeed,
    def.id,
    onAnimalDeath,
  )

  type SignpostInstance = { labelEl: HTMLDivElement, label: CSS2DObject, position: Vector3 }
  const signposts: SignpostInstance[] = []

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

  // Place v1: formalizes the home assignment that already existed
  // (`landmarks.homes[i % length]`) as a `Place` instead of a bare
  // `Vector3` — see `places.ts`. Same fallback as before when a settlement
  // somehow has no huts (shouldn't happen, but `findSettlementSite` doesn't
  // guarantee it).
  const homePlaces: Place[] =
    landmarks.homes.length > 0
      ? landmarks.homes.map((position, i) => ({ id: homePlaceId(def.id, i), type: 'home', position }))
      : [{ id: `${def.id}:home:fallback`, type: 'home', position: landmarks.well.clone() }]

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

  // 1 family = 1 household = 1 house (plan 069 §5): every member of a family
  // shares that family's home place and household stock. `households` stays
  // index-aligned with `def.families` — the registry itself lives on
  // `SettlementsManager` so stream-out/stream-in reuses the same stock.
  const households: Household[] = def.families.map((_family, familyIndex) => {
    const home = homePlaces[familyIndex % homePlaces.length]!
    return householdRegistry.getOrCreate(householdIdFor(def.id, familyIndex), def.id, home.id)
  })

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

  const agents = await Promise.all(
    flatMembers.map(async ({ home, household, member, familyMembers }, i) => {
      const workplace = workplaceFor(def.id, member.character.role, landmarks, i)
      const agent = await NpcAgent.create(
        sampleHeight,
        waterLevel,
        collidersNear,
        landmarks,
        home,
        workplace,
        i,
        i / Math.max(1, flatMembers.length - 1),
        member,
        familyMembers,
        playAt,
        undefined,
        forest,
        `${def.id}:npc:${i}`,
        queues,
        wellQid,
        economy,
        household,
      )
      scene.add(agent.mesh)
      return agent
    }),
  )

  const spawn = new Vector3(
    site.x + 3.5,
    sampleHeight(site.x + 3.5, site.z - 3),
    site.z - 3,
  )

  const fire = landmarks.campfire
    ? createVillageFire(landmarks.campfire.position, landmarks.campfire.flame, FUEL_PER_BRANCH, {
      onLight: (pos) => playActionFireIgnite(playAt, pos),
      onExtinguish: (pos) => playActionFireExtinguish(playAt, pos),
    })
    : undefined

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
    fire,
    update(dt, observerPos, observerYaw, timeOfDay, dayFactor, litFires, villages) {
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i]!
        let nearbyNpcCount = 0
        for (let j = 0; j < agents.length; j++) {
          if (i === j) continue
          if (agent.mesh.position.distanceTo(agents[j]!.mesh.position) <= GROUP_REACTION_RADIUS) nearbyNpcCount++
        }
        agent.update(dt, observerPos, observerYaw, timeOfDay, nearbyNpcCount)
      }
      // `forestFactor` is hardcoded to 0 — every owned-livestock `AnimalDef`
      // has `playerNoticeRange`/`playerPanicRange` 0, so the forestFactor-
      // modified branch of `isPlayerNoticed()` is structurally unreachable
      // for these kinds regardless of the value passed.
      for (const animal of livestock) animal.update(dt, livestock, observerPos, dayFactor, 0, litFires, villages)
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
      fire?.update(dt)
      placeWoodshedIfComplete()
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
    },
    setDayNight(t) {
      if (fire && !fire.isLit() && nightFactor <= NIGHT_FIRE_THRESHOLD && t > NIGHT_FIRE_THRESHOLD) {
        nightIndex++
        const random = createSeededRandom(
          settlementSeed ^ Math.imul(nightIndex, 0x9e3779b1) ^ 0x4e494748,
        )
        if (random() < (NIGHT_FIRE_IGNITE_CHANCE[def.size] ?? 0.75)) fire.light()
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
    dispose() {
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
      disposeSettlementGroup(group)
      group.removeFromParent()
    },
  }
}
