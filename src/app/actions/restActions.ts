import type { LodgingConfirmView, LodgingOption } from '../../settlement/lodging'
import type { BusyOverlay } from '../../ui/createBusyOverlay'
import type { RestOutcome, RestVariant } from '../../ui/createQuickActions'
import type { TimeSkipOverlay } from '../../ui/createTimeSkipOverlay'
import { inventoryFullToastText } from '../../items/Inventory'
import { canCancelRestProgress } from '../../items/items'
import { tentRestPose } from '../../items/tentProp'
import { restoreNeedsFromSleep } from '../../player/PlayerNeeds'
import { awardSkillXp, SKILL_XP_AWARD } from '../../player/PlayerSkills'
import { LODGING_ARRIVE_TOLERANCE, lodgingPlaceLabel, lodgingRestQuality } from '../../settlement/lodging'
import { collectLodgingCandidates, resolveBestLodging, settlementLodgingInput } from '../../settlement/lodgingResolver'
import { type CampRestContext, campRestQuality, hasTentNear, hasWarmFireNear } from '../campRest'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

/** How close (world units) to a settlement's center counts as "in town" for
 *  the "Nocuj w mieście" quick action (plan 168) — covers the default
 *  village extent (core + house ring, `ringMax + houseRadius*2 ≈ 39.6` at
 *  default `coreRadius`/`houseRadius`), not the much larger `HOME_RADIUS`.
 *  A UI/action convenience gate only — the lodging resolver itself picks
 *  the actual candidates once this passes (implementation notes §8). */
export const REST_IN_TOWN_RADIUS = 40

/** Waiting, sleeping and the camp quality that decides how much a night gives
 *  back (plan 128). The rest *outcome* is owned here rather than in
 *  `gameLoop.ts`: the camp context is resolved once when the rest starts, and
 *  consumed when the 8h skip finishes (`onSleepFinished`). */
export type RestActions = {
  /** Is the player standing close enough to a loaded settlement to use the
   *  town bed? Also drives the Quick Actions availability flag. */
  isNearTown: () => boolean
  startWait: (hours: number) => void
  /** Quick Actions "Rozbij obóz" / "Nocuj w mieście" (plan 168). */
  startRest: (variant: RestVariant) => RestOutcome
  startTentRest: (id: string) => void
  packTent: (id: string) => void
  /** A full night's sleep just finished — applies the resolved rest quality
   *  and any Survival XP the camp earned. */
  onSleepFinished: () => void
  /** Esc during a rest/sleep — aborts the skip before the pause menu opens. */
  abortRest: () => boolean
  /** Esc during a `busy` channel — cancels without running `onComplete`. */
  abortBusy: () => boolean
  /** Forced (non-Esc) interruption of an active rest/sleep from taking
   *  damage (plan 186 §3) — see the implementation's own doc for how this
   *  differs from `abortRest`. */
  interruptRestForDamage: () => boolean
  /** Commits payment (exactly once) for the paid lodging offer `startRest`
   *  reported via `'confirm'`, then arms the walk to it (plan 168). */
  confirmLodgingPayment: () => void
  /** Declines the pending paid lodging offer without charging or moving. */
  cancelLodgingConfirm: () => void
  /** Per-frame: walks the player to the resolved lodging option and starts
   *  Sleep on arrival — called from `gameLoop.ts` the same way `restCamp.tick`
   *  is (plan 168). */
  tickLodging: () => void
  /** True while walking to a resolved lodging option (not yet asleep) — used
   *  to gate other input the same way `restCamp.isActive()` does. */
  isLodgingActive: () => boolean
}

export type RestActionDeps = {
  timeSkipOverlay: TimeSkipOverlay
  busyOverlay: BusyOverlay
  /** Plan 168 — pushes the pending paid-lodging confirmation payload into the
   *  Quick Actions UI (`null` clears it). */
  setLodgingConfirm: (payload: LodgingConfirmView | null) => void
}

