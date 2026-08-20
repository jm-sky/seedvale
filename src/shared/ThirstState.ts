/** `current` is hydration (how well-watered the player is) — same shape as
 *  `HungerState`, see that file's doc comment. */
export type ThirstState = {
  max: number
  current: number
}

/** Remaining hydration at/below this level is "significant" thirst — the
 *  point where `player/PlayerNeeds.ts`'s `tickPlayerNeeds` starts
 *  accumulating `dehydrationDuration` (plan 165). Moderate thirst above this
 *  threshold carries no penalty; HP loss only follows after `dehydrationDuration`
 *  itself has stayed critical long enough. */
export const THIRST_DEHYDRATED_THRESHOLD = 20

export function createThirstState(max: number): ThirstState {
  return { max, current: max }
}

export function drainThirst(thirst: ThirstState, amount: number): void {
  if (amount <= 0) return
  thirst.current = Math.max(0, thirst.current - amount)
}

export function restoreThirst(thirst: ThirstState, amount: number): void {
  if (amount <= 0) return
  thirst.current = Math.min(thirst.max, thirst.current + amount)
}

export function isDehydrated(thirst: ThirstState): boolean {
  return thirst.current <= THIRST_DEHYDRATED_THRESHOLD
}

export function getThirstRatio(thirst: ThirstState): number {
  if (thirst.max <= 0) return 0
  return thirst.current / thirst.max
}
