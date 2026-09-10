import type { HeightSampler } from '../player/PlayerController'
import type { VillageTorch } from '../settlement/houseLighting'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import { createNullPointLightBudget, type PointLightBudget } from './pointLightBudget'
import {
  isStandingTorchConstructionComplete,
  resolveStandingTorchBurnState,
  STANDING_TORCH_REQUIRED_WORK,
  standingTorchBurnUntilDays,
  type StandingTorchRecord,
  standingTorchRemainingWork,
} from './standingTorch'
import { createStandingTorchVisual, preloadStandingTorchTemplate } from './standingTorchProp'
import type { Scene } from 'three'

export type StandingTorchEntry = StandingTorchRecord & { torch: VillageTorch }

/** Cheap discrete unfinished-height fraction derived from progress (plan
 *  items-player-017 §14) — same "one `Object3D.scale.y` set only on
 *  work/completion" shape as `world/createPalisades.ts`'s
 *  `palisadeVisualScaleY`. */
const STANDING_TORCH_UNFINISHED_SCALE_MIN = 0.4

function standingTorchVisualScaleY(record: Pick<StandingTorchRecord, 'completedWork'>): number {
  if (isStandingTorchConstructionComplete(record)) return 1
  const fraction = Math.max(0, Math.min(1, record.completedWork / STANDING_TORCH_REQUIRED_WORK))
  return STANDING_TORCH_UNFINISHED_SCALE_MIN + (1 - STANDING_TORCH_UNFINISHED_SCALE_MIN) * fraction
}

export type StandingTorches = {
  list: () => readonly StandingTorchEntry[]
  nodes: () => readonly StandingTorchRecord[]
  /** Places a new, unlit standing torch at `(x, z)` — the caller
   *  (`app/actions/placementActions.ts`'s `placeStandingTorchAtAim`) owns
   *  validation/material consumption; this only creates the record + runtime. */
  place: (x: number, z: number, yaw: number) => StandingTorchRecord
  /** Actor-neutral construction work contribution (plan items-player-017
   *  §16) — same shape as `Palisades.contributeWork`/
   *  `TerrainPreparations.contributeWork`. `null` if `id` is unknown. */
  contributeWork: (id: string, workAmount: number) => { acceptedWork: number, completed: boolean } | null
  /** Flips `id`'s authoritative `lit` to true, stamps `burnUntilDays` from
   *  `nowDays`, and updates its runtime flame/light — false (no-op) if `id`
   *  is unknown, already lit, or construction isn't finished yet (plan
   *  items-player-017 §11: an unfinished torch must never function as a
   *  light source), so a repeated `Ignite` never creates duplicate
   *  flame/light resources. */
  ignite: (id: string, nowDays: number) => boolean
  remove: (id: string) => StandingTorchRecord | null
  /** World-time burn expiry (plan items-player-022) — flips expired lit
   *  torches to unlit, clears their deadline, and drops them from `active`.
   *  Call from the game/world update path with `dayNight.elapsedDays`. */
  resolveExpiry: (nowDays: number) => void
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
  nowDays = 0,
): StandingTorches {
  const entries: StandingTorchEntry[] = []
  /** Torches with an active flame/sparks runtime — `update()` iterates only
   *  this, never the full `entries` array (plan §6). */
  const active: StandingTorchEntry[] = []

  void preloadStandingTorchTemplate()

  const spawn = (record: StandingTorchRecord): StandingTorchEntry => {
    const burn = resolveStandingTorchBurnState(record, nowDays)
    const torch = createStandingTorchVisual()
    torch.object.rotation.y = record.yaw
    placeOnGround(torch.object, record.x, record.z, sampleHeight)
    torch.object.scale.y = standingTorchVisualScaleY(record)
    scene.add(torch.object)
    pointLightBudget.registerSubtree(torch.object)
    torch.setLit(burn.lit)
    const entry: StandingTorchEntry = { ...record, lit: burn.lit, burnUntilDays: burn.burnUntilDays, torch }
    entries.push(entry)
    if (entry.lit) active.push(entry)
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
    burnUntilDays: entry.burnUntilDays,
    completedWork: entry.completedWork,
  })

  const extinguish = (entry: StandingTorchEntry): void => {
    entry.lit = false
    entry.burnUntilDays = null
    entry.torch.setLit(false)
    const index = active.indexOf(entry)
    if (index >= 0) active.splice(index, 1)
  }

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
        burnUntilDays: null,
        completedWork: 0,
      }
      spawn(record)
      return record
    },
    contributeWork(id, workAmount) {
      const entry = find(id)
      if (!entry) return null
      const acceptedWork = Math.max(0, Math.min(workAmount, standingTorchRemainingWork(entry)))
      if (acceptedWork > 0) {
        entry.completedWork += acceptedWork
        entry.torch.object.scale.y = standingTorchVisualScaleY(entry)
      }
      return { acceptedWork, completed: isStandingTorchConstructionComplete(entry) }
    },
    ignite(id, now) {
      const entry = find(id)
      if (!entry || entry.lit || !isStandingTorchConstructionComplete(entry)) return false
      entry.lit = true
      entry.burnUntilDays = standingTorchBurnUntilDays(now)
      entry.torch.setLit(true)
      if (!active.includes(entry)) active.push(entry)
      return true
    },
    remove(id) {
      const index = entries.findIndex((entry) => entry.id === id)
      if (index === -1) return null
      const [entry] = entries.splice(index, 1)
      if (!entry) return null
      extinguish(entry)
      pointLightBudget.unregisterSubtree(entry.torch.object)
      entry.torch.object.removeFromParent()
      disposeObject3D(entry.torch.object)
      return toRecord(entry)
    },
    resolveExpiry(now) {
      for (let i = active.length - 1; i >= 0; i--) {
        const entry = active[i]!
        const burn = resolveStandingTorchBurnState(entry, now)
        if (!burn.lit) extinguish(entry)
      }
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
