import type { Settlement } from '../../settlement/createSettlement'
import type { LodgingOption } from '../../settlement/lodging'
import type { BusyOverlay } from '../../ui/createBusyOverlay'
import type { RestOutcome, RestVariant } from '../../ui/createQuickActions'
import type { TimeSkipOverlay } from '../../ui/createTimeSkipOverlay'
import { inventoryFullToastText } from '../../items/Inventory'
import { canCancelRestNow, restCancelAllowedByStartVigor } from '../../items/items'
import { tentRestPose } from '../../items/tentProp'
import { restoreNeedsFromSleep } from '../../player/PlayerNeeds'
import { awardSkillXp, SKILL_XP_AWARD } from '../../player/PlayerSkills'
import {
  advanceLodgingProgress,
  hayLodgingId,
  initialLodgingProgress,
  LODGING_ARRIVE_TOLERANCE,
  lodgingChoiceLabel,
  lodgingPlaceLabel,
  lodgingRestQuality,
} from '../../settlement/lodging'
import { collectLodgingCandidates, selectLodgingFromCandidates, settlementLodgingInput } from '../../settlement/lodgingResolver'
import { getVigorRatio } from '../../shared/VigorState'
import { type CampRestContext, campRestQuality, hasTentNear, hasWarmFireNear } from '../campRest'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

/** One button in the generic contextual interaction panel
 *  (`InteractionPanelAction`/`openFlavorDialog`) — mirrored here rather than
 *  imported from `ui-vue/store.ts` so this module stays free of a Vue-layer
 *  dependency, same convention as the rest of `app/actions/`. */
export type LodgingChoiceAction = { label: string, enabled: boolean, reasonLabel: string, run: () => void }

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
  /** Quick Actions "Rozbij obóz" / "Nocuj w mieście" (plan 168). `'town'`
   *  opens the "Nocuj w mieście" choice panel (`'choose'`) listing every
   *  available `LodgingOption` rather than auto-picking one (plan 168
   *  follow-up) — picking an option (or cancelling out of a paid confirm) is
   *  a `run()` callback on the panel, not a further call to `startRest`. */
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
  /** Direct `[E]` on a hay bale (plan 168 follow-up) — the same commit path
   *  as picking "Stóg siana" from the "Nocuj w mieście" panel, without going
   *  through Quick Actions. No-ops (silently, like re-pressing `startRest`
   *  while already resting) if blocked or already lodging/confirming. */
  sleepInHay: (settlementId: string) => void
  /** Per-frame: walks the player to the resolved lodging option and starts
   *  Sleep on arrival — called from `gameLoop.ts` the same way `restCamp.tick`
   *  is (plan 168), now with a stuck-movement watchdog/recovery (plan
   *  `ui-input-005`) driven by the same per-frame `dt`. */
  tickLodging: (dt: number) => void
  /** True while walking to a resolved lodging option (not yet asleep) — used
   *  to gate other input the same way `restCamp.isActive()` does. */
  isLodgingActive: () => boolean
  /** True while the active rest/sleep (`fadeStrength === 1` skip) can be
   *  cancelled with `Esc` right now — high starting vigor grants this from
   *  the first frame, otherwise it unlocks late via
   *  `canCancelRestProgress`/`REST_CANCEL_PROGRESS_THRESHOLD` (plan 168
   *  hay/rest UX bugfix). The single source `abortRest` gates on and
   *  `gameLoop.ts` reads for the HUD prompt — never diverges from what
   *  `Esc` will actually do. Meaningless (returns the stale progress-only
   *  fallback) outside an active `fadeStrength === 1` skip; callers already
   *  only consult it while one is active. */
  canCancelRest: () => boolean
}

export type RestActionDeps = {
  timeSkipOverlay: TimeSkipOverlay
  busyOverlay: BusyOverlay
  /** Opens the generic contextual interaction panel (`FlavorDialog` /
   *  `openFlavorDialog`) for a lodging step (plan 168 follow-up) — both the
   *  "Nocuj w mieście" place list and the paid-lodging confirm step reuse
   *  this one dependency/mechanism instead of a second lodging UI. This
   *  module builds the `title`/`description`/`actions`; Vue only renders
   *  them. */
  openLodgingPanel: (title: string, description: string, actions: readonly LodgingChoiceAction[]) => void
}

