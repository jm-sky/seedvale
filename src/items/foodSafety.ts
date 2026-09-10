import type { FoodBatch, FoodSourceSpecies } from './foodFreshness'
import type { ItemKind } from './items'
import { getFoodBatchFreshnessStage, sourceSpeciesForMeatKind } from './foodFreshness'

/**
 * @domain items-player
 * @system food-safety
 * @role Species/freshness-aware raw-meat poisoning-exposure risk (plan
 *  items-player-023) — a pure resolver consumed by
 *  `app/actions/survivalActions.ts::consumeItem()`. Provenance stays owned
 *  by `FoodBatch`/`foodFreshness.ts`; poisoning stays owned by
 *  `shared/temporaryConditions.ts`. This module only maps the two onto a
 *  chance/severity pair — never a second illness/condition state.
 */

/** Only these kinds can ever expose raw-meat poisoning risk — `roasted_meat`
 *  and `dried_meat` retain `sourceSpecies` for nutrition (plan
 *  items-player-002) but never re-enter this resolver, even though their
 *  batch still carries provenance. */
const RAW_MEAT_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'beef', 'boar_meat', 'deer_meat', 'rabbit_meat', 'raw_meat', 'wolf_meat',
])

export type RawMeatSafetyRisk = {
  /** `[0,1]` exposure-roll probability for one consumption event. */
  chance: number
  /** Severity passed to `applyPoisoningExposure`'s `extraSeverity` override —
   *  same 0-100 scale as `POISONING_INITIAL_EXPOSURE_SEVERITY`. */
  severity: number
}

type RawMeatSafetyProfile = RawMeatSafetyRisk

/** Base (fresh) risk per source species — simple, deliberately centralized
 *  balancing data. Ordering reflects a mild "wilder/scavenger species are
 *  riskier" gradient without modeling anything beyond the existing
 *  `FoodSourceSpecies` vocabulary. */
const RAW_MEAT_SAFETY_BY_SPECIES: Record<FoodSourceSpecies, RawMeatSafetyProfile> = {
  rabbit: { chance: 0.05, severity: 15 },
  cow: { chance: 0.08, severity: 18 },
  deer: { chance: 0.1, severity: 20 },
  boar: { chance: 0.18, severity: 28 },
  wolf: { chance: 0.22, severity: 32 },
}

/** Generic `raw_meat` carries no `sourceSpecies` when picked up without a
 *  tracked-provenance harvest — still deterministic and never skipped. */
const GENERIC_RAW_MEAT_SAFETY: RawMeatSafetyProfile = { chance: 0.12, severity: 20 }

/** Shared `medium`-freshness chance multiplier — one modifier for every
 *  species instead of a duplicated per-species medium profile. `fresh` and
 *  `spoiled` are unaffected: `spoiled` never reaches this resolver at all
 *  (blocked earlier, by the existing `consumeItem()` preflight). */
const MEDIUM_FRESHNESS_RISK_MULTIPLIER = 1.6

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Raw-meat poisoning-exposure risk for one consumption event, or `null` when
 * `kind` isn't raw meat, or the batch is already Spoiled (existing
 * `consumeItem()` preflight refuses spoiled food outright — this is not a
 * "very high risk" case). Species resolves from `batch.sourceSpecies` when
 * present, else the kind's own species mapping, else the generic fallback —
 * always defined, never a silent no-risk default for legacy/generic meat.
 *
 * @domain items-player
 */
export function resolveRawMeatSafetyRisk(
  kind: ItemKind,
  batch: FoodBatch | undefined,
  nowDays: number,
): RawMeatSafetyRisk | null {
  if (!RAW_MEAT_KINDS.has(kind)) return null
  const stage = batch ? getFoodBatchFreshnessStage(kind, batch, nowDays) : 'fresh'
  if (stage === 'spoiled') return null
  const species = batch?.sourceSpecies ?? sourceSpeciesForMeatKind(kind)
  const profile = species ? RAW_MEAT_SAFETY_BY_SPECIES[species] : GENERIC_RAW_MEAT_SAFETY
  const multiplier = stage === 'medium' ? MEDIUM_FRESHNESS_RISK_MULTIPLIER : 1
  return {
    chance: clamp01(profile.chance * multiplier),
    severity: profile.severity,
  }
}
