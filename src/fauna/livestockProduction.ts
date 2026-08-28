import type { ItemKind } from '../items/items'

/**
 * World-item hook for autonomous livestock production (plan fauna-002) — a
 * `chicken` laying an egg where it stands. Threaded straight through
 * `SettlementsManager.update` → `Settlement.update`'s livestock loop
 * (`settlement/createSettlement.ts`), the same "hooks object forwarded
 * unchanged" pattern as `SettlementHuntingHooks`/`SettlementFoodSourceHooks`.
 *
 * `onCollected` fires once, the moment the dropped item is actually picked
 * up (`items/createDroppedItems.ts`'s `drop()`/`collect()`), so the
 * producing animal can gate its next cycle on real collection instead of a
 * blind timer — see `AnimalAgent.readyToLayEgg`/`markEggLaid`/
 * `notifyEggCollected`.
 */
export type DropLivestockProductHook = (
  kind: ItemKind,
  x: number,
  z: number,
  onCollected: () => void,
) => void

/**
 * Pure day-anchor production-readiness math (plan fauna-002 §5/§6/§7) — the
 * same "lazy resolve against `nowDays`, no per-frame decrementing timer"
 * technique `items/timedProcess.ts` already uses for drying, applied to a
 * livestock production cycle. `AnimalAgent` stores only `readyAtDays` (an
 * absolute `elapsedDays` anchor) and re-derives readiness whenever it's next
 * queried — correct after any length of real time, a time-skip, or a
 * settlement being unloaded/reloaded, with no catch-up replay needed:
 * whatever `nowDays` the next real `update()` call carries is compared
 * directly against the stored anchor. `null` means "not yet initialized" —
 * see `AnimalAgent`'s lazy-stagger-on-first-tick comment. Unit-testable
 * without instantiating `AnimalAgent`/Three.js, same technique as
 * `AnimalAgent.ts`'s own `corpsePhaseFromElapsed`/`canHarvestMeatFrom`.
 */
export function livestockProductionReady(readyAtDays: number | null, nowDays: number): boolean {
  return readyAtDays !== null && nowDays >= readyAtDays
}

/** The next `readyAtDays` anchor once a cycle starts (collection/milking),
 *  `intervalDays` after `nowDays` — a fixed duration, not "however long the
 *  interval was previously running for", so a late collection never grants
 *  a shorter next wait. */
export function nextLivestockProductionReadyAtDays(nowDays: number, intervalDays: number): number {
  return nowDays + intervalDays
}

/** First-ever real tick's stagger anchor — spreads same-kind livestock
 *  across up to one full `intervalDays` so a settlement's whole coop doesn't
 *  lay eggs in lockstep on the same in-game day (plan fauna-002 §6 "różnych
 *  momentów narodzin"). `offsetFraction` is caller-supplied (`Math.random()`
 *  at the real call site) so this stays pure/deterministic for tests. */
export function initialLivestockProductionReadyAtDays(
  nowDays: number,
  intervalDays: number,
  offsetFraction: number,
): number {
  return nowDays + intervalDays * offsetFraction
}
