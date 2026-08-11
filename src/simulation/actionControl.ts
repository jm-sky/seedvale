import type { ActionLifecycle, PlannedAction } from './types'
import {
  cancelActionLifecycle,
  completeActionLifecycle,
  failActionLifecycle,
  startActionLifecycle,
} from './actionLifecycle'

/**
 * Helpers for switching the current planned action (plan 055 Phase 4).
 * Cancelling the previous active action is the shared ownership rule —
 * agents keep domain movement; they only share lifecycle transitions.
 */

/** Start a new action, cancelling any currently `active` one. */
export function replaceActionLifecycle(life: ActionLifecycle): void {
  if (life.status === 'active') cancelActionLifecycle(life)
  startActionLifecycle(life)
}

/** Complete if active; otherwise leave terminal/idle unchanged. */
export function finishActionLifecycle(life: ActionLifecycle): void {
  if (life.status === 'active') completeActionLifecycle(life)
}

/** Fail if active (e.g. destination lost). */
export function abortActionLifecycle(life: ActionLifecycle): void {
  if (life.status === 'active') failActionLifecycle(life)
}

/**
 * Adopt `next` when the kind changes. Returns whether the intent changed
 * (so callers can reset timers/targets). Same kind keeps the lifecycle active.
 */
export function adoptPlannedAction<TKind extends string>(
  life: ActionLifecycle,
  current: PlannedAction<TKind> | null,
  next: PlannedAction<TKind>,
): { action: PlannedAction<TKind>, changed: boolean } {
  if (current?.kind === next.kind) {
    if (life.status !== 'active') startActionLifecycle(life)
    return { action: { ...current, ...next, kind: current.kind }, changed: false }
  }
  replaceActionLifecycle(life)
  return { action: next, changed: true }
}