export function createRestActions(ctx: PlayerActionContext, deps: RestActionDeps): RestActions {
  const { bundle, player, inventory, hud, toast, busy, timeSkip, restCamp, keyboard, mouseLook, getPlayerSocial } = ctx
  const { timeSkipOverlay, busyOverlay, setLodgingConfirm } = deps

  /** Rest quality + XP for the sleep currently in flight (plan 128 §5-§7),
   *  resolved once when rest starts and consumed when the 8h skip finishes.
   *  Null means "no camp context" — a plain town bed, restored in full. */
  let pendingRest: { quality: number, awardsSurvivalXp: boolean } | null = null

  /** Resolved sleep quality for a lodging-originated sleep (plan 168) —
   *  parallel to `pendingRest` but never awards Survival XP (that stays
   *  camp-only). Set on arrival, consumed by `onSleepFinished`. */
  let pendingLodgingQuality: number | null = null
  /** The lodging option currently being walked to — non-null only between
   *  `startRest('town')` arming movement and either arrival or cancellation. */
  let lodgingWalkTarget: LodgingOption | null = null
  /** A paid lodging offer awaiting `confirmLodgingPayment`/`cancelLodgingConfirm`. */
  let lodgingConfirmTarget: LodgingOption | null = null

  /** One-shot proximity lookup at rest start — never a per-frame scan. Only
   *  player-built fires count as camp warmth; a village's own campfire belongs
   *  to town rest, which is already a full night. */
  const resolveCampContext = (hasBlanket: boolean, hasTent: boolean): CampRestContext => ({
    hasBlanket,
    hasTent: hasTent || hasTentNear(
      bundle.placedTents.list(),
      player.mesh.position.x,
      player.mesh.position.z,
    ),
    hasWarmFire: hasWarmFireNear(
      bundle.placedFires.list(),
      player.mesh.position.x,
      player.mesh.position.z,
    ),
  })

  const beginCampRest = (context: CampRestContext): void => {
    pendingRest = {
      quality: campRestQuality(context, player.skills.survival.value),
      awardsSurvivalXp: true,
    }
  }

  /** Called by `gameLoop` when a `fadeStrength === 1` skip (i.e. a night's
   *  sleep) finishes. Owns both halves of the rest outcome: how much the
   *  night restored, and the Survival XP the camp earned. */
  const onSleepFinished = (): void => {
    const rest = pendingRest
    pendingRest = null
    const lodgingQuality = pendingLodgingQuality
    pendingLodgingQuality = null
    if (lodgingQuality != null) {
      restoreNeedsFromSleep(player.needs, lodgingQuality)
      return
    }
    restoreNeedsFromSleep(player.needs, rest?.quality ?? 1)
    if (rest?.awardsSurvivalXp) awardSkillXp(player.skills, 'survival', SKILL_XP_AWARD.campRest)
  }

  const isNearTown = (): boolean => bundle.settlementsManager
    .getLoaded()
    .some((s) => s.center.distanceTo(player.mesh.position) <= REST_IN_TOWN_RADIUS)

  const startWait = (hours: number): void => {
    if (isActionBlocked(ctx)) return
    timeSkip.start(hours, { fadeStrength: 0.5, label: `Czekasz... (${hours}h)` })
  }

  /** Plan 168 — one resolve per "Nocuj w mieście" request/arrival check,
   *  never cached across frames (implementation notes §4/§8). Only loaded
   *  settlements can be walked to. */
  const resolveLodgingOption = (): LodgingOption | null => {
    const settlements = bundle.settlementsManager.getLoaded().map(settlementLodgingInput)
    const candidates = collectLodgingCandidates(settlements, { getPlayerSocial })
    return resolveBestLodging(candidates, { x: player.mesh.position.x, z: player.mesh.position.z })
  }

  /** Re-derived from authoritative state at arrival — never trusts a cached
   *  `available` flag from when the option was first resolved (implementation
   *  notes §4/§14). */
  const isLodgingOptionStillAvailable = (option: LodgingOption): boolean => {
    const settlements = bundle.settlementsManager.getLoaded().map(settlementLodgingInput)
    const candidates = collectLodgingCandidates(settlements, { getPlayerSocial })
    return candidates.some((c) => c.id === option.id)
  }

  const armLodgingWalk = (option: LodgingOption): void => {
    lodgingWalkTarget = option
  }

  const cancelLodgingWalk = (silent = false): void => {
    if (!lodgingWalkTarget) return
    lodgingWalkTarget = null
    keyboard.state.forward = false
    if (!silent) toast.show('Przerwano nocleg', 'info')
  }

  const cancelLodgingConfirm = (): void => {
    if (!lodgingConfirmTarget) return
    lodgingConfirmTarget = null
    setLodgingConfirm(null)
  }

  const confirmLodgingPayment = (): void => {
    const option = lodgingConfirmTarget
    lodgingConfirmTarget = null
    setLodgingConfirm(null)
    if (!option) return
    const price = option.price ?? 0
    if (!inventory.has('coin', price)) {
      toast.show('Nie stać cię na ten nocleg', 'error')
      return
    }
    inventory.remove('coin', price)
    ctx.onInventoryChanged()
    armLodgingWalk(option)
  }

  const tickLodging = (): void => {
    const option = lodgingWalkTarget
    if (!option) return
    const keys = keyboard.state
    if (keys.backward || keys.left || keys.right || keys.sprint || keys.jump) {
      cancelLodgingWalk()
      return
    }
    const px = player.mesh.position.x
    const pz = player.mesh.position.z
    const dx = option.approachPoint.x - px
    const dz = option.approachPoint.z - pz
    const dist = Math.hypot(dx, dz)
    if (dist <= LODGING_ARRIVE_TOLERANCE) {
      lodgingWalkTarget = null
      keys.forward = false
      if (!isLodgingOptionStillAvailable(option)) {
        toast.show('To miejsce jest już zajęte', 'error')
        return
      }
      if (option.facing != null) player.mesh.rotation.y = option.facing
      pendingLodgingQuality = lodgingRestQuality(option.quality)
      player.lieDown()
      timeSkip.start(8, { fadeStrength: 1, label: `Nocujesz (${lodgingPlaceLabel(option)})...` })
      return
    }
    keys.forward = true
    mouseLook.state.yaw = Math.atan2(-dx, -dz)
  }

  const isLodgingActive = (): boolean => lodgingWalkTarget !== null

  const startRest = (variant: RestVariant): RestOutcome => {
    if (isActionBlocked(ctx)) return 'ok'
    if (lodgingWalkTarget || lodgingConfirmTarget) return 'ok'
    if (variant === 'town') {
      if (!isNearTown()) return 'too-far'
      const option = resolveLodgingOption()
      if (!option) return 'no-lodging'
      if (option.type === 'paid' && (option.price ?? 0) > 0) {
        lodgingConfirmTarget = option
        setLodgingConfirm({ placeLabel: lodgingPlaceLabel(option), price: option.price ?? 0, quality: option.quality })
        return 'confirm'
      }
      armLodgingWalk(option)
      return 'ok'
    }
    if (!inventory.has('blanket', 1)) return 'no-blanket'
    restCamp.start({
      onSleepStart: () => {
        // The quick action already required a blanket; the tent/fire halves
        // of the camp come from what's actually pitched/lit around here.
        beginCampRest(resolveCampContext(true, false))
        timeSkip.start(8, {
          fadeStrength: 1,
          label: 'Rozbijasz obóz...',
        })
      },
      onComplete: () => {},
    })
    return 'ok'
  }

  const startTentRest = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const tent = bundle.placedTents.list().find((entry) => entry.id === id)
    if (tent) {
      const pose = tentRestPose(tent)
      player.setPosition(pose.x, pose.z)
      player.mesh.rotation.y = pose.yaw
    }
    restCamp.start({
      variant: 'tent',
      onSleepStart: () => {
        // Resolved after the pose move so the fire/tent lookup uses where the
        // player actually sleeps.
        beginCampRest(resolveCampContext(inventory.has('blanket', 1), true))
        timeSkip.start(8, { fadeStrength: 1, label: 'Odpoczywasz w namiocie...' })
      },
      onComplete: () => {},
    })
  }

  const packTent = (id: string): void => {
    if (isActionBlocked(ctx)) return
    if (!inventory.canAdd('tent')) {
      toast.show(inventoryFullToastText(inventory, 'tent', 1), 'error')
      return
    }
    const packed = bundle.placedTents.pack(id)
    if (!packed) return
    inventory.add('tent', 1)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.syncQuickActionAvailability()
    toast.show('+1 Namiot', 'pickup')
  }

  /** Shared cancel body for `abortRest`/`interruptRestForDamage` — aborted
   *  rest earns nothing and resolves no quality (plan 128 edge cases). Also
   *  clears any in-flight lodging walk/quality (plan 168) so a later,
   *  unrelated sleep never inherits it. */
  const cancelRest = (): void => {
    pendingRest = null
    pendingLodgingQuality = null
    cancelLodgingWalk(true)
    cancelLodgingConfirm()
    timeSkip.cancel()
    timeSkipOverlay.hide()
    busyOverlay.hide()
    restCamp.cancel()
    player.standUp()
  }

  const abortRest = (): boolean => {
    const resting = restCamp.isActive() || timeSkip.fadeStrength() === 1
      || lodgingWalkTarget !== null || lodgingConfirmTarget !== null
    if (!resting) return false
    if (timeSkip.fadeStrength() === 1 && !canCancelRestProgress(timeSkip.progress())) return false
    if (restCamp.isActive() && !timeSkip.isActive()) return false
    cancelRest()
    return true
  }

  const abortBusy = (): boolean => {
    if (!busy.isActive()) return false
    busy.cancel()
    busyOverlay.hide()
    return true
  }

  /** Forced interruption from an invalidating condition (plan 186 §3 —
   *  damage/starvation while resting/sleeping), not a player Esc press:
   *  unlike `abortRest`, this never gates on `canCancelRestProgress` — being
   *  attacked should wake the player up at any point in the skip, not only
   *  in its last 15%. Same `resting` definition as `abortRest` (a plain
   *  "Czekaj" wait, `fadeStrength === 0.5`, is deliberately not "resting"
   *  here either — unchanged from `abortRest`'s existing scope). */
  const interruptRestForDamage = (): boolean => {
    const resting = restCamp.isActive() || timeSkip.fadeStrength() === 1 || lodgingWalkTarget !== null
    if (!resting) return false
    cancelRest()
    return true
  }

  return {
    isNearTown,
    startWait,
    startRest,
    startTentRest,
    packTent,
    onSleepFinished,
    abortRest,
    abortBusy,
    interruptRestForDamage,
    confirmLodgingPayment,
    cancelLodgingConfirm,
    tickLodging,
    isLodgingActive,
  }
}
