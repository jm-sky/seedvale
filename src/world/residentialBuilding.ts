import type { HouseDefinition } from '../assets/houseDefinitionExampleConfig'
import type { MaterialRequirement } from '../items/constructionMaterials'
import type { GroundPlacementReason } from '../items/tentPlacement'
import { COTTAGE_4X4_A, COTTAGE_6X4_A } from '../assets/houseDefinitionExample'
import { formatHours } from './playerWell'

/**
 * Player-built residential houses (plan settlements-005) — pure domain
 * logic, free of `THREE`/DOM, same split as `world/palisade.ts` vs
 * `world/createPalisades.ts`. Construction progress, ownership and the
 * completed home identity live on one stable record; Work Contracts,
 * `Place` and lodging only reference it.
 *
 * @domain settlements
 */

export type ResidentialBuildingKind = 'small_house' | 'medium_house'

export type ResidentialConstructionStage = 'foundation' | 'structure' | 'roof'

export type ResidentialBuildingStage = ResidentialConstructionStage | 'completed'

/** Who owns the physical building — independent of who lives there
 *  (`Household.homeId`) and of land-plot ownership. v1 only acquires
 *  `{ kind: 'player' }`; the other variants exist so a later owner kind
 *  does not need a schema rewrite. */
export type ResidentialOwner =
  | { kind: 'player' }
  | { kind: 'household', householdId: string }
  | { kind: 'settlement', settlementId: string }
  | { kind: 'unowned' }

export type ResidentialBuildingRecord = {
  id: string
  kind: ResidentialBuildingKind
  x: number
  z: number
  yaw: number
  stage: ResidentialBuildingStage
  /** Hours of active work applied to the current work-bearing stage.
   *  Reset to 0 when the stage advances. Unused once `stage === 'completed'`. */
  stageWorkProgress: number
  /** True once the current work-bearing stage's materials have been
   *  committed. A newly activated stage starts `false`. Completed houses
   *  keep `true`. */
  materialsSupplied: boolean
  owner: ResidentialOwner
  /** Settlement association when the site is inside an existing settlement
   *  footprint at placement; `null` for an independent world house. */
  settlementId: string | null
  /** Stable `Place(type='home')` id, set exactly once on completion. */
  homePlaceId: string | null
}

export type ResidentialStageDefinition = {
  requiredWork: number
  requiredMaterials: readonly MaterialRequirement[]
}

export type ResidentialBuildingDefinition = {
  kind: ResidentialBuildingKind
  label: string
  houseDefinition: HouseDefinition
  footprint: { width: number, depth: number }
  housingCapacity: number
  stages: Record<ResidentialConstructionStage, ResidentialStageDefinition>
}

export const RESIDENTIAL_CONSTRUCTION_STAGES: readonly ResidentialConstructionStage[] = [
  'foundation',
  'structure',
  'roof',
]

const SMALL_HOUSE_STAGES: Record<ResidentialConstructionStage, ResidentialStageDefinition> = {
  foundation: { requiredWork: 2, requiredMaterials: [{ kind: 'stone', count: 8 }] },
  structure: {
    requiredWork: 4,
    requiredMaterials: [{ kind: 'beam', count: 6 }, { kind: 'branch', count: 4 }],
  },
  roof: {
    requiredWork: 2,
    requiredMaterials: [{ kind: 'beam', count: 4 }, { kind: 'branch', count: 4 }],
  },
}

const MEDIUM_HOUSE_STAGES: Record<ResidentialConstructionStage, ResidentialStageDefinition> = {
  foundation: { requiredWork: 3, requiredMaterials: [{ kind: 'stone', count: 14 }] },
  structure: {
    requiredWork: 6,
    requiredMaterials: [{ kind: 'beam', count: 10 }, { kind: 'branch', count: 6 }],
  },
  roof: {
    requiredWork: 4,
    requiredMaterials: [{ kind: 'beam', count: 6 }, { kind: 'branch', count: 8 }],
  },
}

export const RESIDENTIAL_BUILDING_DEFINITIONS: Record<ResidentialBuildingKind, ResidentialBuildingDefinition> = {
  small_house: {
    kind: 'small_house',
    label: 'Mała chata',
    houseDefinition: COTTAGE_4X4_A,
    footprint: COTTAGE_4X4_A.footprint,
    housingCapacity: 3,
    stages: SMALL_HOUSE_STAGES,
  },
  medium_house: {
    kind: 'medium_house',
    label: 'Średnia chata',
    houseDefinition: COTTAGE_6X4_A,
    footprint: COTTAGE_6X4_A.footprint,
    housingCapacity: 6,
    stages: MEDIUM_HOUSE_STAGES,
  },
}

export function residentialBuildingDefinition(kind: ResidentialBuildingKind): ResidentialBuildingDefinition {
  return RESIDENTIAL_BUILDING_DEFINITIONS[kind]
}

export function isResidentialConstructionStage(stage: ResidentialBuildingStage): stage is ResidentialConstructionStage {
  return stage !== 'completed'
}

