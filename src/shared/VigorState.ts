/**
 * @domain shared
 * @system vigor
 * @role NPC daily physiological budget; collapse gates sleep through the NPC FSM. Not used by fauna.
 * @owns VigorState
 */
export type VigorState = {
  max: number
  current: number
}

/** Below this remaining pool, the NPC may no longer start a normal day's work. */
export const VIGOR_COLLAPSE_THRESHOLD = 5

export function createVigorState(max: number): VigorState {
  return { max, current: max }
}

export function drainVigor(vigor: VigorState, amount: number): void {
  if (amount <= 0) return
  vigor.current = Math.max(0, vigor.current - amount)
}

export function restoreVigor(vigor: VigorState, amount: number): void {
  if (amount <= 0) return
  vigor.current = Math.min(vigor.max, vigor.current + amount)
}

export function isCollapsed(vigor: VigorState): boolean {
  return vigor.current <= VIGOR_COLLAPSE_THRESHOLD
}

export function getVigorRatio(vigor: VigorState): number {
  if (vigor.max <= 0) return 0
  return vigor.current / vigor.max
}
