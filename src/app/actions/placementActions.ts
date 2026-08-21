import { CAPABILITY_NEED_LABEL } from '../../items/itemCatalog'
import { isTrapItemInstance } from '../../items/itemInstances'
import { ITEM_DEFS } from '../../items/items'
import { evaluateGroundPlacement, evaluateTentPlacement, TENT_PLACEMENT_MESSAGE, TENT_SETUP_DURATION_SEC } from '../../items/tentPlacement'
import { TENT_LENGTH } from '../../items/tentProp'
import { selectInstanceToPlace } from '../../items/trade'
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
  WELL_WORK_SESSION_SEC,
} from '../../world/playerWell'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

/** A world object the player can put down in front of themselves — the shared
 *  `evaluateGroundPlacement` + busy-channel shape used by tents (plan 099),
 *  animal traps (plan 141), chests (plan 164) and player-built wells (plan
 *  127). The item/material is always spent when the channel *completes*, so
 *  Esc costs nothing. */
export type PlacementBlocker = { x: number, z: number, radius: number }

export type PlacementActions = {
  /** Where a tent placed right now would land (its far end is `TENT_LENGTH`
   *  ahead of the player, along the current look yaw). */
  tentAimPoint: () => { x: number, z: number, yaw: number }
  /** Nearby trees / settlement wells / houses that block a ground placement.
   *  Shared by every placeable (tent, trap, chest, well) — the name predates
   *  the others but the geometry is the same. */
  tentBlockers: (x: number, z: number) => PlacementBlocker[]
  placeTentAtAim: () => void
  placeTrapAtAim: (kind: TrapKind) => void
  placeWellAtAim: () => void
  workOnWell: (id: string) => void
}

export function createPlacementActions(ctx: PlayerActionContext): PlacementActions {
  const { bundle, player, inventory, hud, toast, busy, dayNight, mouseLook } = ctx

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

  const placeTentAtAim = (): void => {
    if (!inventory.has('tent', 1) || isActionBlocked(ctx)) return
    const aim = tentAimPoint()
    const reason = evaluateTentPlacement({
      x: aim.x,
      z: aim.z,
      sampleHeight: (x, z) => bundle.chunkManager.sampleHeight(x, z),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: tentBlockers(aim.x, aim.z),
      otherTents: bundle.placedTents.nodes(),
    })
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
        bundle.placedTents.place(aim.x, aim.z, aim.yaw)
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
    })
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
   *     — a stage's full requirement is reached over several repeated
   *     presses, never one long frozen channel. The *measured* world-time
   *     delta over the bout (not the precomputed cap) is what gets credited
   *     to `workProgress`, on both natural completion and cancellation
   *     (Escape) — so an interruption keeps exactly the work actually done,
   *     never rolling back stage/materials. */
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
      const missing: string[] = []
      if (cost.stone > 0 && !inventory.has('stone', cost.stone)) missing.push(`${cost.stone}× ${ITEM_DEFS.stone.label}`)
      if (cost.branch > 0 && !inventory.has('branch', cost.branch)) missing.push(`${cost.branch}× ${ITEM_DEFS.branch.label}`)
      if (missing.length > 0) {
        toast.show(`Potrzebujesz: ${missing.join(', ')}.`, 'error')
        return
      }
      if (cost.stone > 0) inventory.remove('stone', cost.stone)
      if (cost.branch > 0) inventory.remove('branch', cost.branch)
      if (cost.stone > 0 || cost.branch > 0) {
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
      }
      bundle.playerWells.transitionTo(id, stage)
    }
    const workedSoFar = startingNewStage ? 0 : well.workProgress
    const remainingHours = Math.max(0, WELL_STAGE_WORK_HOURS[stage] - workedSoFar)
    const sessionHours = Math.min(WELL_WORK_SESSION_SEC / (dayNight.dayLengthSec / 24), remainingHours)
    const sessionSec = sessionHours * (dayNight.dayLengthSec / 24)
    const startDays = dayNight.elapsedDays
    const commitProgress = (): void => {
      const elapsedHours = Math.max(0, (dayNight.elapsedDays - startDays) * 24)
      bundle.playerWells.addWork(id, elapsedHours)
    }
    busy.start(sessionSec, WELL_WORK_LABEL[stage], commitProgress, { onCancel: commitProgress })
  }

  return { tentAimPoint, tentBlockers, placeTentAtAim, placeTrapAtAim, placeWellAtAim, workOnWell }
}
