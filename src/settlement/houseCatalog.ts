/**
 * Per-model house catalog — Quaternius Fantasy RTS meshes differ a lot.
 * Tune each entry (issue 018 / plan 074). Prefer `doorHeightFraction` +
 * `targetDoorHeight` when the mesh has a measurable door; otherwise `height`.
 *
 * Field notes (2026-08-12 playtest):
 * - hut_a / hut_b / hut_c: First Age shells — no real walls (holes / plank roof).
 *   Still in home rotation; lamps skipped (`hasWalls: false`).
 * - hut_d: Second Age — real walls; lamps allowed.
 * - towerhouse: tower + flags — not a cottage (`useAsHome: false` until landmark use).
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
   * False for First Age “roof shells” — skip wall lamps (raycasts hit the
   * roof and float in mid-air).
   */
  hasWalls: boolean
  /** Extra world Y after `placeOnGround` (e.g. sink gray foundation). */
  groundYOffset: number
  /**
   * Door lintel as a fraction of fitted bbox height (0–1). When set,
   * world height = targetDoorHeight / doorHeightFraction (capped).
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

/** Hard cap for wall-lamp local Y (meters above hut foot) — NPC-door band. */
export const HOUSE_LAMP_MAX_LOCAL_Y = 2.35

export const HOUSE_CATALOG: readonly HouseCatalogEntry[] = [
  {
    id: 'hut_d',
    url: '/models/settlement/hut_d.glb',
    role: 'cottage',
    label: 'Chata',
    examine: 'Drewniana chata z wyraźnymi ścianami — wygląda na solidny dach nad głową.',
    useAsHome: true,
    hasWalls: true,
    groundYOffset: 0,
    // Textured door. Playtest: doors ~20cm too tall at 9.0 → 8.2.
    doorHeightFraction: null,
    targetDoorHeight: DEFAULT_TARGET_DOOR_HEIGHT,
    height: 8.2,
    maxHeight: 9.5,
    lightHeightFractions: [0.14, 0.18, 0.22, 0.26],
    lightMaxHeightFraction: 0.3,
  },
  {
    id: 'hut_a',
    url: '/models/settlement/hut_a.glb',
    role: 'cottage',
    label: 'Chałupa',
    examine:
      'Pierwszy Wiek Quaternius: praktycznie sam dach na szarym fundamencie — brak ścian, same otwory.',
    useAsHome: true,
    hasWalls: false,
    groundYOffset: -0.2,
    doorHeightFraction: 0.22,
    targetDoorHeight: DEFAULT_TARGET_DOOR_HEIGHT,
    height: 8.5,
    maxHeight: 9.5,
    lightHeightFractions: [0.18, 0.24],
    lightMaxHeightFraction: 0.28,
  },
  {
    id: 'hut_b',
    url: '/models/settlement/hut_b.glb',
    role: 'cottage',
    label: 'Chałupa',
    examine:
      'Pierwszy Wiek Quaternius: dach bez ścian (ażurowe otwory). Trochę za duży w skali chaty.',
    useAsHome: true,
    hasWalls: false,
    groundYOffset: 0,
    doorHeightFraction: 0.24,
    targetDoorHeight: DEFAULT_TARGET_DOOR_HEIGHT,
    height: 8.0,
    maxHeight: 9,
    lightHeightFractions: [0.18, 0.24],
    lightMaxHeightFraction: 0.28,
  },
  {
    id: 'hut_c',
    url: '/models/settlement/hut_c.glb',
    role: 'cottage',
    label: 'Szałas',
    examine:
      'Pierwszy Wiek Quaternius: brak ścian, dach to kilka desek.',
    useAsHome: true,
    hasWalls: false,
    groundYOffset: 0,
    doorHeightFraction: 0.28,
    targetDoorHeight: DEFAULT_TARGET_DOOR_HEIGHT,
    height: 6.5,
    maxHeight: 8,
    lightHeightFractions: [0.2, 0.26],
    lightMaxHeightFraction: 0.3,
  },
  {
    id: 'towerhouse',
    url: '/models/settlement/towerhouse.glb',
    role: 'tower',
    label: 'Wieża mieszkalna',
    examine:
      'Wieża z blankami i flagami — strażnica / landmark, nie zwykły dom rodzinny.',
    useAsHome: false,
    hasWalls: true,
    groundYOffset: 0,
    doorHeightFraction: null,
    targetDoorHeight: DEFAULT_TARGET_DOOR_HEIGHT,
    height: 10,
    maxHeight: 12,
    lightHeightFractions: [0.12, 0.16, 0.2, 0.24],
    lightMaxHeightFraction: 0.28,
  },
  {
    id: 'fallback',
    url: null,
    role: 'cottage',
    label: 'Chata',
    examine: 'Prosta chatka z bali — tymczasowa budowla, zanim postawią coś trwalszego.',
    useAsHome: false,
    hasWalls: true,
    groundYOffset: 0,
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
