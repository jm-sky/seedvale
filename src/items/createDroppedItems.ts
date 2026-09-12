import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { SaveItemInstance } from './Inventory'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import {
  type FoodBatch,
  foodBatchDecomposeAtDays,
  isFoodBatchDecomposed,
} from './foodFreshness'
import { createItemMesh, type ItemKind } from './items'

export type DroppedItem = {
  id: string
  kind: ItemKind
  x: number
  z: number
  /** Plan 199 — set only when this drop came from an `ItemInstance` (traps,
   *  weapon-maintenance kinds), so pickup restores the same instance id and
   *  condition instead of minting a fresh default one. Absent for plain
   *  stackable kinds. */
  instance?: SaveItemInstance
  /** Perishable food provenance for a dropped unit (plan items-player-002). */
  foodBatch?: FoodBatch
}

export type DroppedItems = {
  nodes: () => readonly DroppedItem[]
  /** Read-only lookup by stable id (plan fauna-023) — never removes. */
  get: (id: string) => DroppedItem | null
  /** Places one unit of `kind` at (x, z) as a new pickup, world-persistent
   *  (unlike the renewable spawner pool, dropped items don't respawn — once
   *  collected they're gone for good, same as world-generated ones). Pass
   *  `instance` when `kind` came from a concrete `ItemInstance` so its
   *  identity/condition survives the drop→pickup round trip (plan 199).
   *  `onCollected` (plan fauna-002) fires once, the moment this exact drop
   *  is picked up via `collect()` — never persisted (a runtime-only
   *  producer callback, e.g. a chicken resetting its egg cycle), so it's
   *  silently lost across a reload the same way other non-persisted runtime
   *  state already is. */
  drop: (kind: ItemKind, x: number, z: number, instance?: SaveItemInstance, onCollected?: () => void, foodBatch?: FoodBatch) => void
  collect: (id: string) => { kind: ItemKind, x: number, z: number, instance?: SaveItemInstance, foodBatch?: FoodBatch } | null
  /** World/fauna consumption (plan fauna-023 §6) — removes the record/mesh
   *  exactly once without firing pickup-only `onCollected` and without
   *  returning the item to inventory. Returns the removed record, or `null`
   *  when the id is already gone. */
  consume: (id: string) => DroppedItem | null
  /** Advances items still in flight (plan 097 phase 2.1). Landed items cost
   *  nothing — only entries in `falling` are touched. */
  tick: (dt: number) => void
  /** World-time spoiled-food cleanup (plan items-player-025). Removes
   *  perishable dropped records whose `FoodBatch` has passed
   *  `foodBatchDecomposeAtDays`. O(1) when `nowDays` is still before the
   *  cached next expiry; does not iterate landed items from `tick(dt)`.
   *  Does not fire `onCollected` — decompose is not a pickup. */
  reconcilePerishableLifecycle: (nowDays: number) => void
  /** Re-arms gravity (the same `falling` mechanism `drop()` uses) for every
   *  landed item within `radius` of `(x, z)` — call after a terrain
   *  modification (dig) so a stone that was already resting there settles
   *  onto the new height instead of staying stuck at its pre-dig Y. */
  settleNear: (x: number, z: number, radius: number) => void
  dispose: () => void
}

let nextDropId = 0

/** Hand/waist height a freshly dropped item starts at, before gravity takes
 *  over — replaces the old instant teleport onto the ground. */
const DROP_SPAWN_HEIGHT = 0.9
const GRAVITY = 20

/** Player-placed pickups — the "throw it back into the world" counterpart to
 *  `terrain/chunkItems.ts` (world-generated) and `ItemSpawner.ts` (renewable).
 *  Unlike those, positions here aren't derivable from the seed, so the full
 *  record (not just a collected-id set) has to round-trip through the save. */
