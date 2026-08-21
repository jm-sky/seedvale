import type { ItemKind } from '../items/items'
import type { CropId, CropPlacement } from './cropLifecycle'
import { gardenClearingRadius } from '../settlement/gardenScale'
import { CROP_IDS } from './cropLifecycle'

/** How far ahead of the player a planted crop lands — same idea as
 *  `TREE_PLANT_REACH`. */
export const CROP_PLANT_REACH = 1.2
/** Clearance a planted crop needs from another crop (wild or planted). */
export const CROP_PLANT_FOOTPRINT_RADIUS = 0.5
/** Minimum centre distance to another crop (wild or planted). */
export const CROP_PLANT_SEPARATION = CROP_PLANT_FOOTPRINT_RADIUS * 2
/** Busy-channel duration for planting a crop seed. */
export const CROP_PLANT_DURATION_SEC = 2

/** Seed `ItemKind` for each `CropId` — the 1:1 mapping the planting Quick
 *  Action reads instead of a per-crop hand-written branch. */
export const CROP_SEED_ITEM: Record<CropId, ItemKind> = {
  carrot: 'seed_carrot',
  potato: 'seed_potato',
  cabbage: 'seed_cabbage',
}

export const CROP_PLANT_MESSAGE: Record<'water' | 'slope' | 'object' | 'occupied' | 'noGarden', string> = {
  water: 'Tu jest za mokro, by coś zasadzić.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś tu stoi.',
  occupied: 'Zbyt blisko innej rośliny.',
  noGarden: 'Warzywa można sadzić tylko w ogródku.',
}

/** Widest garden footprint (`gardenClearingRadius('L')`) — used as a single
 *  conservative "is this near a garden at all" circle around each settlement
 *  garden landmark, since `Settlement.landmarks.gardens` only carries a
 *  position, not its `GardenScale` (implementation notes §12: garden
 *  placement should stay narrow/garden-based, not become general farmland;
 *  this is a deliberate v1 simplification — a small/medium garden's true bed
 *  footprint is smaller, so this is generous rather than exact). */
export const GARDEN_PLANT_RADIUS = gardenClearingRadius('L')

/** Is `(x, z)` within reach of any known settlement garden? Pure — callers
 *  supply garden centers (`Settlement.landmarks.gardens`) so this module
 *  stays settlement-agnostic. */
export function isNearAnyGarden(
  x: number,
  z: number,
  gardens: readonly { x: number, z: number }[],
  radius = GARDEN_PLANT_RADIUS,
): boolean {
  return gardens.some((g) => Math.hypot(g.x - x, g.z - z) <= radius)
}

/** Distinct id namespace from both procedural crop ids (`${cx}:${cz}:crop${i}`)
 *  and tree ids — a planted crop can never collide with a naturally-generated
 *  one even at the exact same quantized position. */
export function makePlantedCropId(seed: number, x: number, z: number): string {
  const qx = Math.round(x * 10) / 10
  const qz = Math.round(z * 10) / 10
  return `planted-crop:${seed}:${qx}:${qz}`
}

const VALID_CROP_IDS: ReadonlySet<string> = new Set(CROP_IDS)

/** Defensive parse of saved planted-crop records — malformed entries are
 *  dropped rather than breaking the whole array. */
export function parsePlantedCrops(value: unknown): CropPlacement[] {
  if (!Array.isArray(value)) return []
  const out: CropPlacement[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const rec = raw as Record<string, unknown>
    if (typeof rec.id !== 'string' || !rec.id) continue
    if (typeof rec.x !== 'number' || !Number.isFinite(rec.x)) continue
    if (typeof rec.z !== 'number' || !Number.isFinite(rec.z)) continue
    if (typeof rec.cropId !== 'string' || !VALID_CROP_IDS.has(rec.cropId)) continue
    if (typeof rec.stageStartedAt !== 'number' || !Number.isFinite(rec.stageStartedAt)) continue
    out.push({ id: rec.id, x: rec.x, z: rec.z, cropId: rec.cropId as CropId, stageStartedAt: rec.stageStartedAt })
  }
  return out
}
