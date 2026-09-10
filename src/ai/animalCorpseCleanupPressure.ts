import type { CorpsePhase } from '../fauna/animalCorpse'
import type {
  AnimalCorpseCleanupCandidate,
  AnimalCorpseCleanupRejection,
} from '../settlement/animalCorpseSanitation'

/**
 * Settlement-local animal-corpse sanitation pressure (plan settlements-npcs-029)
 * — an independent producer competing in `NpcAgent.choose()` as a
 * `'cleanAnimalCorpse'` decision target, not a fake `NeedId` and not NPC burial.
 *
 * @domain settlements-npcs
 */

export type AnimalCorpseCleanupPressureInput = {
  claimantId: string
  claimantHouseholdId: string | null
  claimantPosition: { x: number, z: number }
  candidates: readonly AnimalCorpseCleanupCandidate[]
}

export type AnimalCorpseCleanupPressureResult = {
  score: number
  animalId: string | null
  kind: string | null
  phase: CorpsePhase | null
  responsibleHouseholdId: string | null
  claimOwner: string | null
  rejectionReason: AnimalCorpseCleanupRejection | null
}

const PHASE_BASE: Record<CorpsePhase, number> = {
  bones: 0.20,
  fresh: 0.26,
  rotting: 0.38,
}

const REMAINS_BASE = 0.20
const COUNT_BONUS_PER = 0.025
const COUNT_BONUS_MAX = 0.08
const MIN_DISTANCE = 2
const MAX_DISTANCE = 80

function distanceScore(dx: number, dz: number): number {
  const dist = Math.hypot(dx, dz)
  if (dist <= MIN_DISTANCE) return 1
  if (dist >= MAX_DISTANCE) return 0
  return 1 - (dist - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE)
}

function phaseBase(candidate: AnimalCorpseCleanupCandidate): number {
  if (candidate.meatHarvested) return REMAINS_BASE
  return PHASE_BASE[candidate.phase]
}

function eligibleForClaimant(
  candidate: AnimalCorpseCleanupCandidate,
  claimantId: string,
  claimantHouseholdId: string | null,
): AnimalCorpseCleanupRejection | null {
  if (candidate.responsibleHouseholdId == null) return 'outside-influence'
  if (claimantHouseholdId == null || candidate.responsibleHouseholdId !== claimantHouseholdId) {
    return 'other-household'
  }
  if (candidate.foodClaimed) return 'food-claimed'
  if (candidate.cleanupClaimantNpcId != null && candidate.cleanupClaimantNpcId !== claimantId) {
    return 'cleanup-claimed'
  }
  if (candidate.held && candidate.cleanupClaimantNpcId !== claimantId) return 'held'
  return null
}

/**
 * Pure — pressure evaluation never mutates corpse state. The winner later
 * claims/holds through fauna-owned operations. One corpse at a time;
 * remaining corpses re-enter on the next `choose()`.
 */
export function resolveAnimalCorpseCleanupPressure(
  input: AnimalCorpseCleanupPressureInput,
): AnimalCorpseCleanupPressureResult {
  const empty: AnimalCorpseCleanupPressureResult = {
    score: 0,
    animalId: null,
    kind: null,
    phase: null,
    responsibleHouseholdId: null,
    claimOwner: null,
    rejectionReason: input.claimantHouseholdId == null ? 'other-household' : null,
  }
  if (input.candidates.length === 0) return empty

  const householdCorpses: AnimalCorpseCleanupCandidate[] = []
  let lastRejection: AnimalCorpseCleanupRejection | null = empty.rejectionReason
  for (const candidate of input.candidates) {
    const rejection = eligibleForClaimant(candidate, input.claimantId, input.claimantHouseholdId)
    if (rejection) {
      lastRejection = rejection
      continue
    }
    householdCorpses.push(candidate)
  }

  if (householdCorpses.length === 0) {
    return { ...empty, rejectionReason: lastRejection }
  }

  const countBonus = Math.min(COUNT_BONUS_MAX, Math.max(0, householdCorpses.length - 1) * COUNT_BONUS_PER)

  let best: AnimalCorpseCleanupCandidate | null = null
  let bestScore = 0
  for (const candidate of householdCorpses) {
    const dx = candidate.x - input.claimantPosition.x
    const dz = candidate.z - input.claimantPosition.z
    const score = (phaseBase(candidate) + countBonus) * distanceScore(dx, dz)
    if (
      best == null
      || score > bestScore
      || (score === bestScore && candidate.animalId < best.animalId)
    ) {
      best = candidate
      bestScore = score
    }
  }

  if (!best || bestScore <= 0) {
    return { ...empty, rejectionReason: lastRejection }
  }

  return {
    score: bestScore,
    animalId: best.animalId,
    kind: best.kind,
    phase: best.phase,
    responsibleHouseholdId: best.responsibleHouseholdId,
    claimOwner: best.cleanupClaimantNpcId,
    rejectionReason: null,
  }
}
