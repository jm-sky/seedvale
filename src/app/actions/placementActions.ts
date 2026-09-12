import type { CropId } from '../../world/cropLifecycle'
import type { PlacementPreviewFootprint } from '../../world/placementPreview'
import { playActionWellConstruction } from '../../audio/actionSounds'
import {
  applyRecovery,
  canReceiveRecovery,
  computeMaterialRecovery,
  CONSTRUCTION_MATERIAL_RADIUS,
  consumeMaterial,
  hasMaterial,
  materialAvailabilityBreakdown,
  type MaterialRequirement,
} from '../../items/constructionMaterials'
import { CAPABILITY_NEED_LABEL } from '../../items/itemCatalog'
import { isLiquidContainerInstance, isTentItemInstance, isTrapItemInstance, LIQUID_CONTAINER_KIND_LIST, type LiquidContainerItemInstance } from '../../items/itemInstances'
import { ITEM_DEFS } from '../../items/items'
import { drinkFromLiquidContainer, hasLiquidContent, pourLiquidFromContainer } from '../../items/liquidContainer'
import {
  evaluateGroundPlacement,
  evaluateOrientedGroundPlacement,
  evaluateTentPlacement,
  TENT_PLACEMENT_MESSAGE,
  TENT_SETUP_DURATION_SEC,
  type TentPlacementReason,
} from '../../items/tentPlacement'
import { TENT_FOOTPRINT_RADIUS, TENT_LENGTH, TENT_WIDTH } from '../../items/tentProp'
import { selectInstanceToPlace } from '../../items/trade'
import {
  applyRepresentedPhysicalEffortVigor,
  physicalEffortBusyOptions,
} from '../../player/PlayerNeeds'
import { awardSkillXp, SKILL_XP_AWARD, survivalDurationMultiplier } from '../../player/PlayerSkills'
import { villageSizeConfig } from '../../settlement/families'
import { worldToCell } from '../../settlement/settlementGenerator'
import { STRUCTURE_REPAIR_WORK_SESSION_HOURS, STRUCTURE_REPAIR_WORK_SESSION_SEC } from '../../settlement/structureCondition'
import { type DigEnv } from '../../terrain/dig'
import {
  averageAbsHeightDelta,
  computeRequiredWork,
  resolvePreparationSamples,
  type TerrainPreparationRecord,
  validatePreparationSamples,
} from '../../terrain/terrainPreparation'
import {
  TRAP_DEFS,
  TRAP_FOOTPRINT_RADIUS,
  TRAP_PLACE_REACH,
  TRAP_PLACEMENT_MESSAGE,
  TRAP_SEPARATION,
  TRAP_SETUP_DURATION_SEC,
  type TrapKind,
  type TrapPlacementReason,
} from '../../world/animalTraps'
import {
  isPalisadeConstructionComplete,
  PALISADE_FOOTPRINT_RADIUS,
  PALISADE_LENGTH,
  PALISADE_MATERIAL_REQUIREMENTS,
  PALISADE_PLACE_DURATION_SEC,
  PALISADE_PLACE_REACH,
  PALISADE_PLACEMENT_MESSAGE,
  PALISADE_RECOVERY_RATE,
  PALISADE_SEPARATION,
  PALISADE_WORK_SESSION_HOURS,
  PALISADE_WORK_SESSION_SEC,
  type PalisadePlacementReason,
  palisadeRemainingWork,
  resolvePalisadeSite,
} from '../../world/palisade'
import {
  CROP_PLANT_DURATION_SEC,
  CROP_PLANT_FOOTPRINT_RADIUS,
  CROP_PLANT_MESSAGE,
  CROP_PLANT_REACH,
  CROP_PLANT_SEPARATION,
  CROP_SEED_ITEM,
  isNearAnyGarden,
} from '../../world/plantedCrops'
import {
  TREE_PLANT_DURATION_SEC,
  TREE_PLANT_FOOTPRINT_RADIUS,
  TREE_PLANT_MESSAGE,
  TREE_PLANT_REACH,
  TREE_PLANT_SEPARATION,
} from '../../world/plantedTrees'
import {
  GARDEN_CAPABILITY,
  GARDEN_FOOTPRINT_RADIUS,
  GARDEN_PLACE_DURATION_SEC,
  GARDEN_PLACE_REACH,
  GARDEN_PLACEMENT_MESSAGE,
  GARDEN_SEPARATION,
  gardenMaterialRequirements,
  type GardenPlacementReason,
  maintenanceDurationSec,
  PLAYER_GARDEN_PLANT_RADIUS,
  WATERING_DURATION_SEC,
  WATERING_LITRES,
} from '../../world/playerGarden'
import {
  isPlayerTroughConstructionComplete,
  PLAYER_TROUGH_FILL_DURATION_SEC,
  PLAYER_TROUGH_FOOTPRINT_RADIUS,
  PLAYER_TROUGH_MATERIAL_REQUIREMENTS,
  PLAYER_TROUGH_PLACE_DURATION_SEC,
  PLAYER_TROUGH_PLACE_REACH,
  PLAYER_TROUGH_PLACEMENT_MESSAGE,
  PLAYER_TROUGH_RECOVERY_RATE,
  PLAYER_TROUGH_SEPARATION,
  PLAYER_TROUGH_WORK_SESSION_HOURS,
  PLAYER_TROUGH_WORK_SESSION_SEC,
  playerTroughFreeCapacity,
  type PlayerTroughPlacementReason,
  playerTroughRemainingWork,
} from '../../world/playerTrough'
import {
  activeWellStage,
  advanceWellConstruction,
  formatWorkDuration,
  isWellCompleted,
  isWellWaterAvailable,
  quoteWellRoofRepair,
  WELL_FOOTPRINT_RADIUS,
  WELL_PLACE_DURATION_SEC,
  WELL_PLACE_REACH,
  WELL_PLACEMENT_MESSAGE,
  WELL_RECOVERY_RATE,
  WELL_ROOF_REPAIR_WORK_LABEL,
  WELL_SEPARATION,
  WELL_WORK_LABEL,
  WELL_WORK_SESSION_HOURS,
  WELL_WORK_SESSION_SEC,
  type WellPlacementReason,
  wellStageCapabilities,
  wellStageRequirements,
  wellStageWorkHours,
} from '../../world/playerWell'
import { repairRemainingWork } from '../../world/repair'
import {
  coveringPreparationSize,
  isResidentialBuildingComplete,
  isResidentialBuildingMaterialBlocked,
  RESIDENTIAL_BUILDING_PLACE_DURATION_SEC,
  RESIDENTIAL_BUILDING_WORK_SESSION_HOURS,
  RESIDENTIAL_BUILDING_WORK_SESSION_SEC,
  RESIDENTIAL_PLACEMENT_MESSAGE,
  residentialBuildingDefinition,
  residentialBuildingFootprintRadius,
  type ResidentialBuildingKind,
  residentialBuildingPlaceReach,
  residentialBuildingRemainingWork,
  residentialBuildingSeparation,
  type ResidentialPlacementReason,
  residentialStageRequirements,
  residentialTotalRequirements,
} from '../../world/residentialBuilding'
import {
  BEDROLL_FOOTPRINT_RADIUS,
  BEDROLL_MATERIAL_REQUIREMENTS,
  BEDROLL_PLACE_DURATION_SEC,
  BEDROLL_PLACE_REACH,
  BEDROLL_PLACEMENT_MESSAGE,
  BEDROLL_RECOVERY_RATE,
  BEDROLL_SEPARATION,
  type BedrollPlacementReason,
  PLATFORM_FOOTPRINT_RADIUS,
  PLATFORM_MATERIAL_REQUIREMENTS,
  PLATFORM_PLACE_DURATION_SEC,
  PLATFORM_PLACE_REACH,
  PLATFORM_PLACEMENT_MESSAGE,
  PLATFORM_RECOVERY_RATE,
  PLATFORM_SEPARATION,
  type PlatformPlacementReason,
} from '../../world/sleepingUtilities'
import {
  BEDROLL_LENGTH,
  BEDROLL_WIDTH,
  PLATFORM_FOOTPRINT_LENGTH,
  PLATFORM_FOOTPRINT_WIDTH,
} from '../../world/sleepingUtilityProp'
import {
  isStandingTorchConstructionComplete,
  STANDING_TORCH_FOOTPRINT_RADIUS,
  STANDING_TORCH_MATERIAL_REQUIREMENTS,
  STANDING_TORCH_PLACE_DURATION_SEC,
  STANDING_TORCH_PLACE_REACH,
  STANDING_TORCH_PLACEMENT_MESSAGE,
  STANDING_TORCH_RECOVERY_RATE,
  STANDING_TORCH_SEPARATION,
  STANDING_TORCH_WORK_SESSION_HOURS,
  STANDING_TORCH_WORK_SESSION_SEC,
  type StandingTorchPlacementReason,
  standingTorchRemainingWork,
} from '../../world/standingTorch'
import { isActionBlocked, type PlayerActionContext } from './actionContext'
import { startConstructionWorkSession } from './constructionWorkSession'
import {
  derivePlacementPresentation,
  formatRecoveryLines,
  type PlacementConfirmKind,
  type PlacementPreviewState,
  type PlacementRequirementView,
  placementRequirementViews,
} from './placementRequirementView'
import { placementAimSite } from './placementYaw'

/** A world object the player can put down in front of themselves — the shared
 *  `evaluateGroundPlacement` + busy-channel shape used by tents (plan 099),
 *  animal traps (plan 141), chests (plan 164) and player-built wells (plan
 *  127). The item/material is always spent when the channel *completes*, so
 *  Esc costs nothing. */
export type PlacementBlocker = { x: number, z: number, radius: number }

export type { PlacementPreviewFootprint }

/** Read-only per-frame result backing the shared placement-preview ghost/UI
 *  (plan `ui-input-004` §2/§7, footprint/yaw by `ui-input-012`) — every
 *  `preview*Placement()` below returns this same shape so
 *  `app/actions/placementPreviewActions.ts` can render and validate any of
 *  chest/tent/fire without knowing their individual reason types. Never
 *  authoritative: the real placement action re-resolves aim and re-validates
 *  from scratch at confirm time. */
export type PlacementPreviewResult = {
  x: number
  z: number
  yaw: number
  footprintRadius: number
  /** Presentational ghost shape — independent of `footprintRadius` clearance. */
  footprint: PlacementPreviewFootprint
  valid: boolean
  reasonLabel: string
  /** Explicit three-state presentation (plan ui-input-016) — Vue/ghost
   *  must not infer this from `reasonLabel`. `valid` stays as
   *  `state === 'ready'` for compatibility. */
  state: PlacementPreviewState
  canConfirm: boolean
  confirmKind: PlacementConfirmKind
  requirements: readonly PlacementRequirementView[]
}

export type { PlacementConfirmKind, PlacementPreviewState, PlacementRequirementView }

/** Aimed transform for a ground-placed object (plan `world-008` §2) —
 *  resolved fresh on every read, never cached: the site a placement would
 *  land at right now. */
export type GroundPlacementSite = { x: number, z: number, yaw: number }

/** Minimal shared placement contract (plan `world-008` §2/§3): the aimed
 *  transform plus the object's own suitability check — `evaluate` stays
 *  free to call `evaluateGroundPlacement`, `evaluateTentPlacement` or any
 *  other object-specific wrapper, so family-specific rules (peers,
 *  blockers, footprint) remain owned by the object, never flattened into
 *  one shared rule set (implementation notes §10). `evaluatePlacementSite`/
 *  `previewGroundPlacement` below are the single seam a `preview*Placement`
 *  and its matching `place*AtAim` both read from, so they can never
 *  disagree about *how* a site is evaluated — only about whether the
 *  result is merely displayed or acted on. Read-only: it never mutates
 *  anything, never consumes inventory and never starts work — mutation
 *  stays in the caller's own busy-channel completion.
 *
 * @domain world */
export type GroundPlacementDefinition<Reason extends string> = {
  aim: () => GroundPlacementSite
  evaluate: (site: GroundPlacementSite) => Reason
  footprintRadius: number
  /** Presentational ghost shape — independent of `footprintRadius` clearance. */
  previewFootprint: PlacementPreviewFootprint
  reasonLabel: (reason: Exclude<Reason, 'ok'>) => string
}

