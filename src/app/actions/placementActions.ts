import type { CropId } from '../../world/cropLifecycle'
import { playActionWellConstruction } from '../../audio/actionSounds'
import {
  applyRecovery,
  canReceiveRecovery,
  computeMaterialRecovery,
  CONSTRUCTION_MATERIAL_RADIUS,
  consumeMaterial,
  hasMaterial,
  type MaterialRequirement,
} from '../../items/constructionMaterials'
import { CAPABILITY_NEED_LABEL } from '../../items/itemCatalog'
import { isLiquidContainerInstance, isTrapItemInstance, LIQUID_CONTAINER_KIND_LIST, type LiquidContainerItemInstance } from '../../items/itemInstances'
import { ITEM_DEFS } from '../../items/items'
import { drinkFromLiquidContainer, hasLiquidContent } from '../../items/liquidContainer'
import {
  evaluateGroundPlacement,
  evaluateTentPlacement,
  TENT_PLACEMENT_MESSAGE,
  TENT_SETUP_DURATION_SEC,
  type TentPlacementReason,
} from '../../items/tentPlacement'
import { TENT_FOOTPRINT_RADIUS, TENT_LENGTH } from '../../items/tentProp'
import { selectInstanceToPlace } from '../../items/trade'
import {
  applyRepresentedPhysicalEffortVigor,
  physicalEffortBusyOptions,
  physicalEffortStaminaCostPerSec,
} from '../../player/PlayerNeeds'
import { awardSkillXp, SKILL_XP_AWARD, survivalDurationMultiplier } from '../../player/PlayerSkills'
import {
  TRAP_DEFS,
  TRAP_FOOTPRINT_RADIUS,
  TRAP_PLACE_REACH,
  TRAP_PLACEMENT_MESSAGE,
  TRAP_SEPARATION,
  TRAP_SETUP_DURATION_SEC,
  type TrapKind,
} from '../../world/animalTraps'
import {
  PALISADE_FOOTPRINT_RADIUS,
  PALISADE_MATERIAL_REQUIREMENTS,
  PALISADE_PLACE_DURATION_SEC,
  PALISADE_PLACE_REACH,
  PALISADE_PLACEMENT_MESSAGE,
  PALISADE_RECOVERY_RATE,
  PALISADE_SEPARATION,
  type PalisadePlacementReason,
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
  GARDEN_COST,
  GARDEN_FOOTPRINT_RADIUS,
  GARDEN_PLACE_DURATION_SEC,
  GARDEN_PLACE_REACH,
  GARDEN_PLACEMENT_MESSAGE,
  GARDEN_SEPARATION,
  maintenanceDurationSec,
  PLAYER_GARDEN_PLANT_RADIUS,
  WATERING_DURATION_SEC,
  WATERING_LITRES,
} from '../../world/playerGarden'
import {
  activeWellStage,
  WELL_FOOTPRINT_RADIUS,
  WELL_PLACE_DURATION_SEC,
  WELL_PLACE_REACH,
  WELL_PLACEMENT_MESSAGE,
  WELL_SEPARATION,
  WELL_STAGE_CAPABILITY,
  WELL_STAGE_COST,
  WELL_STAGE_WORK_HOURS,
  WELL_WORK_LABEL,
  WELL_WORK_SESSION_HOURS,
  WELL_WORK_SESSION_SEC,
} from '../../world/playerWell'
import {
  STANDING_TORCH_FOOTPRINT_RADIUS,
  STANDING_TORCH_MATERIAL_REQUIREMENTS,
  STANDING_TORCH_PLACE_DURATION_SEC,
  STANDING_TORCH_PLACE_REACH,
  STANDING_TORCH_PLACEMENT_MESSAGE,
  STANDING_TORCH_SEPARATION,
  type StandingTorchPlacementReason,
} from '../../world/standingTorch'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

