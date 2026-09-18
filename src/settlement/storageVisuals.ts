import * as THREE from 'three'
import type { Inventory } from '../items/Inventory'
import { disposeObject3D } from '../assets/loadGltf'
import { FOOD_ITEM_KINDS, foodItemCount } from '../items/foodItems'
import { createItemMesh, type ItemKind } from '../items/items'
import { placeOnGround, rotateOffsetY, tagSettlementShadowKind, type TerrainSampler } from './propUtils'

/**
 * Shared physical-storage visual mechanism (plan settlements-npcs-010) — the
 * single "authoritative contents -> derived visual representation" path for
 * both the settlement wood pile and every food storage location (household
 * pantry crate, settlement storage crate). Rendering never mutates
 * `Household`/`SettlementEconomy` state; `sync()` only ever reads it.
 *
 * @domain settlements-npcs
 * @system storage-visuals
 * @role Derives a bounded, deterministic Three.js visual from a storage destination's authoritative quantity/contents.
 */

/** Authored alternative pile variants in `wood_pile_progressive.glb`.
 *  Stable runtime names — resolve once, never by child index. */
export const WOOD_PILE_STAGES = ['Pile_01', 'Pile_05', 'Pile_10', 'Pile_18', 'Pile_29'] as const
export type WoodPileStage = (typeof WOOD_PILE_STAGES)[number]

/** Beyond the last authored primary stage (`Pile_18` covers 11–20), one extra
 *  full pile appears per this many units, bounded by `WOOD_PILE_MAX_EXTRA`. */
export const WOOD_PILE_OVERFLOW_START = 20
export const WOOD_PILE_OVERFLOW_STEP = 20
export const WOOD_PILE_MAX_EXTRA = 2

/** Deterministic offsets for the (at most `WOOD_PILE_MAX_EXTRA`) extra pile
 *  slots, relative to the main stockpile position — chosen to sit clear of
 *  the settlement-storage crate (`+1.8,+1.1`), the clutter barrels
 *  (`+1.1,-0.6` / `+1.6,+0.4`) and the woodshed-complete bonus pile
 *  (`-1.8,-1.1`) that `buildSettlementProps`/`createSettlement.ts` already
 *  place near the same stockpile landmark. */
export const WOOD_PILE_EXTRA_OFFSETS: readonly { dx: number, dz: number }[] = [
  { dx: -2.6, dz: 1.3 },
  { dx: -2.0, dz: 2.7 },
]

export type WoodPileVisualState = {
  stage: WoodPileStage | null
  extraPiles: number
}

/**
 * Pure quantity → authored wood-pile stage. Variants are complete
 * alternatives: a positive quantity selects exactly one `Pile_*`.
 */
export function woodPileStage(quantity: number): WoodPileStage | null {
  if (quantity <= 0) return null
  if (quantity === 1) return 'Pile_01'
  if (quantity <= 5) return 'Pile_05'
  if (quantity <= 10) return 'Pile_10'
  if (quantity <= 20) return 'Pile_18'
  return 'Pile_29'
}

/** Bounded extra-pile count for high stock. `Pile_29` stays the primary. */
export function woodPileOverflowCount(quantity: number): number {
  if (quantity <= WOOD_PILE_OVERFLOW_START) return 0
  return Math.min(
    WOOD_PILE_MAX_EXTRA,
    Math.ceil((quantity - WOOD_PILE_OVERFLOW_START) / WOOD_PILE_OVERFLOW_STEP),
  )
}

/** Pure quantity → visual-state mapping, no Three.js/randomness involved. */
export function woodPileVisualState(quantity: number): WoodPileVisualState {
  return { stage: woodPileStage(quantity), extraPiles: woodPileOverflowCount(quantity) }
}

/** Cache authored `Pile_*` nodes once. Null if any required name is missing. */
export function findWoodPileStageNodes(
  root: THREE.Object3D,
): Record<WoodPileStage, THREE.Object3D> | null {
  const stages = {} as Record<WoodPileStage, THREE.Object3D>
  for (const name of WOOD_PILE_STAGES) {
    const node = root.getObjectByName(name)
    if (!node) return null
    stages[name] = node
  }
  return stages
}

export type WoodPileVisual = {
  /** Re-derives authored-variant / overflow visibility from `quantity`.
   *  A cheap no-op when the resulting visual state hasn't changed since the
   *  last call — change-driven, not rebuilt every frame. */
  sync: (quantity: number) => void
  /** Disposes the extra-pile meshes this controller owns. The main pile
   *  itself is owned by the caller (already part of the settlement's own
   *  prop group / disposal). */
  dispose: () => void
}

