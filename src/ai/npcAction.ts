import type { PlannedAction } from '../simulation'

/** v2 stage 2 (`docs/plans/archive/2026-08-07--020...`) collapses the old
 *  resource-specific `goGarden/goHomeDrink/goStock/goTree/goWell` +
 *  `chop/deposit/drink/eat` phases into one generic `goTo` → `execute` pair,
 *  parameterized by shared `PlannedAction` (`src/simulation`, plan 055).
 *  `followPath`/`goSleep`/`sleep`/`wander`/`lookAtPlayer` stay distinct —
 *  they aren't "go somewhere and perform one resource action", so folding
 *  them in would blur rather than simplify. */
export type Phase =
  | 'choose'
  /** Executing an externally supplied `CombatIntent` (plan 177) — see
   *  `beginCombat()`. Not entered by any NPC decision in this plan; a future
   *  Hunter/animal-defense/bandit decision system calls `beginCombat()`. */
  | 'combat'
  | 'execute'
  | 'exhausted'
  | 'followPath'
  | 'goSleep'
  | 'goTo'
  | 'lookAtPlayer'
  | 'sleep'
  | 'wander'

/** `conversation` and `social` (plan 151) reuse this same generic `goTo` →
 *  `execute` pair instead of a dedicated social FSM — `social` is a brief
 *  "settle at the campfire" marker (mirrors `eat`'s arrival step), and
 *  `conversation` is the shared timed interaction two NPCs execute in
 *  parallel, each through their own normal `execute` phase. */
export type ActionId =
  | 'chop'
  | 'conversation'
  | 'deposit'
  | 'drink'
  | 'eat'
  /** Local resource exchange (plan settlements-npcs-005) — the pickup leg at
   *  a village-storage stockpile or another household's home; `next` chains
   *  into the existing generic `deposit` for the carry-home leg. Falls
   *  through `classifyPendingActivity`'s default `'need'` case like any other
   *  need-driven action, same as `deposit` already does. */
  | 'exchange'
  | 'fish'
  | 'harvest'
  /** Healable-physical-injury treatment response (plan npc-002) — a normal
   *  `goTo`/`execute` step to a treatment destination (V1: this NPC's own
   *  `home`), same "reads as idle to `classifyPendingActivity`, not a Need"
   *  contract as `shelter`/`social`: `activeNeed` stays `'idle'` throughout,
   *  since healing is a pressure reaction, not a `NeedId`. */
  | 'heal'
  | 'mine'
  | 'plant'
  | 'sharpen'
  /** Sheep shearing (plan fauna-004) — profession work, reads as `work`. */
  | 'shear'
  /** Weather-pressure reaction (plan npc-012) — a normal `goTo`/`execute`
   *  step to the NPC's own `home` Place, no world-mutating effect on
   *  completion. Reads as `idle` to `classifyPendingActivity`, same as
   *  `social` — sheltering is a pressure reaction, not a Need. */
  | 'shelter'
  | 'social'
  | 'work'
  /** Nearby-player approach for an interaction intent (plan npc-016) —
   *  generic movement; payment is the first caller. */
  | 'approachPlayer'
  /** Household burial of a deceased NPC (plan npc-011) — normal `goTo`/`execute`
   *  at the corpse position; reads as `idle` to `classifyPendingActivity`. */
  | 'bury'
  /** Animal-corpse sanitation (plan settlements-npcs-029) — normal `goTo`/
   *  `execute` at the animal corpse; reads as `idle` to `classifyPendingActivity`. */
  | 'cleanAnimalCorpse'
  /** Family grave visit (plan npc-026) — normal `goTo`/`execute` at a persistent
   *  grave position; reads as `idle` to `classifyPendingActivity`. */
  | 'visitGrave'
  /** Accompany/follow commitment execution (plan npc-029) — moving-target
   *  follow or stay-at-anchor through ordinary `goTo`/`execute`. Reads as
   *  `idle` to `classifyPendingActivity` (idle-tier duty, not a NeedId). */
  | 'accompany'

/**
 * NPC adapter over the shared `PlannedAction` contract: destination and
 * duration are required for `goTo` → `execute`, and `onComplete` applies
 * domain world effects (needs / harvest) without an event bus.
 * Destination is a plain `Vec3` snapshot of a landmark/home/workplace
 * position (landmarks are not reassigned after settlement build).
 */
export type NpcPlannedAction = PlannedAction<ActionId> & {
  destination: NonNullable<PlannedAction<ActionId>['destination']>
  durationSec: number
  onComplete: () => void
  next?: NpcPlannedAction
  /** When set, this step uses a settlement `InteractionQueue` (FIFO slots). */
  queueId?: string
  /** Carried across a `next` promotion (see the `execute` phase transition)
   *  so a chained leg — e.g. ore-gathering's `deposit` after `mine` — still
   *  reports the chain's own kind (`mine`) to `getCurrentActivity()` instead
   *  of `deposit`'s own, ambiguous kind (`docs/plans/LOOSE-ENDS.md`
   *  2026-08-16). Set automatically at promotion time; never assigned when
   *  an action starts. */
  chainKind?: ActionId
  /** Live moving-target identity (plan fauna-004) — `goTo` refreshes
   *  `destination` from this animal without retargeting another sheep. */
  followAnimalId?: string
}
