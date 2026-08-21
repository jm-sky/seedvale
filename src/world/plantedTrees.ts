import type { TreeEnvSample, TreeId, TreeSizeClass } from './treeLifecycle'
import { envGrowthFactor, quantizeTreeCoord, speciesPrefs, TREE_SPECIES_PREFS } from './treeLifecycle'

/**
 * Player-planted tree (plan 126) — a persistent world mutation `TreeLifecycle`
 * alone can't reconstruct, unlike a procedural tree (which regenerates from
 * seed + terrain on every chunk load). Identity/placement only: current
 * growth stage lives in `TreeLifecycle`'s own sparse override, anchored at
 * the moment of planting (implementation notes §3/§25 — do not duplicate the
 * stage in two persisted structures).
 */
export type PlantedTreeRecord = {
  id: TreeId
  x: number
  z: number
  speciesIndex: number
  sizeClass: TreeSizeClass
  sizeJitter: number
  rotationY: number
}

/** How far ahead of the player a planted tree/seed lands — inside the normal
 *  interact range, same idea as `DIG_REACH`/`TRAP_PLACE_REACH`. */
export const TREE_PLANT_REACH = 1.6
/** Clearance a sapling needs from another tree (procedural or planted) —
 *  smaller than a full-grown canopy since it starts at `sapling` size. */
export const TREE_PLANT_FOOTPRINT_RADIUS = 1.4
/** Minimum centre distance to another tree (procedural or planted). */
export const TREE_PLANT_SEPARATION = TREE_PLANT_FOOTPRINT_RADIUS * 2
/** Busy-channel duration for planting a tree seed — same order of magnitude
 *  as pitching a tent/setting a trap. */
export const TREE_PLANT_DURATION_SEC = 2.5

export const TREE_PLANT_MESSAGE: Record<'water' | 'slope' | 'object' | 'occupied', string> = {
  water: 'Tu jest za mokro, by coś zasadzić.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś tu stoi.',
  occupied: 'Zbyt blisko innego drzewa.',
}

/** Distinct id namespace from `makeTreeId` (procedural: `${seed}:${x}:${z}:${species}`)
 *  — a planted tree can never collide with a procedural tree's id even at the
 *  exact same quantized position (implementation notes §2/§6). */
export function makePlantedTreeId(seed: number, x: number, z: number): TreeId {
  return `planted:${seed}:${quantizeTreeCoord(x)}:${quantizeTreeCoord(z)}`
}

/** Weighted species pick from local habitat suitability — the same signal
 *  (`envGrowthFactor`/`TREE_SPECIES_PREFS`) procedural placement uses
 *  (`chunkVegetation.ts`'s `pickTreeSpecies`), without that function's
 *  clump-noise bias, which only matters for generating a whole stand at once
 *  and has no meaning for a single deliberate plant. */
export function pickPlantedTreeSpecies(env: TreeEnvSample, random01: number): number {
  const count = TREE_SPECIES_PREFS.length
  const weights: number[] = new Array(count)
  let total = 0
  for (let i = 0; i < count; i++) {
    const w = Math.max(0.01, envGrowthFactor(env, speciesPrefs(i)))
    weights[i] = w
    total += w
  }
  const roll = Math.max(0, Math.min(1, random01)) * total
  let acc = 0
  for (let i = 0; i < count; i++) {
    acc += weights[i]!
    if (roll <= acc) return i
  }
  return count - 1
}

const VALID_SIZE_CLASSES: ReadonlySet<string> = new Set(['large', 'medium', 'small'])

/** Defensive parse of saved planted-tree records — malformed entries are
 *  dropped rather than breaking the whole array (same contract as
 *  `treeLifecycle.ts`'s `parseTreeOverrides`). */
export function parsePlantedTrees(value: unknown): PlantedTreeRecord[] {
  if (!Array.isArray(value)) return []
  const out: PlantedTreeRecord[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const rec = raw as Record<string, unknown>
    if (typeof rec.id !== 'string' || !rec.id) continue
    if (typeof rec.x !== 'number' || !Number.isFinite(rec.x)) continue
    if (typeof rec.z !== 'number' || !Number.isFinite(rec.z)) continue
    if (typeof rec.speciesIndex !== 'number' || !Number.isFinite(rec.speciesIndex)) continue
    if (typeof rec.sizeClass !== 'string' || !VALID_SIZE_CLASSES.has(rec.sizeClass)) continue
    if (typeof rec.sizeJitter !== 'number' || !Number.isFinite(rec.sizeJitter)) continue
    if (typeof rec.rotationY !== 'number' || !Number.isFinite(rec.rotationY)) continue
    out.push({
      id: rec.id,
      x: rec.x,
      z: rec.z,
      speciesIndex: rec.speciesIndex,
      sizeClass: rec.sizeClass as TreeSizeClass,
      sizeJitter: rec.sizeJitter,
      rotationY: rec.rotationY,
    })
  }
  return out
}