/** Async completion hooks for multi-stage player intents (plan ui-input-010 /
 *  items-player-018). Normal placement callers omit these. */
export type PlacementMutationLifecycle = {
  onComplete?: (outcome: 'success' | 'failure', placedId?: string) => void
  onCancel?: () => void
}

/** Resolves the current aim + suitability for `def` once. */
export function evaluatePlacementSite<Reason extends string>(
  def: GroundPlacementDefinition<Reason>,
): { site: GroundPlacementSite, reason: Reason } {
  const site = def.aim()
  return { site, reason: def.evaluate(site) }
}

/** Read-only `PlacementPreviewResult` for any `GroundPlacementDefinition` —
 *  backs the shared placement-preview ghost/UI the same way a hand-written
 *  `preview*Placement` would. */
export function previewGroundPlacement<Reason extends string>(
  def: GroundPlacementDefinition<Reason>,
): PlacementPreviewResult {
  const { site, reason } = evaluatePlacementSite(def)
  const ok = (reason as string) === 'ok'
  const presentation = derivePlacementPresentation({
    geometryOk: ok,
    geometryReason: ok ? '' : def.reasonLabel(reason as Exclude<Reason, 'ok'>),
  })
  return {
    x: site.x,
    z: site.z,
    yaw: site.yaw,
    footprintRadius: def.footprintRadius,
    footprint: def.previewFootprint,
    ...presentation,
  }
}

export type WellWorkView = {
  title: string
  description: string
  canWork: boolean
  reasonLabel: string
}

export type WellRoofRepairView = {
  title: string
  description: string
  canAct: boolean
  reasonLabel: string
  mode: 'start' | 'continue'
  waterAvailable: boolean
}

/** Read-only quote/status for a settlement structure's shared repair target
 *  (plan settlements-007) — same shape as `WellRoofRepairView` minus the
 *  well-specific `waterAvailable` field. */
export type StructureRepairView = {
  title: string
  description: string
  canAct: boolean
  reasonLabel: string
  mode: 'start' | 'continue'
}

export type ConstructionActionView = {
  canWork: boolean
  reasonLabel: string
}

export type ResidentialWorkView = {
  canWork: boolean
  workReasonLabel: string
  canSupply: boolean
  supplyReasonLabel: string
}

export type RemovalPreview = {
  recovered: readonly MaterialRequirement[]
  canReceive: boolean
  reasonLabel: string
  body: string
}

export type PlacementActions = {
  /** Where a tent placed right now would land (its far end is `TENT_LENGTH`
   *  ahead of the player, along the current look yaw). */
  tentAimPoint: () => { x: number, z: number, yaw: number }
  /** Nearby trees / settlement wells / houses that block a ground placement.
   *  Shared by every placeable (tent, trap, chest, well) — the name predates
   *  the others but the geometry is the same. */
  tentBlockers: (x: number, z: number) => PlacementBlocker[]
  /** Read-only preview of tent placement at the player's current aim (plan
   *  `ui-input-004` §2) — backs the shared placement-preview ghost/UI;
   *  `placeTentAtAim` remains the only mutation seam. `objectYaw` freezes
   *  the tent's orientation independently of camera aim (plan `ui-input-012`). */
  previewTentPlacement: (objectYaw?: number) => PlacementPreviewResult
  placeTentAtAim: (objectYaw?: number, lifecycle?: PlacementMutationLifecycle) => void
  placeTrapAtAim: (kind: TrapKind) => void
  previewTrapPlacement: (kind: TrapKind) => PlacementPreviewResult
  /** Read-only preview of well placement at the player's current aim (plan
   *  `ui-input-012`) — same shared preview seam as tent/torch; confirm still
   *  re-resolves via `placeWellAtAim`. */
  previewWellPlacement: () => PlacementPreviewResult
  placeWellAtAim: () => void
  workOnWell: (id: string) => void
  /** Read-only preview of what pressing `[E]` on this well would require/do
   *  right now — same checks `workOnWell` runs, without mutating anything.
   *  Backs the interaction panel's construction view (plan `ui-input-002`
   *  §3); `workOnWell` itself remains the only place that actually spends
   *  materials or starts work. */
  describeWellWork: (id: string) => WellWorkView | null
  /** Read-only roof-repair preview for a completed player-built well. */
  describeWellRoofRepair: (id: string) => WellRoofRepairView | null
  /** Starts or resumes one roof-repair work bout on a completed well. */
  workOnWellRoofRepair: (id: string) => void
  /** Read-only repair preview for a settlement structure (plan settlements-007)
   *  — same shared quote/begin/contribute target NPC repair work uses. */
  describeStructureRepair: (settlementId: string, structureId: string, x: number, z: number) => StructureRepairView | null
  /** Starts or resumes one repair work bout on a settlement structure. */
  workOnStructureRepair: (settlementId: string, structureId: string, x: number, z: number) => void
  /** Places a new player-built garden plot ahead of the player (plan 174 §1)
   *  — a single-stage placement (unlike a well), immediately usable as a
   *  planting anchor once built. */
  placeGardenAtAim: () => void
  previewGardenPlacement: () => PlacementPreviewResult
  /** "Zrób porządek" on a player garden plot (plan 176 §4/§10) — restores
   *  ~50 care points (capped at 100) after a short busy channel, shortened
   *  by a held shovel/pitchfork. Mutation only applied on completion, after
   *  revalidating the plot still exists. */
  tidyGardenPlot: (id: string) => void
  /** "Podlej" on a player garden plot (plan settlements-npcs-001 §9/§11/§12)
   *  — consumes `WATERING_LITRES` from a carried water-filled container
   *  (waterskin or bucket) after a short busy channel; mutation only applied
   *  on completion, after revalidating the plot still exists. */
  waterGardenPlot: (id: string) => void
  /** Plants a `tree_seed` from inventory ahead of the player (plan 126). */
  plantTreeAtAim: () => void
  /** Plants a crop seed of `cropId` ahead of the player — only valid near a
   *  settlement garden (plan 126). */
  plantCropAtAim: (cropId: CropId) => void
  /** Read-only preview of standing-torch placement at the player's current
   *  aim (plan items-player-009) — backs the shared placement-preview ghost/
   *  UI; `placeStandingTorchAtAim` remains the only mutation seam. */
  previewStandingTorchPlacement: () => PlacementPreviewResult
  /** Places a new, unlit standing torch ahead of the player (plan
   *  items-player-009 §1/§2) — consumes `STANDING_TORCH_MATERIAL_REQUIREMENTS`
   *  atomically on completion, nothing on a rejected/cancelled placement. */
  placeStandingTorchAtAim: () => void
  /** `[E]` ignites an unlit standing torch (plan items-player-009 §4) —
   *  requires `fire_starting`; no-op (including re-checking `lit`) if `id` is
   *  unknown or already lit. Instant, no busy channel or material cost. */
  igniteStandingTorch: (id: string) => void
  /** `[E]` on an unfinished standing torch (plan items-player-017 §11) — runs
   *  one active-work bout through the actor-neutral `contributeWork` seam,
   *  crediting a `light`-effort represented-vigor cost per hour actually
   *  applied, same "measured wall-clock fraction on cancel" contract as
   *  `workOnWell`. No-op if `id` is unknown or already complete. */
  workOnStandingTorch: (id: string) => void
  describeStandingTorchWork: (id: string) => ConstructionActionView | null
  previewStandingTorchRemoval: (id: string) => RemovalPreview | null
  removeStandingTorch: (id: string) => void
  previewPlayerTroughPlacement: () => PlacementPreviewResult
  placePlayerTroughAtAim: () => void
  workOnPlayerTrough: (id: string) => void
  describePlayerTroughWork: (id: string) => ConstructionActionView | null
  describePlayerTroughFill: (id: string) => ConstructionActionView | null
  fillPlayerTrough: (id: string) => void
  previewPlayerTroughRemoval: (id: string) => RemovalPreview | null
  removePlayerTrough: (id: string) => void
  /** Read-only preview of palisade-segment placement at the player's current
   *  aim (plan items-player-010 §1/§3/§4) — already snapped to a nearby
   *  segment endpoint when one is in range; backs the shared
   *  placement-preview ghost/UI. `placePalisadeAtAim` remains the only
   *  mutation seam. */
  previewPalisadePlacement: (objectYaw?: number) => PlacementPreviewResult
  /** Places a new palisade segment ahead of the player (plan items-player-010
   *  §1/§2/§3/§4) — snaps to the nearest valid endpoint of an existing
   *  segment within reach, then consumes `PALISADE_MATERIAL_REQUIREMENTS`
   *  atomically on completion, nothing on a rejected/cancelled placement. */
  placePalisadeAtAim: (objectYaw?: number) => void
  /** `[E]` on an unfinished palisade segment (plan items-player-017 §10) —
   *  same shape as `workOnStandingTorch`, `moderate`-effort represented
   *  vigor cost. No-op if `id` is unknown or already complete. */
  workOnPalisade: (id: string) => void
  describePalisadeWork: (id: string) => ConstructionActionView | null
  previewPalisadeRemoval: (id: string) => RemovalPreview | null
  /** `[R]` removes one palisade segment by id (plan items-player-010 §5/§6/
   *  §7, extended by items-player-017 §17) — the generic player-built
   *  removal/recovery seam (`items/constructionMaterials.ts`) applied to a
   *  palisade segment: preflights inventory capacity for the recovered
   *  materials before removing anything, then removes the authoritative
   *  segment + runtime representation, adds the recovery and invalidates any
   *  active Work Contract still referencing this segment (so a committed NPC
   *  is never left travelling/working toward a missing target). No-op if
   *  `id` is unknown or the recovered materials wouldn't fit. */
  removePalisadeSegment: (id: string) => void
  /** Read-only preview of bedroll placement at the player's current aim
   *  (plan items-player-013) — same shape as `previewStandingTorchPlacement`;
   *  `placeBedrollAtAim` remains the only mutation seam. */
  previewBedrollPlacement: (objectYaw?: number) => PlacementPreviewResult
  /** Places a new leather bedroll ahead of the player (plan items-player-013)
   *  — consumes `BEDROLL_MATERIAL_REQUIREMENTS` atomically on completion,
   *  nothing on a rejected/cancelled placement. */
  placeBedrollAtAim: (objectYaw?: number, lifecycle?: PlacementMutationLifecycle) => void
  /** Read-only preview of raised-platform placement at the player's current
   *  aim (plan items-player-013) — same shape as `previewBedrollPlacement`. */
  previewPlatformPlacement: (objectYaw?: number) => PlacementPreviewResult
  /** Places a new raised sleeping platform ahead of the player (plan
   *  items-player-013) — consumes `PLATFORM_MATERIAL_REQUIREMENTS` atomically
   *  on completion, nothing on a rejected/cancelled placement. */
  placePlatformAtAim: (objectYaw?: number, lifecycle?: PlacementMutationLifecycle) => void
  previewSmallHousePlacement: (objectYaw?: number) => PlacementPreviewResult
  previewMediumHousePlacement: (objectYaw?: number) => PlacementPreviewResult
  placeSmallHouseAtAim: (objectYaw?: number) => void
  placeMediumHouseAtAim: (objectYaw?: number) => void
  supplyResidentialBuildingMaterials: (id: string) => void
  workOnResidentialBuilding: (id: string) => void
  describeResidentialWork: (id: string) => ResidentialWorkView | null
  previewResidentialCancel: (id: string) => RemovalPreview | null
  cancelResidentialBuilding: (id: string) => void
  previewWellCancel: (id: string) => RemovalPreview | null
  cancelPlayerWell: (id: string) => void
  previewBedrollRemoval: (id: string) => RemovalPreview | null
  removeBedroll: (id: string) => void
  previewPlatformRemoval: (id: string) => RemovalPreview | null
  removePlatform: (id: string) => void
}

