import type { FreshnessStage } from '../items/foodFreshness'
import type { ItemKind } from '../items/items'
import type { TrapKind } from './animalTraps'

/**
 * @domain world
 * @role Neutral plain-data attraction source DTO (plan fauna-023 §1) —
 *  built once per fauna pass from world-owned trap / dropped-item / blood
 *  state. Free of `AnimalDef`, `AnimalAgent`, Three.js objects and mutable
 *  callbacks; species compatibility/scoring lives in
 *  `fauna/animalAttraction.ts`.
 */

export type AnimalAttractionSourceKind = 'food' | 'blood' | 'trapBait'

/** Read-only attraction candidate — not persisted; re-derived from live
 *  world authorities each fauna pass. */
export type AnimalAttractionSource = {
  id: string
  kind: AnimalAttractionSourceKind
  x: number
  z: number
  /** Monotonic base attraction strength before distance falloff. */
  strength: number
  /** Max sensing radius (m); candidates outside this are invalid. */
  radius: number
  /** Set for `food` / `trapBait` — diet compatibility gate. */
  itemKind?: ItemKind
  /** Set for `trapBait` — species trap-coverage gate. */
  trapKind?: TrapKind
  /** Set for `food` — stage-based spoiled-meat scavenging gate. */
  freshnessStage?: FreshnessStage
}