export function createDroppedItems(
  scene: Scene,
  sampleHeight: HeightSampler,
  initial: readonly DroppedItem[] = [],
  nowDays = 0,
): DroppedItems {
  const items: DroppedItem[] = []
  const meshes = new Map<string, Object3D>()
  // Runtime-only, not persisted — see `drop()`'s `onCollected` doc.
  const collectedCallbacks = new Map<string, () => void>()
  // Items still airborne — landed items (the common case) aren't tracked here
  // and cost nothing per tick, same as today. Flight isn't persisted: `x/z`
  // don't change while falling (no throw arc in v1) and a save mid-flight
  // just resumes landed, a sub-second, sub-metre visual difference.
  const falling = new Map<string, { vy: number }>()
  // Cached min decompose world-day across current perishable drops.
  // `Infinity` means "nothing scheduled" — reconcile is then a no-op.
  let nextDecomposeAt = Infinity

  const spawnMesh = (item: DroppedItem, yOffset = 0): void => {
    const mesh = createItemMesh(item.kind)
    placeOnGround(mesh, item.x, item.z, sampleHeight, yOffset)
    scene.add(mesh)
    meshes.set(item.id, mesh)
  }

  const noteDecomposeAt = (item: DroppedItem): void => {
    if (!item.foodBatch) return
    const at = foodBatchDecomposeAtDays(item.kind, item.foodBatch)
    if (at != null && at < nextDecomposeAt) nextDecomposeAt = at
  }

  const recomputeNextDecomposeAt = (): void => {
    nextDecomposeAt = Infinity
    for (const item of items) noteDecomposeAt(item)
  }

  const disposeNode = (id: string): DroppedItem | null => {
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) return null
    const [item] = items.splice(index, 1)
    const mesh = meshes.get(id)
    if (mesh) {
      mesh.removeFromParent()
      disposeObject3D(mesh)
      meshes.delete(id)
    }
    falling.delete(id)
    collectedCallbacks.delete(id)
    return item ?? null
  }

  for (const item of initial) {
    if (item.foodBatch && isFoodBatchDecomposed(item.kind, item.foodBatch, nowDays)) continue
    items.push(item)
    spawnMesh(item)
    noteDecomposeAt(item)
  }

  return {
    nodes: () => items,
    get(id) {
      return items.find((item) => item.id === id) ?? null
    },
    drop(kind, x, z, instance, onCollected, foodBatch) {
      const item: DroppedItem = { id: `drop:${Date.now()}:${nextDropId++}`, kind, x, z }
      if (instance) item.instance = instance
      if (foodBatch) item.foodBatch = foodBatch
      items.push(item)
      spawnMesh(item, DROP_SPAWN_HEIGHT)
      falling.set(item.id, { vy: 0 })
      if (onCollected) collectedCallbacks.set(item.id, onCollected)
      noteDecomposeAt(item)
    },
    collect(id) {
      const onCollected = collectedCallbacks.get(id)
      const item = disposeNode(id)
      if (!item) return null
      onCollected?.()
      const collected: { kind: ItemKind, x: number, z: number, instance?: SaveItemInstance, foodBatch?: FoodBatch } = {
        kind: item.kind,
        x: item.x,
        z: item.z,
        instance: item.instance,
      }
      if (item.foodBatch) collected.foodBatch = item.foodBatch
      return collected
    },
    consume(id) {
      // World consumption reuses dispose + decompose-cache bookkeeping, but
      // never the pickup `onCollected` producer hook (plan fauna-023 §6).
      const item = disposeNode(id)
      if (!item) return null
      if (item.foodBatch) recomputeNextDecomposeAt()
      return item
    },
    settleNear(x, z, radius) {
      for (const item of items) {
        if (falling.has(item.id)) continue
        if (Math.hypot(item.x - x, item.z - z) > radius) continue
        falling.set(item.id, { vy: 0 })
      }
    },
    tick(dt) {
      if (falling.size === 0) return
      for (const [id, state] of falling) {
        const item = items.find((it) => it.id === id)
        const mesh = meshes.get(id)
        if (!item || !mesh) {
          falling.delete(id)
          continue
        }
        state.vy -= GRAVITY * dt
        const groundY = sampleHeight(item.x, item.z)
        const candidateY = mesh.position.y + state.vy * dt
        if (candidateY <= groundY) {
          mesh.position.y = groundY
          falling.delete(id)
        } else {
          mesh.position.y = candidateY
        }
      }
    },
    reconcilePerishableLifecycle(nowDays) {
      if (nowDays < nextDecomposeAt) return
      const expired = items.filter((item) => (
        item.foodBatch != null && isFoodBatchDecomposed(item.kind, item.foodBatch, nowDays)
      ))
      for (const item of expired) disposeNode(item.id)
      recomputeNextDecomposeAt()
    },
    dispose() {
      for (const mesh of meshes.values()) {
        mesh.removeFromParent()
        disposeObject3D(mesh)
      }
      meshes.clear()
      items.length = 0
      falling.clear()
      collectedCallbacks.clear()
      nextDecomposeAt = Infinity
    },
  }
}