export function residentialBuildingFootprintRadius(kind: ResidentialBuildingKind): number {
  const { width, depth } = residentialBuildingDefinition(kind).footprint
  return 0.5 * Math.hypot(width, depth) + 0.45
}

export function residentialBuildingSeparation(kind: ResidentialBuildingKind): number {
  return residentialBuildingFootprintRadius(kind) * 2
}

export function residentialBuildingPlaceReach(kind: ResidentialBuildingKind): number {
  const { depth } = residentialBuildingDefinition(kind).footprint
  return Math.max(2.6, depth / 2 + 0.8)
}

export const RESIDENTIAL_BUILDING_PLACE_DURATION_SEC = 4
export const RESIDENTIAL_BUILDING_WORK_SESSION_SEC = 8
export const RESIDENTIAL_BUILDING_WORK_SESSION_HOURS = 1
/** Bounded wait while a hired NPC is at a material-blocked house — one
 *  work-session length, not a per-frame retry. */
export const RESIDENTIAL_BUILDING_MATERIAL_BLOCK_WAIT_SEC = 8

export type ResidentialPlacementReason = GroundPlacementReason | 'house'

export const RESIDENTIAL_PLACEMENT_MESSAGE: Record<Exclude<ResidentialPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na chatę.',
  slope: 'Teren jest zbyt stromy. Najpierw przygotuj teren (Szybkie akcje → Przygotuj teren).',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już stoi chata.',
  house: 'Tu już stoi chata.',
}

export function isResidentialBuildingComplete(record: Pick<ResidentialBuildingRecord, 'stage'>): boolean {
  return record.stage === 'completed'
}

export function isResidentialBuildingMaterialBlocked(
  record: Pick<ResidentialBuildingRecord, 'stage' | 'materialsSupplied'>,
): boolean {
  return isResidentialConstructionStage(record.stage) && !record.materialsSupplied
}

export function residentialStageRequiredWork(
  kind: ResidentialBuildingKind,
  stage: ResidentialConstructionStage,
): number {
  return residentialBuildingDefinition(kind).stages[stage].requiredWork
}

export function residentialStageRequirements(
  kind: ResidentialBuildingKind,
  stage: ResidentialConstructionStage,
): readonly MaterialRequirement[] {
  return residentialBuildingDefinition(kind).stages[stage].requiredMaterials
}

export function nextResidentialConstructionStage(
  stage: ResidentialConstructionStage,
): ResidentialBuildingStage {
  if (stage === 'foundation') return 'structure'
  if (stage === 'structure') return 'roof'
  return 'completed'
}

/** Useful work the target will accept *right now* — remaining work on the
 *  current material-supplied stage only. A material-blocked or completed
 *  house reports 0. Future stages are not included: a contribution must not
 *  spill into an unsupplied next stage. */
export function residentialBuildingRemainingWork(record: ResidentialBuildingRecord): number {
  if (!isResidentialConstructionStage(record.stage) || !record.materialsSupplied) return 0
  return Math.max(0, residentialStageRequiredWork(record.kind, record.stage) - record.stageWorkProgress)
}

/** Sum of required work across every construction stage — the overall
 *  inspection denominator (plan `ui-input-014`). Independent of the Work
 *  Contract remaining-work authority (`residentialBuildingRemainingWork`). */
export function residentialBuildingTotalRequiredWork(kind: ResidentialBuildingKind): number {
  const stages = residentialBuildingDefinition(kind).stages
  let total = 0
  for (const stage of RESIDENTIAL_CONSTRUCTION_STAGES) total += stages[stage].requiredWork
  return total
}

/** Hours already applied toward a finished house: completed prior stages
 *  plus the current stage's `stageWorkProgress`. Completed houses report
 *  the full required total. */
export function residentialBuildingCompletedWork(record: ResidentialBuildingRecord): number {
  const stages = residentialBuildingDefinition(record.kind).stages
  if (!isResidentialConstructionStage(record.stage)) {
    return residentialBuildingTotalRequiredWork(record.kind)
  }
  let completed = record.stageWorkProgress
  for (const stage of RESIDENTIAL_CONSTRUCTION_STAGES) {
    if (stage === record.stage) break
    completed += stages[stage].requiredWork
  }
  return completed
}

/** Total remaining construction work until the house is complete, including
 *  future unsupplied stages. Not a Work Contract remaining-work authority. */
export function residentialBuildingTotalRemainingWork(record: ResidentialBuildingRecord): number {
  return Math.max(0, residentialBuildingTotalRequiredWork(record.kind) - residentialBuildingCompletedWork(record))
}

export function residentialConstructionStageLabel(stage: ResidentialConstructionStage): string {
  if (stage === 'foundation') return 'fundament'
  if (stage === 'structure') return 'konstrukcja'
  return 'dach'
}

export function residentialHomePlaceId(buildingId: string): string {
  return `home:residential:${buildingId}`
}

