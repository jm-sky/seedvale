/**
 * Per-model house catalog — Quaternius Fantasy RTS meshes differ a lot
 * (roof-heavy cottages vs tower-with-flags). One shared height broke doors
 * and lamps; tune each entry instead of global hacks (issue 018 / plan 074).
 *
 * Prefer `doorHeightFraction` (lintel as fraction of bbox height, measured by
 * raycast) + `targetDoorHeight` so `resolveHouseHeight` stays systematic.
 * Use explicit `height` only when the mesh has no geometric door opening.
 */

export type HouseRole = 'cottage' | 'tower'

export type HouseCatalogEntry = {
  id: string
  /** Public URL, or `null` for the procedural `createHut` fallback. */
  url: string | null
  role: HouseRole
  /** Short label for UI / examine speaker. */
  label: string
  /** Flavor line for `[E] Obejrzyj`. */
  examine: string
  /** Include in family-home rotation (`buildSettlementProps`). */
  useAsHome: boolean
  /**
   * Door lintel as a fraction of fitted bbox height (0–1), from raycast
   * probes. When set, world height = targetDoorHeight / doorHeightFraction
   * (capped). When null, `height` is used as-is.
   */
  doorHeightFraction: number | null
  /** Desired door opening in world meters (~NPC 1.75 + clearance). */
  targetDoorHeight: number
  /** Fallback / override roof-top height when `doorHeightFraction` is null. */
  height: number
  /** Soft cap so extreme fractions don't balloon the footprint. */
  maxHeight: number
  /** Wall-lamp search: try these height fractions of the fitted bbox (low→high). */
  lightHeightFractions: readonly number[]
  /** Never mount a lamp above this fraction (keeps fixtures under eaves). */
  lightMaxHeightFraction: number
}

/** Default door clearance target (world meters). */
export const DEFAULT_TARGET_DOOR_HEIGHT = 2.05

/**
 * Tunable table. `doorHeightFraction` from local raycast probes (2026-08-12).
 * `towerhouse` stays out of home rotation (flags / tower silhouette).
 */
export const HOUSE_CATALOG: readonly HouseCatalogEntry[] = [
  {
    id: 'hut_d',
    url: '/models/settlement/hut_d.glb',
    role: 'cottage',
    label: 'Chata',
    examine: 'Drewniana chata z wyraźnymi ścianami — wygląda na solidny dach nad głową.',
    useAsHome: true,
    // No clear geometric door hole in mesh — textured opening; fixed height.
    doorHeightFraction: null,
    targetDoorHeight: DEFAULT_TARGET_DOOR_HEIGHT,
    height: 9.0,
    maxHeight: 11,
    lightHeightFractions: [0.2, 0.26, 0.32, 0.38],
    lightMaxHeightFraction: 0.42,
  },
  {
    id: 'hut_a',
    url: '/models/settlement/hut_a.glb',
    role: 'cottage',
    label: 'Chałupa',
    examine: 'Niska chałupa z wysokim dachem. Drzwi są wąskie, ale da się wejść wyprostowanym.',
    useAsHome: true,
    doorHeightFraction: 0.2,
    targetDoorHeight: DEFAULT_TARGET_DOOR_HEIGHT,
    height: 9.5,
    maxHeight: 11,
    lightHeightFractions: [0.18, 0.24, 0.3, 0.36],
    lightMaxHeightFraction: 0.38,
  },
  {
    id: 'hut_b',
    url: '/models/settlement/hut_b.glb',
    role: 'cottage',
    label: 'Chałupa',
    examine: 'Podobna chałupa co sąsiednie — ten sam styl, inny układ belek.',
    useAsHome: true,
    doorHeightFraction: 0.2,
    targetDoorHeight: DEFAULT_TARGET_DOOR_HEIGHT,
    height: 9.5,
    maxHeight: 11,
    lightHeightFractions: [0.18, 0.24, 0.3, 0.36],
    lightMaxHeightFraction: 0.38,
  },
  {
    id: 'hut_c',
    url: '/models/settlement/hut_c.glb',
    role: 'cottage',
    label: 'Szałas',
    examine: 'Niższy, bardziej zbity budynek. Dach schodzi prawie do okapu.',
    useAsHome: true,
    doorHeightFraction: 0.28,
    targetDoorHeight: DEFAULT_TARGET_DOOR_HEIGHT,
    height: 7.5,
    maxHeight: 10,
    lightHeightFractions: [0.22, 0.28, 0.34],
    lightMaxHeightFraction: 0.4,
  },
  {
    id: 'towerhouse',
    url: '/models/settlement/towerhouse.glb',
    role: 'tower',
    label: 'Wieża mieszkalna',
    examine: 'Wysoka budowla z blankami i flagami — raczej strażnica niż zwykły dom.',
    useAsHome: false,
    doorHeightFraction: null,
    targetDoorHeight: DEFAULT_TARGET_DOOR_HEIGHT,
    height: 10,
    maxHeight: 12,
    lightHeightFractions: [0.15, 0.2, 0.25, 0.3],
    lightMaxHeightFraction: 0.35,
  },
  {
    id: 'fallback',
    url: null,
    role: 'cottage',
    label: 'Chata',
    examine: 'Prosta chatka z bali — tymczasowa budowla, zanim postawią coś trwalszego.',
    useAsHome: false,
    doorHeightFraction: 0.55,
    targetDoorHeight: DEFAULT_TARGET_DOOR_HEIGHT,
    height: 5.5,
    maxHeight: 7,
    lightHeightFractions: [0.35, 0.45, 0.55],
    lightMaxHeightFraction: 0.6,
  },
] as const

export const HOME_HOUSE_CATALOG: readonly HouseCatalogEntry[] = HOUSE_CATALOG.filter((e) => e.useAsHome)

/** World roof-top height used by `prepareProp` for this catalog entry. */
export function resolveHouseHeight(entry: HouseCatalogEntry): number {
  if (entry.doorHeightFraction != null && entry.doorHeightFraction > 0.05) {
    return Math.min(entry.maxHeight, entry.targetDoorHeight / entry.doorHeightFraction)
  }
  return Math.min(entry.maxHeight, entry.height)
}

export function houseCatalogById(id: string): HouseCatalogEntry {
  return HOUSE_CATALOG.find((e) => e.id === id) ?? HOUSE_CATALOG.find((e) => e.id === 'fallback')!
}

export function homeHouseEntryAt(index: number): HouseCatalogEntry {
  const list = HOME_HOUSE_CATALOG
  return list[index % list.length]!
}