/** A world object the player can put down in front of themselves — the shared
 *  `evaluateGroundPlacement` + busy-channel shape used by tents (plan 099),
 *  animal traps (plan 141), chests (plan 164) and player-built wells (plan
 *  127). The item/material is always spent when the channel *completes*, so
 *  Esc costs nothing. */
export type PlacementBlocker = { x: number, z: number, radius: number }

/** Read-only per-frame result backing the shared placement-preview ghost/UI
 *  (plan `ui-input-004` §2/§7) — every `preview*Placement()` below returns
 *  this same shape so `app/actions/placementPreviewActions.ts` can render
 *  and validate any of chest/tent/fire without knowing their individual
 *  reason types. Never authoritative: the real placement action re-resolves
 *  aim and re-validates from scratch at confirm time. */
export type PlacementPreviewResult = {
  x: number
  z: number
  yaw: number
  footprintRadius: number
  valid: boolean
  reasonLabel: string
}

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
  reasonLabel: (reason: Exclude<Reason, 'ok'>) => string
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
  return {
    x: site.x,
    z: site.z,
    yaw: site.yaw,
    footprintRadius: def.footprintRadius,
    valid: ok,
    reasonLabel: ok ? '' : def.reasonLabel(reason as Exclude<Reason, 'ok'>),
  }
}

export type WellWorkView = {
  title: string
  description: string
  canWork: boolean
  reasonLabel: string
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
   *  `placeTentAtAim` remains the only mutation seam. */
  previewTentPlacement: () => PlacementPreviewResult
  placeTentAtAim: () => void
  placeTrapAtAim: (kind: TrapKind) => void
  placeWellAtAim: () => void
  workOnWell: (id: string) => void
  /** Read-only preview of what pressing `[E]` on this well would require/do
   *  right now — same checks `workOnWell` runs, without mutating anything.
   *  Backs the interaction panel's construction view (plan `ui-input-002`
   *  §3); `workOnWell` itself remains the only place that actually spends
   *  materials or starts work. */
  describeWellWork: (id: string) => WellWorkView | null
  /** Places a new player-built garden plot ahead of the player (plan 174 §1)
   *  — a single-stage placement (unlike a well), immediately usable as a
   *  planting anchor once built. */
  placeGardenAtAim: () => void
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
  /** Read-only preview of palisade-segment placement at the player's current
   *  aim (plan items-player-010 §1/§3/§4) — already snapped to a nearby
   *  segment endpoint when one is in range; backs the shared
   *  placement-preview ghost/UI. `placePalisadeAtAim` remains the only
   *  mutation seam. */
  previewPalisadePlacement: () => PlacementPreviewResult
  /** Places a new palisade segment ahead of the player (plan items-player-010
   *  §1/§2/§3/§4) — snaps to the nearest valid endpoint of an existing
   *  segment within reach, then consumes `PALISADE_MATERIAL_REQUIREMENTS`
   *  atomically on completion, nothing on a rejected/cancelled placement. */
  placePalisadeAtAim: () => void
  /** `[R]` removes one palisade segment by id (plan items-player-010 §5/§6/
   *  §7) — the generic player-built removal/recovery seam
   *  (`items/constructionMaterials.ts`) applied to a palisade segment:
   *  preflights inventory capacity for the recovered materials before
   *  removing anything, then removes the authoritative segment + runtime
   *  representation and adds the recovery. No-op if `id` is unknown or the
   *  recovered materials wouldn't fit. */
  removePalisadeSegment: (id: string) => void
}