export function createRestActions(ctx: PlayerActionContext, deps: RestActionDeps): RestActions {
  const { bundle, player, inventory, hud, toast, busy, timeSkip, restCamp, keyboard, mouseLook, getPlayerSocial } = ctx
  const { timeSkipOverlay, busyOverlay, openLodgingPanel } = deps

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

  /** Stuck-movement watchdog for the current `lodgingWalkTarget` (plan
   *  `ui-input-005`) — see `advanceLodgingProgress` for the pure calculation.
   *  Reset on every arm/cancel/arrival so no stale progress ever leaks into a
   *  later walk. */
  let lodgingProgress = initialLodgingProgress()

  const resetLodgingProgress = (): void => {
    lodgingProgress = initialLodgingProgress()
  }

  /** Captured once, the instant the current rest/sleep actually begins
   *  (camp, tent or lodging — never `startWait`'s fadeStrength-0.5 skip):
   *  true when the player's vigor ratio was already above
   *  `REST_CANCEL_VIGOR_THRESHOLD` at that moment, granting `Esc` from the
   *  very start instead of waiting on `canCancelRestProgress`. Deliberately
   *  a one-time snapshot, not re-evaluated as vigor recovers mid-sleep. */
  let restCancelAllowedByVigor = false

  const captureRestCancelVigorGate = (): void => {
    restCancelAllowedByVigor = restCancelAllowedByStartVigor(getVigorRatio(player.needs.vigor))
  }

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

  /** The one settlement "Nocuj w mieście" actually offers lodging for right
   *  now — whichever loaded settlement's center is both within
   *  `REST_IN_TOWN_RADIUS` and nearest to the player, or `null` outside any
   *  of them. Two settlements can both be `getLoaded()` near a settlement
   *  boundary; the panel must never mix both settlements' options into one
   *  list, only the one the player is actually standing in/next to. */
  const nearestSettlementInRange = (): Settlement | null => {
    let best: Settlement | null = null
    let bestDist = Infinity
    for (const s of bundle.settlementsManager.getLoaded()) {
      const dist = s.center.distanceTo(player.mesh.position)
      if (dist <= REST_IN_TOWN_RADIUS && dist < bestDist) {
        best = s
        bestDist = dist
      }
    }
    return best
  }

  const isNearTown = (): boolean => nearestSettlementInRange() !== null

  const startWait = (hours: number): void => {
    if (isActionBlocked(ctx)) return
    timeSkip.start(hours, { fadeStrength: 0.5, label: `Czekasz... (${hours}h)` })
  }

  /** Every currently available lodging option for the one settlement the
   *  player is actually near (plan 168 follow-up; scoped to a single
   *  settlement as a bugfix — an adjacent settlement's beds/friends/hay must
   *  never leak into this list just because it's also `getLoaded()`) — the
   *  same collection that backs both the "Nocuj w mieście" choice panel and
   *  every revalidation (selection, arrival). Re-collected fresh every call,
   *  never cached across frames (implementation notes §4/§8). */
  const collectNearbyLodgingOptions = (): LodgingOption[] => {
    const settlement = nearestSettlementInRange()
    if (!settlement) return []
    return collectLodgingCandidates(
      [settlementLodgingInput(settlement, player.mesh.position)],
      { getPlayerSocial },
    )
  }

  /** Re-derived from authoritative state at arrival — never trusts a cached
   *  `available` flag from when the option was first resolved (implementation
   *  notes §4/§14). */
  const isLodgingOptionStillAvailable = (option: LodgingOption): boolean =>
    collectNearbyLodgingOptions().some((c) => c.id === option.id)

  const armLodgingWalk = (option: LodgingOption): void => {
    lodgingWalkTarget = option
    resetLodgingProgress()
  }

  const cancelLodgingWalk = (silent = false): void => {
    if (!lodgingWalkTarget) return
    lodgingWalkTarget = null
    keyboard.state.forward = false
    resetLodgingProgress()
    if (!silent) toast.show('Przerwano nocleg', 'info')
  }

  const cancelLodgingConfirm = (): void => {
    lodgingConfirmTarget = null
  }

  const confirmLodgingPayment = (): void => {
    const option = lodgingConfirmTarget
    lodgingConfirmTarget = null
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

  /** Opens the paid-lodging confirm step as a second `openLodgingPanel` call
   *  (implementation notes §18's "smallest existing dialog pattern", now
   *  literally `FlavorDialog` for both steps) — never charges or arms
   *  movement until the player presses "Potwierdź". */
  const openLodgingConfirm = (option: LodgingOption): void => {
    lodgingConfirmTarget = option
    const priceLabel = `Cena: ${option.price ?? 0}× moneta`
    openLodgingPanel(lodgingPlaceLabel(option), priceLabel, [
      { label: 'Potwierdź', enabled: true, reasonLabel: '', run: () => confirmLodgingPayment() },
      { label: 'Anuluj', enabled: true, reasonLabel: '', run: () => cancelLodgingConfirm() },
    ])
  }

  /** Commits the player's pick from the "Nocuj w mieście" panel (or the hay
   *  bale's direct `[E]`, via `sleepInHay`) to one specific `LodgingOption` —
   *  always re-validated against a freshly collected candidate list, never
   *  the snapshot the panel/prompt was built from (implementation notes
   *  §4/§8/§9). A stale/unavailable pick just toasts; it never silently
   *  falls back to a different option (plan 168 follow-up §8/§9). */
  const commitLodgingSelection = (optionId: string): void => {
    if (isActionBlocked(ctx) || lodgingWalkTarget || lodgingConfirmTarget) return
    const selection = selectLodgingFromCandidates(collectNearbyLodgingOptions(), optionId)
    if (selection.kind === 'unavailable') {
      toast.show('To miejsce jest już niedostępne', 'error')
      return
    }
    if (selection.kind === 'confirm') {
      openLodgingConfirm(selection.option)
      return
    }
    armLodgingWalk(selection.option)
  }

  /** Direct `[E]` on a hay bale (plan 168 follow-up) — resolves to the exact
   *  same `LodgingOption` id the resolver's hay fallback would (`hayLodgingId`),
   *  so it's the same commit path as picking "Stóg siana" from the panel. */
  const sleepInHay = (settlementId: string): void => {
    commitLodgingSelection(hayLodgingId(settlementId))
  }

  /** Shared by normal arrival and stuck-recovery arrival (plan `ui-input-005`
   *  §6/§7) — the one place a lodging walk hands off into sleep, so recovery
   *  never duplicates the completion sequence. Always clears the walk/
   *  watchdog state first; re-validates the option against a fresh
   *  candidate collection rather than trusting it's still available. */
  const completeLodgingArrival = (option: LodgingOption): void => {
    lodgingWalkTarget = null
    keyboard.state.forward = false
    resetLodgingProgress()
    if (!isLodgingOptionStillAvailable(option)) {
      toast.show('To miejsce jest już zajęte', 'error')
      return
    }
    if (option.facing != null) player.mesh.rotation.y = option.facing
    pendingLodgingQuality = lodgingRestQuality(option.quality)
    captureRestCancelVigorGate()
    player.lieDown()
    timeSkip.start(8, { fadeStrength: 1, label: `Nocujesz (${lodgingPlaceLabel(option)})...` })
  }

  /** @domain ui-input
   *  Per-frame lodging autowalk (plan 168), extended with a stuck-movement
   *  watchdog (plan `ui-input-005`) — house colliders can stop the player
   *  before `approachPoint` while `keys.forward` keeps being forced, so
   *  progress (not just elapsed time since the walk started), computed by
   *  the pure `advanceLodgingProgress` (`settlement/lodging.ts`), decides
   *  when to recover. Recovery reuses the existing
   *  `PlayerController.setPosition()` seam (already used by `startTentRest`)
   *  to place the player exactly on the authoritative `approachPoint`, then
   *  converges on the same `completeLodgingArrival` normal arrival uses —
   *  never a second sleep-start path. */
  const tickLodging = (dt: number): void => {
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
      completeLodgingArrival(option)
      return
    }
    const advanced = advanceLodgingProgress(lodgingProgress, dist, dt)
    lodgingProgress = advanced.state
    if (advanced.stuck) {
      player.setPosition(option.approachPoint.x, option.approachPoint.z)
      completeLodgingArrival(option)
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
      const options = collectNearbyLodgingOptions()
      if (options.length === 0) return 'no-lodging'
      openLodgingPanel('Nocleg w osadzie', '', options.map((option) => ({
        label: lodgingChoiceLabel(option),
        enabled: true,
        reasonLabel: '',
        run: () => commitLodgingSelection(option.id),
      })))
      return 'choose'
    }
    if (!inventory.has('blanket', 1)) return 'no-blanket'
    restCamp.start({
      onSleepStart: () => {
        // The quick action already required a blanket; the tent/fire halves
        // of the camp come from what's actually pitched/lit around here.
        beginCampRest(resolveCampContext(true, false))
        captureRestCancelVigorGate()
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
        captureRestCancelVigorGate()
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
    restCancelAllowedByVigor = false
    cancelLodgingWalk(true)
    cancelLodgingConfirm()
    timeSkip.cancel()
    timeSkipOverlay.hide()
    busyOverlay.hide()
    restCamp.cancel()
    player.standUp()
  }

  /** The one authoritative "can `Esc` cancel the active rest/sleep right
   *  now" check (plan 168 hay/rest UX bugfix) — high vigor at rest start
   *  (`restCancelAllowedByVigor`) grants it immediately; otherwise falls
   *  back to the existing late-progress unlock. Both `abortRest` (the actual
   *  gate) and the HUD (`gameLoop.ts`'s `updateTimeSkipRestUi`) call this
   *  single function so the Esc prompt never shows something `abortRest`
   *  wouldn't actually honor. */
  const canCancelRest = (): boolean =>
    canCancelRestNow(timeSkip.progress(), restCancelAllowedByVigor)

  const abortRest = (): boolean => {
    const resting = restCamp.isActive() || timeSkip.fadeStrength() === 1
      || lodgingWalkTarget !== null || lodgingConfirmTarget !== null
    if (!resting) return false
    if (timeSkip.fadeStrength() === 1 && !canCancelRest()) return false
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
    sleepInHay,
    tickLodging,
    isLodgingActive,
    canCancelRest,
  }
}
