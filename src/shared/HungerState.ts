/** `current` is satiation (how well-fed the player is) — same "pool that
 *  drains toward 0" shape as `StaminaState`/`VigorState`, not a 0-1 urge
 *  accumulator like NPC `Needs.ts`/fauna `AnimalLife.ts` use. */
export type HungerState = {
  max: number
  current: number
}

/** Below this remaining satiation, hunger starts costing the player HP
 *  (`player/PlayerNeeds.ts`'s `tickPlayerNeeds`). */
export const HUNGER_STARVING_THRESHOLD = 0

export function createHungerState(max: number): HungerState {
  return { max, current: max }
}

export function drainHunger(hunger: HungerState, amount: number): void {
  if (amount <= 0) return
  hunger.current = Math.max(0, hunger.current - amount)
}

export function restoreHunger(hunger: HungerState, amount: number): void {
  if (amount <= 0) return
  hunger.current = Math.min(hunger.max, hunger.current + amount)
}

export function isStarving(hunger: HungerState): boolean {
  return hunger.current <= HUNGER_STARVING_THRESHOLD
}

export function getHungerRatio(hunger: HungerState): number {
  if (hunger.max <= 0) return 0
  return hunger.current / hunger.max
}