export function createPlacementActions(ctx: PlayerActionContext): PlacementActions {
  const { bundle, player, inventory, heldTool, hud, toast, busy, dayNight, mouseLook, worldAudio } = ctx

  const tentAimPoint = (): { x: number, z: number, yaw: number } => {
    const yaw = mouseLook.state.yaw
    return {
      x: player.mesh.position.x - Math.sin(yaw) * TENT_LENGTH,
      z: player.mesh.position.z - Math.cos(yaw) * TENT_LENGTH,
      yaw,
    }
  }

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
    return blockers
  }

  /** Shared placement contract for a tent (plan `world-008`) — one `aim` +
   *  `evaluate` pair `previewTentPlacement` and `placeTentAtAim` both build
   *  from, so they can never validate a site differently. */
  const tentPlacementDefinition = (): GroundPlacementDefinition<TentPlacementReason> => ({
    aim: tentAimPoint,
    evaluate: (site) => evaluateTentPlacement({
      x: site.x,
      z: site.z,
      sampleHeight: (x, z) => bundle.chunkManager.sampleHeight(x, z),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: tentBlockers(site.x, site.z),
      otherTents: bundle.placedTents.nodes(),
    }),
    footprintRadius: TENT_FOOTPRINT_RADIUS,
    reasonLabel: (reason) => TENT_PLACEMENT_MESSAGE[reason],
  })

  const previewTentPlacement = (): PlacementPreviewResult => previewGroundPlacement(tentPlacementDefinition())

  const placeTentAtAim = (): void => {
    if (!inventory.has('tent', 1) || isActionBlocked(ctx)) return
    const { site, reason } = evaluatePlacementSite(tentPlacementDefinition())
    if (reason !== 'ok') {
      toast.show(TENT_PLACEMENT_MESSAGE[reason], 'error')
      return
    }
    // Survival shortens the setup channel; the tent itself is only spent when
    // the channel completes, so Esc costs nothing (same as ignite/cook).
    busy.start(
      TENT_SETUP_DURATION_SEC * survivalDurationMultiplier(player.skills.survival.value),
      'Rozstawianie namiotu…',
      () => {
        if (!inventory.remove('tent', 1)) return
        bundle.placedTents.place(site.x, site.z, site.yaw)
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.syncQuickActionAvailability()
        awardSkillXp(player.skills, 'survival', SKILL_XP_AWARD.pitchTent)
        toast.show('Rozstawiono namiot.')
      },
    )
  }

  /** Sets a trap down in front of the player (plan 141 §3) — same busy-channel
   *  shape as pitching a tent: the item is only spent when the channel
   *  completes, and it lands `placed` (not armed), so arming stays a separate
   *  `[E]` interaction. Reuses the shared ground-suitability check, just with
   *  the trap's own footprint. */
  const placeTrapAtAim = (kind: TrapKind): void => {
    const def = TRAP_DEFS[kind]
    const candidates = inventory.getInstances(def.itemKind).filter(isTrapItemInstance)
    const selected = selectInstanceToPlace(candidates)
    if (!selected || isActionBlocked(ctx)) return
    const instanceId = selected.id
    const yaw = mouseLook.state.yaw
    const x = player.mesh.position.x - Math.sin(yaw) * TRAP_PLACE_REACH
    const z = player.mesh.position.z - Math.cos(yaw) * TRAP_PLACE_REACH
    const reason = evaluateGroundPlacement({
      x,
      z,
      sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: tentBlockers(x, z),
      peers: [...bundle.placedTraps.nodes(), ...bundle.placedTents.nodes()],
      footprintRadius: TRAP_FOOTPRINT_RADIUS,
      separation: TRAP_SEPARATION,
    })
    if (reason !== 'ok') {
      toast.show(TRAP_PLACEMENT_MESSAGE[reason === 'occupied' ? 'trap' : reason], 'error')
      return
    }
    busy.start(TRAP_SETUP_DURATION_SEC, 'Zastawianie pułapki…', () => {
      const instance = inventory.getInstance(instanceId)
      if (!instance || !isTrapItemInstance(instance) || instance.durability <= 0) return
      if (!inventory.removeInstance(instanceId)) return
      bundle.placedTraps.place(instance, x, z, yaw)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show(`Zastawiono: ${def.label}.`)
    })
  }

  /** Places a new player-built well ahead of the player (plan 127 §5/§11) —
   *  same busy-channel shape as pitching a tent/setting a trap: the shovel
   *  is required but never consumed (plan §2), only the `pit` stage's
   *  world-time clock starts here ("[E] Wykop dół" — see
   *  `world/playerWell.ts`'s header doc). Materials are charged later, when
   *  each subsequent stage actually starts (`advanceWellStage` below). */
  const placeWellAtAim = (): void => {
    if (!inventory.hasCapability('soil_digging') || isActionBlocked(ctx)) return
    const yaw = mouseLook.state.yaw
    const x = player.mesh.position.x - Math.sin(yaw) * WELL_PLACE_REACH
    const z = player.mesh.position.z - Math.cos(yaw) * WELL_PLACE_REACH
    const reason = evaluateGroundPlacement({
      x,
      z,
      sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: tentBlockers(x, z),
      peers: bundle.playerWells.nodes(),
      footprintRadius: WELL_FOOTPRINT_RADIUS,
      separation: WELL_SEPARATION,
    })
    if (reason !== 'ok') {
      toast.show(WELL_PLACEMENT_MESSAGE[reason === 'occupied' ? 'well' : reason], 'error')
      return
    }
    busy.start(WELL_PLACE_DURATION_SEC, 'Kopanie dołu pod studnię…', () => {
      bundle.playerWells.place(x, z, yaw)
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
    const stage = activeWellStage(well)
    if (!stage) return
    const capability = WELL_STAGE_CAPABILITY[stage]
    if (capability && !inventory.hasCapability(capability)) {
      toast.show(`Potrzebujesz ${CAPABILITY_NEED_LABEL[capability]}.`, 'error')
      return
    }
    const startingNewStage = stage !== well.stage
    if (startingNewStage) {
      const cost = WELL_STAGE_COST[stage]
      // Materials may be carried or lying nearby the well itself (plan 187
      // §4/§5) — same small bounded radius, no teleport into inventory.
      const requirements: MaterialRequirement[] = []
      if (cost.stone > 0) requirements.push({ kind: 'stone', count: cost.stone })
      if (cost.branch > 0) requirements.push({ kind: 'branch', count: cost.branch })
      const missing = requirements.filter(
        (r) => !hasMaterial(inventory, bundle.droppedItems, well.x, well.z, CONSTRUCTION_MATERIAL_RADIUS, r),
      )
      if (missing.length > 0) {
        toast.show(
          `Potrzebujesz: ${missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`,
          'error',
        )
        return
      }
      for (const r of requirements) {
        consumeMaterial(inventory, bundle.droppedItems, well.x, well.z, CONSTRUCTION_MATERIAL_RADIUS, r)
      }
      if (requirements.length > 0) {
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
      }
      bundle.playerWells.transitionTo(id, stage)
    }
    const workedSoFar = startingNewStage ? 0 : well.workProgress
    const remainingHours = Math.max(0, WELL_STAGE_WORK_HOURS[stage] - workedSoFar)
    const sessionHours = Math.min(WELL_WORK_SESSION_HOURS, remainingHours)
    const sessionSec = (sessionHours / WELL_WORK_SESSION_HOURS) * WELL_WORK_SESSION_SEC
    const startedAt = performance.now()
    // Vigor is `heavy` (plan §8 "studnia heavy") applied per represented
    // work-hour actually credited — never per real `sessionSec`, so changing
    // `WELL_WORK_SESSION_SEC` can't silently change the total Vigor cost of
    // the represented work (plan §5). Stamina stays on the existing
    // `moderate` real-elapsed-seconds channel (`BUSY_ACTION_STAMINA_COST_PER_SEC`
    // unchanged per implementation notes).
    const creditPartial = (): void => {
      const elapsedSec = Math.min(sessionSec, Math.max(0, (performance.now() - startedAt) / 1000))
      const fraction = sessionSec > 0 ? elapsedSec / sessionSec : 1
      const creditedHours = sessionHours * fraction
      bundle.playerWells.addWork(id, creditedHours)
      applyRepresentedPhysicalEffortVigor(player.needs.vigor, 'heavy', creditedHours)
    }
    if (stage === 'roof') {
      playActionWellConstruction(worldAudio.playAt, { x: well.x, z: well.z })
    }
    busy.start(sessionSec, WELL_WORK_LABEL[stage], () => {
      bundle.playerWells.addWork(id, sessionHours)
      applyRepresentedPhysicalEffortVigor(player.needs.vigor, 'heavy', sessionHours)
    }, {
      onCancel: creditPartial,
      staminaCostPerSec: physicalEffortStaminaCostPerSec('moderate'),
    })
  }

  const describeWellWork = (id: string): WellWorkView | null => {
    const well = bundle.playerWells.list().find((entry) => entry.id === id)
    if (!well) return null
    const stage = activeWellStage(well)
    if (!stage) return null
    const title = WELL_WORK_LABEL[stage]
    const capability = WELL_STAGE_CAPABILITY[stage]
    if (capability && !inventory.hasCapability(capability)) {
      return { title, description: '', canWork: false, reasonLabel: `Potrzebujesz ${CAPABILITY_NEED_LABEL[capability]}.` }
    }
    const startingNewStage = stage !== well.stage
    if (startingNewStage) {
      const cost = WELL_STAGE_COST[stage]
      const requirements: MaterialRequirement[] = []
      if (cost.stone > 0) requirements.push({ kind: 'stone', count: cost.stone })
      if (cost.branch > 0) requirements.push({ kind: 'branch', count: cost.branch })
      const description = requirements.length > 0
        ? `Wymagane surowce: ${requirements.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`
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
    const remainingHours = Math.max(0, WELL_STAGE_WORK_HOURS[stage] - well.workProgress)
    return { title, description: `Pozostało: ${remainingHours.toFixed(1)} h pracy.`, canWork: true, reasonLabel: '' }
  }

  /** Places a new player-built garden plot ahead of the player (plan 174 §1)
   *  — same shared-placement shape as a tent/trap/well, but single-stage:
   *  the shovel is required (never consumed, same as a well's `pit`) and the
   *  wood/stone cost is charged atomically when the placement channel
   *  completes, from inventory or nearby dropped items (plan 187's
   *  `constructionMaterials.ts`, the same construction-material seam a
   *  well's `well`/`roof` stages use) — no parallel material system. */
  const placeGardenAtAim = (): void => {
    if (!inventory.hasCapability(GARDEN_CAPABILITY) || isActionBlocked(ctx)) return
    const yaw = mouseLook.state.yaw
    const x = player.mesh.position.x - Math.sin(yaw) * GARDEN_PLACE_REACH
    const z = player.mesh.position.z - Math.cos(yaw) * GARDEN_PLACE_REACH
    const reason = evaluateGroundPlacement({
      x,
      z,
      sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: tentBlockers(x, z),
      peers: bundle.playerGardens.nodes(),
      footprintRadius: GARDEN_FOOTPRINT_RADIUS,
      separation: GARDEN_SEPARATION,
    })
    if (reason !== 'ok') {
      toast.show(GARDEN_PLACEMENT_MESSAGE[reason === 'occupied' ? 'garden' : reason], 'error')
      return
    }
    const requirements: MaterialRequirement[] = []
    if (GARDEN_COST.stone > 0) requirements.push({ kind: 'stone', count: GARDEN_COST.stone })
    if (GARDEN_COST.branch > 0) requirements.push({ kind: 'branch', count: GARDEN_COST.branch })
    const missing = requirements.filter(
      (r) => !hasMaterial(inventory, bundle.droppedItems, x, z, CONSTRUCTION_MATERIAL_RADIUS, r),
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
        if (!consumeMaterial(inventory, bundle.droppedItems, x, z, CONSTRUCTION_MATERIAL_RADIUS, r)) return
      }
      bundle.playerGardens.place(x, z, yaw, dayNight.elapsedDays)
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
    aim: () => {
      const yaw = mouseLook.state.yaw
      return {
        x: player.mesh.position.x - Math.sin(yaw) * STANDING_TORCH_PLACE_REACH,
        z: player.mesh.position.z - Math.cos(yaw) * STANDING_TORCH_PLACE_REACH,
        yaw,
      }
    },
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
    reasonLabel: (reason) => STANDING_TORCH_PLACEMENT_MESSAGE[reason],
  })

  const previewStandingTorchPlacement = (): PlacementPreviewResult =>
    previewGroundPlacement(standingTorchPlacementDefinition())

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
      toast.show('Postawiono pochodnię.')
    })
  }

  /** `[E]` ignites an unlit standing torch (plan items-player-009 §4) — the
   *  same "re-resolve by id, check capability, mutate" shape the plan
   *  requires; `fire_starting` is only needed here, never for placement. */
  const igniteStandingTorch = (id: string): void => {
    if (isActionBlocked(ctx)) return
    if (!inventory.hasCapability('fire_starting')) {
      toast.show(`Potrzebujesz ${CAPABILITY_NEED_LABEL.fire_starting}.`, 'error')
      return
    }
    if (bundle.standingTorches.ignite(id)) toast.show('Zapalono pochodnię.')
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
  const palisadePlacementDefinition = (): GroundPlacementDefinition<PalisadePlacementReason> => ({
    aim: () => {
      const yaw = mouseLook.state.yaw
      const rawX = player.mesh.position.x - Math.sin(yaw) * PALISADE_PLACE_REACH
      const rawZ = player.mesh.position.z - Math.cos(yaw) * PALISADE_PLACE_REACH
      return resolvePalisadeSite({ x: rawX, z: rawZ, yaw }, bundle.palisades.nodes())
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
    reasonLabel: (reason) => PALISADE_PLACEMENT_MESSAGE[reason],
  })

  const previewPalisadePlacement = (): PlacementPreviewResult =>
    previewGroundPlacement(palisadePlacementDefinition())

  /** Places a new palisade segment ahead of the player (plan items-player-010
   *  §1/§2/§3/§4) — same "validate the resolved site, then busy-channel,
   *  consume+build only on completion" shape as `placeStandingTorchAtAim`;
   *  the site (including any snap) is re-resolved and re-validated here, at
   *  confirm time, never trusted from a cached preview result. */
  const placePalisadeAtAim = (): void => {
    if (isActionBlocked(ctx)) return
    const { site, reason } = evaluatePlacementSite(palisadePlacementDefinition())
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
      toast.show('Postawiono segment palisady.')
    })
  }

  /** `[R]` removes one palisade segment (plan items-player-010 §5/§6/§7) —
   *  the generic removal/recovery seam: preflight `canReceiveRecovery`
   *  before touching any authoritative state, remove the segment, then add
   *  the recovered materials — never the reverse, and never partial. */
  const removePalisadeSegment = (id: string): void => {
    if (isActionBlocked(ctx)) return
    if (!bundle.palisades.list().some((entry) => entry.id === id)) return
    const recovered = computeMaterialRecovery({
      requirements: PALISADE_MATERIAL_REQUIREMENTS,
      recoveryRate: PALISADE_RECOVERY_RATE,
    })
    if (!canReceiveRecovery(inventory, recovered)) {
      toast.show('Brak miejsca w ekwipunku na odzyskane materiały.', 'error')
      return
    }
    if (!bundle.palisades.remove(id)) return
    applyRecovery(inventory, recovered)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    toast.show('Usunięto segment palisady.')
  }

  return {
    tentAimPoint,
    tentBlockers,
    previewTentPlacement,
    placeTentAtAim,
    placeTrapAtAim,
    placeWellAtAim,
    workOnWell,
    describeWellWork,
    placeGardenAtAim,
    tidyGardenPlot,
    waterGardenPlot,
    plantTreeAtAim,
    plantCropAtAim,
    previewStandingTorchPlacement,
    placeStandingTorchAtAim,
    igniteStandingTorch,
    previewPalisadePlacement,
    placePalisadeAtAim,
    removePalisadeSegment,
  }
}
