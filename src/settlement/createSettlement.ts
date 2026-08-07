import {
  type Scene,
  Vector3,
} from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { SettlementDef } from './settlementGenerator'
import { NpcAgent } from '../ai/NpcAgent'
import { buildSettlementProps, disposeSettlementGroup, type SettlementLandmarks } from './props'

export type Settlement = {
  id: string
  name: string
  isHome: boolean
  spawn: Vector3
  center: Vector3
  npcs: readonly NpcAgent[]
  landmarks: SettlementLandmarks
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
): Promise<Settlement> {
  const site = { x: def.x, z: def.z, y: def.y }
  const { group, landmarks } = await buildSettlementProps(
    site,
    sampleHeight,
    waterLevel,
    localRadius,
    seed,
    def.isHome,
  )
  scene.add(group)

  // Home keeps its original sizing rule (derived from how many huts actually
  // got placed); other settlements use the generator's rolled `npcCount`.
  const count = def.isHome
    ? Math.min(5, Math.max(3, landmarks.homes.length + 1))
    : def.npcCount

  const agents = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const home =
        landmarks.homes[i % landmarks.homes.length] ??
        landmarks.well.clone()
      const agent = await NpcAgent.create(
        sampleHeight,
        waterLevel,
        landmarks,
        home,
        i,
        i / Math.max(1, count - 1),
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

  return {
    id: def.id,
    name: def.name,
    isHome: def.isHome,
    spawn,
    center: new Vector3(site.x, site.y, site.z),
    npcs: agents,
    landmarks,
    update(dt, observerPos) {
      for (const agent of agents) agent.update(dt, observerPos)
    },
    dispose() {
      for (const agent of agents) {
        agent.dispose()
        agent.mesh.removeFromParent()
      }
      disposeSettlementGroup(group)
      group.removeFromParent()
    },
  }
}
