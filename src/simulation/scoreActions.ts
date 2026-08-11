import type { PlannedAction } from './types'

/**
 * Minimal competing-action scoring (plan 055 Phase 5).
 * Domain code supplies scores; this only picks the best — no GOAP/utility framework.
 */
export type ScoredAction<TKind extends string = string> = {
  kind: TKind
  /** Higher wins. Ties prefer the earlier entry. */
  score: number
}

/** Returns the highest-scoring candidate, or `null` if the list is empty. */
export function pickHighestScore<TKind extends string>(
  candidates: readonly ScoredAction<TKind>[],
): ScoredAction<TKind> | null {
  if (candidates.length === 0) return null
  let best = candidates[0]!
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]!
    if (c.score > best.score) best = c
  }
  return best
}

/** Convenience: pick best kind, or `fallback` when there are no candidates. */
export function pickActionKind<TKind extends string>(
  candidates: readonly ScoredAction<TKind>[],
  fallback: TKind,
): TKind {
  return pickHighestScore(candidates)?.kind ?? fallback
}

/** Build a one-step `PlannedAction` from a scored pick (destination optional). */
export function plannedFromKind<TKind extends string>(
  kind: TKind,
  destination?: PlannedAction<TKind>['destination'],
): PlannedAction<TKind> {
  return destination ? { kind, destination } : { kind }
}
