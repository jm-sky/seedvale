import * as THREE from 'three'
import type { SettlementEconomy } from '../economy/settlementEconomy'
import type { Inventory } from '../items/Inventory'
import type { Household } from './household'
import { disposeObject3D } from '../assets/loadGltf'
import { FOOD_ITEM_KINDS } from '../items/foodItems'
import { createItemMesh, type ItemKind } from '../items/items'
import { placeOnGround, type TerrainSampler } from './propUtils'

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
export const WOOD_PILE_MAX_EXTRA = 3

/** Deterministic offsets for the (at most `WOOD_PILE_MAX_EXTRA`) extra pile
 *  slots, relative to the main stockpile position — chosen to sit clear of
 *  the settlement-storage crate (`+1.8,+1.1`), the clutter barrels
 *  (`+1.1,-0.6` / `+1.6,+0.4`) and the woodshed-complete bonus pile
 *  (`-1.8,-1.1`) that `buildSettlementProps`/`createSettlement.ts` already
 *  place near the same stockpile landmark. */
export const WOOD_PILE_EXTRA_OFFSETS: readonly { dx: number, dz: number }[] = [
  { dx: -2.6, dz: 1.3 },
  { dx: -2.0, dz: 2.7 },
  { dx: 0.6, dz: 2.9 },
]

/** Single physical wood-stockpile quantity (plan settlements-npcs-012) — the
 *  same live total the wood-pile visual renders from below. Wood is
 *  physically deposited at the one shared village stockpile by both
 *  households and the settlement economy (plan settlements-npcs-009), so
 *  physical-storage inspection must sum both sources too, or the displayed
 *  number would diverge from what the pile visually represents.
 *
 * @domain settlements-npcs
 * @role Resolves the single authoritative quantity the physical wood stockpile represents, shared by its visual and its inspection.
 */
export function physicalWoodStockpileQuantity(households: readonly Household[], economy: SettlementEconomy): number {
  return households.reduce((sum, h) => sum + h.stock.query('wood'), 0) + economy.query('wood')
}

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

/** At most this many distinct food kinds are represented simultaneously at
 *  one storage location — bounded aggregation (plan §6), never one mesh per
 *  stored item. */
export const FOOD_STORAGE_MAX_SLOTS = 4

const FOOD_UNIT_BANDS: readonly { max: number, scale: number }[] = [
  { max: 2, scale: 0.7 },
  { max: 5, scale: 0.95 },
  { max: Infinity, scale: 1.2 },
]

function foodUnitScale(count: number): number {
  return (FOOD_UNIT_BANDS.find((b) => count <= b.max) ?? FOOD_UNIT_BANDS[FOOD_UNIT_BANDS.length - 1]!).scale
}

export type FoodStorageSlot = { kind: ItemKind, count: number, scale: number }

/** Selects up to `FOOD_STORAGE_MAX_SLOTS` food kinds to visually represent,
 *  in `FOOD_ITEM_KINDS`' deterministic catalog order (plan settlements-npcs-008)
 *  — the same order every other food-kind selection in the codebase already
 *  uses, so a repeated sync of the same contents always picks the same
 *  kinds (plan §10). Reads `items` only; never mutates it. */
export function selectFoodStorageSlots(items: Inventory): FoodStorageSlot[] {
  const slots: FoodStorageSlot[] = []
  for (const kind of FOOD_ITEM_KINDS) {
    if (slots.length >= FOOD_STORAGE_MAX_SLOTS) break
    const count = items.count(kind)
    if (count <= 0) continue
    slots.push({ kind, count, scale: foodUnitScale(count) })
  }
  return slots
}

/** Deterministic slot offsets around a food-storage anchor (household crate
 *  / settlement crate) — fixed, not seeded, since there are always exactly
 *  `FOOD_STORAGE_MAX_SLOTS` of them. */
const FOOD_SLOT_OFFSETS: readonly { dx: number, dz: number }[] = [
  { dx: 0.4, dz: 0.4 },
  { dx: -0.4, dz: 0.4 },
  { dx: 0.4, dz: -0.4 },
  { dx: -0.4, dz: -0.4 },
]

export type FoodStorageVisual = {
  /** Re-derives the visible food-kind meshes from `items`' current contents.
   *  A cheap no-op when the selected kinds/scale haven't changed since the
   *  last call (plan §8). Swaps (dispose + recreate), never mutates, the
   *  underlying `Household`/`SettlementEconomy` inventory. */
  sync: (items: Inventory) => void
  dispose: () => void
}

/**
 * One food-storage visual location (a household's pantry crate, or a
 * settlement's storage crate) — reuses `items/items.ts`'s existing
 * `createItemMesh(kind)` pickup-mesh factory for every food `ItemKind`
 * (plan §5/§6), so a newly food-classified item works without any renderer
 * change and a missing GLB asset only loses its decorative mesh (the
 * existing procedural fallback in `createItemMesh`), never the stored item.
 */
export function createFoodStorageVisual(
  group: THREE.Group,
  center: { x: number, z: number },
  sampleHeight: TerrainSampler,
): FoodStorageVisual {
  const slotMeshes: (THREE.Object3D | null)[] = new Array(FOOD_STORAGE_MAX_SLOTS).fill(null)
  let lastSignature = ''
  return {
    sync(items) {
      const slots = selectFoodStorageSlots(items)
      const signature = slots.map((s) => `${s.kind}:${s.scale}`).join('|')
      if (signature === lastSignature) return
      lastSignature = signature
      for (let i = 0; i < FOOD_STORAGE_MAX_SLOTS; i++) {
        const existing = slotMeshes[i]
        if (existing) {
          existing.removeFromParent()
          disposeObject3D(existing)
          slotMeshes[i] = null
        }
        const slot = slots[i]
        if (!slot) continue
        const mesh = createItemMesh(slot.kind)
        mesh.scale.multiplyScalar(slot.scale)
        const offset = FOOD_SLOT_OFFSETS[i]!
        placeOnGround(mesh, center.x + offset.dx, center.z + offset.dz, sampleHeight)
        group.add(mesh)
        slotMeshes[i] = mesh
      }
    },
    dispose() {
      for (let i = 0; i < slotMeshes.length; i++) {
        const mesh = slotMeshes[i]
        if (!mesh) continue
        mesh.removeFromParent()
        disposeObject3D(mesh)
        slotMeshes[i] = null
      }
    },
  }
}
