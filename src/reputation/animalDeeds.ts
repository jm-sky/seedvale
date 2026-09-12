import type { AnimalKind } from '../fauna/animalDefs'
import type { ReputationDimension, SocialConsequence } from './ReputationManager'

/**
 * Dangerous-animal-deed reputation resolver (plan quests-progression-019) —
 * turns one confirmed player kill of a dangerous wild animal into zero or
 * more already-resolved `SocialConsequence`s for nearby settlements. Deer and
 * livestock/harmless species never generate a deed; only the explicit
 * species baselines below do.
 *
 * Deliberately separate from `socialExposure.ts`, which is a random risk
 * roll for grave disturbance — a positive animal deed is fully deterministic
 * for a fixed kill context and settlement set, never a witness/gossip
 * simulation. Pure and stateless: never mutates `ReputationManager`, never
 * imports `QuestManager` or fauna behaviour. Callers own quest-ownership
 * suppression (`options.socialOutcomeClaimed`, fed by
 * `QuestManager.hasSocialOutcomeClaim`) and settlement candidate discovery
 * (`settlement/settlementProximity.ts`'s `settlementsWithinDistance`).
 *
 * @domain quests-progression
 * @system reputation
 * @role Pure species-baseline + distance-attenuation resolver for the
 *  generic dangerous-animal-kill reputation/renown deed.
 */

/** Player-caused kill context, captured at the moment of death (plan
 *  quests-progression-019 §1) — fauna-owned `dangerSignificance` scales the
 *  species baseline below; `1` for a normal individual, greater for
 *  exceptional variants (alpha) or the quest `dangerous` trait
 *  (`AnimalAgent.dangerSignificance`, `fauna-022`). Copied out of the
 *  `AnimalAgent` at kill time — callers must not retain the agent reference
 *  and resolve this later. */
export type PlayerAnimalKillContext = {
  animalId: string
  animalKind: AnimalKind
  dangerSignificance: number
  position: { x: number, z: number }
}

/** Read-only settlement site candidate — id + world position only, exactly
 *  what `settlementsWithinDistance` returns and all this resolver needs. */
export type AnimalDeedSettlementCandidate = { id: string, x: number, z: number }

/** Maximum distance at which a kill can affect a settlement at all (plan §5)
 *  — not a "radius of knowledge": distance alone is not evidence a
 *  settlement learned of the kill, but the plan's V1 exposure basis is that
 *  a kill local enough to a settlement (within this bound) is knowable to
 *  it. Settlements farther than this never receive a consequence. */
export const MAX_ANIMAL_DEED_INFLUENCE_DISTANCE = 3000

/** Distance within which both `reputationFactor`/`renownFactor` are `1.0`
 *  (plan §6) — a kill this close to a settlement counts in full. */
export const FULL_ANIMAL_DEED_EFFECT_DISTANCE = 500

/** Distance beyond which `reputationFactor` is `0` (plan §6) — reputation
 *  fades out well before `MAX_ANIMAL_DEED_INFLUENCE_DISTANCE`; renown keeps
 *  fading past this point (see `renownFactor`), which is what makes renown
 *  "wider-reaching" than reputation for the same kill. */
const REPUTATION_ATTENUATION_END_DISTANCE = 1500

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Linear falloff from `1.0` at `FULL_ANIMAL_DEED_EFFECT_DISTANCE` to `0` at
 *  `end`, clamped outside that span — shared shape for `reputationFactor`/
 *  `renownFactor`, which only differ in where they reach zero. */
function linearFalloff(distance: number, end: number): number {
  if (distance <= FULL_ANIMAL_DEED_EFFECT_DISTANCE) return 1
  if (distance >= end) return 0
  return clamp01(1 - (distance - FULL_ANIMAL_DEED_EFFECT_DISTANCE) / (end - FULL_ANIMAL_DEED_EFFECT_DISTANCE))
}

/** Reputation attenuation by distance from the kill site (plan §6) — `1.0`
 *  up to 500m, smoothly `0` by `REPUTATION_ATTENUATION_END_DISTANCE`
 *  (1500m), `0` beyond. Continuous and clamped to `0..1`. */