/**
 * Wraps an already-placed primary pile plus its extra-pile siblings into
 * one quantity-driven controller. Authored `Pile_*` nodes are resolved once;
 * `sync()` only toggles cached `.visible`. Missing node names fall back to
 * showing/hiding the whole primary object, still without quantity scaling.
 */
export function createWoodPileVisual(mainPile: THREE.Object3D, extraPiles: readonly THREE.Object3D[]): WoodPileVisual {
  const stages = findWoodPileStageNodes(mainPile)
  if (stages) {
    for (const name of WOOD_PILE_STAGES) stages[name].visible = false
  }
  for (const pile of extraPiles) pile.visible = false
  let lastSignature = ''
  return {
    sync(quantity) {
      const state = woodPileVisualState(quantity)
      const signature = `${state.stage}|${state.extraPiles}`
      if (signature === lastSignature) return
      lastSignature = signature
      if (stages) {
        for (const name of WOOD_PILE_STAGES) {
          stages[name].visible = name === state.stage
        }
      } else {
        mainPile.visible = state.stage !== null
      }
      for (let i = 0; i < extraPiles.length; i++) extraPiles[i]!.visible = i < state.extraPiles
    },
    dispose() {
      for (const pile of extraPiles) {
        pile.removeFromParent()
        disposeObject3D(pile)
      }
    },
  }
}

/** At most this many distinct food kinds are represented at one storage location. */
export const FOOD_STORAGE_MAX_KINDS = 4

/** Global visible-mesh cap per storage location (not per kind). */
export const FOOD_STORAGE_MAX_REPRESENTATIVES = 8

export type FoodRepresentativeAllocation = { kind: ItemKind, count: number }

/**
 * Maps total stored food units to a bounded visible representative count.
 * Pure — no Three.js (plan settlements-npcs-025 Stage 2).
 *
 * @domain settlements-npcs
 */
export function foodRepresentativeCount(totalQuantity: number): number {
  if (totalQuantity <= 0) return 0
  if (totalQuantity === 1) return 1
  if (totalQuantity === 2) return 2
  if (totalQuantity <= 4) return 3
  if (totalQuantity <= 7) return 4
  if (totalQuantity <= 12) return 5
  if (totalQuantity <= 20) return 6
  return FOOD_STORAGE_MAX_REPRESENTATIVES
}

/**
 * Deterministic visible-representative counts per food kind from inventory
 * contents. `count` is visible mesh count, not stored quantity.
 *
 * @domain settlements-npcs
 */
export function allocateFoodRepresentatives(items: Inventory): FoodRepresentativeAllocation[] {
  let budget = foodRepresentativeCount(foodItemCount(items))
  if (budget <= 0) return []

  const selectedKinds: ItemKind[] = []
  for (const kind of FOOD_ITEM_KINDS) {
    if (selectedKinds.length >= FOOD_STORAGE_MAX_KINDS) break
    if (items.count(kind) > 0) selectedKinds.push(kind)
  }
  if (selectedKinds.length === 0) return []

  const visibleByKind = new Map<ItemKind, number>()
  for (const kind of selectedKinds) visibleByKind.set(kind, 0)

  for (const kind of selectedKinds) {
    if (budget <= 0) break
    visibleByKind.set(kind, 1)
    budget -= 1
  }

  while (budget > 0) {
    let allocatedThisPass = false
    for (const kind of selectedKinds) {
      if (budget <= 0) break
      const current = visibleByKind.get(kind) ?? 0
      const stored = items.count(kind)
      if (current < stored) {
        visibleByKind.set(kind, current + 1)
        budget -= 1
        allocatedThisPass = true
      }
    }
    if (!allocatedThisPass) break
  }

  const result: FoodRepresentativeAllocation[] = []
  for (const kind of FOOD_ITEM_KINDS) {
    const count = visibleByKind.get(kind) ?? 0
    if (count > 0) result.push({ kind, count })
  }
  return result
}

/** Stable slot order: expand allocation in catalog order for local slot indices. */
export function flattenFoodRepresentatives(allocation: readonly FoodRepresentativeAllocation[]): ItemKind[] {
  const flat: ItemKind[] = []
  for (const { kind, count } of allocation) {
    for (let i = 0; i < count; i++) flat.push(kind)
  }
  return flat
}

export function foodStorageAllocationSignature(allocation: readonly FoodRepresentativeAllocation[]): string {
  return allocation.map((e) => `${e.kind}:${e.count}`).join('|')
}

export type FoodStorageLocalSlot = {
  x: number
  y: number
  z: number
  yaw: number
}

