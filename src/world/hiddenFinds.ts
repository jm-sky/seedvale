import type { ItemKind } from '../items/items'
import type { VillageSize } from '../settlement/families'
import type { LandmarkKind } from '../terrain/chunkEnvironment'
import { cemeteryGraveLayout, type CemeterySize } from '../settlement/props'
import { rotateOffsetY } from '../settlement/propUtils'
import { DIG_RADIUS } from '../terrain/dig'
import { createSeededRandom } from './parseSeed'

/**
 * Generic "Hidden Find" system (plan world-007) — generalizes the old
 * one-off `settlement/hiddenTreasure.ts` easter egg into a resolver any
 * procedural landmark (`terrain/chunkEnvironment.ts`'s `LandmarkKind`) can use.
 * A Hidden Find is a logical state attached to a landmark's own stable id, not
 * a separate `Interactable` or visible marker — `app/actions/groundActions.ts`
 * checks every ordinary shovel dig against it via `findHiddenFindSpot`.
 *
 * Two shapes:
 * - `cemetery`: many independent candidate dig spots (one per grave in the
 *   real grave-grid layout, `settlement/decorProps.ts`'s `cemeteryGraveLayout`),
 *   each with its own bounded-by-`CEMETERY_MAX_FINDS` outcome.
 * - `stoneCircle`/`monolith`: one existence roll for the whole landmark: if it
 *   passes, exactly one deterministic dig spot (the landmark's own position).
 *
 * Every roll is seeded from the landmark's own stable id (which already bakes
 * in the world seed, chunk coords and kind — see `deriveLandmarkId`) plus a
 * spot index/salt, so results never depend on `Math.random()`, dig order,
 * reload or save/load (plan world-007 §2).
 */

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Same "hole visibly reaches the spot" rule `hiddenTreasure.ts`'s
 *  `HIDDEN_TREASURE_DIG_TOLERANCE` uses, generalized to every Hidden Find. */
const HIDDEN_FIND_DIG_TOLERANCE = (DIG_RADIUS * 0.8) + 0.2

/** Search radius (world units) `getNearbyLandmarks` should be queried with on
 *  every dig — must cover the largest landmark footprint from its anchor
 *  point, not just the dig-tolerance circle: an LG cemetery's grave grid
 *  spans up to ~9 units from the landmark's own `(x, z)` (see
 *  `CEMETERY_LAYOUTS.LG` in `decorProps.ts`). Generous margin kept since the
 *  query only runs on an actual shovel dig completion, not per frame. */
export const HIDDEN_FIND_SEARCH_RADIUS = 18

export type HiddenFindLandmark = {
  id: string
  kind: LandmarkKind
  x: number
  z: number
  rotationY: number
  scale: number
  cemeterySize?: CemeterySize
}

export type HiddenFindLoot =
  | { kind: 'empty' }
  | { kind: 'coins', amount: number }
  | { kind: 'item', item: ItemKind, rare: boolean }

type LootProfile = {
  coinWeight: number
  coinMin: number
  coinMax: number
  items: readonly { weight: number, item: ItemKind, rare?: boolean }[]
}

function rollLoot(profile: LootProfile, random: () => number): HiddenFindLoot {
  const totalWeight = profile.coinWeight + profile.items.reduce((sum, entry) => sum + entry.weight, 0)
  if (totalWeight <= 0) return { kind: 'empty' }
  let r = random() * totalWeight
  if (r < profile.coinWeight) {
    const amount = profile.coinMin + Math.floor(random() * (profile.coinMax - profile.coinMin + 1))
    return { kind: 'coins', amount }
  }
  r -= profile.coinWeight
  for (const entry of profile.items) {
    if (r < entry.weight) return { kind: 'item', item: entry.item, rare: entry.rare ?? false }
    r -= entry.weight
  }
  return { kind: 'empty' }
}

/** Cemetery loot potential scales with the nearest settlement's size (plan
 *  world-007 §4), not just grave count — reuses the existing `VillageSize`
 *  model instead of a new "wealth" metric. Exact values are tuning, kept
 *  local to this table. */
const CEMETERY_LOOT_BY_SETTLEMENT_SIZE: Record<VillageSize, LootProfile> = {
  OUTPOST: { coinWeight: 2, coinMin: 3, coinMax: 8, items: [] },
  SM: { coinWeight: 3, coinMin: 5, coinMax: 14, items: [{ weight: 0.5, item: 'iron' }] },
  MD: { coinWeight: 4, coinMin: 10, coinMax: 28, items: [{ weight: 1, item: 'copper' }, { weight: 0.5, item: 'whetstone' }] },
  LG: { coinWeight: 5, coinMin: 20, coinMax: 45, items: [{ weight: 1, item: 'gold' }, { weight: 0.3, item: 'damascus_knife', rare: true }] },
  // Plan items-player-016 — a concrete `ItemKind` book as a Hidden Find
  // reward, same seeded/deterministic roll as every other loot entry; a
  // player can find an advanced book here before meeting its own
  // `requiredSkillValue` to read it, which is fine (a purchase can too).
  XL: { coinWeight: 5, coinMin: 30, coinMax: 65, items: [{ weight: 1, item: 'gold' }, { weight: 0.4, item: 'masterwork_sword', rare: true }, { weight: 0.3, item: 'book_archery_advanced', rare: true }] },
}

/** Economic cap (plan world-007 §3) — how many of a cemetery's candidate grave
 *  spots can ever resolve to real loot, regardless of how many graves the
 *  layout has (SM=9, MD=18, LG=36 in `decorProps.ts`'s `CEMETERY_LAYOUTS`).
 *  The rest always resolve `empty`. */
