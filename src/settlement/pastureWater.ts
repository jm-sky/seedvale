import type { Household } from './household'

/**
 * @domain settlements-npcs
 * @role Canonical pasture well ↔ pasture trough local water use contract
 *  (plan settlements-npcs-046). Single source for the "close enough for the
 *  well's rope bucket" reach shared by the pasture layout generator
 *  (`villagePasture.ts`) and pasture-trough player/runtime interaction
 *  eligibility. This is the well+trough usable reach, not a collision or
 *  terrain-clearance footprint (see `villagePasture.ts`'s `WELL_RADIUS`/
 *  `TROUGH_RADIUS`, which stay independent obstacle-clearance radii).
 */
export const PASTURE_WELL_TROUGH_BUCKET_REACH = 2

/** World-space center-to-center distance between a pasture's well and trough anchors. */
export function pastureWellTroughDistance(
  well: { readonly x: number, readonly z: number },
  trough: { readonly x: number, readonly z: number },
): number {
  return Math.hypot(well.x - trough.x, well.z - trough.z)
}

/**
 * Canonical owning `Household` for a settlement's pasture trough (plan
 * settlements-npcs-046). The physical pasture trough is a shared water
 * target for every household's livestock (`livestock.ts`'s
 * `spawnLivestock`), so exactly one household must back both player fill and
 * livestock drinking there — otherwise the same physical trough would
 * silently represent a different `Household.water` reserve depending on
 * which animal or player action touched it. Prefers the settlement's
 * shepherd household (present whenever one was staffed, `families.ts` role
 * `'shepherd'`); falls back to the first household so a pasture without a
 * shepherd still resolves deterministically from settlement composition
 * alone. `undefined` only for a settlement with no households at all.
 */
export function resolvePastureWaterHousehold(
  households: readonly Household[],
  shepherdFamilyIndex: number | null,
): Household | undefined {
  if (shepherdFamilyIndex != null) {
    const shepherd = households[shepherdFamilyIndex]
    if (shepherd) return shepherd
  }
  return households[0]
}

/** Whether the pasture trough's canonical household has room for another
 *  fill (plan settlements-npcs-046) — the player-fill eligibility gate. */
export function pastureTroughCanFill(household: Pick<Household, 'water'>): boolean {
  return household.water.current < household.water.capacity
}

/** `[E]` prompt text for the generated pasture trough — same "full"
 *  flavor-text convention as `playerTrough.ts`'s `playerTroughPromptLabel`,
 *  but never gated on a carried bucket/waterskin (the pasture well's rope
 *  bucket is implicit infrastructure, not player inventory). */
export function pastureTroughPromptLabel(household: Pick<Household, 'water'>): string {
  return pastureTroughCanFill(household) ? '[E] Napełnij koryto' : 'Koryto pełne'
}