export function isPlayerOwnedResidentialBuilding(
  record: Pick<ResidentialBuildingRecord, 'owner'>,
): boolean {
  return record.owner.kind === 'player'
}

/** Local approach point just outside the front wall — v1 lodging walks here
 *  instead of a physical bed. */
export function residentialBuildingApproachLocal(kind: ResidentialBuildingKind): { x: number, z: number } {
  const { depth } = residentialBuildingDefinition(kind).footprint
  return { x: 0, z: -depth / 2 - 1.15 }
}

export function rotateLocalToWorld(
  originX: number,
  originZ: number,
  yaw: number,
  localX: number,
  localZ: number,
): { x: number, z: number } {
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  return {
    x: originX + localX * cos + localZ * sin,
    z: originZ - localX * sin + localZ * cos,
  }
}

export function residentialBuildingApproachPoint(record: Pick<ResidentialBuildingRecord, 'kind' | 'x' | 'z' | 'yaw'>): { x: number, z: number } {
  const local = residentialBuildingApproachLocal(record.kind)
  return rotateLocalToWorld(record.x, record.z, record.yaw, local.x, local.z)
}

export function createUnfinishedResidentialBuildingRecord(params: {
  id: string
  kind: ResidentialBuildingKind
  x: number
  z: number
  yaw: number
  owner?: ResidentialOwner
  settlementId?: string | null
}): ResidentialBuildingRecord {
  return {
    id: params.id,
    kind: params.kind,
    x: params.x,
    z: params.z,
    yaw: params.yaw,
    stage: 'foundation',
    stageWorkProgress: 0,
    materialsSupplied: false,
    owner: params.owner ?? { kind: 'player' },
    settlementId: params.settlementId ?? null,
    homePlaceId: null,
  }
}

export type ResidentialWorkContribution = {
  next: ResidentialBuildingRecord
  acceptedWork: number
  completed: boolean
  stageAdvanced: boolean
}

/**
 * Actor-neutral construction contribution — clamps to remaining useful work
 * of the current material-supplied stage and never spills into the next
 * stage. Returns the original record when blocked, completed or unknown.
 */
export function applyResidentialBuildingWork(
  record: ResidentialBuildingRecord,
  workAmount: number,
): ResidentialWorkContribution {
  if (isResidentialBuildingComplete(record) || isResidentialBuildingMaterialBlocked(record)) {
    return { next: record, acceptedWork: 0, completed: isResidentialBuildingComplete(record), stageAdvanced: false }
  }
  const remaining = residentialBuildingRemainingWork(record)
  const acceptedWork = Math.max(0, Math.min(workAmount, remaining))
  if (acceptedWork <= 0) {
    return { next: record, acceptedWork: 0, completed: false, stageAdvanced: false }
  }
  const stage = record.stage as ResidentialConstructionStage
  const stageWorkProgress = record.stageWorkProgress + acceptedWork
  if (stageWorkProgress < residentialStageRequiredWork(record.kind, stage)) {
    return {
      next: { ...record, stageWorkProgress },
      acceptedWork,
      completed: false,
      stageAdvanced: false,
    }
  }
  const nextStage = nextResidentialConstructionStage(stage)
  if (nextStage === 'completed') {
    return {
      next: {
        ...record,
        stage: 'completed',
        stageWorkProgress: 0,
        materialsSupplied: true,
        homePlaceId: record.homePlaceId ?? residentialHomePlaceId(record.id),
      },
      acceptedWork,
      completed: true,
      stageAdvanced: true,
    }
  }
  return {
    next: {
      ...record,
      stage: nextStage,
      stageWorkProgress: 0,
      materialsSupplied: false,
    },
    acceptedWork,
    completed: false,
    stageAdvanced: true,
  }
}

export function supplyResidentialStageMaterials(
  record: ResidentialBuildingRecord,
): ResidentialBuildingRecord | null {
  if (!isResidentialBuildingMaterialBlocked(record)) return null
  return { ...record, materialsSupplied: true }
}

export function residentialBuildingLodgingId(buildingId: string): string {
  return `residential:${buildingId}:owned_house`
}

export function residentialBuildingPromptLabel(record: ResidentialBuildingRecord): string {
  if (isResidentialBuildingComplete(record)) {
    return isPlayerOwnedResidentialBuilding(record) ? '[E] Nocuj' : 'Chata'
  }
  const stage = record.stage as ResidentialConstructionStage
  const required = residentialStageRequiredWork(record.kind, stage)
  if (!record.materialsSupplied) {
    return `[E] Dostarcz materiały (${residentialConstructionStageLabel(stage)}) · [R] Anuluj budowę`
  }
  return `[E] Buduj (${residentialConstructionStageLabel(stage)} ${formatHours(record.stageWorkProgress)}/${formatHours(required)} h) · [R] Anuluj budowę`
}

export function coveringPreparationSize(width: number, depth: number): 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 {
  const needed = Math.ceil(Math.max(width, depth))
  if (needed <= 2) return 2
  if (needed >= 9) return 9
  return needed as 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
}