export function reputationFactor(distance: number): number {
  return linearFalloff(distance, REPUTATION_ATTENUATION_END_DISTANCE)
}

/** Renown attenuation by distance from the kill site (plan §6) — `1.0` up to
 *  500m, smoothly `0` by `MAX_ANIMAL_DEED_INFLUENCE_DISTANCE` (3000m), `0`
 *  beyond. Decays strictly slower than `reputationFactor` in their shared
 *  500..1500m overlap since it reaches zero much farther out. Continuous and
 *  clamped to `0..1`. */
export function renownFactor(distance: number): number {
  return linearFalloff(distance, MAX_ANIMAL_DEED_INFLUENCE_DISTANCE)
}

type AnimalDeedBaseline = {
  competence: number
  courage: number
  renown: number
}

/** Explicit, exhaustive species baselines (plan §4) — species absent here
 *  (every livestock/domestic/harmless wild kind) never produce a generic
 *  deed. `deer` is kept as an explicit all-zero entry on purpose: a
 *  deliberate, testable "no reward for ordinary hunting" boundary, not an
 *  accidental omission. Values are for `dangerSignificance = 1`; scaled by
 *  the individual kill's significance before rounding. Do not add fauna
 *  variants (e.g. `alpha`) here — that table lives in `fauna-022` and this
 *  domain only ever branches on `dangerSignificance`. */
const ANIMAL_DEED_SPECIES_BASELINE: Partial<Record<AnimalKind, AnimalDeedBaseline>> = {
  deer: { competence: 0, courage: 0, renown: 0 },
  fox: { competence: 1, courage: 0, renown: 1 },
  wolf: { competence: 2, courage: 2, renown: 2 },
  bear: { competence: 4, courage: 5, renown: 5 },
}

function isZeroBaseline(baseline: AnimalDeedBaseline): boolean {
  return baseline.competence === 0 && baseline.courage === 0 && baseline.renown === 0
}

/**
 * Resolves zero or more already-resolved `SocialConsequence`s for one
 * confirmed player animal kill (plan quests-progression-019). Pure: never
 * mutates `settlements`/`kill`, never touches `ReputationManager` itself.
 *
 * `options.socialOutcomeClaimed` (from `QuestManager.hasSocialOutcomeClaim`,
 * read *before* the lethal hit) suppresses the generic deed entirely when a
 * quest already owns this kill's social outcome — avoids double-rewarding
 * the same kill once via the deed and again on quest report.
 *
 * @domain quests-progression
 */
export function resolveAnimalDeedConsequences(
  kill: PlayerAnimalKillContext,
  settlements: readonly AnimalDeedSettlementCandidate[],
  options?: { socialOutcomeClaimed?: boolean },
): SocialConsequence[] {
  if (options?.socialOutcomeClaimed) return []
  const baseline = ANIMAL_DEED_SPECIES_BASELINE[kill.animalKind]
  if (!baseline || isZeroBaseline(baseline)) return []

  const consequences: SocialConsequence[] = []
  for (const settlement of settlements) {
    const distance = Math.hypot(settlement.x - kill.position.x, settlement.z - kill.position.z)
    if (distance > MAX_ANIMAL_DEED_INFLUENCE_DISTANCE) continue

    const repFactor = reputationFactor(distance)
    const renFactor = renownFactor(distance)
    const competence = Math.round(baseline.competence * kill.dangerSignificance * repFactor)
    const courage = Math.round(baseline.courage * kill.dangerSignificance * repFactor)
    const renown = Math.round(baseline.renown * kill.dangerSignificance * renFactor)
    if (competence === 0 && courage === 0 && renown === 0) continue

    const reputation: Partial<Record<ReputationDimension, number>> = {}
    if (competence !== 0) reputation.competence = competence
    if (courage !== 0) reputation.courage = courage

    consequences.push({
      settlementId: settlement.id,
      ...(Object.keys(reputation).length > 0 ? { reputation } : {}),
      ...(renown !== 0 ? { renown } : {}),
    })
  }
  return consequences
}