export function createPlacementActions(ctx: PlayerActionContext): PlacementActions {
  const { bundle, player, inventory, heldTool, hud, toast, busy, dayNight, mouseLook, worldAudio } = ctx

  const withRequirements = (
    result: PlacementPreviewResult,
    requirements: readonly MaterialRequirement[],
    missingCapabilityReason?: string,
  ): PlacementPreviewResult => ({
    ...result,
    ...derivePlacementPresentation({
      geometryOk: result.state !== 'invalid',
      geometryReason: result.reasonLabel,
      requirements: placementRequirementViews(inventory, bundle.droppedItems, result.x, result.z, requirements),
      missingCapabilityReason,
    }),
  })

  const exhaustedReason = 'Jesteś zbyt wyczerpany, by kontynuować.'

  const startRepresentedWork = (
    remainingHours: number,
    realSecondsPerRepresentedHour: number,
    label: string,
    staminaEffort: 'light' | 'moderate' | 'heavy',
    vigorEffort: 'light' | 'moderate' | 'heavy',
    contribute: (hours: number) => void,
  ): boolean => {
    const started = startConstructionWorkSession(busy, player.needs, {
      remainingHours,
      realSecondsPerRepresentedHour,
      label,
      staminaEffort,
      vigorEffort,
      contribute,
    })
    if (!started) toast.show(exhaustedReason, 'error')
    return started
  }

  const removalPreview = (
    requirements: readonly MaterialRequirement[],
    recoveryRate: number,
    emptyReason = 'Brak miejsca w ekwipunku na odzyskane materiały.',
  ): RemovalPreview => {
    const recovered = computeMaterialRecovery({ requirements, recoveryRate })
    const canReceive = canReceiveRecovery(inventory, recovered)
    return {
      recovered,
      canReceive,
      reasonLabel: canReceive ? '' : emptyReason,
      body: formatRecoveryLines(recovered),
    }
  }

  const tentAimPoint = (): { x: number, z: number, yaw: number } =>
    placementAimSite(player.mesh.position.x, player.mesh.position.z, mouseLook.state.yaw, TENT_LENGTH)

  const tentBlockers = (x: number, z: number): PlacementBlocker[] => {
    const blockers: PlacementBlocker[] = []
    for (const tree of bundle.chunkManager.getNearbyTrees({ x, z }, 8)) {
      blockers.push({ x: tree.x, z: tree.z, radius: 1.2 })
    }
    for (const settlement of bundle.settlementsManager.getLoaded()) {
      blockers.push({
        x: settlement.landmarks.well.x,
        z: settlement.landmarks.well.z,
        radius: 1.6,
      })
      for (const house of settlement.landmarks.houses) {
        blockers.push({ x: house.position.x, z: house.position.z, radius: 2.2 })
      }
    }
    for (const house of bundle.residentialBuildings.nodes()) {
      blockers.push({
        x: house.x,
        z: house.z,
        radius: residentialBuildingFootprintRadius(house.kind),
      })
    }
    return blockers
  }

  /** Shared placement contract for a tent (plan `world-008`) — one `aim` +
   *  `evaluate` pair `previewTentPlacement` and `placeTentAtAim` both build
   *  from, so they can never validate a site differently. */
  const tentPlacementDefinition = (objectYaw?: number): GroundPlacementDefinition<TentPlacementReason> => ({
    aim: () => placementAimSite(
      player.mesh.position.x,
      player.mesh.position.z,
      mouseLook.state.yaw,
      TENT_LENGTH,
      objectYaw,
    ),
    evaluate: (site) => evaluateTentPlacement({
      x: site.x,
      z: site.z,
      sampleHeight: (x, z) => bundle.chunkManager.sampleHeight(x, z),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: tentBlockers(site.x, site.z),
      otherTents: bundle.placedTents.nodes(),
    }),
    footprintRadius: TENT_FOOTPRINT_RADIUS,
    previewFootprint: { kind: 'box', width: TENT_WIDTH, depth: TENT_LENGTH },
    reasonLabel: (reason) => TENT_PLACEMENT_MESSAGE[reason],
  })

  const previewTentPlacement = (objectYaw?: number): PlacementPreviewResult =>
    previewGroundPlacement(tentPlacementDefinition(objectYaw))

  const placeTentAtAim = (objectYaw?: number, lifecycle?: PlacementMutationLifecycle): void => {
    const candidates = inventory.getInstances('tent').filter(isTentItemInstance)
    const selected = candidates.sort((a, b) => {
      if (a.condition !== b.condition) return a.condition - b.condition
      return a.id.localeCompare(b.id)
    })[0]
    if (!selected || isActionBlocked(ctx)) {
      lifecycle?.onComplete?.('failure')
      return
    }
    const instanceId = selected.id
    const { site, reason } = evaluatePlacementSite(tentPlacementDefinition(objectYaw))
    if (reason !== 'ok') {
      toast.show(TENT_PLACEMENT_MESSAGE[reason], 'error')
      lifecycle?.onComplete?.('failure')
      return
    }
    // Survival shortens the setup channel; the tent itself is only spent when
    // the channel completes, so Esc costs nothing (same as ignite/cook).
    busy.start(
      TENT_SETUP_DURATION_SEC * survivalDurationMultiplier(player.skills.survival.value),
      'Rozstawianie namiotu…',
      () => {
        const instance = inventory.getInstance(instanceId)
        if (!instance || !isTentItemInstance(instance) || !inventory.removeInstance(instanceId)) {
          lifecycle?.onComplete?.('failure')
          return
        }
        const tent = bundle.placedTents.place(site.x, site.z, site.yaw, dayNight.elapsedDays, {
          id: instance.id,
          condition: instance.condition,
        })
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.syncQuickActionAvailability()
        awardSkillXp(player.skills, 'survival', SKILL_XP_AWARD.pitchTent)
        toast.show('Rozstawiono namiot.')
        lifecycle?.onComplete?.('success', tent.id)
      },
      { onCancel: () => lifecycle?.onCancel?.() },
    )
  }

  /** Sets a trap down in front of the player (plan 141 §3) — same busy-channel
   *  shape as pitching a tent: the item is only spent when the channel
   *  completes, and it lands `placed` (not armed), so arming stays a separate
   *  `[E]` interaction. Reuses the shared ground-suitability check, just with
   *  the trap's own footprint. */
  const trapPlacementDefinition = (_kind: TrapKind): GroundPlacementDefinition<TrapPlacementReason> => ({
    aim: () => placementAimSite(
      player.mesh.position.x,
      player.mesh.position.z,
      mouseLook.state.yaw,
      TRAP_PLACE_REACH,
    ),
    evaluate: (site) => {
      const reason = evaluateGroundPlacement({
        x: site.x,
        z: site.z,
        sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
        waterLevel: bundle.chunkManager.waterLevel,
        blockers: tentBlockers(site.x, site.z),
        peers: [...bundle.placedTraps.nodes(), ...bundle.placedTents.nodes()],
        footprintRadius: TRAP_FOOTPRINT_RADIUS,
        separation: TRAP_SEPARATION,
      })
      return reason === 'occupied' ? 'trap' : reason
    },
    footprintRadius: TRAP_FOOTPRINT_RADIUS,
    previewFootprint: { kind: 'circle', radius: TRAP_FOOTPRINT_RADIUS },
    reasonLabel: (reason) => TRAP_PLACEMENT_MESSAGE[reason],
  })

  const previewTrapPlacement = (kind: TrapKind): PlacementPreviewResult => {
    const result = previewGroundPlacement(trapPlacementDefinition(kind))
    const def = TRAP_DEFS[kind]
    const hasInstance = inventory.getInstances(def.itemKind).some(isTrapItemInstance)
    if (hasInstance) return result
    return {
      ...result,
      ...derivePlacementPresentation({
        geometryOk: result.state !== 'invalid',
        geometryReason: result.reasonLabel,
        missingCapabilityReason: `Nie masz: ${def.label}.`,
      }),
    }
  }

  const placeTrapAtAim = (kind: TrapKind): void => {
    const def = TRAP_DEFS[kind]
    const candidates = inventory.getInstances(def.itemKind).filter(isTrapItemInstance)
    const selected = selectInstanceToPlace(candidates)
    if (!selected || isActionBlocked(ctx)) return
    const instanceId = selected.id
    const { site, reason } = evaluatePlacementSite(trapPlacementDefinition(kind))
    if (reason !== 'ok') {
      toast.show(TRAP_PLACEMENT_MESSAGE[reason], 'error')
      return
    }
    busy.start(TRAP_SETUP_DURATION_SEC, 'Zastawianie pułapki…', () => {
      const instance = inventory.getInstance(instanceId)
      if (!instance || !isTrapItemInstance(instance) || instance.durability <= 0) return
      if (!inventory.removeInstance(instanceId)) return
      bundle.placedTraps.place(instance, site.x, site.z, site.yaw)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show(`Zastawiono: ${def.label}.`)
    })
  }

  const wellPlacementDefinition = (): GroundPlacementDefinition<WellPlacementReason> => ({
    aim: () => placementAimSite(
      player.mesh.position.x,
      player.mesh.position.z,
      mouseLook.state.yaw,
      WELL_PLACE_REACH,
    ),
    evaluate: (site) => {
      const reason = evaluateGroundPlacement({
        x: site.x,
        z: site.z,
        sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
        waterLevel: bundle.chunkManager.waterLevel,
        blockers: tentBlockers(site.x, site.z),
        peers: bundle.playerWells.nodes(),
        footprintRadius: WELL_FOOTPRINT_RADIUS,
        separation: WELL_SEPARATION,
      })
      return reason === 'occupied' ? 'well' : reason
    },
    footprintRadius: WELL_FOOTPRINT_RADIUS,
    previewFootprint: { kind: 'circle', radius: WELL_FOOTPRINT_RADIUS },
    reasonLabel: (reason) => WELL_PLACEMENT_MESSAGE[reason],
  })

  const previewWellPlacement = (): PlacementPreviewResult => {
    const result = previewGroundPlacement(wellPlacementDefinition())
    if (inventory.hasCapability('soil_digging')) return result
    return withRequirements(result, [], `Potrzebujesz ${CAPABILITY_NEED_LABEL.soil_digging}.`)
  }

  /** Places a new player-built well ahead of the player (plan 127 §5/§11) —
   *  same busy-channel shape as pitching a tent/setting a trap: the shovel
   *  is required but never consumed (plan §2), only the `pit` stage's
   *  world-time clock starts here ("[E] Wykop dół" — see
   *  `world/playerWell.ts`'s header doc). Materials are charged later, when
   *  each subsequent stage actually starts (`advanceWellStage` below). */
  const placeWellAtAim = (): void => {
    if (isActionBlocked(ctx)) return
    if (!inventory.hasCapability('soil_digging')) {
      toast.show(`Potrzebujesz ${CAPABILITY_NEED_LABEL.soil_digging}.`, 'error')
      return
    }
    const { site, reason } = evaluatePlacementSite(wellPlacementDefinition())
    if (reason !== 'ok') {
      toast.show(WELL_PLACEMENT_MESSAGE[reason], 'error')
      return
    }
    busy.start(WELL_PLACE_DURATION_SEC, 'Kopanie dołu pod studnię…', () => {
      bundle.playerWells.place(site.x, site.z, site.yaw)
      toast.show('Rozpoczęto kopanie studni.')
    }, physicalEffortBusyOptions('moderate', dayNight.dayLengthSec))
  }

  /** Runs one active-work session ("bout") on a player-built well (plan 127,
   *  revised — active work, not elapsed world time) — `[E]` on an unfinished
   *  well (`app/interactables.ts`'s `playerWell` candidate). One unified
   *  action handles every press:
   *  1. `stage` = the record's own stage if its work isn't finished yet,
   *     otherwise the next stage (about to be started in this same press).
   *  2. Tool check (never consumed) — re-validated on every press, including
   *     resumes.
   *  3. If this press starts a *new* stage, validate + atomically consume
   *     that stage's materials first (nothing is spent if anything is
   *     missing), then transition the record into it (resets progress,
   *     swaps mesh/collider).
   *  4. Start one busy-channel work bout, capped at `WELL_WORK_SESSION_SEC`
   *     real seconds — a stage's full requirement is reached over several
   *     repeated presses, never one long frozen channel. A full bout credits
   *     `WELL_WORK_SESSION_HOURS` of active work (plan `ui-input-004` §1) —
   *     deliberately decoupled from the ambient day/night clock, which would
   *     otherwise only pass ~0.4h of game time per 8s bout. The *measured*
   *     wall-clock fraction of the bout actually run (not the precomputed
   *     cap) is what gets credited on cancellation (Escape), so an
   *     interruption keeps exactly the work actually done, never rolling
   *     back stage/materials. */
  const workOnWell = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const well = bundle.playerWells.list().find((entry) => entry.id === id)
    if (!well) return
    // Materials may be carried or lying nearby the well itself (plan 187
    // §4/§5) — same small bounded radius, no teleport into inventory.
    const outcome = advanceWellConstruction({
      record: well,
      wells: bundle.playerWells,
      hasMaterial: (r) => hasMaterial(inventory, bundle.droppedItems, well.x, well.z, CONSTRUCTION_MATERIAL_RADIUS, r),
      consumeMaterial: (r) => consumeMaterial(inventory, bundle.droppedItems, well.x, well.z, CONSTRUCTION_MATERIAL_RADIUS, r),
      capabilities: { has: (c) => inventory.hasCapability(c) },
    })
    if (outcome.status === 'completed') return
    if (outcome.status === 'blocked') {
      if (outcome.missingCapability) {
        toast.show(`Potrzebujesz ${CAPABILITY_NEED_LABEL[outcome.missingCapability]}.`, 'error')
      } else {
        toast.show(
          `Potrzebujesz: ${outcome.missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`,
          'error',
        )
      }
      return
    }
    const { enteredNewStage, stage } = outcome
    if (enteredNewStage && wellStageRequirements(stage).length > 0) {
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
    }
    const workedSoFar = enteredNewStage ? 0 : well.workProgress
    const remainingHours = Math.max(0, wellStageWorkHours(stage, well.waterDepth) - workedSoFar)
    startRepresentedWork(
      remainingHours,
      WELL_WORK_SESSION_SEC / WELL_WORK_SESSION_HOURS,
      WELL_WORK_LABEL[stage],
      'moderate',
      'heavy',
      (hours) => {
        bundle.playerWells.addWork(id, hours, dayNight.elapsedDays)
        applyRepresentedPhysicalEffortVigor(player.needs.vigor, 'heavy', hours)
      },
    )
    if (stage === 'roof') {
      playActionWellConstruction(worldAudio.playAt, { x: well.x, z: well.z })
    }
  }

  const describeWellWork = (id: string): WellWorkView | null => {
    const well = bundle.playerWells.list().find((entry) => entry.id === id)
    if (!well) return null
    const stage = activeWellStage(well)
    if (!stage) return null
    const title = WELL_WORK_LABEL[stage]
    const missingCapability = wellStageCapabilities(stage, well.waterDepth).find((c) => !inventory.hasCapability(c))
    if (missingCapability) {
      return { title, description: '', canWork: false, reasonLabel: `Potrzebujesz ${CAPABILITY_NEED_LABEL[missingCapability]}.` }
    }
    const startingNewStage = stage !== well.stage
    if (startingNewStage) {
      // Read-only preflight (`workOnWell` is the only place that actually
      // spends materials) — reuses `wellStageRequirements` for the same
      // cost build, never `advanceWellConstruction` (which mutates).
      const requirements = wellStageRequirements(stage)
      const description = requirements.length > 0
        ? requirements.map((r) => {
          const b = materialAvailabilityBreakdown(inventory, bundle.droppedItems, well.x, well.z, CONSTRUCTION_MATERIAL_RADIUS, r)
          return `${ITEM_DEFS[r.kind].label}: ${b.available}/${b.required} — przy sobie ${b.inInventory} · w pobliżu ${b.nearbyWorld}`
        }).join('\n')
        : ''
      const missing = requirements.filter(
        (r) => !hasMaterial(inventory, bundle.droppedItems, well.x, well.z, CONSTRUCTION_MATERIAL_RADIUS, r),
      )
      if (missing.length > 0) {
        return {
          title,
          description,
          canWork: false,
          reasonLabel: `Brakuje: ${missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`,
        }
      }
      return { title, description, canWork: true, reasonLabel: '' }
    }
    const remainingHours = Math.max(0, wellStageWorkHours(stage, well.waterDepth) - well.workProgress)
    return { title, description: `Pozostało: ${remainingHours.toFixed(1)} h pracy.`, canWork: true, reasonLabel: '' }
  }

  const describeWellRoofRepair = (id: string): WellRoofRepairView | null => {
    const well = bundle.playerWells.list().find((entry) => entry.id === id)
    if (!well || !isWellCompleted(well)) return null
    const waterAvailable = isWellWaterAvailable(well)
    if (well.roofRepair) {
      return {
        title: 'Naprawa daszku studni',
        description: [
          `Stan przed naprawą: ${Math.round(well.roofRepair.startedCondition)} / 100`,
          `Cel: ${Math.round(well.roofRepair.targetCondition)} / 100`,
          `Postęp pracy: ${formatWorkDuration(well.roofRepair.completedWork)} / ${formatWorkDuration(well.roofRepair.requiredWork)}`,
          'Materiały: dostarczone',
        ].join('\n'),
        canAct: true,
        reasonLabel: '',
        mode: 'continue',
        waterAvailable: false,
      }
    }
    const quote = quoteWellRoofRepair(well, ctx.getWorldSeed(), dayNight.elapsedDays)
    if (!quote) return null
    const missing = quote.materials.filter(
      (r) => !hasMaterial(inventory, bundle.droppedItems, well.x, well.z, CONSTRUCTION_MATERIAL_RADIUS, r),
    )
    const materialLines = quote.materials.length > 0
      ? quote.materials.map((r) => `${r.count} × ${ITEM_DEFS[r.kind].label}`).join('\n')
      : 'brak'
    return {
      title: 'Napraw daszek studni',
      description: [
        `Stan: ${Math.round(quote.currentCondition)} / 100`,
        `Po naprawie: ${Math.round(quote.targetCondition)} / 100`,
        '',
        'Potrzebne materiały:',
        materialLines,
        '',
        'Czas pracy:',
        formatWorkDuration(quote.requiredWork),
      ].join('\n'),
      canAct: missing.length === 0,
      reasonLabel: missing.length > 0
        ? `Brakuje: ${missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`
        : '',
      mode: 'start',
      waterAvailable,
    }
  }

  const startRoofRepairBout = (id: string): void => {
    const well = bundle.playerWells.list().find((entry) => entry.id === id)
    if (!well?.roofRepair) return
    const remainingHours = repairRemainingWork(well.roofRepair)
    if (remainingHours <= 0) return
    startRepresentedWork(
      remainingHours,
      WELL_WORK_SESSION_SEC / WELL_WORK_SESSION_HOURS,
      WELL_ROOF_REPAIR_WORK_LABEL,
      'moderate',
      'heavy',
      (hours) => {
        const accepted = bundle.playerWells.contributeRoofRepairWork(id, hours, dayNight.elapsedDays)
        applyRepresentedPhysicalEffortVigor(player.needs.vigor, 'heavy', accepted)
      },
    )
    playActionWellConstruction(worldAudio.playAt, { x: well.x, z: well.z })
  }

  const workOnWellRoofRepair = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const well = bundle.playerWells.list().find((entry) => entry.id === id)
    if (!well || !isWellCompleted(well)) return
    if (!well.roofRepair) {
      const outcome = bundle.playerWells.startRoofRepair(
        id,
        dayNight.elapsedDays,
        (r) => hasMaterial(inventory, bundle.droppedItems, well.x, well.z, CONSTRUCTION_MATERIAL_RADIUS, r),
        (r) => consumeMaterial(inventory, bundle.droppedItems, well.x, well.z, CONSTRUCTION_MATERIAL_RADIUS, r),
      )
      if (outcome.status === 'blocked') {
        toast.show(
          `Potrzebujesz: ${outcome.missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`,
          'error',
        )
        return
      }
      if (outcome.status !== 'started') return
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
    }
    startRoofRepairBout(id)
  }

  /** Read-only quote/status for a settlement structure's shared repair target
   *  (plan settlements-007) — same shape/reuse-principle as
   *  `describeWellRoofRepair`: player material availability is checked from
   *  `Inventory` + nearby dropped items, never a household/settlement stock
   *  (implementation notes §8 — player repair stays player-supplied). */
  const describeStructureRepair = (settlementId: string, structureId: string, x: number, z: number): StructureRepairView | null => {
    const state = bundle.settlementsManager.getStructureSnapshot(settlementId, structureId, dayNight.elapsedDays)
    if (state.repair) {
      return {
        title: 'Naprawa budynku',
        description: [
          `Stan przed naprawą: ${Math.round(state.repair.startedCondition)} / 100`,
          `Cel: ${Math.round(state.repair.targetCondition)} / 100`,
          `Postęp pracy: ${formatWorkDuration(state.repair.completedWork)} / ${formatWorkDuration(state.repair.requiredWork)}`,
          'Materiały: dostarczone',
        ].join('\n'),
        canAct: true,
        reasonLabel: '',
        mode: 'continue',
      }
    }
    const quote = bundle.settlementsManager.quoteStructureRepair(settlementId, structureId, dayNight.elapsedDays)
    if (!quote) return null
    const missing = quote.materials.filter(
      (r) => !hasMaterial(inventory, bundle.droppedItems, x, z, CONSTRUCTION_MATERIAL_RADIUS, r),
    )
    const materialLines = quote.materials.length > 0
      ? quote.materials.map((r) => `${r.count} × ${ITEM_DEFS[r.kind].label}`).join('\n')
      : 'brak'
    return {
      title: 'Napraw budynek',
      description: [
        `Stan: ${Math.round(quote.currentCondition)} / 100`,
        `Po naprawie: ${Math.round(quote.targetCondition)} / 100`,
        '',
        'Potrzebne materiały:',
        materialLines,
        '',
        'Czas pracy:',
        formatWorkDuration(quote.requiredWork),
      ].join('\n'),
      canAct: missing.length === 0,
      reasonLabel: missing.length > 0
        ? `Brakuje: ${missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`
        : '',
      mode: 'start',
    }
  }

  const workOnStructureRepair = (settlementId: string, structureId: string, x: number, z: number): void => {
    if (isActionBlocked(ctx)) return
    const nowDays = dayNight.elapsedDays
    let state = bundle.settlementsManager.getStructureSnapshot(settlementId, structureId, nowDays)
    if (!state.repair) {
      const outcome = bundle.settlementsManager.beginStructureRepair({
        settlementId,
        structureId,
        nowDays,
        hasMaterial: (r) => hasMaterial(inventory, bundle.droppedItems, x, z, CONSTRUCTION_MATERIAL_RADIUS, r),
        consumeMaterial: (r) => consumeMaterial(inventory, bundle.droppedItems, x, z, CONSTRUCTION_MATERIAL_RADIUS, r),
      })
      if (outcome.status === 'blocked') {
        toast.show(
          `Potrzebujesz: ${outcome.missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`,
          'error',
        )
        return
      }
      if (outcome.status !== 'started') return
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      state = bundle.settlementsManager.getStructureSnapshot(settlementId, structureId, nowDays)
    }
    if (!state.repair) return
    const remainingHours = repairRemainingWork(state.repair)
    if (remainingHours <= 0) return
    startRepresentedWork(
      remainingHours,
      STRUCTURE_REPAIR_WORK_SESSION_SEC / STRUCTURE_REPAIR_WORK_SESSION_HOURS,
      'Naprawa budynku w toku…',
      'moderate',
      'heavy',
      (hours) => {
        const result = bundle.settlementsManager.contributeStructureRepairWork(settlementId, structureId, hours, dayNight.elapsedDays)
        applyRepresentedPhysicalEffortVigor(player.needs.vigor, 'heavy', result.acceptedWork)
      },
    )
  }

  /** Places a new player-built garden plot ahead of the player (plan 174 §1)

  /** Places a new player-built garden plot ahead of the player (plan 174 §1)
   *  — same shared-placement shape as a tent/trap/well, but single-stage:
   *  the shovel is required (never consumed, same as a well's `pit`) and the
   *  wood/stone cost is charged atomically when the placement channel
   *  completes, from inventory or nearby dropped items (plan 187's
   *  `constructionMaterials.ts`, the same construction-material seam a
   *  well's `well`/`roof` stages use) — no parallel material system. */
  const gardenPlacementDefinition = (): GroundPlacementDefinition<GardenPlacementReason> => ({
    aim: () => placementAimSite(
      player.mesh.position.x,
      player.mesh.position.z,
      mouseLook.state.yaw,
      GARDEN_PLACE_REACH,
    ),
    evaluate: (site) => {
      const reason = evaluateGroundPlacement({
        x: site.x,
        z: site.z,
        sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
        waterLevel: bundle.chunkManager.waterLevel,
        blockers: tentBlockers(site.x, site.z),
        peers: bundle.playerGardens.nodes(),
        footprintRadius: GARDEN_FOOTPRINT_RADIUS,
        separation: GARDEN_SEPARATION,
      })
      return reason === 'occupied' ? 'garden' : reason
    },
    footprintRadius: GARDEN_FOOTPRINT_RADIUS,
    previewFootprint: { kind: 'circle', radius: GARDEN_FOOTPRINT_RADIUS },
    reasonLabel: (reason) => GARDEN_PLACEMENT_MESSAGE[reason],
  })

  const previewGardenPlacement = (): PlacementPreviewResult => {
    const result = previewGroundPlacement(gardenPlacementDefinition())
    const missingCapability = inventory.hasCapability(GARDEN_CAPABILITY)
      ? undefined
      : `Potrzebujesz ${CAPABILITY_NEED_LABEL[GARDEN_CAPABILITY]}.`
    return withRequirements(result, gardenMaterialRequirements(), missingCapability)
  }

  const placeGardenAtAim = (): void => {
    if (isActionBlocked(ctx)) return
    if (!inventory.hasCapability(GARDEN_CAPABILITY)) {
      toast.show(`Potrzebujesz ${CAPABILITY_NEED_LABEL[GARDEN_CAPABILITY]}.`, 'error')
      return
    }
    const { site, reason } = evaluatePlacementSite(gardenPlacementDefinition())
    if (reason !== 'ok') {
      toast.show(GARDEN_PLACEMENT_MESSAGE[reason], 'error')
      return
    }
    const requirements = gardenMaterialRequirements()
    const missing = requirements.filter(
      (r) => !hasMaterial(inventory, bundle.droppedItems, site.x, site.z, CONSTRUCTION_MATERIAL_RADIUS, r),
    )
    if (missing.length > 0) {
      toast.show(
        `Potrzebujesz: ${missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`,
        'error',
      )
      return
    }
    busy.start(GARDEN_PLACE_DURATION_SEC, 'Budowa grządki…', () => {
      for (const r of requirements) {
        if (!consumeMaterial(inventory, bundle.droppedItems, site.x, site.z, CONSTRUCTION_MATERIAL_RADIUS, r)) return
      }
      bundle.playerGardens.place(site.x, site.z, site.yaw, dayNight.elapsedDays)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Zbudowano grządkę.')
    }, physicalEffortBusyOptions('moderate', dayNight.dayLengthSec))
  }

  /** "Zrób porządek" on a player garden plot (plan 176 §4/§10) — same
   *  revalidate-at-completion shape as `interactDryingRack`: the plot may
   *  have decayed away (`pruneDecayed`) while the busy channel was running,
   *  so `applyMaintenance` re-checks existence instead of trusting `id`. */
  const tidyGardenPlot = (id: string): void => {
    if (isActionBlocked(ctx)) return
    if (!bundle.playerGardens.list().some((g) => g.id === id)) return
    busy.start(maintenanceDurationSec(heldTool.held()), 'Porządkowanie grządki…', () => {
      const care = bundle.playerGardens.applyMaintenance(id, dayNight.elapsedDays)
      if (care === null) {
        toast.show('Grządka już zniknęła.', 'error')
        return
      }
      toast.show('Grządka uporządkowana.')
    })
  }

  /** Carried water-filled containers (waterskin or bucket) with at least
   *  `WATERING_LITRES` — the same shared liquid-container model
   *  `survivalActions.ts`'s waterskin fill/drink already uses, extended here
   *  to buckets since watering needs whichever container is holding water. */
  const carriedWaterContainers = (): LiquidContainerItemInstance[] =>
    LIQUID_CONTAINER_KIND_LIST.flatMap((kind) => inventory.getInstances(kind))
      .filter(isLiquidContainerInstance)
      .filter((inst) => hasLiquidContent(inst, 'water', WATERING_LITRES))

  /** "Podlej" on a player garden plot (plan settlements-npcs-001 §9/§11/§12)
   *  — same revalidate-at-completion shape as `tidyGardenPlot`. Consumes
   *  exactly `WATERING_LITRES` from a carried water container, never the
   *  whole container (implementation notes §8), leaving the rest usable. */
  const waterGardenPlot = (id: string): void => {
    if (isActionBlocked(ctx)) return
    if (!bundle.playerGardens.list().some((g) => g.id === id)) return
    if (carriedWaterContainers().length === 0) {
      toast.show('Potrzebujesz pojemnika z wodą.', 'error')
      return
    }
    busy.start(WATERING_DURATION_SEC, 'Podlewanie…', () => {
      if (!bundle.playerGardens.list().some((g) => g.id === id)) {
        toast.show('Grządka już zniknęła.', 'error')
        return
      }
      const container = carriedWaterContainers()[0]
      if (!container) {
        toast.show('Potrzebujesz pojemnika z wodą.', 'error')
        return
      }
      inventory.updateInstance(container.id, (inst) => drinkFromLiquidContainer(inst as LiquidContainerItemInstance, WATERING_LITRES)!)
      bundle.playerGardens.water(id, dayNight.elapsedDays)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Grządka podlana.')
    })
  }

  /** Plants a tree seed ahead of the player (plan 126 §1.2/§1.3): validates
   *  against nearby trees (procedural + already-planted — `getNearbyTrees`
   *  covers both, since a planted tree registers into the same
   *  `TreeLifecycle`) and settlement blockers via the shared
   *  `evaluateGroundPlacement`, same busy-channel shape as tent/trap/well.
   *  The seed is only spent when the channel completes and the world
   *  mutation actually succeeds. */
  const plantTreeAtAim = (): void => {
    if (!inventory.has('tree_seed', 1) || isActionBlocked(ctx)) return
    const yaw = mouseLook.state.yaw
    const x = player.mesh.position.x - Math.sin(yaw) * TREE_PLANT_REACH
    const z = player.mesh.position.z - Math.cos(yaw) * TREE_PLANT_REACH
    const peers = bundle.chunkManager.getNearbyTrees({ x, z }, TREE_PLANT_SEPARATION + 4)
    const reason = evaluateGroundPlacement({
      x,
      z,
      sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: tentBlockers(x, z),
      peers,
      footprintRadius: TREE_PLANT_FOOTPRINT_RADIUS,
      separation: TREE_PLANT_SEPARATION,
    })
    if (reason !== 'ok') {
      toast.show(TREE_PLANT_MESSAGE[reason], 'error')
      return
    }
    busy.start(TREE_PLANT_DURATION_SEC, 'Sadzenie drzewka…', () => {
      if (!inventory.remove('tree_seed', 1)) return
      const result = bundle.chunkManager.plantTree(x, z, yaw)
      if (!result) {
        inventory.add('tree_seed', 1)
        toast.show('Nie udało się zasadzić drzewka.', 'error')
        return
      }
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Zasadzono drzewko.')
    })
  }

  /** Plants a crop seed ahead of the player (plan 126 §2.3) — only within
   *  reach of a settlement garden, or a player-built garden plot (plan 174
   *  §2: same `isNearAnyGarden` mechanism, just a second, tighter-radius
   *  call — a player plot is one small bed, not a whole clearing). Otherwise
   *  the same validate-then-busy-channel shape as `plantTreeAtAim`. */
  const plantCropAtAim = (cropId: CropId): void => {
    const seedKind = CROP_SEED_ITEM[cropId]
    if (!inventory.has(seedKind, 1) || isActionBlocked(ctx)) return
    const yaw = mouseLook.state.yaw
    const x = player.mesh.position.x - Math.sin(yaw) * CROP_PLANT_REACH
    const z = player.mesh.position.z - Math.cos(yaw) * CROP_PLANT_REACH
    const settlementGardens = bundle.settlementsManager.getLoaded().flatMap((s) => s.landmarks.gardens)
    const nearGarden = isNearAnyGarden(x, z, settlementGardens)
      || isNearAnyGarden(x, z, bundle.playerGardens.nodes(), PLAYER_GARDEN_PLANT_RADIUS)
    if (!nearGarden) {
      toast.show(CROP_PLANT_MESSAGE.noGarden, 'error')
      return
    }
    const peers = bundle.chunkManager.getNearbyCrops({ x, z }, CROP_PLANT_SEPARATION + 3)
    const reason = evaluateGroundPlacement({
      x,
      z,
      sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: [],
      peers,
      footprintRadius: CROP_PLANT_FOOTPRINT_RADIUS,
      separation: CROP_PLANT_SEPARATION,
    })
    if (reason !== 'ok') {
      toast.show(CROP_PLANT_MESSAGE[reason], 'error')
      return
    }
    busy.start(CROP_PLANT_DURATION_SEC, 'Sadzenie…', () => {
      if (!inventory.remove(seedKind, 1)) return
      const result = bundle.chunkManager.plantCrop(x, z, cropId)
      if (!result) {
        inventory.add(seedKind, 1)
        toast.show('Nie udało się zasadzić.', 'error')
        return
      }
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Zasadzono.')
    })
  }

  /** Shared placement contract for a standing torch (plan items-player-009
   *  §1) — same shape as `tentPlacementDefinition` above; only the footprint/
   *  separation differ (a single post, not a footprint the player stands
   *  inside). */
  const standingTorchPlacementDefinition = (): GroundPlacementDefinition<StandingTorchPlacementReason> => ({
    aim: () => placementAimSite(
      player.mesh.position.x,
      player.mesh.position.z,
      mouseLook.state.yaw,
      STANDING_TORCH_PLACE_REACH,
    ),
    evaluate: (site) => {
      const reason = evaluateGroundPlacement({
        x: site.x,
        z: site.z,
        sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
        waterLevel: bundle.chunkManager.waterLevel,
        blockers: tentBlockers(site.x, site.z),
        peers: bundle.standingTorches.nodes(),
        footprintRadius: STANDING_TORCH_FOOTPRINT_RADIUS,
        separation: STANDING_TORCH_SEPARATION,
      })
      return reason === 'occupied' ? 'torch' : reason
    },
    footprintRadius: STANDING_TORCH_FOOTPRINT_RADIUS,
    previewFootprint: { kind: 'circle', radius: STANDING_TORCH_FOOTPRINT_RADIUS },
    reasonLabel: (reason) => STANDING_TORCH_PLACEMENT_MESSAGE[reason],
  })

  const previewStandingTorchPlacement = (): PlacementPreviewResult =>
    withRequirements(previewGroundPlacement(standingTorchPlacementDefinition()), STANDING_TORCH_MATERIAL_REQUIREMENTS)

  /** Places a new standing torch ahead of the player (plan items-player-009
   *  §1/§2/§3) — same "validate, then busy-channel, consume+build only on
   *  completion" shape as `placeGardenAtAim`. No capability/tool is required
   *  to build (only to `Ignite` later). */
  const placeStandingTorchAtAim = (): void => {
    if (isActionBlocked(ctx)) return
    const { site, reason } = evaluatePlacementSite(standingTorchPlacementDefinition())
    if (reason !== 'ok') {
      toast.show(STANDING_TORCH_PLACEMENT_MESSAGE[reason], 'error')
      return
    }
    const missing = STANDING_TORCH_MATERIAL_REQUIREMENTS.filter(
      (r) => !hasMaterial(inventory, bundle.droppedItems, site.x, site.z, CONSTRUCTION_MATERIAL_RADIUS, r),
    )
    if (missing.length > 0) {
      toast.show(
        `Potrzebujesz: ${missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`,
        'error',
      )
      return
    }
    busy.start(STANDING_TORCH_PLACE_DURATION_SEC, 'Stawianie pochodni…', () => {
      for (const r of STANDING_TORCH_MATERIAL_REQUIREMENTS) {
        if (!consumeMaterial(inventory, bundle.droppedItems, site.x, site.z, CONSTRUCTION_MATERIAL_RADIUS, r)) return
      }
      bundle.standingTorches.place(site.x, site.z, site.yaw)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Rozpoczęto budowę pochodni.')
    })
  }

  /** `[E]` ignites an unlit, *completed* standing torch (plan items-player-009
   *  §4, gated on construction by items-player-017 §11) — the same
   *  "re-resolve by id, check capability, mutate" shape the plan requires;
   *  `fire_starting` is only needed here, never for placement.
   *  `StandingTorches.ignite` itself is the authoritative completion gate. */
  const igniteStandingTorch = (id: string): void => {
    if (isActionBlocked(ctx)) return
    if (!inventory.hasCapability('fire_starting')) {
      toast.show(`Potrzebujesz ${CAPABILITY_NEED_LABEL.fire_starting}.`, 'error')
      return
    }
    if (bundle.standingTorches.ignite(id, dayNight.elapsedDays)) toast.show('Zapalono pochodnię.')
  }

  /** Runs one active-work bout on an unfinished standing torch (plan
   *  items-player-017 §11) — same "measured wall-clock fraction credited on
   *  cancel" shape as `workOnWell`, through the actor-neutral `contributeWork`
   *  seam shared with NPC contract execution. No-op if `id` is unknown or
   *  already complete. */
  const workOnStandingTorch = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const torch = bundle.standingTorches.list().find((entry) => entry.id === id)
    if (!torch || isStandingTorchConstructionComplete(torch)) return
    startRepresentedWork(
      standingTorchRemainingWork(torch),
      STANDING_TORCH_WORK_SESSION_SEC / STANDING_TORCH_WORK_SESSION_HOURS,
      'Budowa pochodni w toku…',
      'light',
      'light',
      (hours) => {
        bundle.standingTorches.contributeWork(id, hours)
        applyRepresentedPhysicalEffortVigor(player.needs.vigor, 'light', hours)
      },
    )
  }

  const describeStandingTorchWork = (id: string): ConstructionActionView | null => {
    const torch = bundle.standingTorches.list().find((entry) => entry.id === id)
    if (!torch || isStandingTorchConstructionComplete(torch)) return null
    return { canWork: true, reasonLabel: '' }
  }

  const playerTroughPlacementDefinition = (): GroundPlacementDefinition<PlayerTroughPlacementReason> => ({
    aim: () => placementAimSite(
      player.mesh.position.x,
      player.mesh.position.z,
      mouseLook.state.yaw,
      PLAYER_TROUGH_PLACE_REACH,
    ),
    evaluate: (site) => {
      const reason = evaluateGroundPlacement({
        x: site.x,
        z: site.z,
        sampleHeight: (x, z) => bundle.chunkManager.sampleHeight(x, z),
        waterLevel: bundle.chunkManager.waterLevel,
        blockers: tentBlockers(site.x, site.z),
        peers: bundle.playerTroughs.nodes(),
        footprintRadius: PLAYER_TROUGH_FOOTPRINT_RADIUS,
        separation: PLAYER_TROUGH_SEPARATION,
      })
      return reason === 'occupied' ? 'trough' : reason
    },
    footprintRadius: PLAYER_TROUGH_FOOTPRINT_RADIUS,
    previewFootprint: { kind: 'circle', radius: PLAYER_TROUGH_FOOTPRINT_RADIUS },
    reasonLabel: (reason) => PLAYER_TROUGH_PLACEMENT_MESSAGE[reason],
  })

  const previewPlayerTroughPlacement = (): PlacementPreviewResult =>
    withRequirements(previewGroundPlacement(playerTroughPlacementDefinition()), PLAYER_TROUGH_MATERIAL_REQUIREMENTS)

  const placePlayerTroughAtAim = (): void => {
    if (isActionBlocked(ctx)) return
    const { site, reason } = evaluatePlacementSite(playerTroughPlacementDefinition())
    if (reason !== 'ok') {
      toast.show(PLAYER_TROUGH_PLACEMENT_MESSAGE[reason], 'error')
      return
    }
    const missing = PLAYER_TROUGH_MATERIAL_REQUIREMENTS.filter(
      (r) => !inventory.has(r.kind, r.count),
    )
    if (missing.length > 0) {
      toast.show('Brakuje materiałów na koryto.', 'error')
      return
    }
    busy.start(PLAYER_TROUGH_PLACE_DURATION_SEC, 'Stawianie koryta…', () => {
      const { reason: confirmReason } = evaluatePlacementSite(playerTroughPlacementDefinition())
      if (confirmReason !== 'ok') {
        toast.show(PLAYER_TROUGH_PLACEMENT_MESSAGE[confirmReason], 'error')
        return
      }
      for (const r of PLAYER_TROUGH_MATERIAL_REQUIREMENTS) {
        if (!consumeMaterial(inventory, bundle.droppedItems, site.x, site.z, CONSTRUCTION_MATERIAL_RADIUS, r)) return
      }
      bundle.playerTroughs.place(site.x, site.z, site.yaw)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Rozpoczęto budowę koryta.')
    })
  }

  const workOnPlayerTrough = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const trough = bundle.playerTroughs.list().find((entry) => entry.id === id)
    if (!trough || isPlayerTroughConstructionComplete(trough)) return
    startRepresentedWork(
      playerTroughRemainingWork(trough),
      PLAYER_TROUGH_WORK_SESSION_SEC / PLAYER_TROUGH_WORK_SESSION_HOURS,
      'Budowa koryta w toku…',
      'moderate',
      'moderate',
      (hours) => {
        bundle.playerTroughs.contributeWork(id, hours)
        applyRepresentedPhysicalEffortVigor(player.needs.vigor, 'moderate', hours)
      },
    )
  }

  const describePlayerTroughWork = (id: string): ConstructionActionView | null => {
    const trough = bundle.playerTroughs.list().find((entry) => entry.id === id)
    if (!trough || isPlayerTroughConstructionComplete(trough)) return null
    return { canWork: true, reasonLabel: '' }
  }

  const describePlayerTroughFill = (id: string): ConstructionActionView | null => {
    const trough = bundle.playerTroughs.list().find((entry) => entry.id === id)
    if (!trough || !isPlayerTroughConstructionComplete(trough)) return null
    if (playerTroughFreeCapacity(trough) <= 0) {
      return { canWork: false, reasonLabel: 'Koryto jest pełne.' }
    }
    if (carriedWaterContainersForTrough().length === 0) {
      return { canWork: false, reasonLabel: 'Potrzebujesz pojemnika z wodą.' }
    }
    return { canWork: true, reasonLabel: '' }
  }

  const carriedWaterContainersForTrough = (): LiquidContainerItemInstance[] =>
    LIQUID_CONTAINER_KIND_LIST.flatMap((kind) => inventory.getInstances(kind))
      .filter(isLiquidContainerInstance)
      .filter((inst) => inst.liquid === 'water' && inst.amountLitres > 0)

  const fillPlayerTrough = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const trough = bundle.playerTroughs.list().find((entry) => entry.id === id)
    if (!trough || !isPlayerTroughConstructionComplete(trough)) return
    if (playerTroughFreeCapacity(trough) <= 0) {
      toast.show('Koryto jest pełne.', 'error')
      return
    }
    if (carriedWaterContainersForTrough().length === 0) {
      toast.show('Potrzebujesz pojemnika z wodą.', 'error')
      return
    }
    busy.start(PLAYER_TROUGH_FILL_DURATION_SEC, 'Napełnianie koryta…', () => {
      const liveTrough = bundle.playerTroughs.list().find((entry) => entry.id === id)
      if (!liveTrough || !isPlayerTroughConstructionComplete(liveTrough)) {
        toast.show('Koryto już zniknęło.', 'error')
        return
      }
      const freeCapacity = playerTroughFreeCapacity(liveTrough)
      if (freeCapacity <= 0) {
        toast.show('Koryto jest pełne.', 'error')
        return
      }
      const container = carriedWaterContainersForTrough()[0]
      if (!container || container.liquid !== 'water' || container.amountLitres <= 0) {
        toast.show('Potrzebujesz pojemnika z wodą.', 'error')
        return
      }
      const transfer = Math.min(container.amountLitres, freeCapacity)
      const poured = bundle.playerTroughs.addWater(id, transfer)
      if (poured <= 0) return
      inventory.updateInstance(container.id, (inst) => pourLiquidFromContainer(inst as LiquidContainerItemInstance, poured)!)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show(`Dodano ${poured} l wody do koryta.`)
    })
  }

  /** Shared placement contract for a palisade segment (plan items-player-010
   *  §1/§4) — `aim` resolves the player's raw reach point and then, via
   *  `resolvePalisadeSite`, snaps it onto the nearest existing segment
   *  endpoint within `PALISADE_SNAP_RADIUS` (pure math in `world/palisade.ts`
   *  — no palisade-specific placement/collision system, just this object's
   *  own footprint/separation fed into the same `evaluateGroundPlacement`
   *  every other placeable uses). `evaluate` re-validates the *resolved*
   *  (possibly snapped) site — a rejected snap site still shows as invalid,
   *  it never silently falls back to the raw aim point. */
  const palisadePlacementDefinition = (objectYaw?: number): GroundPlacementDefinition<PalisadePlacementReason> => ({
    aim: () => {
      const raw = placementAimSite(
        player.mesh.position.x,
        player.mesh.position.z,
        mouseLook.state.yaw,
        PALISADE_PLACE_REACH,
        objectYaw,
      )
      return resolvePalisadeSite(raw, bundle.palisades.nodes())
    },
    evaluate: (site) => {
      const reason = evaluateGroundPlacement({
        x: site.x,
        z: site.z,
        sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
        waterLevel: bundle.chunkManager.waterLevel,
        blockers: tentBlockers(site.x, site.z),
        peers: bundle.palisades.nodes(),
        footprintRadius: PALISADE_FOOTPRINT_RADIUS,
        separation: PALISADE_SEPARATION,
      })
      return reason === 'occupied' ? 'palisade' : reason
    },
    footprintRadius: PALISADE_FOOTPRINT_RADIUS,
    previewFootprint: { kind: 'box', width: PALISADE_FOOTPRINT_RADIUS * 2, depth: PALISADE_LENGTH },
    reasonLabel: (reason) => PALISADE_PLACEMENT_MESSAGE[reason],
  })

  const previewPalisadePlacement = (objectYaw?: number): PlacementPreviewResult =>
    withRequirements(previewGroundPlacement(palisadePlacementDefinition(objectYaw)), PALISADE_MATERIAL_REQUIREMENTS)

  /** Places a new palisade segment ahead of the player (plan items-player-010
   *  §1/§2/§3/§4) — same "validate the resolved site, then busy-channel,
   *  consume+build only on completion" shape as `placeStandingTorchAtAim`;
   *  the site (including any snap) is re-resolved and re-validated here, at
   *  confirm time, never trusted from a cached preview result. */
  const placePalisadeAtAim = (objectYaw?: number): void => {
    if (isActionBlocked(ctx)) return
    const { site, reason } = evaluatePlacementSite(palisadePlacementDefinition(objectYaw))
    if (reason !== 'ok') {
      toast.show(PALISADE_PLACEMENT_MESSAGE[reason], 'error')
      return
    }
    const missing = PALISADE_MATERIAL_REQUIREMENTS.filter(
      (r) => !hasMaterial(inventory, bundle.droppedItems, site.x, site.z, CONSTRUCTION_MATERIAL_RADIUS, r),
    )
    if (missing.length > 0) {
      toast.show(
        `Potrzebujesz: ${missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`,
        'error',
      )
      return
    }
    busy.start(PALISADE_PLACE_DURATION_SEC, 'Stawianie segmentu palisady…', () => {
      for (const r of PALISADE_MATERIAL_REQUIREMENTS) {
        if (!consumeMaterial(inventory, bundle.droppedItems, site.x, site.z, CONSTRUCTION_MATERIAL_RADIUS, r)) return
      }
      bundle.palisades.place(site.x, site.z, site.yaw)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Rozpoczęto budowę segmentu palisady.')
    })
  }

  /** Runs one active-work bout on an unfinished palisade segment (plan
   *  items-player-017 §10) — same shape as `workOnStandingTorch`. No-op if
   *  `id` is unknown or already complete. */
  const workOnPalisade = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const segment = bundle.palisades.list().find((entry) => entry.id === id)
    if (!segment || isPalisadeConstructionComplete(segment)) return
    startRepresentedWork(
      palisadeRemainingWork(segment),
      PALISADE_WORK_SESSION_SEC / PALISADE_WORK_SESSION_HOURS,
      'Budowa segmentu palisady w toku…',
      'moderate',
      'moderate',
      (hours) => {
        bundle.palisades.contributeWork(id, hours)
        applyRepresentedPhysicalEffortVigor(player.needs.vigor, 'moderate', hours)
      },
    )
  }

  const describePalisadeWork = (id: string): ConstructionActionView | null => {
    const segment = bundle.palisades.list().find((entry) => entry.id === id)
    if (!segment || isPalisadeConstructionComplete(segment)) return null
    return { canWork: true, reasonLabel: '' }
  }

  /** `[R]` removes one palisade segment (plan items-player-010 §5/§6/§7,
   *  extended by items-player-017 §17) — the generic removal/recovery seam:
   *  preflight `canReceiveRecovery` before touching any authoritative state,
   *  remove the segment, then add the recovered materials — never the
   *  reverse, and never partial. Any active Work Contract still referencing
   *  this segment is invalidated in the same step, so a committed NPC never
   *  keeps travelling/working toward a now-missing target. */
  const previewPalisadeRemoval = (id: string): RemovalPreview | null => {
    if (!bundle.palisades.list().some((entry) => entry.id === id)) return null
    return removalPreview(PALISADE_MATERIAL_REQUIREMENTS, PALISADE_RECOVERY_RATE)
  }

  const removePalisadeSegment = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const preview = previewPalisadeRemoval(id)
    if (!preview) return
    if (!preview.canReceive) {
      toast.show(preview.reasonLabel, 'error')
      return
    }
    if (!bundle.palisades.remove(id)) return
    const contract = bundle.workContracts.findByTarget({ kind: 'palisade', targetId: id })
    if (contract) bundle.workContracts.invalidateTarget(contract.id, { now: dayNight.elapsedDays })
    applyRecovery(inventory, preview.recovered)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show('Usunięto segment palisady.')
  }

  /** Shared placement contract for a bedroll (plan items-player-013) — same
   *  shape as `standingTorchPlacementDefinition`. */
  const bedrollPlacementDefinition = (objectYaw?: number): GroundPlacementDefinition<BedrollPlacementReason> => ({
    aim: () => placementAimSite(
      player.mesh.position.x,
      player.mesh.position.z,
      mouseLook.state.yaw,
      BEDROLL_PLACE_REACH,
      objectYaw,
    ),
    evaluate: (site) => {
      const reason = evaluateGroundPlacement({
        x: site.x,
        z: site.z,
        sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
        waterLevel: bundle.chunkManager.waterLevel,
        blockers: tentBlockers(site.x, site.z),
        peers: bundle.sleepingUtilities.bedrolls.nodes(),
        footprintRadius: BEDROLL_FOOTPRINT_RADIUS,
        separation: BEDROLL_SEPARATION,
      })
      return reason === 'occupied' ? 'bedroll' : reason
    },
    footprintRadius: BEDROLL_FOOTPRINT_RADIUS,
    previewFootprint: { kind: 'box', width: BEDROLL_WIDTH, depth: BEDROLL_LENGTH },
    reasonLabel: (reason) => BEDROLL_PLACEMENT_MESSAGE[reason],
  })

  const previewBedrollPlacement = (objectYaw?: number): PlacementPreviewResult =>
    withRequirements(previewGroundPlacement(bedrollPlacementDefinition(objectYaw)), BEDROLL_MATERIAL_REQUIREMENTS)

  /** Places a new leather bedroll ahead of the player (plan items-player-013)
   *  — same "validate, then busy-channel, consume+build only on completion"
   *  shape as `placeStandingTorchAtAim`. No capability/tool is required. */
  const placeBedrollAtAim = (objectYaw?: number, lifecycle?: PlacementMutationLifecycle): void => {
    if (isActionBlocked(ctx)) {
      lifecycle?.onComplete?.('failure')
      return
    }
    const { site, reason } = evaluatePlacementSite(bedrollPlacementDefinition(objectYaw))
    if (reason !== 'ok') {
      toast.show(BEDROLL_PLACEMENT_MESSAGE[reason], 'error')
      lifecycle?.onComplete?.('failure')
      return
    }
    const missing = BEDROLL_MATERIAL_REQUIREMENTS.filter(
      (r) => !hasMaterial(inventory, bundle.droppedItems, site.x, site.z, CONSTRUCTION_MATERIAL_RADIUS, r),
    )
    if (missing.length > 0) {
      toast.show(
        `Potrzebujesz: ${missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`,
        'error',
      )
      lifecycle?.onComplete?.('failure')
      return
    }
    busy.start(BEDROLL_PLACE_DURATION_SEC, 'Rozkładanie posłania…', () => {
      for (const r of BEDROLL_MATERIAL_REQUIREMENTS) {
        if (!consumeMaterial(inventory, bundle.droppedItems, site.x, site.z, CONSTRUCTION_MATERIAL_RADIUS, r)) {
          lifecycle?.onComplete?.('failure')
          return
        }
      }
      const bedroll = bundle.sleepingUtilities.bedrolls.place(site.x, site.z, site.yaw, dayNight.elapsedDays, 'leather')
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Rozłożono posłanie.')
      lifecycle?.onComplete?.('success', bedroll.id)
    }, { onCancel: () => lifecycle?.onCancel?.() })
  }

  /** Shared placement contract for a raised sleeping platform (plan
   *  items-player-013) — same shape as `bedrollPlacementDefinition`. */
  const platformPlacementDefinition = (objectYaw?: number): GroundPlacementDefinition<PlatformPlacementReason> => ({
    aim: () => placementAimSite(
      player.mesh.position.x,
      player.mesh.position.z,
      mouseLook.state.yaw,
      PLATFORM_PLACE_REACH,
      objectYaw,
    ),
    evaluate: (site) => {
      const reason = evaluateGroundPlacement({
        x: site.x,
        z: site.z,
        sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
        waterLevel: bundle.chunkManager.waterLevel,
        blockers: tentBlockers(site.x, site.z),
        peers: bundle.sleepingUtilities.platforms.nodes(),
        footprintRadius: PLATFORM_FOOTPRINT_RADIUS,
        separation: PLATFORM_SEPARATION,
      })
      return reason === 'occupied' ? 'platform' : reason
    },
    footprintRadius: PLATFORM_FOOTPRINT_RADIUS,
    previewFootprint: { kind: 'box', width: PLATFORM_FOOTPRINT_WIDTH, depth: PLATFORM_FOOTPRINT_LENGTH },
    reasonLabel: (reason) => PLATFORM_PLACEMENT_MESSAGE[reason],
  })

  const previewPlatformPlacement = (objectYaw?: number): PlacementPreviewResult =>
    withRequirements(previewGroundPlacement(platformPlacementDefinition(objectYaw)), PLATFORM_MATERIAL_REQUIREMENTS)

  /** Places a new raised sleeping platform ahead of the player (plan
   *  items-player-013) — same shape as `placeBedrollAtAim`. */
  const placePlatformAtAim = (objectYaw?: number, lifecycle?: PlacementMutationLifecycle): void => {
    if (isActionBlocked(ctx)) {
      lifecycle?.onComplete?.('failure')
      return
    }
    const { site, reason } = evaluatePlacementSite(platformPlacementDefinition(objectYaw))
    if (reason !== 'ok') {
      toast.show(PLATFORM_PLACEMENT_MESSAGE[reason], 'error')
      lifecycle?.onComplete?.('failure')
      return
    }
    const missing = PLATFORM_MATERIAL_REQUIREMENTS.filter(
      (r) => !hasMaterial(inventory, bundle.droppedItems, site.x, site.z, CONSTRUCTION_MATERIAL_RADIUS, r),
    )
    if (missing.length > 0) {
      toast.show(
        `Potrzebujesz: ${missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`,
        'error',
      )
      lifecycle?.onComplete?.('failure')
      return
    }
    busy.start(PLATFORM_PLACE_DURATION_SEC, 'Budowa podestu…', () => {
      for (const r of PLATFORM_MATERIAL_REQUIREMENTS) {
        if (!consumeMaterial(inventory, bundle.droppedItems, site.x, site.z, CONSTRUCTION_MATERIAL_RADIUS, r)) {
          lifecycle?.onComplete?.('failure')
          return
        }
      }
      const platform = bundle.sleepingUtilities.platforms.place(site.x, site.z, site.yaw, dayNight.elapsedDays)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Zbudowano podest do spania.')
      lifecycle?.onComplete?.('success', platform.id)
    }, { onCancel: () => lifecycle?.onCancel?.() })
  }

  const settlementIdAt = (x: number, z: number): string | null => {
    const def = bundle.settlementsManager.peekDef(worldToCell(x, z))
    if (!def) return null
    if (Math.hypot(x - def.x, z - def.z) > villageSizeConfig(def.size).footprintRadius) return null
    return def.id
  }

  let nextHousePrepId = 0

  const housePlacementDefinition = (
    kind: ResidentialBuildingKind,
    objectYaw?: number,
  ): GroundPlacementDefinition<ResidentialPlacementReason> => {
    const def = residentialBuildingDefinition(kind)
    const footprintRadius = residentialBuildingFootprintRadius(kind)
    return {
      aim: () => placementAimSite(
        player.mesh.position.x,
        player.mesh.position.z,
        mouseLook.state.yaw,
        residentialBuildingPlaceReach(kind),
        objectYaw,
      ),
      evaluate: (site) => {
        const reason = evaluateOrientedGroundPlacement({
          x: site.x,
          z: site.z,
          yaw: site.yaw,
          width: def.footprint.width,
          depth: def.footprint.depth,
          sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
          waterLevel: bundle.chunkManager.waterLevel,
          blockers: tentBlockers(site.x, site.z),
          peers: bundle.residentialBuildings.nodes(),
          footprintRadius,
          separation: residentialBuildingSeparation(kind),
        })
        return reason === 'occupied' ? 'house' : reason
      },
      footprintRadius,
      previewFootprint: { kind: 'box', width: def.footprint.width, depth: def.footprint.depth },
      reasonLabel: (reason) => RESIDENTIAL_PLACEMENT_MESSAGE[reason],
    }
  }

  const tryStartHouseTerrainPrep = (kind: ResidentialBuildingKind, x: number, z: number): boolean => {
    if (!inventory.hasCapability('soil_digging')) {
      toast.show(`Potrzebujesz ${CAPABILITY_NEED_LABEL.soil_digging}.`, 'error')
      return false
    }
    const def = residentialBuildingDefinition(kind)
    const size = coveringPreparationSize(def.footprint.width, def.footprint.depth)
    const chunkManager = bundle.chunkManager
    const { center, samples } = resolvePreparationSamples(x, z, size, chunkManager.chunkSize, chunkManager.resolution)
    const originalHeights = samples.map((s) => ({ x: s.x, z: s.z, height: chunkManager.sampleHeight(s.x, s.z) }))
    const targetHeight = originalHeights.reduce((sum, s) => sum + s.height, 0) / originalHeights.length
    const env: DigEnv = {
      sampleHeight: chunkManager.sampleHeight,
      sampleMountainRidge: chunkManager.sampleMountainRidge,
      waterLevel: chunkManager.waterLevel,
      seed: chunkManager.seed,
    }
    const validation = validatePreparationSamples(originalHeights, targetHeight, env)
    if (!validation.ok) {
      toast.show(
        validation.reason === 'water' ? 'Tu jest za mokro na chatę.' : 'Teren jest zbyt stromy.',
        'error',
      )
      return false
    }
    const requiredWork = computeRequiredWork(size * size, averageAbsHeightDelta(originalHeights, targetHeight))
    const record: TerrainPreparationRecord = {
      id: `terrainPrep:${Date.now()}:${nextHousePrepId++}`,
      center,
      size,
      targetHeight,
      originalHeights,
      requiredWork,
      completedWork: 0,
      status: 'active',
    }
    bundle.terrainPreparations.place(record)
    toast.show('Teren jest zbyt stromy. Rozpoczęto przygotowanie terenu — podejdź do znacznika, by pracować.')
    return true
  }

  const placeHouseAtAim = (kind: ResidentialBuildingKind, objectYaw?: number): void => {
    if (isActionBlocked(ctx)) return
    const { site, reason } = evaluatePlacementSite(housePlacementDefinition(kind, objectYaw))
    if (reason === 'slope') {
      tryStartHouseTerrainPrep(kind, site.x, site.z)
      return
    }
    if (reason !== 'ok') {
      toast.show(RESIDENTIAL_PLACEMENT_MESSAGE[reason], 'error')
      return
    }
    const label = residentialBuildingDefinition(kind).label
    busy.start(RESIDENTIAL_BUILDING_PLACE_DURATION_SEC, `Wyznaczanie miejsca: ${label}…`, () => {
      const { site: freshSite, reason: freshReason } = evaluatePlacementSite(housePlacementDefinition(kind, objectYaw))
      if (freshReason === 'slope') {
        tryStartHouseTerrainPrep(kind, freshSite.x, freshSite.z)
        return
      }
      if (freshReason !== 'ok') {
        toast.show(RESIDENTIAL_PLACEMENT_MESSAGE[freshReason], 'error')
        return
      }
      bundle.residentialBuildings.place(
        kind,
        freshSite.x,
        freshSite.z,
        freshSite.yaw,
        settlementIdAt(freshSite.x, freshSite.z),
      )
      toast.show(`Rozpoczęto budowę: ${label}.`)
    })
  }

  const previewHousePlacement = (kind: ResidentialBuildingKind, objectYaw?: number): PlacementPreviewResult => {
    const def = housePlacementDefinition(kind, objectYaw)
    const { site, reason } = evaluatePlacementSite(def)
    if (reason === 'slope') {
      const canDig = inventory.hasCapability('soil_digging')
      const presentation = derivePlacementPresentation({
        geometryOk: false,
        geometryReason: RESIDENTIAL_PLACEMENT_MESSAGE.slope,
        requirements: placementRequirementViews(
          inventory,
          bundle.droppedItems,
          site.x,
          site.z,
          residentialTotalRequirements(kind),
        ),
        preparation: {
          canConfirm: canDig,
          reasonLabel: canDig
            ? 'Teren jest zbyt stromy. Przygotuj teren, aby postawić chatę.'
            : `Potrzebujesz ${CAPABILITY_NEED_LABEL.soil_digging}.`,
        },
      })
      return {
        x: site.x,
        z: site.z,
        yaw: site.yaw,
        footprintRadius: def.footprintRadius,
        footprint: def.previewFootprint,
        ...presentation,
      }
    }
    return withRequirements(
      previewGroundPlacement(def),
      residentialTotalRequirements(kind),
    )
  }

  const previewSmallHousePlacement = (objectYaw?: number): PlacementPreviewResult =>
    previewHousePlacement('small_house', objectYaw)
  const previewMediumHousePlacement = (objectYaw?: number): PlacementPreviewResult =>
    previewHousePlacement('medium_house', objectYaw)
  const placeSmallHouseAtAim = (objectYaw?: number): void => placeHouseAtAim('small_house', objectYaw)
  const placeMediumHouseAtAim = (objectYaw?: number): void => placeHouseAtAim('medium_house', objectYaw)

  const supplyResidentialBuildingMaterials = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const house = bundle.residentialBuildings.find(id)
    if (!house || !isResidentialBuildingMaterialBlocked(house)) return
    const stage = house.stage
    if (stage === 'completed') return
    const missing = residentialStageRequirements(house.kind, stage).filter(
      (r) => !hasMaterial(inventory, bundle.droppedItems, house.x, house.z, CONSTRUCTION_MATERIAL_RADIUS, r),
    )
    if (missing.length > 0) {
      toast.show(
        `Potrzebujesz: ${missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`,
        'error',
      )
      return
    }
    for (const r of residentialStageRequirements(house.kind, stage)) {
      if (!consumeMaterial(inventory, bundle.droppedItems, house.x, house.z, CONSTRUCTION_MATERIAL_RADIUS, r)) return
    }
    bundle.residentialBuildings.supplyMaterials(id)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show('Dostarczono materiały.')
  }

  const workOnResidentialBuilding = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const house = bundle.residentialBuildings.find(id)
    if (!house || isResidentialBuildingComplete(house) || isResidentialBuildingMaterialBlocked(house)) return
    const remaining = residentialBuildingRemainingWork(house)
    if (remaining <= 0) return
    startRepresentedWork(
      remaining,
      RESIDENTIAL_BUILDING_WORK_SESSION_SEC / RESIDENTIAL_BUILDING_WORK_SESSION_HOURS,
      'Budowa chaty w toku…',
      'moderate',
      'moderate',
      (hours) => {
        bundle.residentialBuildings.contributeWork(id, hours)
        applyRepresentedPhysicalEffortVigor(player.needs.vigor, 'moderate', hours)
      },
    )
  }

  const describeResidentialWork = (id: string): ResidentialWorkView | null => {
    const house = bundle.residentialBuildings.find(id)
    if (!house || isResidentialBuildingComplete(house)) return null
    if (isResidentialBuildingMaterialBlocked(house) && house.stage !== 'completed') {
      const missing = residentialStageRequirements(house.kind, house.stage).filter(
        (r) => !hasMaterial(inventory, bundle.droppedItems, house.x, house.z, CONSTRUCTION_MATERIAL_RADIUS, r),
      )
      const supplyReason = missing.length > 0
        ? `Brakuje: ${missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`
        : ''
      return {
        canWork: false,
        workReasonLabel: 'Najpierw dostarcz materiały bieżącego etapu.',
        canSupply: missing.length === 0,
        supplyReasonLabel: supplyReason,
      }
    }
    return {
      canWork: residentialBuildingRemainingWork(house) > 0,
      workReasonLabel: '',
      canSupply: false,
      supplyReasonLabel: '',
    }
  }

  const previewResidentialCancel = (id: string): RemovalPreview | null => {
    const house = bundle.residentialBuildings.find(id)
    if (!house || isResidentialBuildingComplete(house)) return null
    const recovered = house.materialsSupplied && house.stage !== 'completed'
      ? [...residentialStageRequirements(house.kind, house.stage)]
      : []
    const canReceive = recovered.length === 0 || canReceiveRecovery(inventory, recovered)
    return {
      recovered,
      canReceive,
      reasonLabel: canReceive ? '' : 'Brak miejsca w ekwipunku na odzyskane materiały.',
      body: formatRecoveryLines(recovered),
    }
  }

  const cancelResidentialBuilding = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const preview = previewResidentialCancel(id)
    if (!preview) return
    if (!preview.canReceive) {
      toast.show(preview.reasonLabel, 'error')
      return
    }
    if (!bundle.residentialBuildings.remove(id)) return
    const contract = bundle.workContracts.findByTarget({ kind: 'residential_building', targetId: id })
    if (contract) bundle.workContracts.invalidateTarget(contract.id, { now: dayNight.elapsedDays })
    if (preview.recovered.length > 0) applyRecovery(inventory, preview.recovered)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show('Anulowano budowę chaty.')
  }

  const previewWellCancel = (id: string): RemovalPreview | null => {
    const well = bundle.playerWells.list().find((entry) => entry.id === id)
    if (!well || isWellCompleted(well)) return null
    const requirements = well.stage === 'pit' ? [] : wellStageRequirements(well.stage)
    return removalPreview(requirements, WELL_RECOVERY_RATE)
  }

  const cancelPlayerWell = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const preview = previewWellCancel(id)
    if (!preview) return
    if (!preview.canReceive) {
      toast.show(preview.reasonLabel, 'error')
      return
    }
    if (!bundle.playerWells.remove(id)) return
    const contract = bundle.workContracts.findByTarget({ kind: 'construction', targetId: id })
    if (contract) bundle.workContracts.invalidateTarget(contract.id, { now: dayNight.elapsedDays })
    applyRecovery(inventory, preview.recovered)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show('Anulowano budowę studni.')
  }

  const previewStandingTorchRemoval = (id: string): RemovalPreview | null => {
    if (!bundle.standingTorches.list().some((entry) => entry.id === id)) return null
    return removalPreview(STANDING_TORCH_MATERIAL_REQUIREMENTS, STANDING_TORCH_RECOVERY_RATE)
  }

  const removeStandingTorch = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const preview = previewStandingTorchRemoval(id)
    if (!preview) return
    if (!preview.canReceive) {
      toast.show(preview.reasonLabel, 'error')
      return
    }
    if (!bundle.standingTorches.remove(id)) return
    const contract = bundle.workContracts.findByTarget({ kind: 'standing_torch', targetId: id })
    if (contract) bundle.workContracts.invalidateTarget(contract.id, { now: dayNight.elapsedDays })
    applyRecovery(inventory, preview.recovered)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show('Usunięto pochodnię.')
  }

  const previewPlayerTroughRemoval = (id: string): RemovalPreview | null => {
    if (!bundle.playerTroughs.list().some((entry) => entry.id === id)) return null
    return removalPreview(PLAYER_TROUGH_MATERIAL_REQUIREMENTS, PLAYER_TROUGH_RECOVERY_RATE)
  }

  const removePlayerTrough = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const preview = previewPlayerTroughRemoval(id)
    if (!preview) return
    if (!preview.canReceive) {
      toast.show(preview.reasonLabel, 'error')
      return
    }
    if (!bundle.playerTroughs.remove(id)) return
    applyRecovery(inventory, preview.recovered)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show('Usunięto koryto.')
  }

  const previewBedrollRemoval = (id: string): RemovalPreview | null => {
    if (!bundle.sleepingUtilities.bedrolls.get(id)) return null
    return removalPreview(BEDROLL_MATERIAL_REQUIREMENTS, BEDROLL_RECOVERY_RATE)
  }

  const removeBedroll = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const preview = previewBedrollRemoval(id)
    if (!preview) return
    if (!preview.canReceive) {
      toast.show(preview.reasonLabel, 'error')
      return
    }
    if (!bundle.sleepingUtilities.bedrolls.remove(id)) return
    applyRecovery(inventory, preview.recovered)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show('Usunięto posłanie.')
  }

  const previewPlatformRemoval = (id: string): RemovalPreview | null => {
    if (!bundle.sleepingUtilities.platforms.get(id)) return null
    return removalPreview(PLATFORM_MATERIAL_REQUIREMENTS, PLATFORM_RECOVERY_RATE)
  }

  const removePlatform = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const preview = previewPlatformRemoval(id)
    if (!preview) return
    if (!preview.canReceive) {
      toast.show(preview.reasonLabel, 'error')
      return
    }
    if (!bundle.sleepingUtilities.platforms.remove(id)) return
    applyRecovery(inventory, preview.recovered)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show('Usunięto podest.')
  }

  return {
    tentAimPoint,
    tentBlockers,
    previewTentPlacement,
    placeTentAtAim,
    placeTrapAtAim,
    previewTrapPlacement,
    previewWellPlacement,
    placeWellAtAim,
    workOnWell,
    describeWellWork,
    describeWellRoofRepair,
    workOnWellRoofRepair,
    describeStructureRepair,
    workOnStructureRepair,
    placeGardenAtAim,
    previewGardenPlacement,
    tidyGardenPlot,
    waterGardenPlot,
    plantTreeAtAim,
    plantCropAtAim,
    previewStandingTorchPlacement,
    placeStandingTorchAtAim,
    igniteStandingTorch,
    workOnStandingTorch,
    describeStandingTorchWork,
    previewStandingTorchRemoval,
    removeStandingTorch,
    previewPlayerTroughPlacement,
    placePlayerTroughAtAim,
    workOnPlayerTrough,
    describePlayerTroughWork,
    describePlayerTroughFill,
    fillPlayerTrough,
    previewPlayerTroughRemoval,
    removePlayerTrough,
    previewPalisadePlacement,
    placePalisadeAtAim,
    workOnPalisade,
    describePalisadeWork,
    previewPalisadeRemoval,
    removePalisadeSegment,
    previewBedrollPlacement,
    placeBedrollAtAim,
    previewPlatformPlacement,
    placePlatformAtAim,
    previewSmallHousePlacement,
    previewMediumHousePlacement,
    placeSmallHouseAtAim,
    placeMediumHouseAtAim,
    supplyResidentialBuildingMaterials,
    workOnResidentialBuilding,
    describeResidentialWork,
    previewResidentialCancel,
    cancelResidentialBuilding,
    previewWellCancel,
    cancelPlayerWell,
    previewBedrollRemoval,
    removeBedroll,
    previewPlatformRemoval,
    removePlatform,
  }
}
