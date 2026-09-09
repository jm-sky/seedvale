/**
 * Shared lazy condition math for persistent world structures (plan world-020).
 * Owns only the 0..100 current-state contract and the arithmetic camp / well
 * roof already share. Does not read weather, shelter, Player, or any world
 * object — callers supply exposure and keep domain rates/windows.
 *
 * @domain world
 */

export type ConditionState = {
  /** Current technical condition, `0..100`. */
  condition: number
  /** World-day anchor the stored `condition` was last committed at. */
  lastConditionUpdateAtDays: number
}

export const CONDITION_MAX = 100

/** Clamp an arbitrary number onto the shared `0..100` condition scale. */
export function clampCondition(value: number): number {
  return Math.max(0, Math.min(CONDITION_MAX, value))
}

/**
 * Apply an explicit condition change (repair +, damage −). Result is always
 * `0..100`. Does not advance a time anchor — callers must checkpoint first
 * (`checkpointCondition`) so elapsed lazy wear is not lost or double-counted.
 *
 * @domain world
 */
export function applyConditionDelta(condition: number, delta: number): number {
  return clampCondition(condition + delta)
}

export type ConditionDecay = {
  passivePerDay?: number
  rainPerExposureDay?: number
  snowPerExposureDay?: number
}

/**
 * Commit a lazily resolved condition at `nowDays` before an explicit mutation.
 * Callers resolve at `nowDays`, persist that value, set the anchor to `nowDays`,
 * then apply any delta to the returned state (plan world-020 / world-021).
 *
 * @domain world
 */
export function checkpointCondition(
  resolvedCondition: number,
  nowDays: number,
): ConditionState {
  return {
    condition: clampCondition(resolvedCondition),
    lastConditionUpdateAtDays: nowDays,
  }
}

/**
 * Pure lazy condition math. Does not fetch weather or know about shelter /
 * object type. Passive wear uses `passiveDays` when provided, otherwise the
 * full elapsed interval (`nowDays - lastConditionUpdateAtDays`) — callers that
 * bound weather lookback must still pass the unclamped elapsed passive span,
 * or a short weather window will silently undercount time-only decay.
 *
 * @domain world
 */
export function resolveCondition(params: {
  state: ConditionState
  nowDays: number
  passiveDays?: number
  rainExposureDays?: number
  snowExposureDays?: number
  decay: ConditionDecay
}): number {
  const { state, nowDays, decay } = params
  const elapsed = Math.max(0, nowDays - state.lastConditionUpdateAtDays)
  const passiveDays = Math.max(0, params.passiveDays ?? elapsed)
  const rain = Math.max(0, params.rainExposureDays ?? 0)
  const snow = Math.max(0, params.snowExposureDays ?? 0)
  if (elapsed <= 0 && rain <= 0 && snow <= 0) return clampCondition(state.condition)
  const loss =
    passiveDays * (decay.passivePerDay ?? 0)
    + rain * (decay.rainPerExposureDay ?? 0)
    + snow * (decay.snowPerExposureDay ?? 0)
  return clampCondition(state.condition - loss)
}
