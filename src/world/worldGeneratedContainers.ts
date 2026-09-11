import { type Object3D, type Scene } from 'three'
import type { ItemKind } from '../items/items'
import type { HeightSampler } from '../player/PlayerController'
import { CONTAINER_DEFS, type ContainerKind, containerTotalWeight } from '../items/container'
import { STORED_FOOD_DECAY } from '../items/foodFreshness'
import { type FoodBatch, Inventory, type SaveItemInstance } from '../items/Inventory'
import { placeOnGround } from '../settlement/props'
import { createPlacedContainerProp, disposePlacedContainerProp } from './containerProp'

export type SaveWorldGeneratedContainer = {
  id: string
  x: number
  z: number
  yaw: number
  counts: Partial<Record<ItemKind, number>>
  instances: SaveItemInstance[]
  foodBatches?: Partial<Record<ItemKind, FoodBatch[]>>
}

export type WorldGeneratedContainerEntry = {
  id: string
  x: number
  z: number
  yaw: number
  mesh: Object3D
  contents: Inventory
  portable: false
}

export type WorldGeneratedContainers = {
  list: () => readonly WorldGeneratedContainerEntry[]
  nodes: () => readonly SaveWorldGeneratedContainer[]
  find: (id: string) => WorldGeneratedContainerEntry | undefined
  containerCounts: (id: string) => Partial<Record<ItemKind, number>>
  containerInstances: (id: string, kind: ItemKind) => readonly import('../items/itemInstances').ItemInstance[]
  containerWeight: (id: string) => number
  deposit: (id: string, kind: ItemKind, amount: number, nowDays?: number, batches?: readonly FoodBatch[]) => number
  depositInstance: (id: string, instance: import('../items/itemInstances').ItemInstance) => boolean
  withdraw: (id: string, kind: ItemKind, amount: number, nowDays?: number) => { amount: number, batches: readonly FoodBatch[] }
  withdrawInstance: (id: string, instanceId: string) => import('../items/itemInstances').ItemInstance | null
  dispose: () => void
}

function contentsFromSave(
  counts: Partial<Record<ItemKind, number>>,
  instances: SaveItemInstance[],
  capacityUnits: number,
  foodBatches?: Partial<Record<ItemKind, readonly FoodBatch[]>>,
): Inventory {
  return new Inventory(counts, Infinity, Inventory.instancesFromJSON(instances), foodBatches, capacityUnits, STORED_FOOD_DECAY)
}

function toRecord(entry: WorldGeneratedContainerEntry): SaveWorldGeneratedContainer {
  return {
    id: entry.id,
    x: entry.x,
    z: entry.z,
    yaw: entry.yaw,
    counts: entry.contents.toJSON(),
    instances: entry.contents.instancesToJSON(),
    foodBatches: entry.contents.foodBatchesToJSON(),
  }
}

export type WorldGeneratedContainerSpec = {
  id: string
  kind: ContainerKind
  x: number
  z: number
  yaw: number
  initialCounts: Partial<Record<ItemKind, number>>
  /** Explicit underground world-space Y (plan world-terrain-020 Stage C).
   *  When present, placement uses this value exactly — no `placeOnGround`,
   *  no `sampleHeight` — because surface height is meaningless for an
   *  interior placement (e.g. a cave chest). Omit for ordinary surface
   *  specs, which keep the existing ground-sampled placement unchanged. */
  y?: number
}

/**
 * World-authored storage (plan quests-progression-009) — shares `Container` +
 * transfer UI with player chests but is not placeable/carryable.
 *
 * @domain world
 */
export function createWorldGeneratedContainers(
  scene: Scene,
  sampleHeight: HeightSampler,
  specs: readonly WorldGeneratedContainerSpec[],
  initialSaved: readonly SaveWorldGeneratedContainer[] = [],
): WorldGeneratedContainers {
  const savedById = new Map(initialSaved.map((r) => [r.id, r]))
  const entries: WorldGeneratedContainerEntry[] = []

  for (const spec of specs) {
    const saved = savedById.get(spec.id)
    const def = CONTAINER_DEFS[spec.kind]
    const contents = saved
      ? contentsFromSave(saved.counts, saved.instances, def.capacityUnits, saved.foodBatches)
      : new Inventory(spec.initialCounts, Infinity, [], undefined, def.capacityUnits, STORED_FOOD_DECAY)
    const mesh = createPlacedContainerProp()
    if (spec.y !== undefined) {
      const ox = mesh.position.x
      const oy = mesh.position.y
      const oz = mesh.position.z
      mesh.position.set(spec.x + ox, spec.y + oy, spec.z + oz)
    } else {
      placeOnGround(mesh, spec.x, spec.z, sampleHeight)
    }
    mesh.rotation.y = spec.yaw
    scene.add(mesh)
    entries.push({
      id: spec.id,
      x: spec.x,
      z: spec.z,
      yaw: spec.yaw,
      mesh,
      contents,
      portable: false,
    })
  }

  const findEntry = (id: string) => entries.find((e) => e.id === id)

  return {
    list: () => entries,
    nodes: () => entries.map(toRecord),
    find: findEntry,
    containerCounts: (id) => findEntry(id)?.contents.toJSON() ?? {},
    containerInstances: (id, kind) => findEntry(id)?.contents.getInstances(kind) ?? [],
    containerWeight: (id) => {
      const entry = findEntry(id)
      if (!entry) return 0
      return containerTotalWeight(CONTAINER_DEFS.chest, entry.contents.totalWeight())
    },
    deposit(id, kind, amount, nowDays = 0, batches) {
      const entry = findEntry(id)
      if (!entry || amount <= 0) return 0
      if (batches && batches.length > 0) {
        let accepted = 0
        let remaining = amount
        for (const batch of batches) {
          if (remaining <= 0) break
          const take = Math.min(batch.count, remaining)
          const slice = { ...batch, count: take }
          if (!entry.contents.addWithFreshness(kind, take, [slice], nowDays)) break
          accepted += take
          remaining -= take
        }
        return accepted
      }
      let accepted = 0
      while (accepted < amount && entry.contents.add(kind, 1, nowDays)) accepted++
      return accepted
    },
    depositInstance(id, instance) {
      const entry = findEntry(id)
      if (!entry) return false
      return entry.contents.addInstance(instance)
    },
    withdraw(id, kind, amount, nowDays = 0) {
      const entry = findEntry(id)
      if (!entry || amount <= 0) return { amount: 0, batches: [] }
      const have = entry.contents.count(kind)
      const take = Math.min(have, amount)
      if (take <= 0) return { amount: 0, batches: [] }
      const batches = entry.contents.removeWithFreshness(kind, take, nowDays)
      return batches ? { amount: take, batches } : { amount: 0, batches: [] }
    },
    withdrawInstance(id, instanceId) {
      const entry = findEntry(id)
      if (!entry) return null
      const instance = entry.contents.getInstance(instanceId)
      if (!instance) return null
      return entry.contents.removeInstance(instanceId) ? instance : null
    },
    dispose() {
      for (const entry of entries) {
        scene.remove(entry.mesh)
        disposePlacedContainerProp(entry.mesh)
      }
      entries.length = 0
    },
  }
}
