import { type Object3D, type Scene } from 'three'
import type { ItemInstance } from '../items/itemInstances'
import type { ItemKind } from '../items/items'
import type { HeightSampler } from '../player/PlayerController'
import { CONTAINER_DEFS, type ContainerKind, containerTotalWeight } from '../items/container'
import { Inventory, type SaveItemInstance } from '../items/Inventory'
import { placeOnGround } from '../settlement/props'
import { createPlacedContainerProp, disposePlacedContainerProp } from './containerProp'

/** Persisted shape of a world-placed container — mirrors `PlacedTrapRecord`:
 *  only what can't be re-derived from `CONTAINER_DEFS` (capacity/baseWeight
 *  stay in the def, never duplicated here). */
export type PlacedContainerRecord = {
  id: string
  kind: ContainerKind
  x: number
  z: number
  yaw: number
  counts: Partial<Record<ItemKind, number>>
  instances: SaveItemInstance[]
}

/** Persisted shape of the container the player is currently carrying (plan
 *  164 §8/§15) — same contents shape, no position/yaw since it has none
 *  while carried. */
export type SaveCarriedContainer = {
  id: string
  kind: ContainerKind
  counts: Partial<Record<ItemKind, number>>
  instances: SaveItemInstance[]
}

export type PlacedContainerEntry = {
  id: string
  kind: ContainerKind
  x: number
  z: number
  yaw: number
  mesh: Object3D
  /** Authoritative contents — reuses `Inventory` directly (container.ts's
   *  module doc §7); `maxWeight: Infinity`, `maxSize: def.capacityUnits`. */
  contents: Inventory
}

type CarriedContainer = { id: string, kind: ContainerKind, contents: Inventory }

export type PlacedContainers = {
  list: () => readonly PlacedContainerEntry[]
  nodes: () => readonly PlacedContainerRecord[]
  find: (id: string) => PlacedContainerEntry | undefined
  /** Places a fresh, empty container — the purchase→place flow (mirrors
   *  `PlacedTents.place`). */
  place: (kind: ContainerKind, x: number, z: number, yaw: number) => PlacedContainerRecord
  /** World → carried (plan 164 §15): the *same* `contents` Inventory moves
   *  with the record, never copied into player `Inventory`. False if `id`
   *  is unknown or something is already carried (one at a time). */
  pickUp: (id: string) => boolean
  hasCarried: () => boolean
  carriedKind: () => ContainerKind | null
  /** Base weight + contents weight (plan 164 §8) — the single number
   *  `player/playerEncumbrance.ts` adds on top of `inventory.totalWeight()`. */
  carriedWeightKg: () => number
  carriedNode: () => SaveCarriedContainer | null
  /** Carried → world at a validated spot (caller already ran
   *  `evaluateGroundPlacement`). Null if nothing is carried. */
  putDownCarried: (x: number, z: number, yaw: number) => PlacedContainerRecord | null
  containerCounts: (id: string) => Partial<Record<ItemKind, number>>
  containerInstances: (id: string, kind: ItemKind) => readonly ItemInstance[]
  containerWeight: (id: string) => number
  /** Player/NPC → container, capacity-checked (gabarite only — see
   *  container.ts). Returns the accepted amount; a partial/zero accept never
   *  loses the remainder (caller keeps it). `acquiredAtDays` only matters for
   *  perishable kinds (plan 159 `FoodBatch`s) — omit for non-food. */
  deposit: (id: string, kind: ItemKind, amount: number, acquiredAtDays?: number) => number
  depositInstance: (id: string, instance: ItemInstance) => boolean
  /** Container → player/NPC. Returns the amount actually removed. */
  withdraw: (id: string, kind: ItemKind, amount: number) => number
  withdrawInstance: (id: string, instanceId: string) => ItemInstance | null
  dispose: () => void
}

function contentsFromSave(counts: Partial<Record<ItemKind, number>>, instances: SaveItemInstance[], capacityUnits: number): Inventory {
  return new Inventory(counts, Infinity, Inventory.instancesFromJSON(instances), undefined, capacityUnits)
}

function toRecord(entry: { id: string, kind: ContainerKind, x: number, z: number, yaw: number, contents: Inventory }): PlacedContainerRecord {
  return {
    id: entry.id,
    kind: entry.kind,
    x: entry.x,
    z: entry.z,
    yaw: entry.yaw,
    counts: entry.contents.toJSON(),
    instances: entry.contents.instancesToJSON(),
  }
}

let nextContainerId = 0

