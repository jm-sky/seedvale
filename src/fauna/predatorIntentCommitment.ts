import {
  decidePredatorHumanIntent,
  isAttackRollSuppressed,
  type PredatorHumanDecisionInput,
  type PredatorHumanIntent,
  PROVOKED_FLEE_HP_RATIO,
} from './predatorHumanDecision'

/**
 * Encounter-stable predator vs-human intent (player or NPC).
 *
 * `decidePredatorHumanIntent` stays the pure scorer; this wrapper keeps the
 * aggression roll and the adopted attack/flee choice stable for one
 * encounter so a 0.2 s refresh cannot thrash chase ↔ flee. Perception still
 * re-scores every tick — only the adopted intent is held.
 *
 * @domain fauna
 */

/** How long an adopted `attack`/`flee` is held unless a hard override fires.
 *  Long enough to stop spinning in place; short enough that a later
 *  frozen-roll rescore can still change its mind. `ignore` is not held. */
export const PREDATOR_INTENT_COMMIT_SEC = 2

export type PredatorIntentCommitment = {
  /** Encounter identity (`'player'` or the NPC id). `null` = no encounter. */
  targetKey: string | null
  intent: PredatorHumanIntent
  /** Frozen for the encounter; re-rolled only on a new target or force-reroll. */
  aggressionRoll: number
  remainingSec: number
}

export type PredatorIntentDebugInfo = {
  intent: PredatorHumanIntent
  committed: boolean
  remainingSec: number
}

export type ResolveCommittedPredatorIntentArgs = {
  input: PredatorHumanDecisionInput
  dt: number
  /** `'player'` / NPC id while the encounter is live; `null` ends it. */
  targetKey: string | null
  /** Consumed only on a new encounter or `forceReroll`. */
  nextRoll: number
  /** Provocation/damage — drop commitment and roll again this tick. */
  forceReroll?: boolean
}

export function createPredatorIntentCommitment(): PredatorIntentCommitment {
  return {
    targetKey: null,
    intent: 'flee',
    aggressionRoll: 0,
    remainingSec: 0,
  }
}

export function clearPredatorIntentCommitment(commitment: PredatorIntentCommitment): void {
  commitment.targetKey = null
  commitment.remainingSec = 0
}

export function predatorIntentDebugInfo(
  commitment: PredatorIntentCommitment,
): PredatorIntentDebugInfo | null {
  if (commitment.targetKey === null) return null
  return {
    intent: commitment.intent,
    committed: commitment.remainingSec > 0,
    remainingSec: commitment.remainingSec,
  }
}

/**
 * Re-score every call with the frozen encounter roll; adopt attack/flee only
 * when uncommitted or a hard override already encoded in the scorer fires.
 */
export function resolveCommittedPredatorIntent(
  commitment: PredatorIntentCommitment,
  args: ResolveCommittedPredatorIntentArgs,
): PredatorHumanIntent | null {
  if (args.targetKey === null) {
    clearPredatorIntentCommitment(commitment)
    return null
  }

  const newEncounter = commitment.targetKey !== args.targetKey
  const forceReroll = args.forceReroll === true
  if (newEncounter || forceReroll) {
    commitment.aggressionRoll = args.nextRoll
    commitment.targetKey = args.targetKey
  }

  const proposed = decidePredatorHumanIntent({
    ...args.input,
    aggressionRoll: commitment.aggressionRoll,
  })

  if (commitment.remainingSec > 0) {
    commitment.remainingSec = Math.max(0, commitment.remainingSec - args.dt)
  }

  const holding = !newEncounter && !forceReroll && commitment.remainingSec > 0
  if (holding && !shouldBreakPredatorIntentCommitment(commitment.intent, proposed, args.input)) {
    return commitment.intent
  }

  commitment.intent = proposed
  commitment.remainingSec = commitDurationSec(proposed)
  return proposed
}

function commitDurationSec(intent: PredatorHumanIntent): number {
  return intent === 'ignore' ? 0 : PREDATOR_INTENT_COMMIT_SEC
}

/** Hard overrides only — proximity/hunger score drift must not break a hold. */
function shouldBreakPredatorIntentCommitment(
  committed: PredatorHumanIntent,
  proposed: PredatorHumanIntent,
  input: PredatorHumanDecisionInput,
): boolean {
  if (proposed === committed) return false
  if (committed === 'ignore' && proposed !== 'ignore') return true
  if (proposed !== 'flee') return false
  if (input.provoked && input.selfHpRatio < PROVOKED_FLEE_HP_RATIO) return true
  return isAttackRollSuppressed(input)
}
