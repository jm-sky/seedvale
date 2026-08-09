import {
  type Scene,
  Vector3,
} from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { HeightSampler } from '../player/PlayerController'
import type { SettlementTerrain } from '../shared/SettlementName'
import type { NaturalResource } from '../terrain/naturalResources'
import type { VillageSize } from './families'
import type { FoodSourceType, SettlementDef } from './settlementGenerator'
import { NpcAgent } from '../ai/NpcAgent'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { createSeededRandom } from '../world/parseSeed'
import { disposeLivestock, spawnLivestock } from './livestock'
import { minorLocationsFor } from './minorLocations'
import { type Place, workplaceFor } from './places'
import {
  buildSettlementProps,
  cloneProp,
  createDock,
  createSignpost,
  disposeSettlementGroup,
  DOCK_SPECS,
  loadPropTemplates,
  placeOnGround,
  type SettlementLandmarks,
} from './props'
import {
  type RoadNetworkContext,
  routeToMinorLocation,
  segmentsNear,
  signpostsForSettlement,
} from './roadNetwork'
import { cellSeed } from './settlementGenerator'
import { createVillageFire, type VillageFire } from './VillageFire'

/** `setDayNight`'s `t` (0 day .. 1 full night) above this triggers the
 *  settlement fire's dusk-ignition roll (see `nightIndex`/`setDayNight`
 *  below). NPC sleep timing moved to `NpcAgent`'s own `schedule` (v2 stage
 *  2, `docs/plans/2026-08-07--020...`) — this threshold is now fire-only. */
const NIGHT_FIRE_THRESHOLD = 0.6
/** Chance the settlement's own fire is already lit when night falls —
 *  villagers keeping it going themselves, no player branch consumed. */
const NIGHT_FIRE_IGNITE_CHANCE = 0.5

/** How close (world units) another NPC must be to count toward
 *  `nearbyNpcCount` for `NpcAgent`'s group reaction-chance dampening (issue
 *  010). */
const GROUP_REACTION_RADIUS = 6

export type Settlement = {
  id: string
  name: string
  isHome: boolean
  /** Plan 032 §8 — surfaced today only in the Villagers screen's settlement
   *  badge (`ui/createVillagersScreen.ts`). */
  foodSourceType: FoodSourceType
  /** `SM/MD/LG/OUTPOST`, straight from `SettlementDef` — see
   *  `docs/plans/2026-08-09--048...`'s "aboutVillage" dialogue topic. */
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
    villages: readonly { x: number, z: number }[],
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
  playSound: (url: string, volume?: number) => void = () => {},
  roadCtx?: RoadNetworkContext,
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
  const { group, landmarks, houseLights } = await buildSettlementProps(
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
  )
  scene.add(group)

  const livestock = spawnLivestock(scene, sampleHeight, waterLevel, landmarks.homes, def.size, settlementSeed)

  type SignpostInstance = { labelEl: HTMLDivElement, label: CSS2DObject, position: Vector3 }
  const signposts: SignpostInstance[] = []

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
      ? landmarks.homes.map((position, i) => ({ id: `${def.id}:home:${i}`, type: 'home', position }))
      : [{ id: `${def.id}:home:fallback`, type: 'home', position: landmarks.well.clone() }]

  // 1 family = 1 house: every member of a family shares that family's home
  // place (`homePlaces[familyIndex]`), not a bare `i % homePlaces.length`
  // cycle — flattened here so the NPC-creation `Promise.all` below stays a
  // single parallel batch, same concurrency as before family grouping existed.
  const flatMembers = def.families.flatMap((family, familyIndex) => {
    const home = homePlaces[familyIndex % homePlaces.length]!
    return family.members.map((member) => ({
      home,
      member,
      // Rest of this member's own family, by name — see `NpcAgent.familyMembers`'s
      // doc comment (dialogue-facing, not a live reference to their `NpcAgent`).
      familyMembers: family.members
        .filter((m) => m !== member)
        .map((m) => ({ name: m.name, lastName: m.lastName, relation: m.relation })),
    }))
  })

  const agents = await Promise.all(
    flatMembers.map(async ({ home, member, familyMembers }, i) => {
      const workplace = workplaceFor(def.id, member.character.role, landmarks, i)
      const agent = await NpcAgent.create(
        sampleHeight,
        waterLevel,
        landmarks,
        home,
        workplace,
        i,
        i / Math.max(1, flatMembers.length - 1),
        member,
        familyMembers,
        playSound,
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
    ? createVillageFire(landmarks.campfire.position, landmarks.campfire.flame)
    : undefined

  let nightFactor = 0
  /** Bumped each time `nightFactor` crosses `NIGHT_FIRE_THRESHOLD` upward —
   *  feeds the ignition roll's seed so the same night (even across a
   *  stream-out/stream-in of this settlement) always resolves the same way,
   *  while a later night gets an independent roll. See `settlementGenerator
   *  .ts`'s `cellSeed` for why this settlement's own seed is `def.gx/def.gz`
   *  combined with the world seed rather than a hash of `def.id`. */
  let nightIndex = 0

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
      fire?.update(dt)
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
        if (random() < NIGHT_FIRE_IGNITE_CHANCE) fire.light()
      }
      nightFactor = t
      for (const light of houseLights) light.setNightIntensity(t)
    },
    dispose() {
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