const CEMETERY_MAX_FINDS: Record<CemeterySize, number> = { SM: 2, MD: 4, LG: 7 }

/** One existence roll per whole landmark (plan world-007 §5) — 25%/10% that
 *  the landmark has any Hidden Find at all, not per candidate position. */
const LANDMARK_FIND_CHANCE: Partial<Record<LandmarkKind, number>> = {
  stoneCircle: 0.25,
  monolith: 0.10,
}

const LANDMARK_LOOT: Partial<Record<LandmarkKind, LootProfile>> = {
  stoneCircle: { coinWeight: 5, coinMin: 40, coinMax: 90, items: [{ weight: 1, item: 'gold' }] },
  monolith: { coinWeight: 4, coinMin: 60, coinMax: 130, items: [{ weight: 1, item: 'obsidian_sword', rare: true }] },
}

function landmarkHasFind(landmarkId: string, chance: number): boolean {
  const random = createSeededRandom(hashString(`${landmarkId}:exists`))
  return random() <= chance
}

/** Which of a cemetery's grave-index candidates actually carry loot — a
 *  stable rank-based cut (lowest `graveCount` seeded rolls win) rather than a
 *  flat per-spot probability, so the total possible finds never exceeds
 *  `CEMETERY_MAX_FINDS` no matter how big the layout is. Cheap (≤36 entries)
 *  and only ever called from an actual dig-resolution, never per frame. */
function cemeteryFoundIndices(landmarkId: string, graveCount: number, size: CemeterySize): ReadonlySet<number> {
  const maxFinds = Math.min(CEMETERY_MAX_FINDS[size], graveCount)
  const scored = Array.from({ length: graveCount }, (_, index) => ({
    index,
    roll: createSeededRandom(hashString(`${landmarkId}:${index}:exists`))(),
  }))
  scored.sort((a, b) => a.roll - b.roll)
  return new Set(scored.slice(0, maxFinds).map((s) => s.index))
}

/** Candidate dig-spot positions for one landmark — the cemetery's full grave
 *  grid (world position derived the same way `decorProps.ts`'s
 *  `createCemetery` places each stone: local layout offset rotated by the
 *  landmark's own `rotationY`), or the landmark's own single position once it
 *  passes its one-shot existence roll. */
function candidateSpots(landmark: HiddenFindLandmark): { spotId: string, x: number, z: number }[] {
  if (landmark.kind === 'cemetery') {
    const layout = cemeteryGraveLayout(landmark.cemeterySize ?? 'SM', landmark.scale)
    return layout.map((local, index) => {
      const rotated = rotateOffsetY(local.x, local.z, landmark.rotationY)
      return { spotId: `${landmark.id}:${index}`, x: landmark.x + rotated.x, z: landmark.z + rotated.z }
    })
  }
  const chance = LANDMARK_FIND_CHANCE[landmark.kind]
  if (!chance || !landmarkHasFind(landmark.id, chance)) return []
  return [{ spotId: landmark.id, x: landmark.x, z: landmark.z }]
}

export type HiddenFindMatch = {
  landmark: HiddenFindLandmark
  spotId: string
  spotIndex: number
}

/** Finds the nearest not-yet-resolved Hidden Find spot within dig tolerance
 *  of `(x, z)` among `landmarks` (typically `chunkManager.getNearbyLandmarks`
 *  around the dig point) — pure/deterministic, safe to call on every shovel
 *  dig completion. `null` when the dig missed every candidate. */
export function findHiddenFindSpot(
  landmarks: readonly HiddenFindLandmark[],
  x: number,
  z: number,
  isSpotResolved: (spotId: string) => boolean,
): HiddenFindMatch | null {
  let best: HiddenFindMatch | null = null
  let bestDist = HIDDEN_FIND_DIG_TOLERANCE
  for (const landmark of landmarks) {
    const spots = candidateSpots(landmark)
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i]!
      if (isSpotResolved(spot.spotId)) continue
      const dist = Math.hypot(spot.x - x, spot.z - z)
      if (dist <= bestDist) {
        bestDist = dist
        best = { landmark, spotId: spot.spotId, spotIndex: i }
      }
    }
  }
  return best
}

/** Resolves what a matched spot contains — deterministic from `spotId` (plus
 *  the nearest settlement's size for a cemetery grave). Call only once per
 *  spot, right after `findHiddenFindSpot` matches it, and record `spotId` as
 *  resolved so a later dig at the same spot never re-resolves it. */
export function resolveHiddenFindLoot(
  landmark: HiddenFindLandmark,
  spotId: string,
  spotIndex: number,
  settlementSize: VillageSize | undefined,
): HiddenFindLoot {
  if (landmark.kind === 'cemetery') {
    const size = landmark.cemeterySize ?? 'SM'
    const graveCount = cemeteryGraveLayout(size, landmark.scale).length
    if (!cemeteryFoundIndices(landmark.id, graveCount, size).has(spotIndex)) return { kind: 'empty' }
    const profile = CEMETERY_LOOT_BY_SETTLEMENT_SIZE[settlementSize ?? 'SM']
    return rollLoot(profile, createSeededRandom(hashString(`${spotId}:loot`)))
  }
  const profile = LANDMARK_LOOT[landmark.kind]
  if (!profile) return { kind: 'empty' }
  return rollLoot(profile, createSeededRandom(hashString(`${spotId}:loot`)))
}
