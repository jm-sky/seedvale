import type { MaterialRequirement } from '../items/constructionMaterials'
import type { GroundPlacementReason } from '../items/tentPlacement'
import { formatHours } from './playerWell'

/**
 * Player-built animal trough — pure domain logic (plan items-player-020).
 * Deliberately free of `THREE`/DOM, same split as `world/standingTorch.ts`
 * vs `world/createPlayerTroughs.ts`. Settlement `AnimalTrough` visuals and
 * `Household.water` remain separate authorities — this record owns only the
 * player-built finite storage.
 *
 * @domain items-player
 */
export type PlayerTroughRecord = {
  id: string
  x: number
  z: number
  yaw: number
  completedWork: number
  waterLitres: number
}

/** Finite water capacity for a completed player-built trough (plan
 *  items-player-020 §1) — a type constant, not a per-record field. */
export const PLAYER_TROUGH_CAPACITY_LITRES = 10

/** Clearance/spacing — a trough is wider than a standing torch but still a
 *  small yard object, not a footprint the player stands inside. */
export const PLAYER_TROUGH_FOOTPRINT_RADIUS = 0.55
export const PLAYER_TROUGH_SEPARATION = 2
export const PLAYER_TROUGH_PLACE_REACH = 1.6
export const PLAYER_TROUGH_PLACE_DURATION_SEC = 3

export type PlayerTroughPlacementReason = GroundPlacementReason | 'trough'

export const PLAYER_TROUGH_PLACEMENT_MESSAGE: Record<Exclude<PlayerTroughPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na koryto.',
  slope: 'Teren jest zbyt stromy. Najpierw przygotuj teren (Szybkie akcje → Przygotuj teren).',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już stoi koryto.',
  trough: 'Tu już stoi koryto.',
}

/** Materials consumed atomically on a successful placement (plan
 *  items-player-020 §2) — same "closest existing recipe, no new material"
 *  choice as `standingTorch.ts`/`palisade.ts`. */
export const PLAYER_TROUGH_MATERIAL_REQUIREMENTS: readonly MaterialRequirement[] = [
  { kind: 'beam', count: 2 },
]

/** Fraction of placement materials returned on removal (plan ui-input-016). */
export const PLAYER_TROUGH_RECOVERY_RATE = 0.5

/** Active-work hours required to finish a trough (plan items-player-020 §2). */
export const PLAYER_TROUGH_REQUIRED_WORK = 1.5
export const PLAYER_TROUGH_WORK_SESSION_SEC = 4
export const PLAYER_TROUGH_WORK_SESSION_HOURS = 1

/** Seconds spent pouring water from a carried container into a completed
 *  trough — same order of magnitude as garden watering. */
export const PLAYER_TROUGH_FILL_DURATION_SEC = 3

export function playerTroughRemainingWork(record: Pick<PlayerTroughRecord, 'completedWork'>): number {
  return Math.max(0, PLAYER_TROUGH_REQUIRED_WORK - record.completedWork)
}

export function isPlayerTroughConstructionComplete(record: Pick<PlayerTroughRecord, 'completedWork'>): boolean {
  return record.completedWork >= PLAYER_TROUGH_REQUIRED_WORK
}

export function playerTroughFreeCapacity(record: Pick<PlayerTroughRecord, 'waterLitres'>): number {
  return Math.max(0, PLAYER_TROUGH_CAPACITY_LITRES - record.waterLitres)
}

export function clampPlayerTroughWaterLitres(litres: number): number {
  return Math.max(0, Math.min(PLAYER_TROUGH_CAPACITY_LITRES, litres))
}

export function playerTroughPromptLabel(
  record: Pick<PlayerTroughRecord, 'completedWork' | 'waterLitres'>,
  hasCarriedWater: boolean,
): string {
  if (!isPlayerTroughConstructionComplete(record)) {
    return `[E] Buduj koryto (${formatHours(record.completedWork)}/${formatHours(PLAYER_TROUGH_REQUIRED_WORK)} h)`
  }
  if (playerTroughFreeCapacity(record) <= 0) return 'Koryto pełne'
  if (!hasCarriedWater) return 'Potrzebujesz pojemnika z wodą'
  return '[E] Napełnij koryto'
}
