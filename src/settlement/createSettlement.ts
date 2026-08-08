import {
  type Scene,
  Vector3,
} from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { HeightSampler } from '../player/PlayerController'
import type { Place } from './places'
import type { SettlementDef } from './settlementGenerator'
import { NpcAgent } from '../ai/NpcAgent'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { minorLocationsFor } from './minorLocations'
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
import { type RoadNetworkContext, routeToMinorLocation, signpostsForSettlement } from './roadNetwork'
import { createVillageFire, type VillageFire } from './VillageFire'

export type Settlement = {
  id: string
  name: string
  isHome: boolean
  spawn: Vector3
  center: Vector3
  npcs: readonly NpcAgent[]
  landmarks: SettlementLandmarks
  /** Only present for MD/LG villages, see `props.ts`'s `buildSettlementProps`. */
  fire?: VillageFire
  update: (dt: number, observerPos: Vector3) => void
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
  const { group, landmarks } = await buildSettlementProps(
    site,
    sampleHeight,
    waterLevel,
    localRadius,
    seed,
    def.clearings,
    def.size,
    def.isHome,
  )
  scene.add(group)

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
    return family.members.map((member) => ({ home, member }))
  })

  const agents = await Promise.all(
    flatMembers.map(async ({ home, member }, i) => {
      const agent = await NpcAgent.create(
        sampleHeight,
        waterLevel,
        landmarks,
        home,
        i,
        i / Math.max(1, flatMembers.length - 1),
        member,
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

  return {
    id: def.id,
    name: def.name,
    isHome: def.isHome,
    spawn,
    center: new Vector3(site.x, site.y, site.z),
    npcs: agents,
    landmarks,
    fire,
    update(dt, observerPos) {
      for (const agent of agents) agent.update(dt, observerPos)
      fire?.update(dt)
      for (const sp of signposts) {
        sp.labelEl.style.opacity = String(labelOpacityForDistance(sp.position.distanceTo(observerPos)))
      }
    },
    dispose() {
      for (const agent of agents) {
        agent.dispose()
        agent.mesh.removeFromParent()
      }
      for (const sp of signposts) {
        sp.label.removeFromParent()
        sp.labelEl.remove()
      }
      disposeSettlementGroup(group)
      group.removeFromParent()
    },
  }
}
