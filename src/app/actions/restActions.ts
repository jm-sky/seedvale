import type { Settlement } from '../../settlement/createSettlement'
import type { LodgingOption } from '../../settlement/lodging'
import type { BusyOverlay } from '../../ui/createBusyOverlay'
import type { RestOutcome, RestVariant } from '../../ui/createQuickActions'
import type { TimeSkipOverlay } from '../../ui/createTimeSkipOverlay'
import {
  CAMP_REPAIR_SESSION_HOURS,
  CAMP_REPAIR_SESSION_SEC,
  campRepairCapability,
  campRepairDurationScale,
  type CampRepairQuote,
  type CampRepairStartOutcome,
  type CampRepairTargetKind,
  campRepairXp,
  hasActiveCampRepair,
  resolveCampRepairQuote,
} from '../../items/campRepair'
import {
  CONSTRUCTION_MATERIAL_RADIUS,
  consumeMaterial,
  hasMaterial,
  type MaterialRequirement,
} from '../../items/constructionMaterials'
import { inventoryFullToastText } from '../../items/Inventory'
import { CAPABILITY_NEED_LABEL } from '../../items/itemCatalog'
import { createTentInstance } from '../../items/itemInstances'
import { canCancelRestNow, ITEM_DEFS, restCancelAllowedByStartVigor } from '../../items/items'
import { tentRestPose } from '../../items/tentProp'
import {
  applyRepresentedPhysicalEffortVigor,
  physicalEffortStaminaCostPerSec,
  restoreNeedsFromSleep,
} from '../../player/PlayerNeeds'
import { awardSkillXp, SKILL_XP_AWARD } from '../../player/PlayerSkills'
import { evaluateSkillCompetence } from '../../player/skillEvaluation'
import {
  advanceLodgingProgress,
  hayLodgingId,
  initialLodgingProgress,
  LODGING_ARRIVE_TOLERANCE,
  lodgingChoiceLabel,
  lodgingPlaceLabel,
  lodgingRestQuality,
} from '../../settlement/lodging'
import { collectLodgingCandidates, collectOwnedHouseLodgingOptions, selectLodgingFromCandidates, settlementLodgingInput } from '../../settlement/lodgingResolver'
import { getVigorRatio } from '../../shared/VigorState'
import { formatWorkDuration } from '../../world/playerWell'
import { type RepairProgress, repairRemainingWork } from '../../world/repair'
import { residentialBuildingLodgingId } from '../../world/residentialBuilding'
import { findNearestSleepingUtility } from '../../world/sleepingUtilities'
import { TENT_SHELTER_RADIUS, tentShelterFactor } from '../campRest'
import { type CampInspectionDetailRow, campInspectionRepairTargets, formatCampInspectionDetails, resolveCampRestSnapshot } from '../campRestSnapshot'
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
  inspectTent: (id: string) => void
  inspectCamp: (tentId: string) => void
  inspectBedroll: (id: string) => void
  inspectPlatform: (id: string) => void
  packTent: (id: string) => void
  workOnCampRepair: (kind: CampRepairTargetKind, id: string) => void
  campRepairAvailable: (kind: CampRepairTargetKind, id: string) => { mode: 'start' | 'continue' } | null
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
  /** Direct `[E]` on a completed Player-owned house (plan settlements-005). */
  sleepInOwnedHouse: (buildingId: string) => void
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
  openLodgingPanel: (
    title: string,
    description: string,
    actions: readonly LodgingChoiceAction[],
    details?: readonly CampInspectionDetailRow[],
  ) => void
}

