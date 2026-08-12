import type { VillageSize } from './families'
import { createSeededRandom } from '../world/parseSeed'

/**
 * Per-model house catalog — Quaternius Fantasy RTS meshes differ a lot.
 * Tune each entry (issue 018 / plan 074). Prefer `doorHeightFraction` +
 * `targetDoorHeight` when the mesh has a measurable door; otherwise `height`.
 *
 * Field notes (2026-08-12 playtest / plan 076):
 * - hut_a / hut_b / hut_c: First Age shells — no real walls (holes / plank roof).
 *   Still catalogued; `pickHomeHouse` only rolls them for OUTPOST/SM (rare).
 *   Lamps: floor-center lantern (NPCs live there; even a “build in progress” hut
 *   can have a light on the ground).
 * - hut_d: Second Age — real walls; wall lamp (raycast → catalog override).
 * - towerhouse: tower + flags — not a cottage (`useAsHome: false` until landmark use).
 */

export type HouseRole = 'cottage' | 'tower'

/** How to place the night lamp relative to the hut (local frame after `prepareProp`). */
export type HouseLampStyle = 'wall' | 'floorCenter'

export type HouseLampMount = { x: number, y: number, z: number }

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
   * False for First Age “roof shells” (holes / plank roof). Still get a
   * floor-center lamp; wall raycasts are not used for them.
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
  /** Wall vs freestanding floor lantern. */
  lampStyle: HouseLampStyle
  /**
   * Manual local mount (paste from `[house:lamp]` / gaze logs). When set,
   * skips raycast / floor defaults. `null` = compute from `lampStyle`.
   */
  lampMount: HouseLampMount | null
  /** Wall-lamp search: try these height fractions of the fitted bbox (low→high). */
  lightHeightFractions: readonly number[]
  /** Never mount a lamp above this fraction (keeps fixtures under eaves). */
  lightMaxHeightFraction: number
}

/** Default door clearance target (world meters). */
export const DEFAULT_TARGET_DOOR_HEIGHT = 2.05

/** Hard cap for wall-lamp local Y (meters above hut foot) — NPC-door band. */
export const HOUSE_LAMP_MAX_LOCAL_Y = 2.35

/** Floor lantern height for shell / under-construction huts (local Y). */
export const HOUSE_FLOOR_LAMP_Y = 0.55

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
    lampStyle: 'wall',
    // Paste from `[house:lamp]` when raycast/provisional looks right.
    // lampMount: { x: -0.094, y: 0.100, z: 0.314 },
    lampMount: { x: 0.07, y: 0.25, z: 0.17 },
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
    lampStyle: 'floorCenter',
    lampMount: null,
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
    lampStyle: 'floorCenter',
    lampMount: null,
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
    lampStyle: 'floorCenter',
    lampMount: null,
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
    lampStyle: 'wall',
    lampMount: null,
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
    lampStyle: 'wall',
    lampMount: null,
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

const WALLED_HOME_CATALOG: readonly HouseCatalogEntry[] = HOME_HOUSE_CATALOG.filter((e) => e.hasWalls)
const SHELL_HOME_CATALOG: readonly HouseCatalogEntry[] = HOME_HOUSE_CATALOG.filter((e) => !e.hasWalls)

/** Chance a small village rolls a First Age wall-less shell (plan 076). */
const SMALL_VILLAGE_SHELL_CHANCE = 0.2

/**
 * Size-aware home pick (plan 076): MD+ always walled (`hut_d` today);
 * OUTPOST/SM mostly walled with a rare shell roll.
 */
export function pickHomeHouse(size: VillageSize, index: number, seed: number): HouseCatalogEntry {
  const walled = WALLED_HOME_CATALOG
  const fallback = walled[0] ?? houseCatalogById('hut_d')

  if (size === 'MD' || size === 'LG' || size === 'XL') {
    return walled[index % Math.max(1, walled.length)] ?? fallback
  }

  const random = createSeededRandom(seed ^ Math.imul(index + 1, 0x9e3779b1) ^ 0xc0ffee)
  if (SHELL_HOME_CATALOG.length > 0 && random() < SMALL_VILLAGE_SHELL_CHANCE) {
    return SHELL_HOME_CATALOG[Math.floor(random() * SHELL_HOME_CATALOG.length)]!
  }
  return walled[index % Math.max(1, walled.length)] ?? fallback
}
