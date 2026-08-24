import type { ToolKind } from '../items/HeldTool'
import type { ItemCapability } from '../items/itemCatalog'
import type { GroundPlacementReason } from '../items/tentPlacement'

/**
 * Player-built garden plot (plan 174) — pure domain logic, same split as
 * `playerWell.ts` vs `createPlayerWells.ts`/`playerWellProp.ts`. A single
 * static player-built world object (no multi-stage construction like a well
 * — the plan's whole point is a small, cheap plot, not a second building
 * project). Once built it is only a placement/anchor: crop planting itself
 * stays owned by plan 126, growth by plan 172 (`world/cropLifecycle.ts`).
 *
 * `care`/`lastMaintainedAtDays` (plan 176) are this same record's maintenance
 * state — garden and field are one concept, not `GardenMaintenance` +
 * `FieldMaintenance`. Both fields are persisted (not just the anchor day)
 * because "restore ~50 points" is not equivalent to resetting the decay
 * clock to full — see `resolveCultivationCare`/`applyCultivationMaintenance`.
 */
export type PlayerGardenRecord = {
  id: string
  x: number
  z: number
  yaw: number
  care: number
  lastMaintainedAtDays: number
}

/** Cost to build a plot — charged once, atomically, when the placement
 *  channel completes. Deliberately cheap (plan §1: "minimalny koszt
 *  budowy") — a fraction of a well's `well`-stage cost. */
export type GardenMaterialCost = { stone: number, branch: number }
export const GARDEN_COST: GardenMaterialCost = { stone: 3, branch: 2 }

/** Capability required to build a plot — same "digging tool, not a specific
 *  item identity" contract as a well's `pit` stage. */
export const GARDEN_CAPABILITY: ItemCapability = 'soil_digging'

/** Footprint/clearance + minimum spacing — smaller than a well (plan §5:
 *  a garden bed, not a structure). */
export const GARDEN_FOOTPRINT_RADIUS = 1
export const GARDEN_SEPARATION = 2.5
/** How far ahead of the player a plot is placed — mirrors `WELL_PLACE_REACH`. */
export const GARDEN_PLACE_REACH = 1.6
/** Busy-channel length for the placement action itself. */
export const GARDEN_PLACE_DURATION_SEC = 3

/** How close a crop must be planted to a player garden plot to count as
 *  planted "in" it (`plantedCrops.ts`'s `isNearAnyGarden`) — much tighter
 *  than a settlement garden's `GARDEN_PLANT_RADIUS` since a plot is one small
 *  bed, not a whole clearing. */
export const PLAYER_GARDEN_PLANT_RADIUS = 2.5

export type GardenPlacementReason = GroundPlacementReason | 'garden'

export const GARDEN_PLACEMENT_MESSAGE: Record<Exclude<GardenPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na grządkę.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już coś stoi.',
  garden: 'Tu już jest grządka.',
}

/** Nearest `{ x, z }`-carrying record to `(x, z)` within `radius`, or `null` —
 *  the one small "which garden owns this position" query shared by the
 *  player harvest path, the NPC food-source hooks, and the interaction
 *  prompt builder. Deliberately generic (no `PlayerGardenRecord` import
 *  needed by callers that only have a `PlayerGardenEntry`). */
export function findNearestGarden<T extends { x: number, z: number }>(
  gardens: readonly T[],
  x: number,
  z: number,
  radius = PLAYER_GARDEN_PLANT_RADIUS,
): T | null {
  let best: T | null = null
  let bestDistSq = radius * radius
  for (const g of gardens) {
    const dx = g.x - x
    const dz = g.z - z
    const distSq = dx * dx + dz * dz
    if (distSq > bestDistSq) continue
    best = g
    bestDistSq = distSq
  }
  return best
}

/**
 * Cultivation maintenance (plan 176) — shared by player and NPC maintenance
 * actions and by the crop-productivity modifier. Deliberately lives next to
 * `PlayerGardenRecord` rather than a separate module: garden and field are
 * one concept (plan §7), and this is the same object plan 174 already owns.
 *
 * Degradation and maintenance are both pure/lazy: no per-frame ticking, no
 * `GardenManager`. Callers resolve on demand (interaction prompt, harvest,
 * NPC decision, persistence snapshot, world-object load).
 */

/** Care lost per world-day since `lastMaintainedAtDays` — a fully maintained
 *  plot (100) reaches the removal threshold (0) after 12.5 world-days of
 *  total neglect. Tunable (plan §1: "dokładne tempo degradacji... należy
 *  dobrać podczas implementacji"). */
export const CARE_DEGRADATION_PER_DAY = 8

export const CARE_MAINTAINED_THRESHOLD = 50
export const CARE_NEGLECTED_THRESHOLD = 25
/** care <= this → the plot is removed as a world object (plan §6) — the one
 *  unambiguous removal threshold every caller must use (plan notes §5: two
 *  callers must never disagree on where "removed" starts). */