export function createRestActions(ctx: PlayerActionContext, deps: RestActionDeps): RestActions {
  const { bundle, player, inventory, hud, toast, busy, timeSkip, restCamp, keyboard, mouseLook, getPlayerSocial, dayNight } = ctx
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

  /** One-shot camp snapshot at an explicit anchor — never a per-frame scan.
   *  Only player-built fires count as camp warmth; a village's own campfire
   *  belongs to town rest. Quality comes from the same `campRest.ts` path
   *  inspection uses (plan items-player-018). */
  const resolveSnapshot = (x: number, z: number, hasBlanket: boolean) => resolveCampRestSnapshot({
    x,
    z,
    tents: bundle.placedTents,
    bedrolls: bundle.sleepingUtilities.bedrolls,
    platforms: bundle.sleepingUtilities.platforms,
    fires: bundle.placedFires.list(),
    nowDays: dayNight.elapsedDays,
    hasBlanket,
    survivalValue: player.skills.survival.value,
  })

  const beginCampRest = (snapshot: ReturnType<typeof resolveSnapshot>): void => {
    pendingRest = {
      quality: snapshot.quality,
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

  const ownedHouseOptions = (): LodgingOption[] =>
    collectOwnedHouseLodgingOptions(bundle.residentialBuildings.nodes())

  /** Every currently available lodging option for the one settlement the
   *  player is actually near (plan 168 follow-up; scoped to a single
   *  settlement as a bugfix — an adjacent settlement's beds/friends/hay must
   *  never leak into this list just because it's also `getLoaded()`) — the
   *  same collection that backs both the "Nocuj w mieście" choice panel and
   *  every revalidation (selection, arrival). Re-collected fresh every call,
   *  never cached across frames (implementation notes §4/§8). Owned houses
   *  associated with this settlement appear here; out-of-settlement houses
   *  are only reachable via direct `[E]`. */
  const collectNearbyLodgingOptions = (): LodgingOption[] => {
    const settlement = nearestSettlementInRange()
    const localOwned = settlement
      ? ownedHouseOptions().filter((option) => option.settlementId === settlement.id)
      : []
    if (!settlement) return localOwned
    return collectLodgingCandidates(
      [settlementLodgingInput(settlement, player.mesh.position)],
      { getPlayerSocial, ownedHouses: localOwned },
    )
  }

  const collectLodgingOptionsForRevalidation = (): LodgingOption[] => {
    const nearby = collectNearbyLodgingOptions()
    const extras = ownedHouseOptions()
    const seen = new Set(nearby.map((option) => option.id))
    return [...nearby, ...extras.filter((option) => !seen.has(option.id))]
  }

  /** Re-derived from authoritative state at arrival — never trusts a cached
   *  `available` flag from when the option was first resolved (implementation
   *  notes §4/§14). */
  const isLodgingOptionStillAvailable = (option: LodgingOption): boolean =>
    collectLodgingOptionsForRevalidation().some((c) => c.id === option.id)

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
    const selection = selectLodgingFromCandidates(collectLodgingOptionsForRevalidation(), optionId)
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

  const sleepInOwnedHouse = (buildingId: string): void => {
    commitLodgingSelection(residentialBuildingLodgingId(buildingId))
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
        beginCampRest(resolveSnapshot(player.mesh.position.x, player.mesh.position.z, true))
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
        beginCampRest(resolveSnapshot(player.mesh.position.x, player.mesh.position.z, inventory.has('blanket', 1)))
        captureRestCancelVigorGate()
        timeSkip.start(8, { fadeStrength: 1, label: 'Odpoczywasz w namiocie...' })
      },
      onComplete: () => {},
    })
  }

  const shelterAt = (x: number, z: number): number => {
    const tent = findNearestSleepingUtility(bundle.placedTents.list(), x, z, TENT_SHELTER_RADIUS)
    const tentCondition = tent ? bundle.placedTents.conditionOf(tent.id, dayNight.elapsedDays) ?? 0 : 0
    return tentShelterFactor(tentCondition)
  }

  type CampRepairView = {
    title: string
    description: string
    canAct: boolean
    reasonLabel: string
    mode: 'start' | 'continue'
  }

  const describeCampRepair = (kind: CampRepairTargetKind, id: string): CampRepairView | null => {
    const nowDays = dayNight.elapsedDays
    if (kind === 'tent') {
      const tent = bundle.placedTents.get(id)
      if (!tent) return null
      if (hasActiveCampRepair(tent) && tent.repair) {
        return formatContinueView('tent', 'Naprawa namiotu', tent.repair)
      }
      const current = bundle.placedTents.conditionOf(id, nowDays)
      if (current === null) return null
      return describeQuote('tent', current, tent.x, tent.z)
    }
    if (kind === 'bedroll') {
      const bedroll = bundle.sleepingUtilities.bedrolls.get(id)
      if (!bedroll) return null
      if (hasActiveCampRepair(bedroll) && bedroll.repair) {
        return formatContinueView('bedroll', 'Naprawa posłania', bedroll.repair)
      }
      const current = bundle.sleepingUtilities.bedrolls.conditionOf(id, nowDays, shelterAt(bedroll.x, bedroll.z))
      if (current === null) return null
      return describeQuote('bedroll', current, bedroll.x, bedroll.z)
    }
    const platform = bundle.sleepingUtilities.platforms.get(id)
    if (!platform) return null
    if (hasActiveCampRepair(platform) && platform.repair) {
      return formatContinueView('platform', 'Naprawa podestu', platform.repair)
    }
    const current = bundle.sleepingUtilities.platforms.conditionOf(id, nowDays, shelterAt(platform.x, platform.z))
    if (current === null) return null
    return describeQuote('platform', current, platform.x, platform.z)
  }

  const formatContinueView = (kind: CampRepairTargetKind, title: string, repair: RepairProgress): CampRepairView => {
    const capability = campRepairCapability(kind)
    const canAct = inventory.hasCapability(capability)
    return {
      title,
      description: [
        `Stan przed naprawą: ${Math.round(repair.startedCondition)} / 100`,
        `Cel: ${Math.round(repair.targetCondition)} / 100`,
        `Postęp pracy: ${formatWorkDuration(repair.completedWork)} / ${formatWorkDuration(repair.requiredWork)}`,
        'Materiały: dostarczone',
      ].join('\n'),
      canAct,
      reasonLabel: canAct ? '' : `Potrzebujesz ${CAPABILITY_NEED_LABEL[capability]}.`,
      mode: 'continue',
    }
  }

  const describeQuote = (kind: CampRepairTargetKind, current: number, x: number, z: number): CampRepairView | null => {
    const quote = resolveCampRepairQuote(kind, current)
    if (!quote) return null
    return formatQuoteView(kind, quote, x, z)
  }

  const formatQuoteView = (kind: CampRepairTargetKind, quote: CampRepairQuote, x: number, z: number): CampRepairView => {
    const title = kind === 'tent' ? 'Napraw namiot' : kind === 'bedroll' ? 'Napraw posłanie' : 'Napraw podest'
    if (!inventory.hasCapability(quote.capability)) {
      return {
        title,
        description: '',
        canAct: false,
        reasonLabel: `Potrzebujesz ${CAPABILITY_NEED_LABEL[quote.capability]}.`,
        mode: 'start',
      }
    }
    const missing = quote.materials.filter(
      (r) => !hasMaterial(inventory, bundle.droppedItems, x, z, CONSTRUCTION_MATERIAL_RADIUS, r),
    )
    const materialLines = quote.materials.length > 0
      ? quote.materials.map((r) => `${r.count} × ${ITEM_DEFS[r.kind].label}`).join('\n')
      : 'brak'
    return {
      title,
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

  const campRecord = (kind: CampRepairTargetKind, id: string) =>
    kind === 'tent'
      ? bundle.placedTents.get(id)
      : kind === 'bedroll'
        ? bundle.sleepingUtilities.bedrolls.get(id)
        : bundle.sleepingUtilities.platforms.get(id)

  const startCampRepairBout = (kind: CampRepairTargetKind, id: string): void => {
    const record = campRecord(kind, id)
    if (!record?.repair) return
    const remainingHours = repairRemainingWork(record.repair)
    if (remainingHours <= 0) return
    const sessionHours = Math.min(CAMP_REPAIR_SESSION_HOURS, remainingHours)
    const competence = evaluateSkillCompetence(player.skills, 'repair')
    const sessionSec = (sessionHours / CAMP_REPAIR_SESSION_HOURS) * CAMP_REPAIR_SESSION_SEC * campRepairDurationScale(competence.primary.value)
    const startedAt = performance.now()
    const effort = kind === 'platform' ? 'moderate' as const : 'light' as const
    const contribute = (work: number): void => {
      const accepted = kind === 'tent'
        ? bundle.placedTents.contributeRepairWork(id, work, dayNight.elapsedDays)
        : kind === 'bedroll'
          ? bundle.sleepingUtilities.bedrolls.contributeRepairWork(id, work, dayNight.elapsedDays)
          : bundle.sleepingUtilities.platforms.contributeRepairWork(id, work, dayNight.elapsedDays)
      applyRepresentedPhysicalEffortVigor(player.needs.vigor, effort, accepted)
      awardSkillXp(player.skills, 'repair', campRepairXp(accepted))
    }
    const creditPartial = (): void => {
      const elapsedSec = Math.min(sessionSec, Math.max(0, (performance.now() - startedAt) / 1000))
      const fraction = sessionSec > 0 ? elapsedSec / sessionSec : 1
      contribute(sessionHours * fraction)
    }
    const label = kind === 'tent' ? 'Naprawa namiotu…' : kind === 'bedroll' ? 'Naprawa posłania…' : 'Naprawa podestu…'
    busy.start(sessionSec, label, () => {
      contribute(sessionHours)
    }, {
      onCancel: creditPartial,
      staminaCostPerSec: physicalEffortStaminaCostPerSec(effort),
    })
  }

  const workOnCampRepair = (kind: CampRepairTargetKind, id: string): void => {
    if (isActionBlocked(ctx)) return
    const nowDays = dayNight.elapsedDays
    const startIfNeeded = (): boolean => {
      const hasCap = (c: Parameters<typeof inventory.hasCapability>[0]) => inventory.hasCapability(c)
      const at = (x: number, z: number) => ({
        has: (r: Parameters<typeof hasMaterial>[5]) => hasMaterial(inventory, bundle.droppedItems, x, z, CONSTRUCTION_MATERIAL_RADIUS, r),
        consume: (r: Parameters<typeof consumeMaterial>[5]) => {
          consumeMaterial(inventory, bundle.droppedItems, x, z, CONSTRUCTION_MATERIAL_RADIUS, r)
        },
      })
      const refuseCapability = (capability: ReturnType<typeof campRepairCapability>): false => {
        toast.show(`Potrzebujesz ${CAPABILITY_NEED_LABEL[capability]}.`, 'error')
        return false
      }
      const refuseMissing = (missing: readonly MaterialRequirement[]): false => {
        toast.show(`Potrzebujesz: ${missing.map((r) => `${r.count}× ${ITEM_DEFS[r.kind].label}`).join(', ')}.`, 'error')
        return false
      }
      const reportStart = (outcome: CampRepairStartOutcome): boolean => {
        if (outcome.status === 'blocked-capability') return refuseCapability(outcome.capability)
        if (outcome.status === 'blocked') return refuseMissing(outcome.missing)
        if (outcome.status !== 'started') return false
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
        return true
      }
      if (kind === 'tent') {
        const tent = bundle.placedTents.get(id)
        if (!tent) return false
        if (tent.repair) {
          const capability = campRepairCapability('tent')
          return hasCap(capability) || refuseCapability(capability)
        }
        const materials = at(tent.x, tent.z)
        return reportStart(bundle.placedTents.startRepair(id, nowDays, hasCap, materials.has, materials.consume))
      }
      if (kind === 'bedroll') {
        const bedroll = bundle.sleepingUtilities.bedrolls.get(id)
        if (!bedroll) return false
        if (bedroll.repair) {
          const capability = campRepairCapability('bedroll')
          return hasCap(capability) || refuseCapability(capability)
        }
        const materials = at(bedroll.x, bedroll.z)
        return reportStart(bundle.sleepingUtilities.bedrolls.startRepair(
          id, nowDays, shelterAt(bedroll.x, bedroll.z), hasCap, materials.has, materials.consume,
        ))
      }
      const platform = bundle.sleepingUtilities.platforms.get(id)
      if (!platform) return false
      if (platform.repair) {
        const capability = campRepairCapability('platform')
        return hasCap(capability) || refuseCapability(capability)
      }
      const materials = at(platform.x, platform.z)
      return reportStart(bundle.sleepingUtilities.platforms.startRepair(
        id, nowDays, shelterAt(platform.x, platform.z), hasCap, materials.has, materials.consume,
      ))
    }
    if (!startIfNeeded()) return
    startCampRepairBout(kind, id)
  }

  const campRepairActionLabel = (kind: CampRepairTargetKind, mode: 'start' | 'continue'): string => {
    if (mode === 'continue') {
      return kind === 'tent'
        ? 'Kontynuuj naprawę namiotu'
        : kind === 'bedroll'
          ? 'Kontynuuj naprawę posłania'
          : 'Kontynuuj naprawę podestu'
    }
    return kind === 'tent' ? 'Napraw namiot' : kind === 'bedroll' ? 'Napraw posłanie' : 'Napraw podest'
  }

  const inspectTent = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const tent = bundle.placedTents.list().find((entry) => entry.id === id)
    if (!tent) return
    const snapshot = resolveSnapshot(tent.x, tent.z, inventory.has('blanket', 1))
    const instance = createTentInstance(bundle.placedTents.conditionOf(id, dayNight.elapsedDays) ?? tent.condition, tent.id)
    const canPack = !hasActiveCampRepair(tent) && inventory.canAddInstance(instance)
    const actions: LodgingChoiceAction[] = [
      { label: 'Odpocznij', enabled: true, reasonLabel: '', run: () => startTentRest(id) },
    ]
    const continueNotes: string[] = []
    for (const target of campInspectionRepairTargets(snapshot)) {
      const repair = describeCampRepair(target.kind, target.id)
      if (!repair) continue
      actions.push({
        label: campRepairActionLabel(target.kind, repair.mode),
        enabled: repair.canAct,
        reasonLabel: repair.reasonLabel,
        run: () => workOnCampRepair(target.kind, target.id),
      })
      if (repair.mode === 'continue' && repair.description) continueNotes.push(repair.description)
    }
    actions.push({
      label: 'Złóż namiot',
      enabled: canPack,
      reasonLabel: hasActiveCampRepair(tent)
        ? 'Nie możesz złożyć namiotu w trakcie naprawy.'
        : canPack ? '' : inventoryFullToastText(inventory, 'tent', 1),
      run: () => packTent(id),
    })
    actions.push({ label: 'Zamknij', enabled: true, reasonLabel: '', run: () => {} })
    const title = snapshot.bedroll || snapshot.platform ? 'Twój obóz' : 'To twój namiot'
    openLodgingPanel(title, continueNotes.join('\n\n'), actions, formatCampInspectionDetails(snapshot))
  }

  const inspectCamp = (tentId: string): void => inspectTent(tentId)

  const inspectBedroll = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const bedroll = bundle.sleepingUtilities.bedrolls.get(id)
    if (!bedroll) return
    const condition = bundle.sleepingUtilities.bedrolls.conditionOf(id, dayNight.elapsedDays, shelterAt(bedroll.x, bedroll.z)) ?? bedroll.condition
    const repair = describeCampRepair('bedroll', id)
    const actions: LodgingChoiceAction[] = []
    if (repair) {
      actions.push({
        label: repair.mode === 'continue' ? 'Kontynuuj naprawę' : 'Napraw',
        enabled: repair.canAct,
        reasonLabel: repair.reasonLabel,
        run: () => workOnCampRepair('bedroll', id),
      })
    }
    actions.push({ label: 'Zamknij', enabled: true, reasonLabel: '', run: () => {} })
    openLodgingPanel('Posłanie', [
      `Stan: ${Math.round(condition)} / 100`,
      repair ? `\n\n${repair.description}` : '',
    ].join(''), actions)
  }

  const inspectPlatform = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const platform = bundle.sleepingUtilities.platforms.get(id)
    if (!platform) return
    const condition = bundle.sleepingUtilities.platforms.conditionOf(id, dayNight.elapsedDays, shelterAt(platform.x, platform.z)) ?? platform.condition
    const repair = describeCampRepair('platform', id)
    const actions: LodgingChoiceAction[] = []
    if (repair) {
      actions.push({
        label: repair.mode === 'continue' ? 'Kontynuuj naprawę' : 'Napraw',
        enabled: repair.canAct,
        reasonLabel: repair.reasonLabel,
        run: () => workOnCampRepair('platform', id),
      })
    }
    actions.push({ label: 'Zamknij', enabled: true, reasonLabel: '', run: () => {} })
    openLodgingPanel('Podest do spania', [
      `Stan: ${Math.round(condition)} / 100`,
      repair ? `\n\n${repair.description}` : '',
    ].join(''), actions)
  }

  const packTent = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const live = bundle.placedTents.get(id)
    if (!live) return
    if (hasActiveCampRepair(live)) {
      toast.show('Nie możesz złożyć namiotu w trakcie naprawy.', 'error')
      return
    }
    const resolved = bundle.placedTents.conditionOf(id, dayNight.elapsedDays) ?? live.condition
    const preview = createTentInstance(resolved, live.id)
    if (!inventory.canAddInstance(preview)) {
      toast.show(inventoryFullToastText(inventory, 'tent', 1), 'error')
      return
    }
    const packed = bundle.placedTents.pack(id, dayNight.elapsedDays)
    if (packed.status !== 'packed') return
    inventory.addInstance(createTentInstance(packed.tent.condition, packed.tent.id))
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
    inspectTent,
    inspectCamp,
    inspectBedroll,
    inspectPlatform,
    packTent,
    workOnCampRepair,
    campRepairAvailable: (kind, id) => {
      const view = describeCampRepair(kind, id)
      return view ? { mode: view.mode } : null
    },
    onSleepFinished,
    abortRest,
    abortBusy,
    interruptRestForDamage,
    sleepInHay,
    sleepInOwnedHouse,
    tickLodging,
    isLodgingActive,
    canCancelRest,
  }
}
