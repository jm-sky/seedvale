import { type Object3D, type Scene } from 'three'
import type { ItemInstance } from '../items/itemInstances'
import type { ItemKind } from '../items/items'
import type { HeightSampler } from '../player/PlayerController'
import { CONTAINER_DEFS, type ContainerKind, containerTotalWeight } from '../items/container'
import { STORED_FOOD_DECAY } from '../items/foodFreshness'
import { type FoodBatch, Inventory, type InventoryContentsSnapshot, type SaveItemInstance } from '../items/Inventory'
import { createItemMesh } from '../items/items'
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
  foodBatches?: Partial<Record<ItemKind, FoodBatch[]>>
}

/** Persisted shape of the container the player is currently carrying (plan
 *  164 §8/§15) — same contents shape, no position/yaw since it has none
 *  while carried. */
export type SaveCarriedContainer = {
  id: string
  kind: ContainerKind
  counts: Partial<Record<ItemKind, number>>
  instances: SaveItemInstance[]
  foodBatches?: Partial<Record<ItemKind, FoodBatch[]>>
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
  /** Idempotently materializes a container at a caller-supplied stable id
   *  (plan fauna-039 §20/§21 — the animal-pack death handoff). If `id`
   *  already exists, this is a no-op (`false`, existing contents
   *  untouched) — the single reconciliation guard against duplicating a
   *  ground pack across repeated death/restore calls. Returns `true` only
   *  when a new entry was actually created from `snapshot`. */
  materialize: (id: string, kind: ContainerKind, x: number, z: number, yaw: number, snapshot: InventoryContentsSnapshot) => boolean
  /** Removes one container entirely without ever entering carried state
   *  (plan fauna-039 §23/§26) — the `empty-to-item` pickup transaction's
   *  primitive; the caller is responsible for verifying it's empty and for
   *  granting the recovered `ItemKind` to the player. `false` if `id` is
   *  unknown. */
  remove: (id: string) => boolean
  /** World → carried (plan 164 §15): the *same* `contents` Inventory moves
   *  with the record, never copied into player `Inventory`. False if `id`
   *  is unknown or something is already carried (one at a time). */
  pickUp: (id: string) => boolean
  hasCarried: () => boolean
  carriedKind: () => ContainerKind | null
  carriedId: () => string | null
  /** Base weight + contents weight (plan 164 §8) — the single number
   *  `player/playerEncumbrance.ts` adds on top of `inventory.totalWeight()`. */
  carriedWeightKg: () => number
  carriedNode: () => SaveCarriedContainer | null
  /** Carried → world at a validated spot (caller already ran
   *  `evaluateGroundPlacement`). Null if nothing is carried. */
  putDownCarried: (x: number, z: number, yaw: number) => PlacedContainerRecord | null
  /** Materializes one carried container without a world mesh (plan quests-progression-008). */
  adoptCarried: (record: SaveCarriedContainer) => boolean
  /** Removes the carried container entirely (hand-in consume). */
  discardCarried: () => boolean
  containerCounts: (id: string) => Partial<Record<ItemKind, number>>
  containerInstances: (id: string, kind: ItemKind) => readonly ItemInstance[]
  containerWeight: (id: string) => number
  /** Player/NPC → container, capacity-checked (gabarite only). Returns the
   *  accepted amount; a partial/zero accept never loses the remainder.
   *  `nowDays` checkpoints decay onto chest 0.5× storage. */
  deposit: (id: string, kind: ItemKind, amount: number, nowDays?: number, batches?: readonly FoodBatch[]) => number
  depositInstance: (id: string, instance: ItemInstance) => boolean
  /** Container → player/NPC. Returns the amount actually removed plus the
   *  FIFO batches checkpointed at `nowDays`. */
  withdraw: (id: string, kind: ItemKind, amount: number, nowDays?: number) => { amount: number, batches: readonly FoodBatch[] }
  withdrawInstance: (id: string, instanceId: string) => ItemInstance | null
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

function toRecord(entry: { id: string, kind: ContainerKind, x: number, z: number, yaw: number, contents: Inventory }): PlacedContainerRecord {
  return {
    id: entry.id,
    kind: entry.kind,
    x: entry.x,
    z: entry.z,
    yaw: entry.yaw,
    counts: entry.contents.toJSON(),
    instances: entry.contents.instancesToJSON(),
    foodBatches: entry.contents.foodBatchesToJSON(),
  }
}

let nextContainerId = 0

/** Presentation factory per `ContainerKind` (plan fauna-039 §25) —
 *  `chest`/`casket` keep the existing procedural prop unchanged;
 *  `saddlebags` reuses the standard item-ground GLB pipeline (same
 *  synchronous "clone or procedural fallback" contract as every other
 *  `createItemMesh` caller, never a second loader/cache path). Ground
 *  transform is independent of the animal-attached `SADDLEBAGS_PLACEMENT`
 *  (plan fauna-039 §8) — `placeOnGround` below positions it like any other
 *  dropped item. */
function createContainerMesh(kind: ContainerKind): Object3D {
  return kind === 'saddlebags' ? createItemMesh('saddlebags') : createPlacedContainerProp()
}

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
    const mesh = createContainerMesh(record.kind)
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
      contents: contentsFromSave(record.counts, record.instances, def.capacityUnits, record.foodBatches),
    })
  }

  for (const record of initial) spawn(record)
  if (initialCarried) {
    const def = CONTAINER_DEFS[initialCarried.kind]
    carried = {
      id: initialCarried.id,
      kind: initialCarried.kind,
      contents: contentsFromSave(initialCarried.counts, initialCarried.instances, def.capacityUnits, initialCarried.foodBatches),
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
        foodBatches: {},
      }
      spawn(record)
      return record
    },
    materialize(id, kind, x, z, yaw, snapshot) {
      if (find(id)) return false
      spawn({
        id,
        kind,
        x,
        z,
        yaw,
        counts: snapshot.counts,
        instances: [...snapshot.instances],
        foodBatches: snapshot.foodBatches as Partial<Record<ItemKind, FoodBatch[]>> | undefined,
      })
      return true
    },
    remove(id) {
      const index = containers.findIndex((entry) => entry.id === id)
      if (index === -1) return false
      const [entry] = containers.splice(index, 1)
      if (!entry) return false
      disposePlacedContainerProp(entry.mesh)
      return true
    },
    pickUp(id) {
      if (carried) return false
      const index = containers.findIndex((entry) => entry.id === id)
      if (index === -1) return false
      // Policy guard (plan fauna-039 §23/§24): only `carry-container` kinds
      // may ever enter the carried-container concept — a dropped
      // `saddlebags` pack goes through `remove()` (empty-to-item) instead.
      if (CONTAINER_DEFS[containers[index].kind].pickupPolicy !== 'carry-container') return false
      const [entry] = containers.splice(index, 1)
      if (!entry) return false
      disposePlacedContainerProp(entry.mesh)
      carried = { id: entry.id, kind: entry.kind, contents: entry.contents }
      return true
    },
    hasCarried: () => carried !== null,
    carriedKind: () => carried?.kind ?? null,
    carriedId: () => carried?.id ?? null,
    carriedWeightKg: () => (carried ? containerTotalWeight(CONTAINER_DEFS[carried.kind], carried.contents.totalWeight()) : 0),
    carriedNode: () => (carried
      ? { id: carried.id, kind: carried.kind, counts: carried.contents.toJSON(), instances: carried.contents.instancesToJSON(), foodBatches: carried.contents.foodBatchesToJSON() }
      : null),
    putDownCarried(x, z, yaw) {
      if (!carried) return null
      const mesh = createContainerMesh(carried.kind)
      mesh.rotation.y = yaw
      placeOnGround(mesh, x, z, sampleHeight)
      scene.add(mesh)
      const entry: PlacedContainerEntry = { id: carried.id, kind: carried.kind, x, z, yaw, mesh, contents: carried.contents }
      containers.push(entry)
      carried = null
      return toRecord(entry)
    },
    adoptCarried(record) {
      if (carried) return false
      const def = CONTAINER_DEFS[record.kind]
      carried = {
        id: record.id,
        kind: record.kind,
        contents: contentsFromSave(record.counts, record.instances, def.capacityUnits, record.foodBatches),
      }
      return true
    },
    discardCarried() {
      if (!carried) return false
      carried = null
      return true
    },
    containerCounts: (id) => find(id)?.contents.toJSON() ?? {},
    containerInstances: (id, kind) => find(id)?.contents.getInstances(kind) ?? [],
    containerWeight: (id) => {
      const entry = find(id)
      if (!entry) return 0
      return containerTotalWeight(CONTAINER_DEFS[entry.kind], entry.contents.totalWeight())
    },
    deposit(id, kind, amount, nowDays = 0, batches) {
      const entry = find(id)
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
      const entry = find(id)
      if (!entry) return false
      return entry.contents.addInstance(instance)
    },
    withdraw(id, kind, amount, nowDays = 0) {
      const entry = find(id)
      if (!entry || amount <= 0) return { amount: 0, batches: [] }
      const have = entry.contents.count(kind)
      const take = Math.min(have, amount)
      if (take <= 0) return { amount: 0, batches: [] }
      const batches = entry.contents.removeWithFreshness(kind, take, nowDays)
      return batches ? { amount: take, batches } : { amount: 0, batches: [] }
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