/**
 * Player-placed storage containers (plan 164) — same "player chose the spot,
 * whole record round-trips through the save" shape as `PlacedTents`/
 * `PlacedTraps`. Contents are authoritative here (an `Inventory` per entry),
 * never in the `Object3D`; streaming/rebuild only recreates the mesh, never
 * the contents (see `world/createPlacedContainers.ts` callers in
 * `worldBundle.ts` — a rebuild carries `nodes()`/`carriedNode()` through).
 */
export function createPlacedContainers(
  scene: Scene,
  sampleHeight: HeightSampler,
  initial: readonly PlacedContainerRecord[] = [],
  initialCarried: SaveCarriedContainer | null = null,
): PlacedContainers {
  const containers: PlacedContainerEntry[] = []
  let carried: CarriedContainer | null = null

  const spawn = (record: PlacedContainerRecord): void => {
    const def = CONTAINER_DEFS[record.kind]
    const mesh = createPlacedContainerProp()
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    scene.add(mesh)
    containers.push({
      id: record.id,
      kind: record.kind,
      x: record.x,
      z: record.z,
      yaw: record.yaw,
      mesh,
      contents: contentsFromSave(record.counts, record.instances, def.capacityUnits),
    })
  }

  for (const record of initial) spawn(record)
  if (initialCarried) {
    const def = CONTAINER_DEFS[initialCarried.kind]
    carried = {
      id: initialCarried.id,
      kind: initialCarried.kind,
      contents: contentsFromSave(initialCarried.counts, initialCarried.instances, def.capacityUnits),
    }
  }

  const find = (id: string): PlacedContainerEntry | undefined => containers.find((entry) => entry.id === id)

  return {
    list: () => containers,
    nodes: () => containers.map(toRecord),
    find,
    place(kind, x, z, yaw) {
      const record: PlacedContainerRecord = {
        id: `chest:${Date.now()}:${nextContainerId++}`,
        kind,
        x,
        z,
        yaw,
        counts: {},
        instances: [],
      }
      spawn(record)
      return record
    },
    pickUp(id) {
      if (carried) return false
      const index = containers.findIndex((entry) => entry.id === id)
      if (index === -1) return false
      const [entry] = containers.splice(index, 1)
      if (!entry) return false
      disposePlacedContainerProp(entry.mesh)
      carried = { id: entry.id, kind: entry.kind, contents: entry.contents }
      return true
    },
    hasCarried: () => carried !== null,
    carriedKind: () => carried?.kind ?? null,
    carriedWeightKg: () => (carried ? containerTotalWeight(CONTAINER_DEFS[carried.kind], carried.contents.totalWeight()) : 0),
    carriedNode: () => (carried
      ? { id: carried.id, kind: carried.kind, counts: carried.contents.toJSON(), instances: carried.contents.instancesToJSON() }
      : null),
    putDownCarried(x, z, yaw) {
      if (!carried) return null
      const mesh = createPlacedContainerProp()
      mesh.rotation.y = yaw
      placeOnGround(mesh, x, z, sampleHeight)
      scene.add(mesh)
      const entry: PlacedContainerEntry = { id: carried.id, kind: carried.kind, x, z, yaw, mesh, contents: carried.contents }
      containers.push(entry)
      carried = null
      return toRecord(entry)
    },
    containerCounts: (id) => find(id)?.contents.toJSON() ?? {},
    containerInstances: (id, kind) => find(id)?.contents.getInstances(kind) ?? [],
    containerWeight: (id) => {
      const entry = find(id)
      if (!entry) return 0
      return containerTotalWeight(CONTAINER_DEFS[entry.kind], entry.contents.totalWeight())
    },
    deposit(id, kind, amount, acquiredAtDays) {
      const entry = find(id)
      if (!entry || amount <= 0) return 0
      let accepted = 0
      while (accepted < amount && entry.contents.add(kind, 1, acquiredAtDays)) accepted++
      return accepted
    },
    depositInstance(id, instance) {
      const entry = find(id)
      if (!entry) return false
      return entry.contents.addInstance(instance)
    },
    withdraw(id, kind, amount) {
      const entry = find(id)
      if (!entry || amount <= 0) return 0
      const have = entry.contents.count(kind)
      const take = Math.min(have, amount)
      if (take <= 0) return 0
      return entry.contents.remove(kind, take) ? take : 0
    },
    withdrawInstance(id, instanceId) {
      const entry = find(id)
      if (!entry) return null
      const instance = entry.contents.getInstance(instanceId)
      if (!instance) return null
      return entry.contents.removeInstance(instanceId) ? instance : null
    },
    dispose() {
      for (const entry of containers) disposePlacedContainerProp(entry.mesh)
      containers.length = 0
    },
  }
}
