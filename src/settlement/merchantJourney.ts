import type { NpcTravelContinuity, NpcTravelPoint } from '../ai/npcTravel'
import { beginOffscreenNpcTravel, observeNpcTravelArrival } from '../ai/npcTravel'

/**
 * Travelling Merchant journey lifecycle (plan settlements-npcs-038).
 *
 * Semantic phase/context only — never a second trade, cargo or travel clock.
 * `TransportOrder` owns the delivery commitment, `NpcAuthoritativeState.
 * transportCargo` owns the concrete goods, `NpcAuthoritativeState.travel`
 * owns spatial continuity; this module only tracks which of those the
 * merchant is currently in and the absolute visit window at the destination.
 *
 * @domain settlements-npcs
 */

export type MerchantJourneyPhase = 'outbound' | 'visiting' | 'returning'

export type MerchantJourneyState = {
  homeSettlementId: string
  destinationSettlementId: string
  phase: MerchantJourneyPhase
  /** Set while `outbound` — the matching `TransportOrder` this journey is
   *  riding on. Absent once `visiting`/`returning` (the order is terminal by
   *  then; the journey no longer needs it). */
  transportOrderId?: string
  visitStartedAtDays?: number
  visitEndsAtDays?: number
  /** Stable-commitment pack animal for this journey (plan
   *  settlements-npcs-048) — resolved once at journey start and carried
   *  unchanged through every phase transition below. `homeSettlementId` is
   *  its persistent-livestock origin namespace; never reselected/replaced
   *  mid-journey. Absent means the journey runs at baseline capacity. */
  packAnimalId?: string
}

/** One configured visit duration in world days — deterministic, no RNG/timers. */
export const TRAVELLING_MERCHANT_VISIT_DAYS = 2

export function cloneMerchantJourney(
  journey: MerchantJourneyState | null | undefined,
): MerchantJourneyState | null {
  if (!journey) return null
  return { ...journey }
}

/** Narrow authoritative slice so this module does not import `npcState.ts`.
 *  `accompanyCommitment` is only here to satisfy `observeNpcTravelArrival`'s
 *  `NpcTravelHost` shape — this module never reads it itself. */
export type MerchantJourneyHost = {
  merchantJourney: MerchantJourneyState | null
  travel: NpcTravelContinuity | null
  accompanyCommitment: unknown | null
  health?: { dead: boolean }
}

/** True whenever an authored home NPC is logically away on a merchant
 *  journey (any phase) — the seam `createSettlement.ts` uses to suppress
 *  rebuilding a live home `NpcAgent` for it. */
export function isNpcAwayOnMerchantJourney(state: Pick<MerchantJourneyHost, 'merchantJourney'>): boolean {
  return state.merchantJourney != null
}

/**
 * `outbound` → `visiting` on successful cross-settlement delivery — the only
 * entry point into `visiting`. Idempotent: a non-`outbound` phase, or an
 * order id mismatch, no-ops so repeated bounded arrival processing can't
 * restart the visit timer.
 *
 * @domain settlements-npcs
 */
export function advanceMerchantJourneyToVisiting(
  state: MerchantJourneyHost,
  orderId: string,
  nowDays: number,
): void {
  const journey = state.merchantJourney
  if (!journey || journey.phase !== 'outbound' || journey.transportOrderId !== orderId) return
  state.merchantJourney = {
    homeSettlementId: journey.homeSettlementId,
    destinationSettlementId: journey.destinationSettlementId,
    phase: 'visiting',
    visitStartedAtDays: nowDays,
    visitEndsAtDays: nowDays + TRAVELLING_MERCHANT_VISIT_DAYS,
    packAnimalId: journey.packAnimalId,
  }
}

/** Resolved points needed to start the return leg — `live: true` when a live
 *  `NpcAgent` still exists at the destination (its own detailed movement
 *  then owns the walk home, same as `dispatchReadyExpedition`'s live branch;
 *  `live: false` starts off-screen execution immediately). */
export type MerchantReturnPoints = {
  origin: NpcTravelPoint
  homeTarget: NpcTravelPoint
  live: boolean
}

/**
 * `visiting` → `returning` once the absolute visit window has elapsed.
 * `resolvePoints` is only invoked once expiry is actually due, and a `null`
 * result (positions not yet resolvable) leaves the journey `visiting` for a
 * later checkpoint — never freezes the merchant, never restarts on retry.
 * A dead merchant never starts a return.
 *
 * @domain settlements-npcs
 */
export function tryBeginMerchantReturn(
  state: MerchantJourneyHost,
  nowDays: number,
  dayLengthSec: number,
  resolvePoints: () => MerchantReturnPoints | null,
): void {
  const journey = state.merchantJourney
  if (!journey || journey.phase !== 'visiting') return
  if (journey.visitEndsAtDays == null || nowDays < journey.visitEndsAtDays) return
  if (state.health?.dead) return
  const points = resolvePoints()
  if (!points) return
  const purpose = { kind: 'merchant-return' as const, homeSettlementId: journey.homeSettlementId }
  state.merchantJourney = {
    homeSettlementId: journey.homeSettlementId,
    destinationSettlementId: journey.destinationSettlementId,
    phase: 'returning',
    packAnimalId: journey.packAnimalId,
  }
  state.travel = points.live
    ? { destination: { ...points.homeTarget }, lastPosition: { ...points.origin }, purpose }
    : beginOffscreenNpcTravel(points.origin, points.homeTarget, nowDays, dayLengthSec, {
        destination: points.homeTarget,
        lastPosition: points.origin,
        purpose,
      })
}

/**
 * `returning` → journey cleared on genuine home arrival — observed exactly
 * once, mirroring `resolveTransportTravelArrivals`'s own arrival contract.
 * Dead/blocked travel never counts as a successful return.
 *
 * @domain settlements-npcs
 */
export function resolveMerchantReturnArrival(state: MerchantJourneyHost): boolean {
  const journey = state.merchantJourney
  if (!journey || journey.phase !== 'returning') return false
  const travel = state.travel
  if (travel?.purpose?.kind !== 'merchant-return') return false
  if (travel.arrival !== 'reached' || travel.blocked) return false
  if (!observeNpcTravelArrival(state)) return false
  state.merchantJourney = null
  return true
}