/**
 * Eight deterministic local slots (one per possible representative). Stage 3B may
 * replace transforms only — allocation and pooling stay unchanged.
 *
 * @domain settlements-npcs
 */
export const FOOD_STORAGE_LOCAL_SLOTS: readonly FoodStorageLocalSlot[] = [
  { x: 0.35, y: 0.05, z: 0.35, yaw: 0.1 },
  { x: -0.35, y: 0.05, z: 0.35, yaw: -0.15 },
  { x: 0.35, y: 0.05, z: -0.35, yaw: 0.25 },
  { x: -0.35, y: 0.05, z: -0.35, yaw: -0.05 },
  { x: 0.2, y: 0.18, z: 0.2, yaw: 0.4 },
  { x: -0.2, y: 0.18, z: 0.2, yaw: -0.3 },
  { x: 0.2, y: 0.18, z: -0.2, yaw: 0.55 },
  { x: -0.2, y: 0.18, z: -0.2, yaw: -0.45 },
]

function applyFoodRepresentativeTransform(
  mesh: THREE.Object3D,
  slot: FoodStorageLocalSlot,
  center: { x: number, z: number },
  sampleHeight: TerrainSampler,
): void {
  const offset = rotateOffsetY(slot.x, slot.z, 0)
  const worldX = center.x + offset.x
  const worldZ = center.z + offset.z
  mesh.rotation.set(0, slot.yaw, 0)
  mesh.quaternion.setFromEuler(mesh.rotation)
  placeOnGround(mesh, worldX, worldZ, sampleHeight, slot.y)
}

export type FoodStorageVisual = {
  /** Re-derives visible representatives from `items`. No-op when allocation
   *  unchanged. Toggles visibility and transforms; does not dispose meshes on
   *  ordinary quantity changes. Never mutates inventory. */
  sync: (items: Inventory) => void
  /** Disposes every materialized representative, including hidden pool members. */
  dispose: () => void
}

/**
 * One food-storage visual location (household pantry or settlement crate).
 * Owns a lazy per-kind mesh pool (max eight total). `createItemMesh(kind)` is
 * the only mesh factory. Do not share pool meshes across controllers.
 *
 * @domain settlements-npcs
 */
export function createFoodStorageVisual(
  group: THREE.Group,
  center: { x: number, z: number },
  sampleHeight: TerrainSampler,
): FoodStorageVisual {
  const pools = new Map<ItemKind, THREE.Object3D[]>()
  let lastSignature = ''

  const getPool = (kind: ItemKind): THREE.Object3D[] => {
    let pool = pools.get(kind)
    if (!pool) {
      pool = []
      pools.set(kind, pool)
    }
    return pool
  }

  const materialize = (kind: ItemKind): THREE.Object3D => {
    const mesh = createItemMesh(kind)
    // Presentation-only pile on crates — tiny meshes that previously dominated
    // settlement shadow `other` (plan world-terrain-038). Main visibility unchanged.
    tagSettlementShadowKind(mesh, 'storageGoods')
    mesh.traverse((node) => {
      const child = node as THREE.Mesh
      if (child.isMesh) child.castShadow = false
    })
    group.add(mesh)
    getPool(kind).push(mesh)
    return mesh
  }

  return {
    sync(items) {
      const allocation = allocateFoodRepresentatives(items)
      const signature = foodStorageAllocationSignature(allocation)
      if (signature === lastSignature) return
      lastSignature = signature

      const visibleKinds = flattenFoodRepresentatives(allocation)
      const usageByKind = new Map<ItemKind, number>()
      const activeMeshes = new Set<THREE.Object3D>()

      for (let i = 0; i < visibleKinds.length; i++) {
        const kind = visibleKinds[i]!
        const usageIndex = usageByKind.get(kind) ?? 0
        usageByKind.set(kind, usageIndex + 1)

        const pool = getPool(kind)
        let mesh = pool[usageIndex]
        if (!mesh) {
          mesh = materialize(kind)
        }

        applyFoodRepresentativeTransform(mesh, FOOD_STORAGE_LOCAL_SLOTS[i]!, center, sampleHeight)
        mesh.visible = true
        activeMeshes.add(mesh)
      }

      for (const pool of pools.values()) {
        for (const mesh of pool) {
          if (!activeMeshes.has(mesh)) mesh.visible = false
        }
      }
    },
    dispose() {
      for (const pool of pools.values()) {
        for (const mesh of pool) {
          mesh.removeFromParent()
          disposeObject3D(mesh)
        }
      }
      pools.clear()
      lastSignature = ''
    },
  }
}
