/**
 * Candidate strategies (plan ai-003) — the explicit seam between a selected
 * `NeedId` (ai-001/002's pressure/personality arbitration) and the existing
 * `NpcAgent.beginNeed()` execution branches. Pure, world-agnostic: callers
 * resolve availability from live hooks (household stock, food-source/hunt
 * queries, tree landmarks) and pass it in as plain booleans, so this module
 * never touches `ChunkManager`/`Household`/Three.js itself and stays
 * testable without them.
 *
 * This is deliberately *not* a scoring engine — v1 selection is "first
 * available strategy wins", in the same fixed priority order the pre-ai-003
 * `beginNeed()` branches already tried alternatives in. See the ai-003 plan
 * and implementation notes for why a second utility engine is out of scope.
 */
export type NpcStrategyId =
  | 'householdFood'
  | 'hunt'
  | 'nearbyFoodSource'
  | 'gardenGather'
  | 'householdWater'
  | 'well'
  | 'fetchDeposit'
  | 'chopDeposit'

export type NpcStrategyCandidate = {
  id: NpcStrategyId
  available: boolean
}

export type FoodStrategyContext = {
  householdHasFood: boolean
  /** Whether this NPC's role can attempt the `hunt` strategy at all — the
   *  `hunt` candidate is omitted entirely (not merely unavailable) for a
   *  non-hunter, matching `beginNeed`'s hunter-only branch. */
  isHunter: boolean
  /** A real hunt target currently exists (`SettlementHuntingHooks.queryTarget`)
   *  — read-only at decision time; the actual attempt still re-queries and
   *  gates on weapon/ammo when it runs. */
  huntTargetAvailable: boolean
  /** A real nearby food source currently exists (`SettlementFoodSourceHooks.queryNearest`). */
  nearbyFoodSourceAvailable: boolean
}

/**
 * Food's vertical slice (ai-003 §2): `householdFood` → `hunt` (hunters only)
 * → `nearbyFoodSource` → `gardenGather`. `gardenGather` is always available —
 * it is the existing unconditional abstract-garden fallback, never a source
 * that can be "out of food".
 */
export function getFoodStrategyCandidates(ctx: FoodStrategyContext): NpcStrategyCandidate[] {
  const candidates: NpcStrategyCandidate[] = [
    { id: 'householdFood', available: ctx.householdHasFood },
  ]
  if (ctx.isHunter) candidates.push({ id: 'hunt', available: ctx.huntTargetAvailable })
  candidates.push({ id: 'nearbyFoodSource', available: ctx.nearbyFoodSourceAvailable })
  candidates.push({ id: 'gardenGather', available: true })
  return candidates
}

export type WaterStrategyContext = {
  householdHasWater: boolean
}

/** Personal thirst (`NeedId.water`) — household reserve first, the well
 *  (queued or not) is the existing unconditional fallback. */
export function getWaterStrategyCandidates(ctx: WaterStrategyContext): NpcStrategyCandidate[] {
  return [
    { id: 'householdWater', available: ctx.householdHasWater },
    { id: 'well', available: true },
  ]
}

/** `waterDuty` (household water provisioning) currently has a single
 *  fetch→deposit route — recorded for diagnostic parity with the other
 *  needs, not because it has real alternatives yet (ai-003 §2). */
export function getWaterDutyStrategyCandidates(): NpcStrategyCandidate[] {
  return [{ id: 'fetchDeposit', available: true }]
}

export type WoodStrategyContext = {
  /** Whether the existing chop→deposit route is usable right now (role,
   *  loaded tree landmarks) — computed by the caller from the same
   *  conditions `beginNeed`'s `wood` branch already gates on. */
  available: boolean
}

/** `wood` currently has a single concrete chop→deposit route (ai-003 §2) —
 *  no artificial alternatives just to exercise the mechanism. */
export function getWoodStrategyCandidates(ctx: WoodStrategyContext): NpcStrategyCandidate[] {
  return [{ id: 'chopDeposit', available: ctx.available }]
}

/** First-available-wins (ai-003 §5) — deliberately not a scoring engine.
 *  Candidate order encodes priority, mirroring `pickActionKind`'s
 *  strict-improvement/first-listed-wins tie idiom. `null` only when every
 *  candidate is unavailable (never happens for `food`/`water`, whose last
 *  candidate is an unconditional fallback). */
export function selectStrategy(candidates: readonly NpcStrategyCandidate[]): NpcStrategyId | null {
  return candidates.find((c) => c.available)?.id ?? null
}
