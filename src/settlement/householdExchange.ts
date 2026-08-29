import type { Household, HouseholdId, HouseholdResourceKind } from './household'

/**
 * Household ↔ household local exchange (plan settlements-npcs-005) — a
 * bounded, same-settlement source lookup for an NPC's shortage need. Not a
 * second household index: `createSettlement.ts` builds the candidate list
 * once from the settlement's own already-materialized `households` array
 * (the same one `households[familyIndex]` already indexes), so this stays a
 * local, per-settlement lookup — never a world-wide household scan.
 */

export type HouseholdSurplusCandidate = {
  household: Household
  /** This household's home position — a static snapshot (home Places don't
   *  move once a settlement is built), used only for the nearest-first tie-
   *  break below. */
  position: { x: number, z: number }
}

/**
 * Picks the best local surplus source of `kind` for a shortage at `near`,
 * excluding `excludeHouseholdId` (a household never trades with itself).
 * Nearest first; household id is the deterministic tie-break for equal
 * distance — never `Math.random()`, so repeated decisions with the same
 * world state pick the same source. Pure/testable: callers must still
 * re-check `household.surplus(kind)` live at claim time (see
 * `economy/localExchange.ts`'s `claimHouseholdSurplus`) since another actor
 * may consume the source between this selection and the actual pickup.
 */
export function selectHouseholdSurplusSource(
  candidates: readonly HouseholdSurplusCandidate[],
  excludeHouseholdId: HouseholdId,
  kind: HouseholdResourceKind,
  near: { x: number, z: number },
): HouseholdSurplusCandidate | null {
  let best: HouseholdSurplusCandidate | null = null
  let bestDistSq = Infinity
  for (const candidate of candidates) {
    if (candidate.household.id === excludeHouseholdId) continue
    if (candidate.household.surplus(kind) <= 0) continue
    const dx = candidate.position.x - near.x
    const dz = candidate.position.z - near.z
    const distSq = dx * dx + dz * dz
    if (!best || distSq < bestDistSq || (distSq === bestDistSq && candidate.household.id < best.household.id)) {
      best = candidate
      bestDistSq = distSq
    }
  }
  return best
}

/** Narrow hook shape injected into `NpcAgent`, mirroring `HelperDeliveryHooks`
 *  (`world/helperDeliveryHooks.ts`)'s "just the domain operation this need
 *  wants" shape — never the full candidate list or settlement internals. */
export type HouseholdExchangeHooks = {
  findSurplusSource: (
    excludeHouseholdId: HouseholdId,
    kind: HouseholdResourceKind,
    near: { x: number, z: number },
  ) => HouseholdSurplusCandidate | null
}

/** Built once per settlement in `createSettlement.ts` from its own
 *  `households` array — candidates are captured live (`Household` objects
 *  mutate in place; `surplus()` always reflects current stock), so this
 *  factory does not need to be recreated as stock changes. */
export function createHouseholdExchangeHooks(candidates: readonly HouseholdSurplusCandidate[]): HouseholdExchangeHooks {
  return {
    findSurplusSource: (excludeHouseholdId, kind, near) =>
      selectHouseholdSurplusSource(candidates, excludeHouseholdId, kind, near),
  }
}