export const CARE_REMOVAL_THRESHOLD = 0

export type CultivationStatus = 'maintained' | 'neglected' | 'heavily-neglected' | 'removed'

export function getCultivationStatus(care: number): CultivationStatus {
  if (care <= CARE_REMOVAL_THRESHOLD) return 'removed'
  if (care >= CARE_MAINTAINED_THRESHOLD) return 'maintained'
  if (care >= CARE_NEGLECTED_THRESHOLD) return 'neglected'
  return 'heavily-neglected'
}

/** Pure, lazy care resolver — no simulation history, just `(lastMaintainedAt,
 *  care-at-that-time, now)`. */
export function resolveCultivationCare(
  record: Pick<PlayerGardenRecord, 'care' | 'lastMaintainedAtDays'>,
  worldDays: number,
): number {
  const elapsedDays = Math.max(0, worldDays - record.lastMaintainedAtDays)
  return Math.max(0, Math.min(100, record.care - elapsedDays * CARE_DEGRADATION_PER_DAY))
}

/** Points restored by one "Zrób porządek" action, capped at 100 (plan §4). */
export const MAINTENANCE_CARE_GAIN = 50

/** Resolves current care, adds the gain, and re-anchors the decay clock to
 *  `worldDays` — the single authoritative maintenance mutation. Never
 *  mutates `record`; callers persist the returned pair. */
export function applyCultivationMaintenance(
  record: Pick<PlayerGardenRecord, 'care' | 'lastMaintainedAtDays'>,
  worldDays: number,
): { care: number, lastMaintainedAtDays: number } {
  const current = resolveCultivationCare(record, worldDays)
  return { care: Math.min(100, current + MAINTENANCE_CARE_GAIN), lastMaintainedAtDays: worldDays }
}

/** Busy-channel length for "Zrób porządek" (plan §4/§10) — short real-time
 *  cost like every other busy action (`busyChannelDurations.test.ts` caps
 *  every such constant at 8s so a longer action never reads as a freeze);
 *  the plan's "~1-2 world hours" is flavor for how substantial the action
 *  should feel, not a literal `dayNight` conversion (well construction is
 *  the one action that tracks literal work-hours, and does so across many
 *  repeated bouts, not a single channel). */
export const MAINTENANCE_BASE_DURATION_SEC = 6
/** Shortened duration while a digging tool is held (plan §5) — `shovel`/
 *  `pitchfork` are the only current `ToolKind`s with a defensible
 *  maintenance relationship; the plan explicitly forbids inventing a `rake`
 *  merely because it's mentioned as a future example. Never changes
 *  `MAINTENANCE_CARE_GAIN`. */
export const MAINTENANCE_TOOL_DURATION_SEC = 4
const MAINTENANCE_TOOL_KINDS: ReadonlySet<ToolKind> = new Set<ToolKind>(['pitchfork', 'shovel'])

export function maintenanceDurationSec(heldTool: ToolKind | null): number {
  return heldTool !== null && MAINTENANCE_TOOL_KINDS.has(heldTool)
    ? MAINTENANCE_TOOL_DURATION_SEC
    : MAINTENANCE_BASE_DURATION_SEC
}

/** Yield multiplier by cultivation status (plan §3/§13) — applied only to a
 *  crop harvested from within a garden plot's radius, never to wild crops
 *  (callers gate that with `findNearestGarden`). `neglected` deliberately
 *  rounds a single-yield crop back up to 1 — a mild penalty only shows on
 *  multi-count yields; `heavily-neglected` can legitimately zero a
 *  single-yield crop out (plan notes §14: an intentional harsher outcome for
 *  that tier, not a rounding bug). */
const CULTIVATION_YIELD_MULTIPLIER: Record<CultivationStatus, number> = {
  maintained: 1,
  neglected: 0.7,
  'heavily-neglected': 0.3,
  removed: 0,
}

export function cultivationYieldCount(baseCount: number, care: number): number {
  return Math.max(0, Math.round(baseCount * CULTIVATION_YIELD_MULTIPLIER[getCultivationStatus(care)]))
}

const CULTIVATION_STATUS_LABEL: Record<CultivationStatus, string> = {
  maintained: 'Zadbane',
  neglected: 'Zaniedbane',
  'heavily-neglected': 'Mocno zaniedbane',
  removed: 'Zniszczone',
}

/** `[E]` prompt for a garden plot's `gardenPlot` interactable — available
 *  regardless of `care` (plan §4: the action must stay offered even while
 *  fully maintained). */
export function gardenMaintenancePromptLabel(care: number): string {
  const status = getCultivationStatus(care)
  return `[E] Zrób porządek (${CULTIVATION_STATUS_LABEL[status]}, ${Math.round(care)}%)`
}
