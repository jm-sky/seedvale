import type { HeightSampler } from '../player/PlayerController'
import type { VillageTorch } from '../settlement/houseLighting'
import type { StandingTorchRecord } from './standingTorch'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import { createNullPointLightBudget, type PointLightBudget } from './pointLightBudget'
import { createStandingTorchVisual, preloadStandingTorchTemplate } from './standingTorchProp'
import type { Scene } from 'three'

export type StandingTorchEntry = StandingTorchRecord & { torch: VillageTorch }

export type StandingTorches = {
  list: () => readonly StandingTorchEntry[]
  nodes: () => readonly StandingTorchRecord[]
  /** Places a new, unlit standing torch at `(x, z)` — the caller
   *  (`app/actions/placementActions.ts`'s `placeStandingTorchAtAim`) owns
   *  validation/material consumption; this only creates the record + runtime. */
  place: (x: number, z: number, yaw: number) => StandingTorchRecord
  /** Flips `id`'s authoritative `lit` to true and updates its runtime flame/
   *  light — false (no-op) if `id` is unknown or already lit, so a repeated
   *  `Ignite` never creates duplicate flame/light resources. */
  ignite: (id: string) => boolean
  /** Per-frame flame/sparks tick — only iterates torches actually lit, never
   *  every torch regardless of state. */
  update: (dt: number) => void
  dispose: () => void
}

let nextStandingTorchId = 0

/**
 * Player-built standing torches (plan items-player-009) — same "player chose
 * the spot, whole record round-trips through the save" shape as
 * `PlayerWells`/`PlacedTents`. Deliberately not built on `PlacedFires`/
 * `VillageFire`: that system's fuel/burn/despawn semantics don't apply here
 * (see the plan's non-goals). Registers each lit torch's `PointLight` through
 * the shared `PointLightBudget`, same mechanism `PlacedFires` uses.
 *
 * @domain items-player
 */
export function createStandingTorches(
  scene: Scene,
  sampleHeight: HeightSampler,
  initial: readonly StandingTorchRecord[] = [],
  pointLightBudget: PointLightBudget = createNullPointLightBudget(),
): StandingTorches {
  const entries: StandingTorchEntry[] = []
  /** Torches with an active flame/sparks runtime — `update()` iterates only
   *  this, never the full `entries` array (plan §6). Only ever grows: this
   *  plan has no extinguish. */
  const active: StandingTorchEntry[] = []

  void preloadStandingTorchTemplate()

  const spawn = (record: StandingTorchRecord): StandingTorchEntry => {
    const torch = createStandingTorchVisual()
    torch.object.rotation.y = record.yaw
    placeOnGround(torch.object, record.x, record.z, sampleHeight)
    scene.add(torch.object)
    pointLightBudget.registerSubtree(torch.object)
    torch.setLit(record.lit)
    const entry: StandingTorchEntry = { ...record, torch }
    entries.push(entry)
    if (record.lit) active.push(entry)
    return entry
  }

  for (const record of initial) spawn(record)

  const find = (id: string): StandingTorchEntry | undefined => entries.find((entry) => entry.id === id)

  const toRecord = (entry: StandingTorchEntry): StandingTorchRecord => ({
    id: entry.id,
    x: entry.x,
    z: entry.z,
    yaw: entry.yaw,
    lit: entry.lit,
  })

  return {
    list: () => entries,
    nodes: () => entries.map(toRecord),
    place(x, z, yaw) {
      const record: StandingTorchRecord = {
        id: `standingTorch:${Date.now()}:${nextStandingTorchId++}`,
        x,
        z,
        yaw,
        lit: false,
      }
      spawn(record)
      return record
    },
    ignite(id) {
      const entry = find(id)
      if (!entry || entry.lit) return false
      entry.lit = true
      entry.torch.setLit(true)
      active.push(entry)
      return true
    },
    update(dt) {
      for (const entry of active) entry.torch.update(dt)
    },
    dispose() {
      for (const entry of entries) {
        pointLightBudget.unregisterSubtree(entry.torch.object)
        entry.torch.object.removeFromParent()
        disposeObject3D(entry.torch.object)
      }
      entries.length = 0
      active.length = 0
    },
  }
}
